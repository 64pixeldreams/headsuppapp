/**
 * Token generation utilities
 * Generate secure random tokens for verification and reset flows
 */

/**
 * Generate a secure random token
 * @returns {Promise<string>}
 */
export async function generateToken() {
  // Generate random bytes
  const buffer = new Uint8Array(32);
  crypto.getRandomValues(buffer);
  
  // Convert to URL-safe base64
  const base64 = btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
    
  return base64;
}

/**
 * Generate a short numeric code (for SMS/2FA)
 * @param {number} length - Code length (default 6)
 * @returns {string}
 */
export function generateCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += Math.floor(Math.random() * 10);
  }
  return code;
}
