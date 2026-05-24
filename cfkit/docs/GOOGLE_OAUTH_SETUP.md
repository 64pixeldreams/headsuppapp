# Google OAuth Setup Guide

This guide explains how to set up and use Google OAuth login in your application.

## Overview

Google OAuth has been integrated into the authentication system. Users can now sign in with their Google account instead of (or in addition to) email/password.

## Backend Setup

### 1. Environment Variables

Add these environment variables to your `wrangler.toml` or `.dev.vars`:

```toml
[vars]
GOOGLE_CLIENT_ID = "your-google-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET = "your-google-client-secret"
GOOGLE_REDIRECT_URI = "https://yourdomain.com/auth/google/callback"
PUBLIC_ORIGIN = "https://yourdomain.com"
```

For local development:
```bash
# .dev.vars
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8787/auth/google/callback
PUBLIC_ORIGIN=http://localhost:8787
```

### 2. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google+ API** (or **Google Identity Services API**)
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Configure the OAuth consent screen:
   - User Type: External (for public apps)
   - Scopes: `email`, `profile`, `openid`
6. Create OAuth 2.0 Client ID:
   - Application type: Web application
   - Authorized redirect URIs: 
     - `https://yourdomain.com/auth/google/callback` (production)
     - `http://localhost:8787/auth/google/callback` (development)
7. Copy the **Client ID** and **Client Secret**

## API Usage

### Get Google OAuth URL

**CloudFunction:** `auth.google.redirect`

```javascript
const result = await cf.run('auth.google.redirect', {
  redirect_uri: 'https://yourdomain.com/auth/google/callback', // Optional
  state: 'optional-csrf-token' // Optional
});

if (result.success) {
  // Redirect user to result.data.auth_url
  window.location.href = result.data.auth_url;
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?...",
    "state": "csrf-token-here"
  }
}
```

### Handle OAuth Callback

**CloudFunction:** `auth.google.callback`

After user authorizes, Google redirects to your callback URL with a `code` parameter.

```javascript
// Extract code from URL query params
const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');
const state = urlParams.get('state');

// Exchange code for session
const result = await cf.run('auth.google.callback', {
  code: code,
  state: state // Optional
});

if (result.success) {
  // User is logged in!
  // Store session_token and redirect to app
  localStorage.setItem('session_token', result.data.session_token);
  window.location.href = '/dashboard';
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "user_abc123",
    "session_token": "session_token_here",
    "expires": "2024-01-08T12:00:00.000Z",
    "user": {
      "user_id": "user_abc123",
      "email": "user@gmail.com",
      "name": "John Doe",
      "email_verified": true,
      "auth_provider": "google"
    }
  }
}
```

## Frontend Integration Example

### Simple Google Login Button

```html
<button id="google-login-btn">Sign in with Google</button>

<script>
document.getElementById('google-login-btn').addEventListener('click', async () => {
  try {
    // Get OAuth URL
    const result = await cf.run('auth.google.redirect');
    
    if (result.success) {
      // Redirect to Google
      window.location.href = result.data.auth_url;
    } else {
      alert('Failed to initiate Google login: ' + result.error);
    }
  } catch (error) {
    console.error('Google login error:', error);
    alert('Login failed. Please try again.');
  }
});
</script>
```

### OAuth Callback Handler

Create a page at `/auth/google/callback`:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Signing in...</title>
</head>
<body>
  <p>Signing you in...</p>
  
  <script>
  (async () => {
    try {
      // Extract code from URL
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      
      if (!code) {
        throw new Error('No authorization code received');
      }
      
      // Exchange code for session
      const result = await cf.run('auth.google.callback', { code, state });
      
      if (result.success) {
        // Store session token
        localStorage.setItem('session_token', result.data.session_token);
        
        // Redirect to app
        window.location.href = '/dashboard';
      } else {
        throw new Error(result.error || 'Login failed');
      }
    } catch (error) {
      console.error('OAuth callback error:', error);
      alert('Login failed: ' + error.message);
      window.location.href = '/login';
    }
  })();
  </script>
</body>
</html>
```

## User Model Changes

The User model now supports:
- **Optional `password_hash`**: OAuth users don't need passwords
- **`auth_provider` field**: Tracks authentication method (`'email'` or `'google'`)

OAuth users are automatically:
- Created if they don't exist
- Updated with latest Google profile info
- Marked as email verified if Google verifies their email
- Given a session token for immediate access

## Security Notes

1. **State Parameter**: Use the `state` parameter for CSRF protection. Store it in session storage and verify it matches on callback.

2. **HTTPS Required**: Google OAuth requires HTTPS in production. Use `https://` for your redirect URIs.

3. **Token Storage**: Session tokens should be stored securely (HttpOnly cookies recommended for production).

4. **Environment Variables**: Never commit `GOOGLE_CLIENT_SECRET` to version control. Use Cloudflare Workers secrets or environment variables.

## Troubleshooting

### "Google OAuth not configured"
- Check that `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set in environment variables

### "Invalid token audience"
- Verify `GOOGLE_CLIENT_ID` matches the one in Google Cloud Console

### "Failed to exchange authorization code"
- Check that `GOOGLE_REDIRECT_URI` matches exactly what's configured in Google Cloud Console
- Verify the redirect URI uses the same protocol (http/https) and domain

### "This account uses Google login"
- User tried to login with password but account was created via Google OAuth
- They should use the Google login button instead

## Testing

1. **Local Development:**
   ```bash
   # Set up .dev.vars with your Google OAuth credentials
   # Start dev server
   wrangler dev
   ```

2. **Test Flow:**
   - Click "Sign in with Google"
   - Authorize in Google popup
   - Should redirect back and create session
   - Check user in database has `auth_provider: 'google'`

3. **Test Existing User:**
   - Create user via email/password
   - Try Google login with same email
   - Should find existing user and update it

## Next Steps

- Add more OAuth providers (GitHub, Microsoft, etc.)
- Implement account linking (connect Google to existing email account)
- Add profile picture sync from Google
- Implement logout functionality

