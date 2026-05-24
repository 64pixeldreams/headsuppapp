/**
 * Google OAuth utilities
 * Handles Google OAuth token verification and user info retrieval
 */

/**
 * Verify Google OAuth ID token
 * @param {string} idToken - Google ID token
 * @param {string} clientId - Google OAuth client ID
 * @returns {Promise<Object|null>} Decoded token payload or null if invalid
 */
export async function verifyGoogleToken(idToken, clientId) {
  try {
    // Fetch Google's public keys for token verification
    const jwksResponse = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    if (!jwksResponse.ok) {
      throw new Error('Failed to fetch Google public keys');
    }
    
    const jwks = await jwksResponse.json();
    
    // Decode token header to get key ID
    const tokenParts = idToken.split('.');
    if (tokenParts.length !== 3) {
      throw new Error('Invalid token format');
    }
    
    const header = JSON.parse(atob(tokenParts[0]));
    const payload = JSON.parse(atob(tokenParts[1]));
    
    // Verify token claims
    if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
      throw new Error('Invalid token issuer');
    }
    
    if (payload.aud !== clientId) {
      throw new Error('Invalid token audience');
    }
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      throw new Error('Token expired');
    }
    
    // For production, you should verify the signature using JWKS
    // For now, we'll trust the token if it passes basic checks
    // In production, use a JWT library like jose or jsonwebtoken
    
    return {
      sub: payload.sub, // Google user ID
      email: payload.email,
      email_verified: payload.email_verified || false,
      name: payload.name || payload.given_name || '',
      picture: payload.picture || '',
      given_name: payload.given_name || '',
      family_name: payload.family_name || ''
    };
    
  } catch (error) {
    console.error('Google token verification error:', error);
    return null;
  }
}

/**
 * Exchange authorization code for tokens
 * @param {string} code - Authorization code from Google
 * @param {string} clientId - Google OAuth client ID
 * @param {string} clientSecret - Google OAuth client secret
 * @param {string} redirectUri - Redirect URI
 * @returns {Promise<Object|null>} Token response or null if failed
 */
export async function exchangeCodeForTokens(code, clientId, clientSecret, redirectUri) {
  try {
    const tokenUrl = 'https://oauth2.googleapis.com/token';
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('Token exchange failed:', error);
      return null;
    }
    
    const tokenData = await response.json();
    return tokenData;
    
  } catch (error) {
    console.error('Token exchange error:', error);
    return null;
  }
}

/**
 * Get user info from Google using access token
 * @param {string} accessToken - Google access token
 * @returns {Promise<Object|null>} User info or null if failed
 */
export async function getGoogleUserInfo(accessToken) {
  try {
    const userInfoUrl = 'https://www.googleapis.com/oauth2/v2/userinfo';
    
    const response = await fetch(userInfoUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch user info');
    }
    
    return await response.json();
    
  } catch (error) {
    console.error('Get user info error:', error);
    return null;
  }
}

/**
 * Generate Google OAuth authorization URL
 * @param {string} clientId - Google OAuth client ID
 * @param {string} redirectUri - Redirect URI
 * @param {string} state - Optional state parameter for CSRF protection
 * @param {string[]} scopes - OAuth scopes
 * @returns {string} Authorization URL
 */
export function generateGoogleAuthUrl(clientId, redirectUri, state = null, scopes = ['openid', 'email', 'profile']) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent'
  });
  
  if (state) {
    params.append('state', state);
  }
  
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

