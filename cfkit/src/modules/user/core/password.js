/**
 * Password management operations
 * Change password, forgot password, reset password using DataModel
 */

import { DataModel } from '../../datamodel/index.js';
import { UserModel } from '../../../models/user.js';
import { hashPassword, verifyPassword } from '../../auth/utils/passwords.js';
import { generateToken } from '../utils/tokens.js';

// Register User model
DataModel.registerModel(UserModel);

/**
 * Change user password
 * @param {string} userId - User ID
 * @param {string} oldPassword - Current password
 * @param {string} newPassword - New password
 * @param {object} env - Cloudflare environment
 * @param {Logger} logger - Logger instance
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function changePassword(userId, oldPassword, newPassword, env, logger) {
  const timer = logger?.timer('user.changePassword');
  
  try {
    // Initialize datastore
    const { Datastore } = await import('../../datastore/index.js');
    const datastore = new Datastore(env, logger);
    
    // Get user
    const user = await DataModel.get('USER', datastore, userId, logger);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify old password
    const validPassword = await verifyPassword(oldPassword, user.get('password_hash'));
    if (!validPassword) {
      throw new Error('Invalid current password');
    }

    // Hash new password
    const newHash = await hashPassword(newPassword);
    
    // Update user using DataModel
    await user.update({ password_hash: newHash });
    
    // Invalidate all sessions (via AUTH module)
    // TODO: Call AUTH.invalidateSessions(userId)
    
    logger?.info('Password changed', { userId });
    timer?.end({ success: true });
    
    return { success: true };
    
  } catch (err) {
    logger?.error('Failed to change password', err);
    timer?.end({ error: true });
    
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Initiate forgot password flow
 * @param {string} email - User email
 * @param {Datastore} datastore - Authenticated datastore instance
 * @param {Messenger} messenger - Messaging instance
 * @param {Logger} logger - Logger instance
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function forgotPassword(email, datastore, messenger, logger) {
  const timer = logger?.timer('user.forgotPassword');
  
  try {
    // Find user by email
    const emailKey = `email:${email.toLowerCase().trim()}`;
    const emailMapping = await datastore.get('EMAIL', emailKey);
    
    if (!emailMapping) {
      // Don't reveal if email exists
      logger?.info('Forgot password for unknown email', { email });
      return { success: true };
    }

    // Get the user
    const user = await datastore.get('USER', emailMapping.user_id);
    if (!user) {
      logger?.error('Email mapping points to non-existent user', { userId: emailMapping.user_id });
      return { success: true };
    }
    
    // Generate reset token
    const resetToken = await generateToken();
    const resetData = {
      user_id: user.user_id,
      email: user.email,
      expires: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours
      type: 'password_reset'
    };
    
    // Store reset token
    await datastore.put('VERIFY', resetToken, resetData);
    
    // Send reset email
    await messenger.sendTemplate('password-reset', user.email, {
      name: user.profile.name || user.email,
      resetLink: `${messenger.env.APP_URL}/reset-password?token=${resetToken}`,
      expiryHours: 2
    });
    
    logger?.info('Password reset initiated', { userId: user.user_id });
    timer?.end({ success: true });
    
    return { success: true };
    
  } catch (err) {
    logger?.error('Failed to initiate password reset', err);
    timer?.end({ error: true });
    
    return {
      success: false,
      error: 'Failed to process request'
    };
  }
}

/**
 * Reset password with token
 * @param {string} token - Reset token
 * @param {string} newPassword - New password
 * @param {Datastore} datastore - Authenticated datastore instance
 * @param {Logger} logger - Logger instance
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function resetPassword(token, newPassword, datastore, logger) {
  const timer = logger?.timer('user.resetPassword');
  
  try {
    // Get reset token
    const resetData = await datastore.get('VERIFY', token);
    if (!resetData) {
      throw new Error('Invalid or expired reset token');
    }

    // Check expiry
    if (new Date(resetData.expires) < new Date()) {
      await datastore.delete('VERIFY', token);
      throw new Error('Reset token has expired');
    }

    // Check type
    if (resetData.type !== 'password_reset') {
      throw new Error('Invalid token type');
    }

    // Get user
    const user = await datastore.get('USER', resetData.user_id);
    if (!user) {
      throw new Error('User not found');
    }

    // Hash new password
    const newHash = await hashPassword(newPassword);
    
    // Update user
    user.password_hash = newHash;
    user.updated = new Date().toISOString();
    await datastore.put('USER', resetData.user_id, user);
    
    // Delete used token
    await datastore.delete('VERIFY', token);
    
    // Invalidate all sessions
    // TODO: Call AUTH.invalidateSessions(resetData.user_id)
    
    logger?.info('Password reset completed', { userId: resetData.user_id });
    timer?.end({ success: true });
    
    return { success: true };
    
  } catch (err) {
    logger?.error('Failed to reset password', err);
    timer?.end({ error: true });
    
    return {
      success: false,
      error: err.message
    };
  }
}
