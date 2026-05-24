# 🔧 Complete Setup Guide - CF64JS Framework

> IMPORTANT  
> This guide is a framework setup example from the repo, not a Foretic product story doc.
> For current model setup rules used across this repo, start with:
> - `foretic-saas/cf/docs/DATAMODEL_SETUP_GUIDE.md`
> - `foretic-saas/cf/CFKIT_CURSOR_DEVELOPER_GUIDE.md`
> - `foretic-saas/cf/docs/FRAMEWORK_MODEL_SETUP_CHECKLIST.md`

## 📋 **EXACT Steps Taken to Set Up CF64JS Framework Todo Project**

### **Project Details:**
- **Project Name**: `cf64js-framework-todo`
- **API Worker**: `cf64js-framework-todo-api`
- **Cloudflare Account**: `55987b6602e8ac9db46e14dcc7ad2c79`
- **Subdomain**: `martin-598.workers.dev`

---

## **Step 1: Project Configuration**

### **A. Update package.json**
```json
{
  "name": "cf64js-framework-todo",
  "version": "1.0.0",
  "description": "CF64JS Framework - Complete Cloudflare Worker framework with auto-generated CRUD CloudFunctions and PX64JS integration"
}
```

### **B. Update wrangler.toml**
```toml
name = "cf64js-framework-todo-api"
main = "src/index.js"
compatibility_date = "2024-01-01"
account_id = "55987b6602e8ac9db46e14dcc7ad2c79"
```

---

## **Step 2: Create Project-Specific KV Namespaces**

### **Commands Executed:**
```bash
wrangler kv namespace create "cf64js-framework-todo-users"
# Result: id = "389f67810f1e4387b115bacbc3e8d2ca"

wrangler kv namespace create "cf64js-framework-todo-sessions"
# Result: id = "37a3671792ab416581fee3100e0235cf"

wrangler kv namespace create "cf64js-framework-todo-cache"
# Result: id = "7785a635b0404ef79a63677f06f07d3c"

wrangler kv namespace create "cf64js-framework-todo-todos"
# Result: id = "7e6fcf85d3014ab8ac086074350bda53"
```

### **Updated wrangler.toml KV Section:**
```toml
# KV Namespaces for the framework (project-specific)
[[kv_namespaces]]
binding = "USERS"
id = "389f67810f1e4387b115bacbc3e8d2ca"

[[kv_namespaces]]
binding = "SESSIONS"
id = "37a3671792ab416581fee3100e0235cf"

[[kv_namespaces]]
binding = "CACHE"
id = "7785a635b0404ef79a63677f06f07d3c"

[[kv_namespaces]]
binding = "TODOS"
id = "7e6fcf85d3014ab8ac086074350bda53"
```

---

## **Step 3: Create Project-Specific D1 Database**

### **Command Executed:**
```bash
wrangler d1 create cf64js-framework-todo
```

### **Result:**
```
✅ Successfully created DB 'cf64js-framework-todo' in region ENAM
Created your new D1 database.

To access your new D1 Database in your Worker, add the following snippet to your configuration file:
[[d1_databases]]
binding = "cf64js_framework_todo"
database_name = "cf64js-framework-todo"
database_id = "240fe0f9-fd81-4149-9cb2-2cfda9b58b5e"
```

### **Updated wrangler.toml D1 Section:**
```toml
# D1 Database (project-specific)
[[d1_databases]]
binding = "DB"
database_name = "cf64js-framework-todo"
database_id = "240fe0f9-fd81-4149-9cb2-2cfda9b58b5e"
```

---

## **Step 4: Fix Model Registration**

### **Issue Found:**
The Todo model was not imported in the auto-registration system.

### **Fix Applied:**
**File**: `src/cloudfunctions/datamodels-auto/index.js`

**Before:**
```javascript
// Import models that use enhanced registration
import '../../models/demo.js';
```

**After:**
```javascript
// Import models that use enhanced registration
import '../../models/demo.js';
import '../../models/todo.js';
```

---

## **Step 5: Create Missing Model Files**

### **Files Created:**

#### **A. src/models/log.js**
```javascript
export const LogModel = {
  name: 'Log',
  fields: {
    level: { type: 'string', required: true, enum: ['debug', 'info', 'warn', 'error'] },
    message: { type: 'string', required: true },
    module: { type: 'string' },
    function: { type: 'string' },
    entity_type: { type: 'string' },
    entity_id: { type: 'string' },
    user_id: { type: 'string' },
    metadata: { type: 'object' },
    timestamp: { type: 'string', default: () => new Date().toISOString() }
  }
};
```

#### **B. src/models/webhook-config.js**
```javascript
export const WebhookConfigModel = {
  name: 'WebhookConfig',
  fields: {
    name: { type: 'string', required: true },
    url: { type: 'string', required: true },
    events: { type: 'array', default: [] },
    secret: { type: 'string' },
    active: { type: 'boolean', default: true },
    retry_count: { type: 'number', default: 3 },
    timeout: { type: 'number', default: 30000 }
  }
};
```

#### **C. src/models/webhook-queue.js**
```javascript
export const WebhookQueueModel = {
  name: 'WebhookQueue',
  fields: {
    webhook_id: { type: 'string', required: true },
    event_type: { type: 'string', required: true },
    payload: { type: 'object', required: true },
    attempts: { type: 'number', default: 0 },
    max_attempts: { type: 'number', default: 3 },
    status: { type: 'string', default: 'pending', enum: ['pending', 'processing', 'completed', 'failed'] },
    next_retry: { type: 'string' },
    error_message: { type: 'string' }
  }
};
```

---

## **Step 6: Deploy the Worker**

### **Command Executed:**
```bash
wrangler deploy
```

### **Result:**
```
⛅️ wrangler 4.33.1
───────────────────
Total Upload: 235.31 KiB / gzip: 45.81 KiB
Worker Startup Time: 1 ms
Your Worker has access to the following bindings:
Binding            Resource
env.USERS          KV Namespace
  389f67810f1e4387b115bacbc3e8d2ca
env.SESSIONS       KV Namespace
  37a3671792ab416581fee3100e0235cf
env.CACHE          KV Namespace
  7785a635b0404ef79a63677f06f07d3c
env.TODOS          KV Namespace
  7e6fcf85d3014ab8ac086074350bda53
env.ENVIRONMENT    Environment Variable
  "production"

Uploaded cf64js-framework-todo-api (4.76 sec)
Deployed cf64js-framework-todo-api triggers (0.39 sec)
  https://cf64js-framework-todo-api.martin-598.workers.dev
Current Version ID: 2bd2c6f2-6262-4c13-9de6-1fc6e59574b9
```

---

## **Step 7: Verify Auto-Model Registration**

### **Worker Logs Show:**
```
🔄 Registering auto DataModel CloudFunctions...
  ✅ Registered: demo.get
  ✅ Registered: demo.list
  ✅ Registered: demo.create
  ✅ Registered: demo.update
  ✅ Registered custom: demo.search
  ✅ Registered: todo.get
  ✅ Registered: todo.list
  ✅ Registered: todo.create
  ✅ Registered: todo.update
  ✅ Registered custom: todo.completed
✅ Auto DataModel CloudFunctions registered successfully
```

---

## **🎯 Key Success Factors**

### **✅ What Made This Work:**

1. **Project-Specific Resources**: Each project gets isolated KV namespaces and D1 database
2. **Correct Naming Convention**: `cf64js-framework-todo-{resource-type}`
3. **Model Registration**: Must import models in `datamodels-auto/index.js`
4. **Missing Model Files**: Created required model files that were missing
5. **Exact Configuration**: wrangler.toml IDs must match exactly

### **❌ Issues Encountered:**

1. **D1 Auth Error**: Initial attempt failed, succeeded on retry
2. **Missing Models**: Framework expected log.js, webhook-config.js, webhook-queue.js
3. **Model Not Registered**: Todo model wasn't imported in auto-registration
4. **Shared Resources**: Initially tried to use shared KV namespaces

---

## **📋 Final Configuration Summary**

### **Project Structure:**
```
cf64js-framework-todo/
├── API Worker: cf64js-framework-todo-api.martin-598.workers.dev
├── KV Namespaces: 4 project-specific namespaces
├── D1 Database: cf64js-framework-todo
└── Models: demo, todo, log, webhook-config, webhook-queue
```

### **Auto-Generated Functions:**
- `demo.get`, `demo.list`, `demo.create`, `demo.update`, `demo.search`
- `todo.get`, `todo.list`, `todo.create`, `todo.update`, `todo.completed`

### **Resources Created:**
- **KV Namespaces**: 4 (users, sessions, cache, todos)
- **D1 Database**: 1 (cf64js-framework-todo)
- **Cloudflare Worker**: 1 (cf64js-framework-todo-api)

---

## **Step 8: Deploy Worker with D1 Database**

### **Command Executed:**
```bash
wrangler deploy
```

### **Result:**
```
⛅️ wrangler 4.33.1
───────────────────
Total Upload: 235.31 KiB / gzip: 45.81 KiB
Worker Startup Time: 1 ms
Your Worker has access to the following bindings:
Binding            Resource
env.USERS          KV Namespace
  389f67810f1e4387b115bacbc3e8d2ca
env.SESSIONS       KV Namespace
  37a3671792ab416581fee3100e0235cf
env.CACHE          KV Namespace
  7785a635b0404ef79a63677f06f07d3c
env.TODOS          KV Namespace
  7e6fcf85d3014ab8ac086074350bda53
env.DB             D1 Database
  cf64js-framework-todo
env.ENVIRONMENT    Environment Variable
  "production"

Uploaded cf64js-framework-todo-api (4.17 sec)
Deployed cf64js-framework-todo-api triggers (0.51 sec)
  https://cf64js-framework-todo-api.martin-598.workers.dev
Current Version ID: 25e1f1fb-c9b0-4d86-88b5-d856ddcee9a2
```

### **Key Success Indicators:**
- ✅ **env.DB D1 Database**: Now properly bound
- ✅ **All KV Namespaces**: Project-specific namespaces bound
- ✅ **Worker URL**: https://cf64js-framework-todo-api.martin-598.workers.dev

---

## **Step 9: Initialize D1 Database Tables**

### **A. Initialize Local D1 Database**
```bash
wrangler d1 execute cf64js-framework-todo --file=./schema.sql
```

### **Result:**
```
⛅️ wrangler 4.33.1
───────────────────
🌀 Executing on local database cf64js-framework-todo (240fe0f9-fd81-4149-9cb2-2cfda9b58b5e) from .wrangler\state\v3\d1:
🌀 To execute on your remote database, add a --remote flag to your wrangler command.
🚣 9 commands executed successfully.
```

### **B. Initialize Remote D1 Database**
```bash
echo Y | wrangler d1 execute cf64js-framework-todo --file=./schema.sql --remote
```

### **Result:**
```
⛅️ wrangler 4.33.1
───────────────────
? ⚠️ This process may take some time, during which your D1 database will be unavvailable to serve queries.
  Ok to proceed?
🤖 Using fallback value in non-interactive context: yes
🌀 Executing on remote database cf64js-framework-todo (240fe0f9-fd81-4149-9cb2-2cfda9b58b5e):
├ Checking if file needs uploading
│
├ 🌀 Uploading 240fe0f9-fd81-4149-9cb2-2cfda9b58b5e.9db4107e1381aca3.sql        
│ 🌀 Uploading complete.
│
🌀 Starting import...
🌀 Processed 9 queries.
🚣 Executed 9 queries in 0.00 seconds (14 rows read, 17 rows written)
   Database is currently at bookmark 00000002-00000004-00004f83-ec257ddd513a5776ebc7a059d2d4298e.
┌────────────────────────┬───────────┬──────────────┬────────────────────┐
│ Total queries executed │ Rows read │ Rows written │ Database size (MB) │
├────────────────────────┼───────────┼──────────────┼────────────────────┤
│ 9                      │ 14        │ 17           │ 0.07               │
└────────────────────────┴───────────┴──────────────┴────────────────────┘
```

### **D1 Initialization Results:**
- ✅ **Local Database**: 9 commands executed successfully
- ✅ **Remote Database**: 9 queries executed (14 rows read, 17 rows written)
- ✅ **Database Size**: 0.07 MB
- ✅ **Tables Created**: All framework tables initialized

---

## **📋 Complete Setup Summary**

### **✅ All Steps Completed:**

1. ✅ **Project Configuration**: package.json and wrangler.toml updated
2. ✅ **KV Namespaces**: 4 project-specific namespaces created and bound
3. ✅ **D1 Database**: Created and bound to worker
4. ✅ **Model Registration**: Todo model imported in auto-registration
5. ✅ **Missing Models**: Created log.js, webhook-config.js, webhook-queue.js
6. ✅ **Worker Deployment**: Successfully deployed with all bindings
7. ✅ **D1 Initialization**: Local and remote databases initialized

### **🎯 Final Status:**
- **Worker URL**: https://cf64js-framework-todo-api.martin-598.workers.dev
- **KV Namespaces**: 4 project-specific namespaces active
- **D1 Database**: Initialized with all framework tables
- **Auto-Model Functions**: Registered and ready for testing

---

## **🚀 Next Steps**

1. **Test Auto-Model Functions**: Verify all 5 CRUD operations work
2. **Create Frontend**: Connect PX64JS to the API
3. **Test End-to-End**: Complete Todo app functionality
4. **Documentation**: Update API reference with working examples

---

**This setup is now ready for testing the auto-model system!** 🎉
