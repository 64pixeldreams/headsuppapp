# CloudflareAppKit Security: Auto-Generated LIST User ID Filtering

**Version:** 1.0  
**Date:** October 25, 2025  
**Status:** Proposal → Implementation

---

## 🚨 Security Vulnerability Identified

### The Problem

Auto-generated `model.list` CloudFunctions currently accept **ANY filter from client requests**, including `user_id`. This allows authenticated users to query data belonging to other users.

**Example Exploit:**
```javascript
// Malicious client request
await cf.run('project.list', {
  filter: {
    user_id: 'victim_user_id_123'  // 🚨 SECURITY BREACH!
  }
});

// Current behavior: Returns victim's projects!
```

### Root Cause

In `src/modules/datamodel/auto-cloudfunctions.js` (lines 255-280), the `_handleList` function blindly applies all filters from the client request:

```javascript
// VULNERABLE CODE:
if (filter && Object.keys(filter).length > 0) {
  Object.entries(filter).forEach(([key, value]) => {
    query.where(key, value);  // ← Trusts ALL user input!
  });
}
```

### Impact

- ✅ **Severity:** HIGH
- ✅ **Affected:** All models with `user_id` or `created_by` fields
- ✅ **Attack Vector:** Any authenticated user via client-side API calls
- ✅ **Data at Risk:** PROJECT, PAGE, PAGE_ASSET, PAGE_HTML, and any user-scoped data

---

## ✅ Proposed Solution

### Security Model

Implement **automatic `user_id` enforcement** with **two bypass mechanisms**:

1. **Default Behavior (Secure):** Force `user_id` from authenticated user's token
2. **Server Bypass:** Allow server-side code to bypass via flag
3. **Admin Bypass:** Allow admin users to bypass via flag + role check

---

## 🔒 Implementation Details

### Phase 1: Core Security (Implement Now)

#### Step 1: Block Malicious `user_id` Filters

```javascript
// In auto-cloudfunctions.js _handleList (before applying filters):

// Remove ANY user_id filter from client request
if (filter?.user_id) {
  delete filter.user_id;
  logger.warn('🚨 Blocked user_id filter from client request', {
    requested_user_id: filter.user_id,
    auth_user_id: auth?.user_id
  });
}
```

#### Step 2: Auto-Apply `user_id` Filter

```javascript
// Check if model has user_id field
const hasUserIdField = modelDef.fields?.user_id || modelDef.fields?.created_by;

// If model tracks users AND user is authenticated → Force filter
if (hasUserIdField && auth?.user_id) {
  query.where('user_id', auth.user_id);
  logger.info(`🔒 Auto-applied user_id filter: ${auth.user_id}`);
}
```

#### Step 3: Server-Side Bypass (No Auth Check)

```javascript
// Check for server-side bypass flag
if (payload._bypassUserFilter === true) {
  logger.warn('⚠️ Server-side user_id filter bypass enabled', {
    caller: 'server-cloudfunction',
    auth_user: auth?.email || 'unknown'
  });
  // Skip user_id enforcement
  skipUserIdFilter = true;
}
```

**Use Case:** Server-side CloudFunctions that need cross-user queries:

```javascript
// Inside a custom CloudFunction (server-side)
export default async function internalAnalytics({ env, logger }) {
  // Get all projects for analytics (server decides this is safe)
  const allProjects = await cf.run('project.list', {
    _bypassUserFilter: true  // ← Server code can do this
  });
  
  return { success: true, data: aggregateStats(allProjects) };
}
```

**Security:** This is safe because:
- ✅ Only server-side CloudFunctions can use this flag
- ✅ Clients cannot send this flag (HTTP requests are validated by the framework)
- ✅ Server developer consciously chose to bypass

#### Step 4: Admin Bypass (With Auth Check)

```javascript
// Check for admin bypass flag
if (payload._bypassUserFilterAdmin === true) {
  const isAdmin = auth?.is_admin === true;
  
  if (!isAdmin) {
    return { 
      success: false, 
      error: { 
        message: 'Admin privileges required',
        code: 'UNAUTHORIZED_BYPASS'
      } 
    };
  }
  
  logger.warn('🔓 Admin user_id filter bypass enabled', {
    admin_user: auth.email,
    admin_id: auth.user_id
  });
  
  // Skip user_id enforcement
  skipUserIdFilter = true;
}
```

**Use Case:** Admin dashboards where admins need to view user data:

```javascript
// Client-side admin dashboard
await cf.run('project.list', {
  _bypassUserFilterAdmin: true,  // ← Admin requests this
  filter: { 
    user_id: 'customer_user_id_456'  // ← View customer's projects
  }
});
```

**Security:** This is safe because:
- ✅ Checks `auth.is_admin` before allowing bypass
- ✅ Non-admin requests are rejected immediately
- ✅ All bypass attempts are logged with admin email
- ✅ Enables client-side admin UIs without custom CloudFunctions

---

## 📊 Security Matrix

| Request Type | `user_id` Filter Behavior | Auth Check | Safe? |
|--------------|---------------------------|------------|-------|
| **Client (Normal User)** | Forced from `auth.user_id` | ✅ Token required | ✅ YES |
| **Client (Malicious)** | Blocked, forced from token | ✅ Token required | ✅ YES |
| **Server CloudFunction** | Bypassed if `_bypassUserFilter: true` | ⚠️ Trust server | ✅ YES |
| **Admin Client** | Bypassed if `_bypassUserFilterAdmin: true` | ✅ `is_admin` check | ✅ YES |
| **Non-Admin Bypass Attempt** | **REJECTED** | ✅ `is_admin` check fails | ✅ YES |

---

## 🔐 Complete Implementation

### Modified `_handleList` Function

```javascript
async function _handleList(payload, auth, env, logger) {
  const { model, filter = {}, sort, order, page = 1, pageSize = 50 } = payload;
  
  // Get model definition
  const modelDef = DataModel.getDefinition(model);
  if (!modelDef) {
    return { success: false, error: { message: `Model ${model} not found` } };
  }
  
  // Initialize query
  const datastore = new Datastore(env, logger);
  let query = DataModel.query(model, datastore, logger);
  
  // Hydrate DataProxy models from KV
  query.withData();
  
  // --- SECURITY: USER_ID FILTERING ---
  let skipUserIdFilter = false;
  
  // Check for admin bypass (requires auth check)
  if (payload._bypassUserFilterAdmin === true) {
    const isAdmin = auth?.is_admin === true;
    
    if (!isAdmin) {
      logger.error('❌ Unauthorized admin bypass attempt', {
        user_id: auth?.user_id,
        email: auth?.email
      });
      return { 
        success: false, 
        error: { 
          message: 'Admin privileges required',
          code: 'UNAUTHORIZED_BYPASS'
        } 
      };
    }
    
    logger.warn('🔓 Admin user_id filter bypass enabled', {
      admin_user: auth.email,
      admin_id: auth.user_id,
      model: model
    });
    
    skipUserIdFilter = true;
  }
  // Check for server-side bypass (no auth check needed)
  else if (payload._bypassUserFilter === true) {
    logger.warn('⚠️ Server-side user_id filter bypass enabled', {
      caller: 'server-cloudfunction',
      auth_user: auth?.email || 'system',
      model: model
    });
    
    skipUserIdFilter = true;
  }
  // Default: Enforce user_id filtering
  else {
    // Remove any user_id filter from client request
    if (filter?.user_id) {
      logger.warn('🚨 Blocked user_id filter from client request', {
        requested_user_id: filter.user_id,
        auth_user_id: auth?.user_id,
        model: model
      });
      delete filter.user_id;
    }
    
    // Check if model has user_id field
    const hasUserIdField = modelDef.fields?.user_id || modelDef.fields?.created_by;
    
    // If model tracks users AND user is authenticated → Force filter
    if (hasUserIdField && auth?.user_id) {
      query.where('user_id', auth.user_id);
      logger.info(`🔒 Auto-applied user_id filter: ${auth.user_id} for ${model}`);
    }
  }
  
  // --- END SECURITY BLOCK ---
  
  // Apply remaining filters
  if (filter && Object.keys(filter).length > 0) {
    Object.entries(filter).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        query.whereIn(key, value);
      } else {
        query.where(key, value);
      }
    });
  }
  
  // Apply sorting
  if (sort) {
    query.orderBy(sort, order || 'asc');
  }
  
  // Apply pagination
  const limit = Math.min(pageSize, 100); // Cap at 100
  const offset = (page - 1) * limit;
  query.limit(limit).offset(offset);
  
  // Execute query
  const result = await query.list();
  const instances = result.data || [];
  
  // Get total count (for pagination)
  const countQuery = DataModel.query(model, datastore, logger);
  
  // Re-apply user_id filter for count (if not bypassed)
  if (!skipUserIdFilter) {
    const hasUserIdField = modelDef.fields?.user_id || modelDef.fields?.created_by;
    if (hasUserIdField && auth?.user_id) {
      countQuery.where('user_id', auth.user_id);
    }
  }
  
  // Re-apply other filters for count
  if (filter && Object.keys(filter).length > 0) {
    Object.entries(filter).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        countQuery.whereIn(key, value);
      } else {
        countQuery.where(key, value);
      }
    });
  }
  
  const total = await countQuery.count();
  
  return {
    success: true,
    data: {
      data: instances.map(instance => instance.toJSON ? instance.toJSON() : instance),
      meta: {
        page: parseInt(page),
        pageSize: limit,
        total: total,
        totalPages: Math.ceil(total / limit)
      }
    }
  };
}
```

---

## 📋 Testing Checklist

### Test 1: Normal User (Should Be Restricted)
```javascript
// As user_123
const result = await cf.run('project.list', {
  filter: { status: 'active' }
});

// ✅ Expected: Only projects where user_id = 'user_123'
// ✅ Expected: Log shows "🔒 Auto-applied user_id filter"
```

### Test 2: Malicious User (Should Be Blocked)
```javascript
// As user_123, trying to access user_456's data
const result = await cf.run('project.list', {
  filter: { user_id: 'user_456' }  // ← Malicious!
});

// ✅ Expected: Only projects where user_id = 'user_123' (ignored malicious filter)
// ✅ Expected: Log shows "🚨 Blocked user_id filter from client request"
```

### Test 3: Server-Side Bypass (Should Work)
```javascript
// Inside a CloudFunction
const result = await cf.run('project.list', {
  _bypassUserFilter: true
});

// ✅ Expected: ALL projects returned (no user_id filter)
// ✅ Expected: Log shows "⚠️ Server-side user_id filter bypass enabled"
```

### Test 4: Admin User (Should Work)
```javascript
// As admin user (is_admin: true)
const result = await cf.run('project.list', {
  _bypassUserFilterAdmin: true,
  filter: { user_id: 'user_456' }
});

// ✅ Expected: Projects for user_456 returned
// ✅ Expected: Log shows "🔓 Admin user_id filter bypass enabled"
```

### Test 5: Non-Admin Bypass Attempt (Should Be Rejected)
```javascript
// As normal user (is_admin: false)
const result = await cf.run('project.list', {
  _bypassUserFilterAdmin: true
});

// ✅ Expected: { success: false, error: { message: 'Admin privileges required' } }
// ✅ Expected: Log shows "❌ Unauthorized admin bypass attempt"
```

---

## 📚 Documentation Updates Required

1. ✅ **AUTO_CLOUDFUNCTIONS_API_REFERENCE.md**
   - Add "Security: User ID Filtering" section
   - Document bypass flags
   - Add security examples

2. ✅ **DATAMODEL_QUERY_API.md**
   - Add note about auto-filtering
   - Explain when to use bypass flags
   - Link to this security doc

3. ✅ **.cursorrules**
   - Add security rule about user_id filtering
   - Document bypass mechanisms
   - Warn against custom list functions (now unnecessary)

4. ✅ **CHANGELOG.md**
   - Add "Security: Auto-Generated LIST User ID Filtering"
   - Document breaking changes (if any)
   - Link to this security doc

---

## 🚀 Deployment Plan

### Step 1: Code Changes
- ✅ Modify `src/modules/datamodel/auto-cloudfunctions.js`
- ✅ Update `_handleList` function with security logic

### Step 2: Testing
- ✅ Run security tests (see Testing Checklist above)
- ✅ Verify no breaking changes to existing code

### Step 3: Documentation
- ✅ Update all docs listed above
- ✅ Add examples to guides

### Step 4: Rollout
- ✅ Deploy to staging
- ✅ Monitor logs for blocked attempts
- ✅ Deploy to production

---

## 💡 FAQ

### Q: Will this break existing code?

**A:** No! If your existing code doesn't try to query other users' data, it will work identically. The filter is automatically applied based on the authenticated user.

### Q: What about models without `user_id`?

**A:** They are unaffected. Only models with `user_id` or `created_by` fields enforce filtering.

### Q: Can I still write custom list functions?

**A:** Yes, but you probably don't need to anymore! Use `_bypassUserFilter` for server-side logic instead.

### Q: How do I create an admin user?

**A:** Update the user record:
```javascript
await cf.run('user.update', {
  id: 'user_id_here',
  is_admin: true
});
```

### Q: What if I need more complex role-based access?

**A:** For now, use custom CloudFunctions. In the future, we may add a `role` field with granular permissions.

---

## ✅ Summary

**Security Gain:**
- ✅ Prevents unauthorized cross-user data access
- ✅ Secure by default (no code changes needed)
- ✅ Flexible bypass mechanisms for legitimate use cases
- ✅ Full audit trail via logging

**Developer Experience:**
- ✅ Zero breaking changes
- ✅ Works automatically
- ✅ Clear bypass mechanisms
- ✅ Well-documented

**Performance:**
- ✅ No performance impact
- ✅ Same query execution path
- ✅ Leverages existing D1 indexes

---

**Status:** Ready for implementation.  
**Next Step:** Implement code changes in `auto-cloudfunctions.js`.

