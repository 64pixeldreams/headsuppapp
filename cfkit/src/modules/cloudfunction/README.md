# CloudFunction Module

Unified API interface for function-based operations. Provides a single endpoint that dispatches to registered functions with automatic authentication, validation, and logging.

## Core Features

- **Single API Endpoint**: `POST /api/function`
- **Function-based Interface**: `CloudFunction.run("action", payload)`
- **Automatic Authentication**: API keys and sessions
- **Payload Validation**: Based on function rules
- **Centralized Logging**: Integrated with LOGS module
- **Error Handling**: Consistent error responses

## Usage

### Backend Registration

```javascript
import { CloudFunction } from './modules/cloudfunction/index.js';

// Initialize with environment
const cloudFunction = new CloudFunction(env);

// Register a function
cloudFunction.define('project.create', async (request) => {
  const { name, domain } = request.payload;
  const { auth, env, logger } = request;
  
  // Your function logic here
  const project = await ProjectManager.create(env, auth.user_id, { name, domain });
  
  logger.log('Project created', { projectId: project.project_id });
  return { success: true, project };
}, {
  auth: true,
  validation: {
    name: { type: 'string', required: true },
    domain: { type: 'string', required: true, validation: 'domain' }
  }
});
```

### Frontend Usage

```javascript
// Simple function calls
const result = await CloudFunction.run('project.create', {
  name: 'My Website',
  domain: 'example.com'
});

if (result.success) {
  console.log('Project created:', result.data.project_id);
}
```

## Request Format

```javascript
POST /api/function
{
  "action": "project.create",
  "payload": {
    "name": "My Website",
    "domain": "example.com"
  }
}
```

## Response Format

### Success Response
```javascript
{
  "success": true,
  "data": { ... },
  "logs": [...],
  "requestId": "req_123",
  "duration": 150,
  "function": "project.create"
}
```

### Error Response
```javascript
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": { field: "name", reason: "required" }
  },
  "logs": [...],
  "requestId": "req_123"
}
```

## Function Options

```javascript
cloudFunction.define('action', handler, {
  auth: true,                    // Require authentication
  validation: {                  // Payload validation rules
    field: { type: 'string', required: true }
  },
  timeout: 30000,               // Function timeout (ms)
  rateLimit: { requests: 10, window: 60000 }, // Per-user rate limit
  logLevel: 'info'              // Logging level
});
```

## Integration Points

- **AUTH**: Automatic authentication handling
- **LOGS**: Integrated logging with performance tracking
- **Datastore**: Access to authenticated datastore
- **Validation**: Uses DataModel validation system

## Module Structure

```
cloudfunction/
├── index.js                    # Module exports
├── core/
│   ├── cloudfunction.js        # Main CloudFunction class
│   └── function-registry.js    # Function registration
├── middleware/
│   ├── auth-middleware.js      # Authentication handling
│   └── validation-middleware.js # Payload validation
├── utils/
│   ├── error-handler.js        # Error handling
│   └── response-builder.js     # Response building
└── README.md
```

## Notes

- All functions receive `request` object with `payload`, `auth`, `env`, `logger`
- Authentication is handled automatically based on function requirements
- Validation uses the same system as DataModel
- All operations are logged with performance tracking
- Error handling is centralized and consistent
