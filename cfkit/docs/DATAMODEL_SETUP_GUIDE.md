# DataModel Setup Guide

This guide explains how to set up new DataModels with automatic CloudFunction generation.

## Overview

When creating a new DataModel in the NimbusAI platform, there are several steps required to ensure it works properly with both KV (key-value) and D1 (SQL) storage, as well as the auto-generated CloudFunctions.

## Step-by-Step Setup Process

### 1. Create Your Model Definition

Create a new file in `src/models/` with your model definition:

```javascript
// src/models/example.js
import { EnhancedDataModel } from '../modules/datamodel/enhanced-registration.js';

export const ExampleModel = {
  name: 'EXAMPLE',
  
  // Define your fields
  fields: {
    example_id: {
      type: 'string',
      primary: true,
      auto: true,
      prefix: 'ex'
    },
    title: {
      type: 'string',
      required: true,
      maxLength: 200
    },
    description: {
      type: 'text',
      required: false
    },
    status: {
      type: 'string',
      required: true,
      enum: ['draft', 'active', 'archived'],
      default: 'draft'
    },
    priority: {
      type: 'number',
      required: false,
      min: 1,
      max: 10,
      default: 5
    },
    metadata: {
      type: 'json',
      required: false
    }
  },
  
  // KV storage configuration
  kv: {
    namespace: 'EXAMPLE',  // Must match wrangler.toml binding
    keyPattern: 'example:{id}'
  },
  
  // D1 storage configuration
  d1: {
    table: 'examples',
    syncFields: [
      'title',
      'status',
      'priority',
      'created_at',
      'updated_at'
      // Note: deleted_at is automatically added when softDelete is enabled
    ]
  },
  
  // Model options
  options: {
    softDelete: true  // Automatically adds deleted_at field
  }
};

// Register with enhanced features for auto-CloudFunctions
EnhancedDataModel.registerModel(ExampleModel, {
  auth: true,  // Require authentication for CloudFunctions
  rateLimit: {
    requests: 100,
    window: 60  // 100 requests per minute
  }
});
```

### 2. Add KV Namespace to wrangler.toml

Add your KV namespace binding to `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "EXAMPLE"
id = "your-namespace-id"  # Replace with actual ID after creation
```

### 3. Create the KV Namespace

Run the following command to create the namespace:

```bash
wrangler kv:namespace create "EXAMPLE"
```

This will output something like:
```
🌀 Creating namespace with title "nimbus-platform-EXAMPLE"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "EXAMPLE", id = "abc123def456..." }
```

Update `wrangler.toml` with the actual namespace ID.

### 4. Add Model to KV Mapping

**REQUIRED:** Add your model to the KV namespace mapping in `src/modules/datastore/adapters/kv.js`:

```javascript
getKVMapping() {
  const mapping = {};
  
  // ... existing code ...
  
  // Add special cases that use CACHE namespace
  mapping.LOG = this.env.CACHE;
  mapping.VERIFY = this.env.CACHE;
  mapping.NOTIFICATION = this.env.CACHE;
  mapping.WEBHOOK_CONFIG = this.env.CACHE;
  mapping.EXAMPLE = this.env.CACHE;  // ← Add your model here
  
  // OR if it has its own namespace:
  // mapping.EXAMPLE = this.env.EXAMPLES;
  
  return mapping;
}
```

**Choose one:**
- **Use shared CACHE namespace:** `mapping.EXAMPLE = this.env.CACHE;` (most common)
- **Use dedicated namespace:** `mapping.EXAMPLE = this.env.EXAMPLES;` (if you created one in step 3)

**Why?** Every model needs to be mapped to a KV namespace. Without this, you'll get:
```
Error: Unknown class: EXAMPLE. Please ensure the KV namespace is configured...
```

---

### 5. Register Auto-CloudFunctions

Add your model to the auto-registration system by editing `src/cloudfunctions/datamodels-auto/index.js`:

```javascript
// Import your model
import '../../models/example.js';

export async function registerAutoDataModelFunctions(cloudFunction) {
  // The model is automatically registered when imported
  // Just ensure your model file is imported above
  
  await autoCloudFunctionRegistry.registerWithCloudFunction(cloudFunction);
}
```

### 6. Initialize Database Tables

After deploying your changes, run the system initialization to create D1 tables:

```bash
# Using the CLI
node test-initialize-schema.js

# Or via CloudFunction (if authenticated)
curl -X POST https://your-worker.workers.dev/api/function \
  -H "Content-Type: application/json" \
  -H "X-Session-Token: your-session-token" \
  -d '{"action": "system.initialize"}'
```

### 7. Test Your Model

Your model now has the following auto-generated CloudFunctions:

- `example.create` - Create a new record
- `example.get` - Get a single record by ID
- `example.list` - List records with pagination and filtering
- `example.update` - Update an existing record
- `example.delete` - Soft delete a record

Test them using:

```javascript
// Create
const result = await cf.run('example.create', {
  title: 'Test Example',
  description: 'This is a test',
  status: 'active'
});

// List
const list = await cf.run('example.list', {
  page: 1,
  pageSize: 20,
  filter: { status: 'active' },
  sort: 'created_at',
  order: 'desc'
});

// Get
const item = await cf.run('example.get', {
  id: 'ex_abc123'
});

// Update
const updated = await cf.run('example.update', {
  id: 'ex_abc123',
  title: 'Updated Title'
});

// Delete (soft delete)
const deleted = await cf.run('example.delete', {
  id: 'ex_abc123'
});
```

## Common Issues and Solutions

### Error: "Table for model 'X' does not exist"
**Solution:** Run `system.initialize` CloudFunction to create database tables.

### Error: "KV namespace for model 'X' is not configured"
**Solution:** 
1. Add the KV namespace to `wrangler.toml`
2. Create the namespace with `wrangler kv:namespace create`
3. Update the namespace ID in `wrangler.toml`
4. Add to hardcoded lists (temporary requirement)

### Error: "Unknown class: X"
**Solution:** Add your model's class name to `VALID_CLASSES` in `keys.js` and the namespace mapping in `kv.js`.

## Model Field Types

Supported field types:
- `string` - Text up to 255 characters
- `text` - Longer text content
- `number` - Integer values
- `boolean` - true/false values
- `json` - JSON objects/arrays
- `timestamp` - Date/time values

## Field Options

- `required` - Field must have a value
- `primary` - Primary key field
- `auto` - Auto-generated value
- `prefix` - Prefix for auto-generated IDs
- `default` - Default value if not provided
- `enum` - Array of allowed values
- `min`/`max` - Min/max values for numbers
- `minLength`/`maxLength` - Length constraints for strings

## Best Practices

1. **Use Soft Delete**: Enable `softDelete: true` in options for data recovery
2. **Index Important Fields**: Add frequently queried fields to `syncFields`
3. **Validate Data**: Use field constraints to ensure data quality
4. **Use Prefixed IDs**: Add `prefix` to primary keys for easier identification
5. **Document Fields**: Add descriptions to complex fields
6. **🔒 Security: Add `user_id` for User-Scoped Data**:
   ```javascript
   fields: {
     model_id: { type: 'string', primary: true },
     user_id: { type: 'string', required: true },  // ← Add this!
     // ... other fields
   },
   d1: {
     syncFields: [
       'user_id',  // ← Make it queryable
       // ... other fields
     ]
   }
   ```
   - Auto-generated `list` CloudFunctions **automatically filter by `user_id`**
   - Prevents unauthorized access to other users' data
   - Client-provided `user_id` filters are blocked
   - See `docs/SECURITY_USER_ID_FILTERING.md` for details

## Future Improvements

The following improvements are planned to simplify the setup process:

1. **Dynamic KV Namespace Registration**: Automatically register KV namespaces without hardcoded lists
2. **Automatic Table Creation**: Create tables on first use without manual initialization
3. **CLI Model Generator**: Command to scaffold new models with all required setup
4. **Namespace Auto-Creation**: Automatically create KV namespaces during deployment
