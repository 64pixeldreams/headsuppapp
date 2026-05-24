# 🚀 CFKit Cursor Developer Guide

**Version**: 2.0  
**Target**: Cursor AI Assistant & Developers  
**Purpose**: Complete guide for using CFKit framework effectively

---

## 📋 **Quick Start Checklist**

### **Before Creating Any Model:**
1. ✅ **Model has primary key field** with `primary: true, auto: true`
2. ✅ **KV namespace created** in Cloudflare Dashboard
3. ✅ **KV binding added** to `wrangler.toml`
4. ✅ **Model imported** in `src/models/register-all.js`
5. ✅ **Run `npm run sync-schema`** to generate schema
6. ✅ **Deploy with `npm run deploy`**
7. ✅ **Test with model CloudFunctions**

---

## 🏗️ **Model Creation Guide**

### **Step 1: Create Model Definition**

**CRITICAL**: Every model MUST have a primary key field!

```javascript
// src/models/my-model.js
export const MyModel = {
  name: 'MYMODEL',
  
  // ✅ REQUIRED: Primary key field
  fields: {
    mymodel_id: {
      type: 'string',
      primary: true,        // ← REQUIRED
      auto: true,           // ← Auto-generate ID
      prefix: 'mym'         // ← 3-letter prefix
    },
    name: { 
      type: 'string', 
      required: true 
    },
    status: { 
      type: 'string', 
      default: 'active' 
    },
    config: { 
      type: 'json', 
      default: {} 
    }
  },
  
  // KV storage configuration
  kv: {
    namespace: 'MYMODELS',  // Must match Cloudflare KV namespace
    keyPattern: 'mymodel:{id}'
  },
  
  // D1 storage configuration
  d1: {
    table: 'mymodels',
    syncFields: [
      'mymodel_id',  // ← Include primary key!
      'name',
      'status',
      'config',
      'created_at',
      'updated_at'
    ]
  },
  
  // Model options
  options: {
    timestamps: true,     // Auto-add created_at, updated_at
    softDelete: true,     // Auto-add deleted_at
    userTracking: true,   // Auto-add user_id
    auth: true           // Require authentication
  }
};
```

### **Step 2: Register Model**

```javascript
// src/models/register-all.js
import { MyModel } from './my-model.js';

// Add to existing imports
DataModel.registerModel(MyModel);
```

### **Step 3: Setup Cloudflare Resources**

#### **3a. Create KV Namespace**
```bash
# In Cloudflare Dashboard or CLI
wrangler kv:namespace create "MYMODELS"
```

#### **3b. Add to wrangler.toml**
```toml
[[kv_namespaces]]
binding = "MYMODELS"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-namespace-id"
```

#### **3c. Create D1 Database** (if not exists)
```bash
wrangler d1 create my-database
```

---

## 🔄 **Schema Management**

### **Auto-Generate Schema**
```bash
# Generate schema.sql from all models
npm run sync-schema

# Deploy with auto-schema generation
npm run deploy
```

### **Manual Schema Generation**
```javascript
// Generate schema programmatically
import { DataModel } from './src/modules/datamodel/index.js';

const schema = DataModel.generateAllSchemas();
console.log(schema);
```

### **Verify D1 Tables**
```bash
# Check if tables exist
wrangler d1 execute my-database --command "SELECT name FROM sqlite_master WHERE type='table';"
```

---

## 🚀 **Deployment Workflow**

### **Complete Deployment Process**
```bash
# 1. Generate schema from models
npm run sync-schema

# 2. Deploy to Cloudflare
npm run deploy

# 3. Initialize D1 tables (first time only)
# Call system.initialize CloudFunction after deployment
```

### **Development Workflow**
```bash
# Development with auto-schema
npm run dev

# Test locally
wrangler dev --local
```

---

## 🔧 **Common Issues & Solutions**

### **Issue 1: "Unknown class" Error**
```
Error: Unknown class: MYMODEL. Please ensure the KV namespace is configured
```

**Solution**: 
1. ✅ Create KV namespace in Cloudflare Dashboard
2. ✅ Add binding to `wrangler.toml`
3. ✅ Restart development server

### **Issue 2: "Missing primary key field" Error**
```
Error: Model MYMODEL missing primary key field!
```

**Solution**: Add primary key field to model:
```javascript
fields: {
  mymodel_id: {
    type: 'string',
    primary: true,    // ← REQUIRED
    auto: true,       // ← REQUIRED
    prefix: 'mym'     // ← REQUIRED
  }
  // ... other fields
}
```

### **Issue 3: D1 Table Creation Fails**
```
Error: Failed to create table mymodels
```

**Solution**:
1. ✅ Run `npm run sync-schema` first
2. ✅ Check `syncFields` includes primary key
3. ✅ Verify D1 database exists
4. ✅ Call `system.initialize` CloudFunction

### **Issue 4: CORS Errors in Browser**
```
Access to fetch blocked by CORS policy
```

**Solution**: CORS is already handled in `src/index.js` - check:
1. ✅ Using correct server URL
2. ✅ Headers include `Content-Type: application/json`
3. ✅ No mixed content (HTTP/HTTPS)

### **Issue 5: "Not authenticated" Error**
```
Error: Not authenticated - call cf.login() first
```

**Solution**: For public functions, use:
```javascript
// In CloudFunction definition
config: {
  auth: false  // ← Allow unauthenticated access
}
```

---

## 📚 **Model Field Types**

### **Supported Field Types**
```javascript
fields: {
  // String fields
  name: { type: 'string', required: true, maxLength: 100 },
  description: { type: 'text' },
  
  // Numeric fields
  count: { type: 'number', default: 0 },
  price: { type: 'number', min: 0 },
  
  // Boolean fields
  active: { type: 'boolean', default: true },
  
  // JSON fields
  config: { type: 'json', default: {} },
  metadata: { type: 'object' },
  
  // Array fields
  tags: { type: 'array', default: [] },
  
  // Timestamp fields
  created_at: { type: 'timestamp', auto: true },
  updated_at: { type: 'timestamp', auto: true },
  
  // Enum fields
  status: { 
    type: 'string', 
    enum: ['pending', 'active', 'inactive'],
    default: 'pending'
  }
}
```

### **Field Options**
```javascript
fieldName: {
  type: 'string',           // Field type
  required: true,           // Required field
  default: 'value',         // Default value
  maxLength: 100,          // String max length
  min: 0,                  // Number minimum
  max: 100,                // Number maximum
  enum: ['a', 'b', 'c'],   // Allowed values
  auto: true,              // Auto-generated
  primary: true,           // Primary key
  prefix: 'usr'            // ID prefix
}
```

---

## 🔌 **CloudFunction Integration**

### **Auto-Generated Functions**
Every model automatically gets these CloudFunctions:
- `{model}.create` - Create new record
- `{model}.get` - Get single record
- `{model}.list` - List records with pagination
- `{model}.update` - Update record
- `{model}.delete` - Soft delete record

### **Custom CloudFunctions**
```javascript
// In model definition
customFunctions: {
  'activate': {
    handler: async (requestContext) => {
      const { payload, env, logger } = requestContext;
      // Custom logic here
      return { success: true, data: result };
    },
    config: {
      auth: true,
      validation: {
        payload: {
          id: { type: 'string', required: true }
        }
      }
    }
  }
}
```

### **Calling CloudFunctions**
```javascript
// Frontend usage
const result = await cf.run('mymodel.create', {
  name: 'Test Item',
  status: 'active'
});

// Public functions (no auth required)
const list = await cf.run('mymodel.list', { limit: 10 });
```

---

## 🗄️ **Database Operations**

### **KV Storage (Primary)**
- ✅ **Fast reads/writes**
- ✅ **Automatic scaling**
- ✅ **Global distribution**
- ❌ **No complex queries**

### **D1 Storage (Secondary)**
- ✅ **SQL queries**
- ✅ **Complex filtering**
- ✅ **Analytics**
- ❌ **Slower than KV**

### **Hybrid Pattern**
```javascript
// Data flows: KV (source of truth) → D1 (querying)
// Create/Update: KV first, then D1
// Read: KV for single records, D1 for queries
```

---

## 🧪 **Testing Models**

### **Test Model Creation**
```javascript
// Test script
import { DataModel } from './src/modules/datamodel/index.js';
import { Datastore } from './src/modules/datastore/index.js';

const datastore = new Datastore(env, logger);

// Test create
const model = await DataModel.create('MYMODEL', datastore, {
  name: 'Test Item',
  status: 'active'
}, logger);

console.log('Created:', model.getData());
```

### **Test CloudFunctions**
```javascript
// Test via API
const response = await fetch('/api/function', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'mymodel.create',
    payload: { name: 'Test', status: 'active' }
  })
});

const result = await response.json();
console.log('Result:', result);
```

---

## 📖 **Best Practices**

### **Model Design**
1. ✅ **Always include primary key** with `primary: true, auto: true`
2. ✅ **Use descriptive field names** (avoid abbreviations)
3. ✅ **Set appropriate defaults** for optional fields
4. ✅ **Include timestamps** for audit trails
5. ✅ **Use soft delete** for data recovery

### **Performance**
1. ✅ **KV for single record operations**
2. ✅ **D1 for complex queries and analytics**
3. ✅ **Limit syncFields** to essential fields only
4. ✅ **Use indexes** for frequently queried fields

### **Security**
1. ✅ **Set `auth: true`** for sensitive operations
2. ✅ **Validate all inputs** in CloudFunctions
3. ✅ **Use `userTracking: true`** for user-scoped data
4. ✅ **Sanitize JSON fields** before storage

---

## 🆘 **Emergency Troubleshooting**

### **Model Won't Create**
1. ✅ Check primary key field exists
2. ✅ Verify KV namespace exists
3. ✅ Confirm model is registered
4. ✅ Run `npm run sync-schema`

### **D1 Tables Missing**
1. ✅ Run `npm run sync-schema`
2. ✅ Deploy with `npm run deploy`
3. ✅ Call `system.initialize` CloudFunction
4. ✅ Check `syncFields` includes primary key

### **CloudFunctions Not Working**
1. ✅ Check model registration
2. ✅ Verify CloudFunction registration
3. ✅ Test with simple payload
4. ✅ Check authentication requirements

### **KV Access Denied**
1. ✅ Verify KV namespace binding
2. ✅ Check environment variables
3. ✅ Confirm namespace exists in Cloudflare
4. ✅ Restart development server

---

## 📞 **Getting Help**

### **Debug Commands**
```bash
# Check schema generation
npm run sync-schema

# View generated schema
cat schema.sql

# Test D1 connection
wrangler d1 execute my-database --command "SELECT 1;"

# Check KV namespaces
wrangler kv:namespace list
```

### **Log Analysis**
```javascript
// Enable debug logging
const logger = LOGS.init('DEBUG');
logger.debug('Model creation', { model: 'MYMODEL', data });
```

### **Common Error Codes**
- `MISSING_PRIMARY_KEY` - Add primary key field
- `UNKNOWN_CLASS` - Check KV namespace binding
- `VALIDATION_FAILED` - Check field types and requirements
- `AUTHENTICATION_ERROR` - Check auth configuration

---

**This guide provides everything Cursor needs to effectively work with CFKit!** 🚀
