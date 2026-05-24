# USER Management Module

Complete user lifecycle management including profile updates, password management, email verification, and admin functions.

## Features

- **User Creation**: Create users with email verification flow
- **Profile Management**: Update user profiles and settings
- **Password Management**: Change, forgot, and reset password flows
- **Email Verification**: Token-based email verification
- **GDPR Compliance**: Soft delete with grace period, data export, immediate purge
- **Admin Functions**: List, search, suspend, and activate users

## Usage

### Basic Setup

```javascript
import { Datastore } from '@/modules/datastore';
import { Messenger } from '@/modules/messaging';
import { LOGS } from '@/modules/logs';
import * as USER from '@/modules/user';

// Initialize dependencies
const datastore = new Datastore(env);
const messenger = new Messenger(env, LOGS);
```

### Creating Users

```javascript
// Create a new user
const result = await USER.createUser(
  'user@example.com',
  'SecurePassword123!',
  { name: 'John Doe', company: 'Acme Corp' },
  datastore,
  messenger,
  LOGS
);

if (result.success) {
  console.log('User created:', result.user);
  console.log('Verification token:', result.verificationToken);
}
```

### Updating Users

```javascript
// Update user profile (requires auth context)
const authedStore = datastore.auth(userId);
const result = await USER.updateUser(userId, {
  profile: {
    name: 'John Smith',
    timezone: 'America/New_York'
  },
  settings: {
    notifications: false
  }
}, authedStore, LOGS);
```

### Password Management

```javascript
// Change password (user must be authenticated)
const authedStore = datastore.auth(userId);
await USER.changePassword(
  userId,
  'oldPassword',
  'newPassword',
  authedStore,
  LOGS
);

// Forgot password flow
await USER.forgotPassword(
  'user@example.com',
  datastore,
  messenger,
  LOGS
);

// Reset password with token
await USER.resetPassword(
  resetToken,
  'newPassword',
  datastore,
  LOGS
);
```

### Email Verification

```javascript
// Verify email with token
const result = await USER.verifyEmail(
  userId, // optional validation
  verificationToken,
  datastore,
  LOGS
);

// Resend verification email
const authedStore = datastore.auth(userId);
await USER.resendVerification(
  userId,
  authedStore,
  messenger,
  LOGS
);
```

### User Deletion (GDPR)

```javascript
// Soft delete (30 day grace period)
const authedStore = datastore.auth(userId);
await USER.deleteUser(userId, authedStore, LOGS);

// Export user data
const exportResult = await USER.exportUserData(
  userId,
  authedStore,
  LOGS
);
console.log('User data:', exportResult.data);

// Immediate purge (admin only)
const adminStore = datastore.auth('admin');
await USER.purgeUser(userId, adminStore, LOGS);
```

### Admin Functions

```javascript
// Admin datastore required
const adminStore = datastore.auth('admin');

// List users with pagination
const users = await USER.listUsers({
  limit: 20,
  offset: 0,
  status: 'active', // 'active', 'suspended', 'deleted', 'all'
  orderBy: 'created',
  order: 'DESC'
}, adminStore, LOGS);

// Find user by email
const user = await USER.findByEmail(
  'user@example.com',
  adminStore,
  LOGS
);

// Suspend user
await USER.suspendUser(
  userId,
  'Terms of service violation',
  adminStore,
  LOGS
);

// Reactivate user
await USER.activateUser(userId, adminStore, LOGS);
```

## Data Structures

### User Object
```javascript
{
  user_id: 'user_12345',
  email: 'user@example.com',
  email_verified: false,
  password_hash: '...', // Not returned in responses
  created: '2024-01-01T00:00:00Z',
  updated: '2024-01-01T00:00:00Z',
  profile: {
    name: 'John Doe',
    company: 'Acme Corp',
    timezone: 'UTC'
  },
  settings: {
    notifications: true,
    newsletter: false
  },
  status: 'active' // 'active', 'suspended', 'deleted', 'purged'
}
```

### Verification Token
```javascript
// Key: verify:{token}
{
  user_id: 'user_12345',
  email: 'user@example.com',
  expires: '2024-01-02T00:00:00Z',
  type: 'email' // or 'password_reset'
}
```

## Integration Points

### With AUTH Module
- Uses `hashPassword()` and `verifyPassword()` from AUTH
- Password changes should invalidate sessions (TODO)
- User creation integrates with auth flow

### With DATASTORE
- All operations use authenticated datastore
- User data stored in KV with key `user:{user_id}`
- Verification tokens stored with key `verify:{token}`
- Lists stored as `projects:{user_id}`, `apikeys:{user_id}`

### With MESSAGING
- Sends verification emails on signup
- Sends password reset emails
- Uses templates: 'verification', 'password-reset'

### With API-KEY Module
- User deletion revokes all API keys
- User suspension deactivates keys
- User activation reactivates suspended keys

## Security Considerations

1. **Password Security**
   - Passwords hashed with PBKDF2
   - Old password required for changes
   - All sessions invalidated on password change

2. **Email Verification**
   - Required for full account access
   - Tokens expire in 24 hours
   - One-time use tokens

3. **GDPR Compliance**
   - 30-day soft delete grace period
   - Complete data export capability
   - Immediate purge option
   - Anonymization of deleted data

4. **Admin Access**
   - Admin functions require `admin` auth context
   - Audit trail via datastore `_auth` arrays

## Error Handling

All functions return consistent error format:
```javascript
{
  success: false,
  error: 'Error message'
}
```

Common errors:
- `User already exists with this email`
- `User not found`
- `Invalid current password`
- `Invalid or expired token`
- `Unauthorized to update/delete this user`
- `Admin access required`

## Testing

```bash
# Run user module tests
npm run test:user

# Run with coverage
npm run test:user -- --coverage
```
