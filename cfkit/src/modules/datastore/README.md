# Datastore Module

## 🔒 MODULE STATUS: LOCKED v1.0
- **Lock Date**: 09/09/2025
- **API Stability**: STABLE - No breaking changes allowed
- **Dependencies**: See below
- **Test Status**: PASSING
- **Production Status**: LIVE

---



A unified data storage interface for Cloudflare Workers with swappable adapters for KV and D1.

## 🎯 Purpose

The DATASTORE module provides:
- **Unified Interface** - Same API for both KV and D1 storage
- **Auth by Default** - Built-in access control with `_auth` arrays
- **Zero Direct Access** - All storage operations go through this module
- **Future-Proof** - Switch storage backends without changing application code

## 🚀 Quick Start

```javascript
import { Datastore } from './modules/datastore';

// In your Worker handler
export default {
  async fetch(request, env, ctx) {
    // Initialize with env bindings
    const datastore = new Datastore(env);
    
    // Create authenticated instance
    const db = datastore.auth('user_123');
    
    // Store data (automatically adds auth)
    await db.put('PROJECT', 'proj_456', {
      name: 'My Project',
      created: new Date().toISOString()
    });
    
    // Retrieve data (checks auth)
    const project = await db.get('PROJECT', 'proj_456');
  }
};
```

## 📦 Installation

1. Copy the `datastore` folder to your project
2. Configure KV namespaces in `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "NIMBUS_USERS"
id = "your-users-namespace-id"

[[kv_namespaces]]
binding = "NIMBUS_PROJECTS"
id = "your-projects-namespace-id"

# ... other namespaces
```

## 🔧 Core API

### Authentication

```javascript
// Set auth context for all operations
const authDb = datastore.auth(userId);
```

### Basic Operations

```javascript
// Get an object (returns null if not found or no access)
const data = await db.get('CLASS', 'id');

// Store an object (adds _auth array)
await db.put('CLASS', 'id', data);

// Delete an object (checks auth first)
await db.delete('CLASS', 'id');

// Check if exists (and user has access)
const exists = await db.exists('CLASS', 'id');
```

### List Operations

```javascript
// Get list items
const items = await db.queryListByPointer('projects', userId);

// Add to list
await db.queryListAddItem('projects', userId, 'proj_123');

// Remove from list
await db.queryListRemoveItem('projects', userId, 'proj_123');

// Clear entire list
await db.queryListClear('projects', userId);

// Convenience method
const projects = await db.getList('projects', userId);
```

## 🗄️ Storage Classes

### KV Storage (via `datastore.KV`)
- `USER` - User accounts
- `PROJECT` - Projects
- `PAGE` - Page content
- `APIKEY` - API key data
- `SESSION` - User sessions
- `CACHE` - Temporary data
- `EMAIL` - Email mappings
- `LIST` - All list data

### D1 Storage (via `datastore.D1`)
- `LOG` - Application logs
- `AUDIT` - Audit trails
- `BATCH` - Batch processing
- `QUEUE` - Job queues
- `STATUS` - Job status

## 🔑 Key Patterns

### Object Keys
```javascript
// Simple keys
await db.put('USER', 'user_123', userData);
// → KV key: user:user_123

// Composite keys
import { compositeKey } from './modules/datastore';
const pageKey = compositeKey(projectId, pageId);
await db.put('PAGE', pageKey, pageData);
// → KV key: page:proj_123:page_456
```

### List Keys
```javascript
await db.queryListAddItem('projects', 'user_123', 'proj_456');
// → KV key: projects:user_123
// → Value: ['proj_456']
```

## 🔐 Access Control

All objects are automatically tagged with `_auth` arrays:

```javascript
// When you store data
await db.auth('user_123').put('PROJECT', 'proj_456', {
  name: 'My Project'
});

// It's stored as:
{
  name: 'My Project',
  _auth: ['user_123']  // Added automatically
}

// Only user_123 can retrieve it
const project = await db.auth('user_123').get('PROJECT', 'proj_456');
// → Returns project data

const project2 = await db.auth('user_456').get('PROJECT', 'proj_456');
// → Returns null (no access)
```

## 🎯 Best Practices

### 1. Always Use Auth Context
```javascript
// ❌ BAD - No auth context
const db = new Datastore(env);
await db.put('PROJECT', id, data);

// ✅ GOOD - Auth context set
const db = new Datastore(env).auth(userId);
await db.put('PROJECT', id, data);
```

### 2. Minimize Lookups
```javascript
// ❌ BAD - Multiple lookups
const apiKey = await db.get('APIKEY', keyHash);
const user = await db.get('USER', apiKey.user_id);
const projects = await db.getList('projects', user.id);

// ✅ GOOD - Embed data
const apiKey = await db.get('APIKEY', keyHash);
// apiKey already contains: user_id, permissions, rate_limit
```

### 3. Use Composite Keys
```javascript
// For related data
import { compositeKey } from './modules/datastore';

const batchKey = compositeKey(projectId, batchId);
await db.put('BATCH', batchKey, batchData);
```

### 4. Never Access KV Directly
```javascript
// ❌ BAD - Direct KV access
const data = await env.NIMBUS_USERS.get('user:123');

// ✅ GOOD - Through datastore
const data = await db.get('USER', '123');
```

## 🚨 Error Handling

```javascript
try {
  await db.delete('PROJECT', 'proj_123');
} catch (error) {
  if (error.message === 'Not found or no access') {
    // Handle missing or unauthorized
  }
}
```

## 🔄 Switching Adapters

```javascript
// Use KV for key-value data
const project = await datastore.KV.get('PROJECT', id);

// Use D1 for structured data (when implemented)
const logs = await datastore.D1.query('LOG', { 
  where: { project_id: id },
  orderBy: 'created_at DESC'
});
```

## 📊 Performance Tips

1. **Batch Operations** - Use list operations for bulk updates
2. **Denormalize Data** - Store redundant data to avoid joins
3. **Cache Results** - Use the CACHE class for temporary data
4. **Composite Keys** - Group related data with composite keys

## 🛠️ Troubleshooting

### "Unknown class" Error
Make sure the class name is in the valid list. Add new classes to `utils/keys.js`.

### "Not found or no access" Error
Either the object doesn't exist or the user doesn't have access. Check the auth context.

### Missing KV Namespace
Ensure all KV namespaces are configured in `wrangler.toml` with correct bindings.

## 🧪 Testing

### Running Tests
```bash
# Test DATASTORE module
npm run test:datastore

# Test all modules
npm test
```

### Test Coverage
The test suite covers:
- ✅ Basic initialization with/without logger
- ✅ Store and retrieve operations
- ✅ Auth context isolation
- ✅ List operations (add, remove, get)
- ✅ Error handling
- ✅ Logging integration
- ✅ Composite key support

### Example Test
```javascript
// Test auth isolation
const ds = new Datastore(env);
const user1 = ds.auth('user_1');
const user2 = ds.auth('user_2');

// User 1 stores private data
await user1.put('USER', 'private', { secret: 'data' });

// User 2 cannot access it
const data = await user2.get('USER', 'private'); // Returns null

// User 1 can access it
const ownData = await user1.get('USER', 'private'); // Returns data
```

## 📚 See Also

- [Datastore Specification](../../../../specs/00-datastore.md)
- [Test Suite](../../tests/test-datastore.js)
- [Cloudflare KV Documentation](https://developers.cloudflare.com/workers/runtime-apis/kv/)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)