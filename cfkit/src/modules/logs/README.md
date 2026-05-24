# 📊 LOGS Module

Centralized, context-aware logging for debugging, audit trails, and performance tracking.

## 🎯 Purpose

The LOGS module provides:
- **Context-Aware Logging** - Know exactly where logs come from
- **Performance Controls** - Turn on/off for production
- **Error Tracking** - Always log errors with stack traces
- **Audit Trails** - Persist important operations
- **Performance Timing** - Built-in operation timers
- **Request Correlation** - Track logs across a request

## 🚀 Quick Start

```javascript
import { LOGS } from './modules/logs';

// In your route handler
export async function handleRequest(request, env, ctx) {
  // Set request context once
  LOGS.setRequest({
    requestId: crypto.randomUUID(),
    userId: auth.user_id,
    url: request.url,
    method: request.method
  });

  const logger = LOGS.init('API.createProject');
  
  try {
    logger.log('Creating project', { name: projectName });
    
    // Use timer for performance tracking
    const timer = logger.timer('database_write');
    await db.put('PROJECT', id, data);
    timer.end(); // Logs: "database_write took 45ms"
    
    return new Response(JSON.stringify({ success: true }));
    
  } catch (error) {
    logger.error('Failed to create project', error);
    
    // Return error with logs for debugging
    return new Response(JSON.stringify({
      error: error.message,
      logs: LOGS.getRecent(10),
      requestId: LOGS.getRequestId()
    }), { status: 500 });
  }
}
```

## 📝 Log Levels

```javascript
logger.debug('Detailed debugging info');    // Level 0
logger.log('Normal operation info');        // Level 1 (info)
logger.warn('Something suspicious');        // Level 2
logger.error('Something failed', error);    // Level 3 (always logged)
logger.fatal('System broken', error);       // Level 4 (always logged)
```

## 🎮 Performance Controls

```javascript
// Production mode - minimal logging
LOGS.off();          // Only errors
LOGS.errorsOnly();   // Errors and fatals only

// Development mode
LOGS.on();           // All logs enabled
LOGS.setLevel('debug'); // Set specific level

// Check current level
console.log(LOGS.getLevel()); // 'error'
```

## 🎯 Context Management

```javascript
// Create nested contexts
const logger = LOGS.init('DATASTORE');
const kvLogger = logger.init('KV');
const putLogger = kvLogger.init('put');

putLogger.log('Storing data');
// Output: [DATASTORE.KV.put] Storing data
```

## ⏱️ Performance Tracking

```javascript
// Simple timer
const timer = logger.timer('api_call');
const response = await fetch(url);
timer.end(); // Logs: "api_call took 1.23s"

// Timer with additional data
const timer2 = logger.timer('processing');
const result = await process(data);
timer2.end({ 
  records: result.length,
  status: 'success' 
});
```

## 💾 Persistent Audit Trails

```javascript
// Create saved logger for important operations
const audit = LOGS.saved(datastore, auth, pageId);

// Log operation steps
audit.log('AI Optimization started', { model: 'gpt-4' });
audit.log('Prompt sent', { tokens: 1500 });
audit.log('Response received', { status: 200 });
audit.log('Applied changes', { count: 5 });

// Save to datastore
const logId = await audit.persist();
// Saved to LOG:page_123:1704564923000

// Retrieve later
const savedLog = await datastore.get('LOG', logId);
console.log(savedLog.summary);
// { total_steps: 4, duration_ms: 2340, success: true }
```

## 📊 Structured Output

```javascript
// Get logs as structured data
const logs = LOGS.getStructured();
/*
[
  {
    timestamp: '2024-01-01T12:00:00Z',
    level: 'info',
    context: 'API.createProject',
    message: 'Creating project',
    data: { name: 'My Project' },
    requestId: 'abc-123',
    userId: 'user_456'
  }
]
*/

// Get recent logs
const recentErrors = LOGS.getRecent(5);
```

## 🔐 Security Features

### Automatic Sensitive Data Masking
```javascript
logger.log('User login', {
  email: 'user@example.com',
  password: 'secret123',  // Automatically masked
  token: 'abc123'         // Automatically masked
});
// Output: User login {"email":"user@example.com","password":"[REDACTED]","token":"[REDACTED]"}
```

### Masked Fields
- password, token, secret, key
- auth, authorization
- cookie, session

## 🎯 Integration Examples

### With Datastore
```javascript
// Pass logger to datastore
const logger = LOGS.init('ROUTE.updateUser');
const db = new Datastore(env).auth(userId);

// Datastore can now log operations
try {
  await db.put('USER', userId, userData);
  logger.log('User updated successfully');
} catch (error) {
  logger.error('Failed to update user', error);
  throw error;
}
```

### Error Responses
```javascript
catch (error) {
  logger.error('Operation failed', error);
  
  return new Response(JSON.stringify({
    error: {
      message: error.message,
      code: 'OPERATION_FAILED'
    },
    debug: {
      logs: LOGS.getRecent(20),
      requestId: LOGS.getRequestId(),
      timestamp: new Date().toISOString()
    }
  }), { 
    status: 500,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

## 📏 Best Practices

1. **Set Request Context Early**
   ```javascript
   // At the start of request handler
   LOGS.setRequest({ requestId, userId, method, url });
   ```

2. **Use Descriptive Contexts**
   ```javascript
   // Good
   const logger = LOGS.init('USER.profile.update');
   
   // Bad
   const logger = LOGS.init('handler');
   ```

3. **Log Meaningful Data**
   ```javascript
   // Good
   logger.log('Project created', { projectId, name, userId });
   
   // Bad
   logger.log('Success');
   ```

4. **Use Timers for Performance**
   ```javascript
   const timer = logger.timer('external_api');
   const data = await callExternalAPI();
   timer.end({ recordCount: data.length });
   ```

5. **Always Log Errors**
   ```javascript
   try {
     // operations
   } catch (error) {
     logger.error('Descriptive error message', error);
     throw error; // Re-throw after logging
   }
   ```

## 🚨 Troubleshooting

### Logs Not Appearing
```javascript
// Check if logging is enabled
console.log(LOGS.getLevel()); // Should not be 'off'

// Force enable
LOGS.on();
```

### Too Many Logs
```javascript
// Reduce log level
LOGS.setLevel('warn'); // Only warnings and above

// Or turn off in production
if (env.ENVIRONMENT === 'production') {
  LOGS.errorsOnly();
}
```

### Memory Usage
```javascript
// Clear logs periodically
LOGS.clear();

// Or limit array size (in logger.js)
if (this.logs.length > 1000) {
  this.logs = this.logs.slice(-500);
}
```

## 📚 Module Structure

```
logs/
├── index.js           # Public exports
├── core/
│   ├── logger.js      # Main Logger class
│   ├── saved-logger.js # Persistent audit trails
│   └── singleton.js   # LOGS singleton instance
└── utils/
    ├── levels.js      # Log level management
    ├── formatter.js   # Output formatting
    └── timer.js       # Performance timer
```

## 🧪 Testing

### Running Tests
```bash
# Test LOGS module
npm run test:logs

# Test all modules
npm test
```

### Test Coverage
The test suite covers:
- ✅ Basic logging at all levels
- ✅ Context tracking (nested contexts)
- ✅ Request context persistence
- ✅ Performance controls (on/off/errorsOnly)
- ✅ Timer functionality
- ✅ Timer double-end protection
- ✅ Sensitive data masking
- ✅ Log level filtering
- ✅ getRecent functionality

### Example Test
```javascript
// Test performance controls
LOGS.off();
logger.log('Will not appear');
logger.error('Will appear', new Error()); // Errors always log

LOGS.setLevel('warn');
logger.log('Will not appear'); // info < warn
logger.warn('Will appear');    // warn >= warn
```

## 🔗 See Also

- [Logs Specification](../../../../specs/00-logs.md)
- [Test Suite](../../tests/test-logs.js)
- [Implementation Guide](../../../../specs/00-implementation-guide.md)
