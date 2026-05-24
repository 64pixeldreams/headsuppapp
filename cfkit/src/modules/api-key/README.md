# 🔑 API Key Management Module

Complete API key lifecycle management with CRUD operations, usage tracking, and security features.

## 🎯 Purpose

The API Key module provides:
- **Create** - Generate secure API keys
- **List** - View all keys for a user
- **Info** - Get details about specific keys
- **Revoke** - Disable keys (soft delete)
- **Usage Tracking** - Monitor key usage

## 🚀 Quick Start

### Creating an API Key
```javascript
POST /api/keys
Authorization: Bearer {token}

{
  "name": "Production Key",
  "permissions": ["read", "write"]
}

Response:
{
  "success": true,
  "api_key": "sk_live_a1b2c3d4e5f6...",
  "key_hash": "sha256:abc123...",
  "name": "Production Key",
  "created": "2024-01-01T00:00:00Z",
  "message": "Save this API key securely. It will not be shown again."
}
```

### Using the API Key
```bash
curl -H "Authorization: Bearer sk_live_a1b2c3d4e5f6..." \
  https://api.example.com/data
```

## 📋 Endpoints

### Create API Key
```javascript
POST /api/keys

// Requires authentication
// Body:
{
  "name": "Key Name",          // Optional, defaults to "Default Key"
  "permissions": ["read"]      // Optional, inherits from auth
}

// Returns: New API key (only time it's visible)
```

### List API Keys
```javascript
GET /api/keys

// Requires authentication
// Returns:
{
  "success": true,
  "keys": [
    {
      "key_hash": "sha256:abc123...",
      "key_preview": "sk_live_a1b2c3d4...",
      "name": "Production Key",
      "created": "2024-01-01T00:00:00Z",
      "last_used": "2024-01-02T00:00:00Z",
      "active": true,
      "permissions": ["read", "write"],
      "usage": {
        "requests_today": 150,
        "requests_total": 1500
      }
    }
  ],
  "count": 1
}
```

### Get Key Info
```javascript
GET /api/keys/:keyHash

// Requires authentication
// Returns: Detailed info about specific key
{
  "success": true,
  "key": {
    "key_hash": "sha256:abc123...",
    "key_preview": "sk_live_a1b2c3d4...",
    "name": "Production Key",
    "created": "2024-01-01T00:00:00Z",
    "last_used": "2024-01-02T00:00:00Z",
    "active": true,
    "permissions": ["read", "write"],
    "rate_limit": {
      "requests": 1000,
      "window": 3600
    },
    "usage": {
      "requests_today": 150,
      "requests_total": 1500
    },
    "is_current": true  // If this key is being used for auth
  }
}
```

### Revoke API Key
```javascript
DELETE /api/keys/:keyHash

// Requires authentication
// Cannot revoke the key being used for current request
// Returns:
{
  "success": true,
  "message": "API key revoked successfully",
  "key_hash": "sha256:abc123...",
  "name": "Production Key"
}
```

## 🔒 Security Features

### Key Generation
- 256-bit cryptographically secure random keys
- Prefixed with `sk_live_` for identification
- SHA-256 hashed for storage

### Access Control
- Users can only manage their own keys
- Cannot revoke the key used for current auth
- Auth context enforced via datastore

### Usage Tracking
Each key tracks:
- `requests_today` - Rolling 24-hour count
- `requests_total` - Lifetime requests
- `last_used` - Timestamp of last use

## 💾 Storage Schema

```javascript
// KV: apikey:{keyHash}
{
  "user_id": "user_123",
  "name": "Production Key",
  "created": "2024-01-01T00:00:00Z",
  "last_used": "2024-01-02T00:00:00Z",
  "active": true,
  "revoked": null,  // Set when revoked
  "permissions": ["read", "write"],
  "rate_limit": {
    "requests": 1000,
    "window": 3600
  },
  "usage": {
    "requests_today": 150,
    "requests_total": 1500
  }
}

// KV: apikeys:{userId} (list)
["keyHash1", "keyHash2", "keyHash3"]
```

## 🏗️ Integration Example

```javascript
import { withAuth } from '../auth';
import { createKey, listKeys, revokeKey, getKeyInfo } from '../api-key';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // API Key endpoints
    if (url.pathname === '/api/keys' && request.method === 'POST') {
      return withAuth(request, env, ctx, createKey);
    }
    
    if (url.pathname === '/api/keys' && request.method === 'GET') {
      return withAuth(request, env, ctx, listKeys);
    }
    
    if (url.pathname.match(/^\/api\/keys\/([^\/]+)$/)) {
      const keyHash = url.pathname.split('/')[3];
      const params = { keyHash };
      
      if (request.method === 'GET') {
        return withAuth(request, env, ctx, (req, env, ctx, auth) => 
          getKeyInfo(req, env, ctx, auth, params)
        );
      }
      
      if (request.method === 'DELETE') {
        return withAuth(request, env, ctx, (req, env, ctx, auth) => 
          revokeKey(req, env, ctx, auth, params)
        );
      }
    }
    
    return new Response('Not found', { status: 404 });
  }
};
```

## 🎯 Best Practices

1. **Name Your Keys** - Use descriptive names like "Production", "Development", "CI/CD"
2. **Rotate Regularly** - Create new keys and revoke old ones periodically
3. **Minimal Permissions** - Only grant permissions actually needed
4. **Monitor Usage** - Check usage stats to detect anomalies
5. **Never Share Keys** - Each service/user should have their own key

## 🧪 Testing

The API key module integrates with AUTH and DATASTORE modules which are already tested. Key features to verify:

- ✅ Key generation is cryptographically secure
- ✅ Only owners can manage their keys
- ✅ Revoked keys cannot be used
- ✅ Usage tracking increments correctly
- ✅ Cannot revoke current auth key

## 📚 Module Structure

```
api-key/
├── index.js           # Public exports
└── endpoints/
    ├── create.js      # Create new API key
    ├── list.js        # List all keys
    ├── info.js        # Get key details
    └── revoke.js      # Revoke (soft delete) key
```

## 🔗 See Also

- [API Key Specification](../../../../specs/01-api-key-management.md)
- [Auth Module](../auth/) - For key validation
- [Datastore Module](../datastore/) - For storage
