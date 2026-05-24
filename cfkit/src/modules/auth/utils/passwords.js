/**
 * Password hashing and validation utilities
 * Uses Web Crypto API for PBKDF2 (Argon2 not available in CF Workers)
 */

import { Datastore } from '../../datastore/index.js';

// PBKDF2 parameters
const ITERATIONS = 100000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

/**
 * Hash a password
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password with salt
 */
export async function hashPassword(password) {
  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  
  // Convert password to buffer
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  
  // Import password as key
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  // Derive key
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: 'SHA-256'
    },
    passwordKey,
    KEY_LENGTH * 8
  );
  
  // Combine salt and hash
  const hashArray = new Uint8Array(derivedBits);
  const combined = new Uint8Array(salt.length + hashArray.length);
  combined.set(salt);
  combined.set(hashArray, salt.length);
  
  // Return as base64
  return btoa(String.fromCharCode(...combined));
}

/**
 * Verify a password against a hash
 * @param {string} password - Plain text password
 * @param {string} hash - Stored hash
 * @returns {Promise<boolean>} True if password matches
 */
export async function verifyPassword(password, hash) {
  try {
    // Decode hash
    const combined = Uint8Array.from(atob(hash), c => c.charCodeAt(0));
    
    // Extract salt and hash
    const salt = combined.slice(0, SALT_LENGTH);
    const storedHash = combined.slice(SALT_LENGTH);
    
    // Hash the provided password with same salt
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);
    
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveBits']
    );
    
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations: ITERATIONS,
        hash: 'SHA-256'
      },
      passwordKey,
      KEY_LENGTH * 8
    );
    
    const newHash = new Uint8Array(derivedBits);
    
    // Compare hashes
    return timingSafeEqual(newHash, storedHash);
  } catch (error) {
    return false;
  }
}

/**
 * Timing-safe comparison
 * @private
 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  
  return result === 0;
}

/**
 * Store password hash for user
 * @param {Object} env - Cloudflare env
 * @param {string} email - User email
 * @param {string} userId - User ID
 * @param {string} passwordHash - Hashed password
 */
export async function storePasswordHash(env, email, userId, passwordHash, logger) {
  const datastore = new Datastore(env, logger);
  
  await datastore.put('EMAIL', `email:${email}`, {
    user_id: userId,
    hash: passwordHash,
    updated: new Date().toISOString()
  });
}

/**
 * Get password hash by email
 * @param {Object} env - Cloudflare env
 * @param {string} email - User email
 * @param {Object} logger - Logger instance
 * @returns {Promise<Object|null>} Password data or null
 */
export async function getPasswordHash(env, email, logger) {
  const datastore = new Datastore(env, logger);
  return await datastore.get('EMAIL', `email:${email}`);
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} Validation result
 */
export function validatePasswordStrength(password) {
  const errors = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain lowercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain number');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
