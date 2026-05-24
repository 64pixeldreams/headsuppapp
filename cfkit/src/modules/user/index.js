/**
 * USER module exports
 * Complete user lifecycle management
 */

// Core user operations
export { createUser } from './core/create.js';
export { updateUser } from './core/update.js';
export { deleteUser, purgeUser, exportUserData } from './core/delete.js';

// Password management
export { changePassword, forgotPassword, resetPassword } from './core/password.js';

// Email verification
export { verifyEmail, resendVerification } from './core/verify.js';

// Admin functions
export { listUsers, findByEmail, suspendUser, activateUser } from './core/admin.js';

// Utilities
export { generateToken, generateCode } from './utils/tokens.js';
