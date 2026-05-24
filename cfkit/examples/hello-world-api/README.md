# Hello World API - CFKit Example

A minimal, runnable example demonstrating how to build an API using CFKit CloudFunctions. This example shows the core concepts of CFKit without requiring databases or complex setup.

## Overview

This example demonstrates:

- **Basic CloudFunction Registration** - How to register and use CloudFunctions
- **Parameter Validation** - Automatic validation of function parameters
- **Error Handling** - Proper error responses and logging
- **CORS Support** - Cross-origin requests for web applications
- **Logging** - Integrated logging system
- **Direct Routes** - Simple GET endpoints alongside CloudFunctions

## Quick Start

### Prerequisites

- Node.js 18+ installed
- Wrangler CLI installed: `npm install -g wrangler`
- Cloudflare account (for deployment)

### Local Development

1. **Update wrangler.toml** with your Cloudflare account ID:
   ```toml
   account_id = "your-account-id-here"
   ```

2. **Start development server:**
   ```bash
   cd examples/hello-world-api
   npm install
   wrangler dev
   ```

3. **Open test page:**
   - Navigate to `http://localhost:8787/www/index.html`
   - Or use the interactive test page to try all endpoints

### Deploy to Cloudflare

```bash
wrangler deploy
```

After deployment, update the server URL in `www/index.html` or use the deployed URL.

## Project Structure

```
hello-world-api/
├── src/
│   └── index.js              # Worker entry point with CloudFunction registration
├── www/
│   └── index.html            # Interactive test page
├── wrangler.toml             # Cloudflare Worker configuration
├── package.json              # Project dependencies
├── README.md                 # This file
└── .gitignore                # Git ignore rules
```

## API Endpoints

### CloudFunctions (POST /api/function)

All CloudFunctions are accessed via `POST /api/function` with this format:

```json
{
  "action": "function.name",
  "payload": { ... }
}
```

#### 1. hello.world

Simple hello world endpoint with no required parameters.

**Request:**
```json
{
  "action": "hello.world",
  "payload": {}
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Hello, World!",
    "timestamp": "2024-01-01T12:00:00.000Z",
    "received": {}
  }
}
```

**Test with curl:**
```bash
curl -X POST http://localhost:8787/api/function \
  -H "Content-Type: application/json" \
  -d '{"action":"hello.world","payload":{}}'
```

#### 2. hello.greet

Greet someone by name. Requires `name` parameter.

**Request:**
```json
{
  "action": "hello.greet",
  "payload": {
    "name": "Alice"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Hello, Alice!",
    "timestamp": "2024-01-01T12:00:00.000Z"
  }
}
```

**Test with curl:**
```bash
curl -X POST http://localhost:8787/api/function \
  -H "Content-Type: application/json" \
  -d '{"action":"hello.greet","payload":{"name":"Alice"}}'
```

#### 3. hello.echo

Echo back a message. Requires `message` parameter.

**Request:**
```json
{
  "action": "hello.echo",
  "payload": {
    "message": "Hello from CFKit!"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "echo": {
      "message": "Hello from CFKit!"
    },
    "timestamp": "2024-01-01T12:00:00.000Z"
  }
}
```

**Test with curl:**
```bash
curl -X POST http://localhost:8787/api/function \
  -H "Content-Type: application/json" \
  -d '{"action":"hello.echo","payload":{"message":"Hello from CFKit!"}}'
```

### Direct Routes

#### GET /health

Simple health check endpoint (not a CloudFunction).

**Request:**
```bash
curl http://localhost:8787/health
```

**Response:**
```json
{
  "status": "ok",
  "message": "Hello World API is running!",
  "framework": "CFKit",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Code Walkthrough

### Worker Entry Point (`src/index.js`)

The worker entry point demonstrates:

1. **CloudFunction Initialization:**
   ```javascript
   let cloudFunction = null;
   
   if (!cloudFunction) {
     cloudFunction = new CloudFunction(env);
     await registerHelloWorldFunctions(cloudFunction);
   }
   ```

2. **CloudFunction Registration:**
   ```javascript
   cloudFunction.define('hello.world', async (requestContext) => {
     const { logger, payload } = requestContext;
     // Function logic here
     return { success: true, message: 'Hello, World!' };
   }, {
     auth: false,
     validation: {
       name: { type: 'string' } // Optional parameter
     }
   });
   ```

3. **Parameter Validation:**
   - Optional parameters: `{ type: 'string' }`
   - Required parameters: `{ type: 'string', required: true }`
   - Validation happens automatically before your function runs

4. **Error Handling:**
   - Try-catch blocks for error handling
   - Consistent error response format
   - Logging with LOGS module

5. **CORS Support:**
   - Handles OPTIONS preflight requests
   - Adds CORS headers to all responses

### Test Page (`www/index.html`)

The interactive test page:

- Uses CFramework client to call CloudFunctions
- Provides UI for testing all endpoints
- Shows formatted JSON responses
- Handles errors gracefully
- Auto-detects localhost vs production URLs

## Testing

### Using the Test Page

1. Start the dev server: `wrangler dev`
2. Open `http://localhost:8787/www/index.html`
3. Click the test buttons for each endpoint
4. View the formatted JSON responses

### Using curl

See the API Endpoints section above for curl examples for each endpoint.

### Using JavaScript (CFramework)

```javascript
// Initialize CFramework
cf.init({
  serverUrl: 'http://localhost:8787',
  appName: 'hello-world-api'
});

// Call a CloudFunction
const result = await cf.run('hello.greet', { name: 'Alice' });
console.log(result.data.message); // "Hello, Alice!"
```

## Next Steps

### Add Authentication

To require authentication for a CloudFunction:

```javascript
cloudFunction.define('hello.protected', async (requestContext) => {
  const { auth, logger } = requestContext;
  // auth.user_id is available here
  return { success: true, userId: auth.user_id };
}, {
  auth: true, // Require authentication
  validation: {}
});
```

See [Auth Module Documentation](../../src/modules/auth/README.md) for more details.

### Add a DataModel

To add database functionality:

1. Create a model in `src/models/`
2. Register it with DataModel
3. Auto-generated CloudFunctions will be available

See [DataModel Setup Guide](../../docs/DATAMODEL_SETUP_GUIDE.md) for complete instructions.

### Add More CloudFunctions

Simply add more `cloudFunction.define()` calls in the registration function:

```javascript
cloudFunction.define('my.function', async (requestContext) => {
  // Your logic here
}, {
  auth: false,
  validation: {
    // Your validation rules
  }
});
```

## Troubleshooting

### "Module not found" errors

Make sure you're running from the `examples/hello-world-api/` directory and that the parent CFKit project structure is intact. The example imports modules from `../../src/modules/`.

### CORS errors

The example includes CORS headers. If you're still seeing CORS errors:
- Check that the server URL in the test page matches your actual server
- Verify CORS headers are being set (check Network tab in browser dev tools)

### "Action not found" errors

- Verify the CloudFunction is registered (check console logs)
- Ensure the action name matches exactly (case-sensitive)
- Check that the request format is correct: `{ "action": "...", "payload": {...} }`

### Validation errors

- Check that required parameters are provided
- Verify parameter types match the validation rules
- Look at the error response for specific validation messages

## Related Documentation

- [CFKit Developer Guide](../../CFKIT_CURSOR_DEVELOPER_GUIDE.md) - Complete CFKit guide
- [CloudFunction Module](../../src/modules/cloudfunction/README.md) - CloudFunction API reference
- [Auto CloudFunctions API](../../AUTO_CLOUDFUNCTIONS_API_REFERENCE.md) - Auto-generated functions
- [DataModel Setup Guide](../../docs/DATAMODEL_SETUP_GUIDE.md) - Adding database models

## License

MIT

