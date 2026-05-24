# 🔐 AUTH Module

Unified authentication system supporting both API keys and user sessions.

## 🎯 Purpose

The AUTH module provides:
- **API Key Authentication** - For programmatic access (CLI, CI/CD)
- **Session Authentication** - For web users (email/password)
- **Unified Auth Context** - Same interface for both auth types
- **Middleware Support** - Easy integration with routes
- **Complete Auth Flow** - Login, signup, logout endpoints

## 🚀 Quick Start

### API Key Authentication
```javascript
import { withAuth } from './modules/auth';

// Protected route
export default {
  async fetch(request, env, ctx) {
    return withAuth(request, env, ctx, async (req, env, ctx, auth) => {
      // auth.user_id is available here
      const db = new Datastore(env).auth(auth.user_id);
      
      return new Response(`Hello user ${auth.user_id}`);
    });
  }
};
```

### Session Authentication
```javascript
// Login endpoint
const response = await login(request, env);
// Sets HttpOnly session cookie

// Protected route works the same
return withAuth(request, env, ctx, handler);
```

## 🔑 API Key Management

### Creating API Keys
```javascript
import { generateApiKey, hashApiKey } from './modules/auth/utils/api-keys';

// Generate new key
const apiKey = generateApiKey();
const keyHash = await hashApiKey(apiKey);

// Store in datastore
await datastore.put('APIKEY', keyHash, {
  user_id: 'user_123',
  active: true,
  permissions: ['read', 'write'],
  created: new Date().toISOString()
});

// Return key to user (only time they see it)
return { api_key: apiKey };
```

### Using API Keys
```bash
curl -H "Authorization: Bearer your-api-key" https://api.example.com/data
```

## 👤 User Authentication

### Signup
```javascript
POST /auth/signup
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "John Doe"
}

Response:
{
  "success": true,
  "user_id": "user_abc123",
  "session_token": "...",
  "expires": "2024-01-08T00:00:00Z"
}
```

### Login
```javascript
POST /auth/login
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}

Response: (same as signup)
```

### Logout
```javascript
POST /auth/logout
// Requires authentication

Response:
{
  "success": true,
  "message": "Logged out successfully"
}
```

### Get Current User
```javascript
GET /auth/me
// Requires authentication

Response:
{
  "id": "user_abc123",
  "email": "user@example.com",
  "name": "John Doe",
  "created": "2024-01-01T00:00:00Z",
  "auth_type": "user",
  "permissions": ["read", "write"]
}
```

## 🛡️ Middleware

### Required Auth
```javascript
import { withAuth } from './modules/auth';

// Route requires authentication
return withAuth(request, env, ctx, async (req, env, ctx, auth) => {
  // auth is guaranteed to exist
  console.log('User:', auth.user_id);
  console.log('Type:', auth.type); // 'api' or 'user'
  console.log('Permissions:', auth.permissions);
});
```

### Optional Auth
```javascript
import { withOptionalAuth } from './modules/auth';

// Route works with or without auth
return withOptionalAuth(request, env, ctx, async (req, env, ctx, auth) => {
  if (auth) {
    return new Response(`Hello ${auth.user_id}`);
  } else {
    return new Response('Hello guest');
  }
});
```

## 🔒 Security Features

### Password Requirements
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter  
- At least 1 number

### Session Security
- HttpOnly cookies (not accessible via JS)
- Secure flag (HTTPS only)
- SameSite=Strict (CSRF protection)
- 7-day expiration
- Random 256-bit tokens

### API Key Security
- SHA-256 hashed storage
- 256-bit random keys
- Never stored in plain text
- Rate limiting support

## 📊 Auth Context

Both auth methods return the same context:

```javascript
{
  type: 'api' | 'user',
  user_id: 'user_123',
  permissions: ['read', 'write'],
  rate_limit: {
    requests: 1000,
    window: 3600
  },
  // Additional fields for sessions
  email: 'user@example.com',
  session_id: 'session_token'
}
```

## 🧪 Testing

### Running Tests
```bash
# Test AUTH module
npm run test:auth

# Test all modules
npm test
```

### Test Coverage
- ✅ API key validation
- ✅ Session validation
- ✅ Password hashing/verification
- ✅ Login/signup flow
- ✅ Middleware functionality
- ✅ Cookie management

## 💾 Storage Schema

### Sessions (KV)
```javascript
// Key: session:{token}
{
  user_id: 'user_123',
  email: 'user@example.com',
  created: '2024-01-01T00:00:00Z',
  expires: '2024-01-08T00:00:00Z',
  ip: '192.168.1.1',
  user_agent: 'Mozilla/5.0...'
}
```

### Password Hashes (KV)
```javascript
// Key: email:{email}
{
  user_id: 'user_123',
  hash: 'base64-encoded-hash',
  updated: '2024-01-01T00:00:00Z'
}
```

## 🏗️ Module Structure

```
auth/
├── index.js              # Public exports
├── core/
│   ├── auth.js          # Main Auth class
│   └── singleton.js     # AUTH singleton
├── utils/
│   ├── api-keys.js      # API key utilities
│   ├── sessions.js      # Session management
│   └── passwords.js     # Password hashing
├── middleware/
│   └── with-auth.js     # Auth middleware
└── endpoints/
    ├── login.js         # Login handler
    ├── signup.js        # Signup handler
    ├── logout.js        # Logout handler
    └── me.js           # Current user handler
```

## 🔗 Integration Example

```javascript
// Worker with auth
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Public endpoints
    if (url.pathname === '/auth/login') {
      return login(request, env);
    }
    if (url.pathname === '/auth/signup') {
      return signup(request, env);
    }
    
    // Protected endpoints
    if (url.pathname === '/auth/logout') {
      return withAuth(request, env, ctx, logout);
    }
    if (url.pathname === '/auth/me') {
      return withAuth(request, env, ctx, me);
    }
    
    // Protected API routes
    if (url.pathname.startsWith('/api/')) {
      return withAuth(request, env, ctx, async (req, env, ctx, auth) => {
        // Handle API request with auth context
      });
    }
    
    return new Response('Not found', { status: 404 });
  }
};
```

## 📚 See Also

- [Auth Specification](../../../../specs/00-auth.md)
- [User Management](../user/)
- [API Key Management](../../../../specs/00-api-key-management.md)
