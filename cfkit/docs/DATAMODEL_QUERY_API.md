# 🔍 DataModel Query API Reference

## 📋 **Overview**

This guide covers **direct DataModel querying** for custom CloudFunctions. If you're using auto-generated CloudFunctions (`cf.run('model.list')`), see [AUTO_CLOUDFUNCTIONS_API_REFERENCE.md](../AUTO_CLOUDFUNCTIONS_API_REFERENCE.md) instead.

---

## 🎯 **When to Use Direct Queries**

Use `DataModel.query()` when:
- ✅ Writing custom CloudFunctions with complex logic
- ✅ Need advanced filtering not available in auto-CloudFunctions
- ✅ Building custom endpoints with special business logic
- ✅ Combining data from multiple models
- ✅ **Need to bypass automatic `user_id` filtering** (see Security note below)

**Don't use** direct queries when:
- ❌ Auto-CloudFunctions already provide what you need (`cf.run('model.list')`)
- ❌ Simple CRUD operations (use auto-CloudFunctions)

### 🔒 **IMPORTANT: Security Consideration**

**Auto-CloudFunctions automatically enforce `user_id` filtering** for models with `user_id` or `created_by` fields. This prevents unauthorized access to other users' data.

If you write a **custom CloudFunction** using `DataModel.query()`:
- ⚠️ **YOU are responsible for security filtering**
- ✅ Always check `auth.user_id` and apply filters manually
- ✅ Or use `_bypassUserFilter`/`_bypassUserFilterAdmin` flags with auto-CloudFunctions

**Example - Secure Custom Query:**
```javascript
export async function getMyProjects({ auth, env, logger }) {
  const datastore = new Datastore(env, logger);
  
  // ✅ CORRECT: Manually enforce user_id filter
  const projects = await DataModel.query('PROJECT', datastore, logger)
    .where('user_id', auth.user_id)  // ← YOU must add this!
    .withData()
    .list();
  
  return { success: true, data: projects.data };
}
```

**See:** `docs/SECURITY_USER_ID_FILTERING.md` for complete security documentation.

---

## 🚀 **Quick Start**

### **Basic Create Pattern**

```javascript
import { DataModel } from '../modules/datamodel/index.js';
import { Datastore } from '../modules/datastore/index.js';

// Inside a CloudFunction:
export async function myCustomFunction(requestContext) {
  const { env, logger, payload } = requestContext;
  
  // 1. Create datastore
  const datastore = new Datastore(env, logger);
  
  // 2. Create new record
  const newPage = await DataModel.create('PAGE_HTML', datastore, {
    project_id: payload.project_id,
    url: payload.url,
    title: payload.title,
    html: payload.html,
    status: 'draft',
    priority: 1,
    metadata: {
      source: 'api',
      version: '1.0'
    }
  }, logger);
  
  // 3. Use the created record
  return {
    success: true,
    page: newPage.toJSON()
  };
}
```

---

### **Basic Query Pattern**

```javascript
import { DataModel } from '../modules/datamodel/index.js';
import { Datastore } from '../modules/datastore/index.js';

// Inside a CloudFunction:
export async function myCustomFunction(requestContext) {
  const { env, logger } = requestContext;
  
  // 1. Create datastore
  const datastore = new Datastore(env, logger);
  
  // 2. Build query
  const query = DataModel.query('PAGE_HTML', datastore, logger);
  
  // 3. Chain filters/options
  query
    .where('project_id', 'proj_123')
    .where('status', 'active')
    .orderBy('created_at', 'desc')
    .limit(20)
    .withData();  // ← CRITICAL for KV models!
  
  // 4. Execute
  const result = await query.list();
  
  // 5. Use results
  return {
    items: result.data.map(item => item.toJSON()),
    total: result.pagination.total
  };
}
```

---

## 📚 **Complete API Reference**

---

## 📝 **Create Operations**

### **DataModel.create(modelName, datastore, data, logger)**

Create a new record.

**Parameters:**
- `modelName` (string): The registered model name (e.g., `'PAGE_HTML'`, `'USER'`, `'TODO'`)
- `datastore` (Datastore): Datastore instance from `new Datastore(env, logger)`
- `data` (object): Record data (fields to set)
- `logger` (Logger): Logger instance

**Returns:** `Promise<DataModel>` - The created model instance

**Example:**
```javascript
const newPage = await DataModel.create('PAGE_HTML', datastore, {
  project_id: 'proj_123',
  url: '/example',
  title: 'Example Page',
  html: '<html>...</html>',
  status: 'draft'
}, logger);

// Access created record
console.log(newPage.id);           // Auto-generated ID
console.log(newPage.created_at);   // Auto-generated timestamp
console.log(newPage.toJSON());     // Full record as plain object
```

**Auto-Generated Fields:**
- `id`: Unique identifier (e.g., `page_abc123`)
- `created_at`: ISO timestamp
- `updated_at`: ISO timestamp
- `created_by`: User ID (if authenticated context available)
- Default values from field definitions

---

### **Create Patterns**

#### **Pattern 1: Simple Create**

```javascript
const todo = await DataModel.create('TODO', datastore, {
  title: 'Buy groceries',
  description: 'Milk, eggs, bread',
  priority: 1,
  status: 'pending'
}, logger);

return { success: true, todo: todo.toJSON() };
```

---

#### **Pattern 2: Create with Nested Objects**

```javascript
const user = await DataModel.create('USER', datastore, {
  email: 'user@example.com',
  password_hash: hashedPassword,
  profile: {
    name: 'John Doe',
    company: 'Acme Inc',
    timezone: 'America/New_York'
  },
  settings: {
    notifications: true,
    theme: 'dark'
  },
  status: 'active'
}, logger);
```

---

#### **Pattern 3: Create with Auth Context**

```javascript
// If user is authenticated, created_by is auto-added
cloudFunction.define('page.create', async (requestContext) => {
  const { env, logger, payload, auth } = requestContext;
  const datastore = new Datastore(env, logger);
  
  // auth.user_id automatically added as created_by
  const page = await DataModel.create('PAGE_HTML', datastore, {
    project_id: payload.project_id,
    title: payload.title,
    html: payload.html
    // created_by: auth.user_id <- Added automatically!
  }, logger);
  
  return { page: page.toJSON() };
}, { auth: true });
```

---

#### **Pattern 4: Create with Validation**

```javascript
try {
  const product = await DataModel.create('PRODUCT', datastore, {
    name: 'iPhone 15',
    price: 999,
    category: 'electronics',  // Must match enum in model definition
    stock: 50
  }, logger);
  
  return { success: true, product: product.toJSON() };
  
} catch (error) {
  // Handle validation errors
  if (error.message.includes('validation')) {
    return {
      success: false,
      error: 'Invalid product data',
      details: error.message
    };
  }
  throw error;
}
```

---

#### **Pattern 5: Create Multiple Records**

```javascript
const pages = [];

for (const pageData of payload.pages) {
  const page = await DataModel.create('PAGE_HTML', datastore, {
    project_id: payload.project_id,
    url: pageData.url,
    title: pageData.title,
    html: pageData.html,
    status: 'draft'
  }, logger);
  
  pages.push(page.toJSON());
}

return {
  success: true,
  created: pages.length,
  pages
};
```

---

#### **Pattern 6: Create with Default Values**

```javascript
// Model definition has defaults:
// fields: {
//   priority: { type: 'number', default: 3 },
//   status: { type: 'string', default: 'active' }
// }

const item = await DataModel.create('ITEM', datastore, {
  title: 'New Item'
  // priority: 3 <- Applied automatically
  // status: 'active' <- Applied automatically
}, logger);
```

---

## 🔍 **Query Operations**

### **DataModel.get(modelName, datastore, id, logger)**

Get a single record by ID.

**Parameters:**
- `modelName` (string): The registered model name
- `datastore` (Datastore): Datastore instance
- `id` (string): Record ID
- `logger` (Logger): Logger instance

**Returns:** `Promise<DataModel>` - The model instance (or throws if not found)

**Example:**
```javascript
const page = await DataModel.get('PAGE_HTML', datastore, 'page_abc123', logger);

console.log(page.id);         // page_abc123
console.log(page.title);      // Page title
console.log(page.toJSON());   // Full record
```

**Error Handling:**
```javascript
try {
  const page = await DataModel.get('PAGE_HTML', datastore, id, logger);
  return { page: page.toJSON() };
} catch (error) {
  if (error.message.includes('not found')) {
    return { success: false, error: 'Page not found' };
  }
  throw error;
}
```

---

### **DataModel.query(modelName, datastore, logger)**

Creates a new query builder for the specified model.

**Parameters:**
- `modelName` (string): The registered model name (e.g., `'PAGE_HTML'`, `'USER'`, `'TODO'`)
- `datastore` (Datastore): Datastore instance from `new Datastore(env, logger)`
- `logger` (Logger): Logger instance (usually from `requestContext.logger`)

**Returns:** `QueryBuilder` - Chainable query builder

**Example:**
```javascript
const query = DataModel.query('PAGE_HTML', datastore, logger);
```

---

## 🔗 **Chainable Query Methods**

All methods return the query builder for chaining.

### **where(field, value)**

Add a WHERE clause for exact match.

```javascript
query.where('project_id', 'proj_abc123');
query.where('status', 'active');
query.where('priority', 5);
```

**Multiple where() calls are combined with AND:**
```javascript
query
  .where('project_id', 'proj_123')
  .where('status', 'active')
  .where('priority', 5);
// SQL: WHERE project_id = ? AND status = ? AND priority = ?
```

---

### **whereIn(field, values)**

Add a WHERE IN clause for multiple values.

```javascript
query.whereIn('status', ['draft', 'published', 'archived']);
query.whereIn('priority', [1, 2, 3]);
```

**Example:**
```javascript
const result = await DataModel.query('PAGE_HTML', datastore, logger)
  .where('project_id', projectId)
  .whereIn('status', ['published', 'draft'])
  .withData()
  .list();
```

---

### **orderBy(field, direction)**

Set sorting order.

**Parameters:**
- `field` (string): Field name to sort by
- `direction` (string): `'asc'` or `'desc'` (default: `'desc'`)

```javascript
query.orderBy('created_at', 'desc');  // Newest first
query.orderBy('priority', 'asc');     // Lowest first
query.orderBy('title', 'asc');        // Alphabetical
```

---

### **limit(n)**

Set maximum number of results to return.

```javascript
query.limit(20);  // Return max 20 results
query.limit(100); // Return max 100 results
```

**Default:** 20

---

### **offset(n)**

Set offset for pagination.

```javascript
query.offset(0);   // Page 1
query.offset(20);  // Page 2 (if pageSize = 20)
query.offset(40);  // Page 3
```

**Pagination helper:**
```javascript
const page = 3;
const pageSize = 20;
query.offset((page - 1) * pageSize);
```

---

### **withData()** ⚠️ **CRITICAL**

Hydrate full data from KV storage.

```javascript
query.withData();
```

**⚠️ ALWAYS call this before `.list()` for models using KV storage!**

```javascript
// ❌ WRONG - Returns objects with only D1 metadata
const result = await query.list();

// ✅ CORRECT - Returns full objects from KV
const result = await query.withData().list();
```

**Why?** Models using `DataProxy` store metadata in D1 and full data in KV. Without `.withData()`, you only get D1 fields (id, created_at, etc.) but not the actual content.

---

### **includeDeleted()**

Include soft-deleted records in results.

```javascript
query.includeDeleted();
```

**Default behavior:** Soft-deleted records (where `deleted_at IS NOT NULL`) are excluded.

**Example:**
```javascript
const allPages = await DataModel.query('PAGE_HTML', datastore, logger)
  .where('project_id', projectId)
  .includeDeleted()  // Include deleted pages
  .withData()
  .list();
```

---

### **onlyDeleted()**

Return ONLY soft-deleted records.

```javascript
query.onlyDeleted();
```

**Example:**
```javascript
const deletedPages = await DataModel.query('PAGE_HTML', datastore, logger)
  .where('project_id', projectId)
  .onlyDeleted()  // Only deleted pages
  .withData()
  .list();
```

---

## 🎯 **Execution Methods**

### **list()**

Execute the query and return results with pagination.

```javascript
const result = await query.list();
```

**Returns:**
```javascript
{
  data: [
    // Array of model instances
    DataProxyInstance { ... },
    DataProxyInstance { ... }
  ],
  pagination: {
    total: 156,      // Total matching records
    pages: 8,        // Total pages
    page: 1,         // Current page
    pageSize: 20     // Items per page
  }
}
```

**Processing results:**
```javascript
const result = await query.list();

// Convert to plain objects
const items = result.data.map(item => item.toJSON());

// Access properties directly
result.data.forEach(item => {
  console.log(item.id);
  console.log(item.title);
  console.log(item.html);
});

// Check pagination
console.log(`Showing ${result.data.length} of ${result.pagination.total}`);
```

---

### **count()**

Count total matching records without fetching data.

```javascript
const count = await query.count();
```

**Returns:** Number

**Example:**
```javascript
const totalPages = await DataModel.query('PAGE_HTML', datastore, logger)
  .where('project_id', projectId)
  .where('status', 'active')
  .count();

console.log(`Active pages: ${totalPages}`);
```

**Performance:** Much faster than `.list()` when you only need the count.

---

## 📖 **Common Query Patterns**

### **Pattern 1: Simple Filter**

Get all active pages for a project:

```javascript
const result = await DataModel.query('PAGE_HTML', datastore, logger)
  .where('project_id', projectId)
  .where('status', 'active')
  .withData()
  .list();

const pages = result.data.map(p => p.toJSON());
```

---

### **Pattern 2: Pagination**

Fetch page 3 of results:

```javascript
const page = 3;
const pageSize = 20;

const result = await DataModel.query('PAGE_HTML', datastore, logger)
  .where('project_id', projectId)
  .orderBy('created_at', 'desc')
  .limit(pageSize)
  .offset((page - 1) * pageSize)
  .withData()
  .list();

return {
  items: result.data.map(p => p.toJSON()),
  meta: {
    page: page,
    pageSize: pageSize,
    total: result.pagination.total,
    totalPages: result.pagination.pages
  }
};
```

---

### **Pattern 3: Multiple Status Filter**

Get pages with multiple statuses:

```javascript
const result = await DataModel.query('PAGE_HTML', datastore, logger)
  .where('project_id', projectId)
  .whereIn('status', ['draft', 'published', 'reviewing'])
  .orderBy('updated_at', 'desc')
  .withData()
  .list();
```

---

### **Pattern 4: Count Only**

Check how many pages meet criteria:

```javascript
const draftCount = await DataModel.query('PAGE_HTML', datastore, logger)
  .where('project_id', projectId)
  .where('status', 'draft')
  .count();

const publishedCount = await DataModel.query('PAGE_HTML', datastore, logger)
  .where('project_id', projectId)
  .where('status', 'published')
  .count();

return {
  stats: {
    draft: draftCount,
    published: publishedCount
  }
};
```

---

### **Pattern 5: Latest N Items**

Get 5 most recent pages:

```javascript
const recent = await DataModel.query('PAGE_HTML', datastore, logger)
  .where('project_id', projectId)
  .orderBy('created_at', 'desc')
  .limit(5)
  .withData()
  .list();

return recent.data.map(p => p.toJSON());
```

---

### **Pattern 6: Audit Trail (Include Deleted)**

Get all records including deleted ones:

```javascript
const allRecords = await DataModel.query('PAGE_HTML', datastore, logger)
  .where('project_id', projectId)
  .includeDeleted()
  .orderBy('updated_at', 'desc')
  .withData()
  .list();

return allRecords.data.map(p => ({
  ...p.toJSON(),
  is_deleted: !!p.deleted_at
}));
```

---

## 🔥 **Real-World Examples**

### **Complete CRUD Example: Page Management**

```javascript
// ============================================================
// COMPLETE CRUD CLOUDFUNCTION FOR PAGE_HTML MODEL
// ============================================================

cloudFunction.define('page.manage', async (requestContext) => {
  const { env, logger, payload } = requestContext;
  const datastore = new Datastore(env, logger);
  
  const { operation } = payload;
  
  // ─────────────────────────────────────────────────────────
  // CREATE - Add new page
  // ─────────────────────────────────────────────────────────
  if (operation === 'create') {
    const newPage = await DataModel.create('PAGE_HTML', datastore, {
      project_id: payload.project_id,
      url: payload.url,
      title: payload.title,
      html: payload.html,
      status: 'draft',
      priority: payload.priority || 3,
      metadata: {
        source: 'api',
        version: '1.0'
      }
    }, logger);
    
    logger.log('Page created', { id: newPage.id });
    
    return {
      success: true,
      page: newPage.toJSON()
    };
  }
  
  // ─────────────────────────────────────────────────────────
  // GET - Retrieve single page
  // ─────────────────────────────────────────────────────────
  if (operation === 'get') {
    try {
      const page = await DataModel.get('PAGE_HTML', datastore, payload.id, logger);
      
      return {
        success: true,
        page: page.toJSON()
      };
    } catch (error) {
      return {
        success: false,
        error: 'Page not found'
      };
    }
  }
  
  // ─────────────────────────────────────────────────────────
  // LIST - Query multiple pages with filters
  // ─────────────────────────────────────────────────────────
  if (operation === 'list') {
    const query = DataModel.query('PAGE_HTML', datastore, logger)
      .where('project_id', payload.project_id);
    
    // Optional filters
    if (payload.status) {
      query.where('status', payload.status);
    }
    
    if (payload.priority) {
      query.where('priority', payload.priority);
    }
    
    // Sorting and pagination
    query
      .orderBy(payload.sort || 'created_at', payload.order || 'desc')
      .limit(payload.pageSize || 20)
      .offset(((payload.page || 1) - 1) * (payload.pageSize || 20))
      .withData();
    
    const result = await query.list();
    
    return {
      success: true,
      pages: result.data.map(p => p.toJSON()),
      meta: {
        total: result.pagination.total,
        pages: result.pagination.pages,
        page: payload.page || 1
      }
    };
  }
  
  // ─────────────────────────────────────────────────────────
  // UPDATE - Modify existing page
  // ─────────────────────────────────────────────────────────
  if (operation === 'update') {
    try {
      // Get existing page
      const page = await DataModel.get('PAGE_HTML', datastore, payload.id, logger);
      
      // Update fields
      if (payload.title) page.set('title', payload.title);
      if (payload.html) page.set('html', payload.html);
      if (payload.status) page.set('status', payload.status);
      if (payload.priority) page.set('priority', payload.priority);
      
      // Or update multiple at once:
      // page.set({
      //   title: payload.title,
      //   html: payload.html,
      //   status: payload.status
      // });
      
      // Save changes
      await page.save();
      
      logger.log('Page updated', { id: page.id });
      
      return {
        success: true,
        page: page.toJSON()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // ─────────────────────────────────────────────────────────
  // DELETE - Soft delete page
  // ─────────────────────────────────────────────────────────
  if (operation === 'delete') {
    try {
      const page = await DataModel.get('PAGE_HTML', datastore, payload.id, logger);
      
      // Soft delete (sets deleted_at timestamp)
      await page.delete();
      
      logger.log('Page deleted', { id: payload.id });
      
      return {
        success: true,
        message: 'Page deleted successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // ─────────────────────────────────────────────────────────
  // COUNT - Count pages matching criteria
  // ─────────────────────────────────────────────────────────
  if (operation === 'count') {
    const total = await DataModel.query('PAGE_HTML', datastore, logger)
      .where('project_id', payload.project_id)
      .count();
    
    const active = await DataModel.query('PAGE_HTML', datastore, logger)
      .where('project_id', payload.project_id)
      .where('status', 'published')
      .count();
    
    return {
      success: true,
      stats: {
        total,
        active,
        draft: total - active
      }
    };
  }
  
  return {
    success: false,
    error: 'Invalid operation'
  };
}, {
  auth: true,
  validation: {
    operation: { type: 'string', required: true }
  }
});
```

**Usage from frontend:**
```javascript
// Create
await cf.run('page.manage', { 
  operation: 'create',
  project_id: 'proj_123',
  url: '/new-page',
  title: 'New Page',
  html: '<h1>Hello</h1>'
});

// Get
await cf.run('page.manage', { 
  operation: 'get',
  id: 'page_abc123'
});

// List
await cf.run('page.manage', { 
  operation: 'list',
  project_id: 'proj_123',
  status: 'published',
  page: 1,
  pageSize: 20
});

// Update
await cf.run('page.manage', { 
  operation: 'update',
  id: 'page_abc123',
  title: 'Updated Title',
  status: 'published'
});

// Delete
await cf.run('page.manage', { 
  operation: 'delete',
  id: 'page_abc123'
});

// Count
await cf.run('page.manage', { 
  operation: 'count',
  project_id: 'proj_123'
});
```

---

### **Example 1: Custom CloudFunction - Get Project Stats**

```javascript
cloudFunction.define('project.stats', async (requestContext) => {
  const { env, logger, payload } = requestContext;
  const { project_id } = payload;
  
  const datastore = new Datastore(env, logger);
  
  // Get total pages
  const totalPages = await DataModel.query('PAGE_HTML', datastore, logger)
    .where('project_id', project_id)
    .count();
  
  // Get active pages
  const activePages = await DataModel.query('PAGE_HTML', datastore, logger)
    .where('project_id', project_id)
    .where('status', 'published')
    .count();
  
  // Get recent pages
  const recentPages = await DataModel.query('PAGE_HTML', datastore, logger)
    .where('project_id', project_id)
    .orderBy('created_at', 'desc')
    .limit(5)
    .withData()
    .list();
  
  return {
    total: totalPages,
    active: activePages,
    recent: recentPages.data.map(p => ({
      id: p.id,
      title: p.title,
      url: p.url,
      created_at: p.created_at
    }))
  };
});
```

---

### **Example 2: Custom Search Function**

```javascript
cloudFunction.define('page.search', async (requestContext) => {
  const { env, logger, payload } = requestContext;
  const { project_id, query_text, page = 1, pageSize = 20 } = payload;
  
  const datastore = new Datastore(env, logger);
  
  // First, get matching page IDs (you'd implement custom search logic here)
  // For this example, we'll just filter by status
  const result = await DataModel.query('PAGE_HTML', datastore, logger)
    .where('project_id', project_id)
    .whereIn('status', ['draft', 'published'])
    .orderBy('updated_at', 'desc')
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .withData()
    .list();
  
  // Process and filter results
  const items = result.data
    .map(p => p.toJSON())
    .filter(p => 
      p.title?.toLowerCase().includes(query_text.toLowerCase()) ||
      p.html?.toLowerCase().includes(query_text.toLowerCase())
    );
  
  return {
    items,
    meta: {
      page,
      pageSize,
      total: result.pagination.total
    }
  };
});
```

---

### **Example 3: Bulk Status Update**

```javascript
cloudFunction.define('page.bulkPublish', async (requestContext) => {
  const { env, logger, payload } = requestContext;
  const { project_id } = payload;
  
  const datastore = new Datastore(env, logger);
  
  // Find all draft pages
  const drafts = await DataModel.query('PAGE_HTML', datastore, logger)
    .where('project_id', project_id)
    .where('status', 'draft')
    .withData()
    .list();
  
  logger.log(`Found ${drafts.data.length} draft pages to publish`);
  
  // Update each one
  for (const page of drafts.data) {
    page.set('status', 'published');
    await page.save();
  }
  
  return {
    message: `Published ${drafts.data.length} pages`,
    count: drafts.data.length
  };
});
```

---

## 🚨 **Common Mistakes**

### **Mistake 1: Model Not in KV Mapping**

```javascript
// ❌ ERROR: Invalid class: PAGE_ASSET
const result = await DataModel.create('PAGE_ASSET', datastore, {...}, logger);
// Error: Unknown class: PAGE_ASSET. Please ensure the KV namespace is configured...

// ✅ SOLUTION: Add model to KV mapping
// Edit src/modules/datastore/adapters/kv.js in getKVMapping():
getKVMapping() {
  const mapping = {};
  // ... existing code ...
  
  // Add special cases that use CACHE namespace
  mapping.LOG = this.env.CACHE;
  mapping.VERIFY = this.env.CACHE;
  mapping.PAGE_ASSET = this.env.CACHE;  // ← Add your model here
  
  return mapping;
}
```

**Why?** Every model needs to be mapped to a KV namespace. Models can either:
- Have their own namespace: `mapping.PAGE_ASSET = this.env.PAGE_ASSETS;`
- Use the shared CACHE namespace: `mapping.PAGE_ASSET = this.env.CACHE;`

---

### **Mistake 2: Forgetting withData()**

```javascript
// ❌ WRONG - Returns empty objects
const result = await DataModel.query('PAGE_HTML', datastore, logger)
  .where('project_id', projectId)
  .list();

console.log(result.data[0].html);  // undefined!
console.log(result.data[0].title); // undefined!

// ✅ CORRECT
const result = await DataModel.query('PAGE_HTML', datastore, logger)
  .where('project_id', projectId)
  .withData()  // ← Add this!
  .list();

console.log(result.data[0].html);  // Works!
```

---

### **Mistake 3: Wrong Model Name**

```javascript
// ❌ WRONG - Model names are UPPERCASE
DataModel.query('page_html', datastore, logger);  // Error!
DataModel.query('PageHtml', datastore, logger);   // Error!

// ✅ CORRECT - Use exact registered name
DataModel.query('PAGE_HTML', datastore, logger);  // Works!

// To see registered models:
console.log('Available models:', DataModel.getRegisteredModels());
```

---

### **Mistake 4: Not Handling Pagination**

```javascript
// ❌ WRONG - Only gets first 20 results
const result = await DataModel.query('PAGE_HTML', datastore, logger)
  .where('project_id', projectId)
  .withData()
  .list();
// If there are 100 pages, you only get 20!

// ✅ CORRECT - Fetch all pages if needed
const allPages = [];
let page = 1;
let hasMore = true;

while (hasMore) {
  const result = await DataModel.query('PAGE_HTML', datastore, logger)
    .where('project_id', projectId)
    .limit(100)
    .offset((page - 1) * 100)
    .withData()
    .list();
  
  allPages.push(...result.data);
  hasMore = page < result.pagination.pages;
  page++;
}

// Or better: increase limit if you know you need all
const result = await DataModel.query('PAGE_HTML', datastore, logger)
  .where('project_id', projectId)
  .limit(1000)  // Increase limit
  .withData()
  .list();
```

---

### **Mistake 5: Filtering Non-syncFields**

```javascript
// If your model has:
d1: {
  table: 'pages',
  syncFields: ['project_id', 'status', 'priority']  // Only these are in D1!
}

// ❌ WRONG - 'content' is not in syncFields
const result = await DataModel.query('PAGE_HTML', datastore, logger)
  .where('content', 'some text')  // Won't work!
  .list();

// ✅ CORRECT - Filter by syncFields only
const result = await DataModel.query('PAGE_HTML', datastore, logger)
  .where('project_id', projectId)
  .where('status', 'published')
  .withData()
  .list();

// Then filter by content in JavaScript:
const filtered = result.data.filter(p => 
  p.content.includes('some text')
);
```

---

## 📊 **Response Format**

### **list() Response**

```javascript
{
  data: [
    DataProxyInstance {
      id: 'page_abc123',
      project_id: 'proj_xyz',
      title: 'Example Page',
      html: '<html>...</html>',
      status: 'published',
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-01-01T12:00:00.000Z',
      deleted_at: null,
      // ... other fields
      
      // Methods:
      toJSON: [Function],
      save: [Function],
      delete: [Function],
      isFullyLoaded: [Function]
    },
    // ... more items
  ],
  pagination: {
    total: 156,      // Total records matching query
    pages: 8,        // Total pages (ceil(total / pageSize))
    page: 1,         // Current page (calculated from offset)
    pageSize: 20     // Items per page (from limit)
  }
}
```

### **count() Response**

```javascript
42  // Just a number
```

---

## 🔧 **Advanced Usage**

### **Chaining from Model Class**

If you have a model instance:

```javascript
const PageHTML = DataModel.get('PAGE_HTML');

const query = PageHTML.query(env);  // Shorter syntax
// Same as: DataModel.query('PAGE_HTML', datastore, logger)
```

---

### **Building Queries Dynamically**

```javascript
const query = DataModel.query('PAGE_HTML', datastore, logger)
  .where('project_id', projectId);

// Add filters conditionally
if (status) {
  query.where('status', status);
}

if (priority) {
  query.where('priority', priority);
}

// Always end with these
query.withData();
const result = await query.list();
```

---

## 📚 **Related Documentation**

- [AUTO_CLOUDFUNCTIONS_API_REFERENCE.md](../AUTO_CLOUDFUNCTIONS_API_REFERENCE.md) - Auto-generated CloudFunctions API
- [DATAMODEL_SETUP_GUIDE.md](./DATAMODEL_SETUP_GUIDE.md) - Creating new models
- [CURSOR_CFKIT_RULES.md](../CURSOR_CFKIT_RULES.md) - CloudflareAppKit rules for Cursor

---

## 🎯 **Summary: API Checklist**

### **For CREATE operations:**

1. ✅ Import `DataModel` and `Datastore`
2. ✅ Create `new Datastore(env, logger)`
3. ✅ Use correct model name (UPPERCASE)
4. ✅ Pass data object with required fields
5. ✅ Use `await DataModel.create(modelName, datastore, data, logger)`
6. ✅ Use `.toJSON()` to convert result to plain object
7. ✅ Wrap in try/catch for validation errors

### **For QUERY operations:**

1. ✅ Import `DataModel` and `Datastore`
2. ✅ Create `new Datastore(env, logger)`
3. ✅ Use correct model name (UPPERCASE)
4. ✅ Chain `.where()` for filters (only syncFields!)
5. ✅ Call `.withData()` before `.list()` (CRITICAL!)
6. ✅ Handle pagination if >20 results expected
7. ✅ Use `.toJSON()` to convert results to plain objects
8. ✅ Check `result.pagination.total` for total count

### **For GET operations:**

1. ✅ Use `DataModel.get(modelName, datastore, id, logger)`
2. ✅ Wrap in try/catch for "not found" errors
3. ✅ Use `.toJSON()` to convert result to plain object

### **For UPDATE operations:**

1. ✅ Get record first with `DataModel.get()`
2. ✅ Update fields with `.set(field, value)` or `.set({ multiple: 'fields' })`
3. ✅ Call `await record.save()` to persist changes
4. ✅ Use `.toJSON()` to return updated record

### **For DELETE operations:**

1. ✅ Get record first with `DataModel.get()`
2. ✅ Call `await record.delete()` for soft delete
3. ✅ Soft delete sets `deleted_at` timestamp
4. ✅ Deleted records excluded from `.list()` by default

---

**That's the complete DataModel API!** 🚀

