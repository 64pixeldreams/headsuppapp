/**
 * AUTH Module - Public API
 * Unified authentication for API keys and user sessions
 * See specs/00-auth.md for implementation details
 */

export { Auth } from './core/auth.js';
export { withAuth } from './middleware/with-auth.js';
export { AUTH } from './core/singleton.js';

// Re-export auth endpoints
export { login } from './endpoints/login.js';
export { signup } from './endpoints/signup.js';
export { logout } from './endpoints/logout.js';
export { me } from './endpoints/me.js';
