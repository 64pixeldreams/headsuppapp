/**
 * User update logic
 * Updates user profile and settings using DataModel
 */

import { DataModel } from '../../datamodel/index.js';
import { UserModel } from '../../../models/user.js';

// Register User model
DataModel.registerModel(UserModel);

/**
 * Update user profile
 * @param {string} userId - User ID
 * @param {object} data - Update data
 * @param {object} env - Cloudflare environment
 * @param {string} authUserId - Authenticated user ID
 * @param {Logger} logger - Logger instance
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
export async function updateUser(userId, data, env, authUserId, logger) {
  const timer = logger?.timer?.('user.update');
  
  try {
    // Initialize datastore
    const { Datastore } = await import('../../datastore/index.js');
    const datastore = new Datastore(env, logger);
    
    // Validate user can update (must match auth context)
    if (authUserId !== userId && authUserId !== 'admin') {
      throw new Error('Unauthorized to update this user');
    }

    // Get existing user
    const user = await DataModel.get('USER', datastore, userId, logger);
    if (!user) {
      throw new Error('User not found');
    }

    // Prepare update data
    const updateData = {};

    // Update profile if provided
    if (data.profile) {
      updateData.profile = {
        ...user.get('profile'),
        ...data.profile
      };
    }

    // Update settings if provided
    if (data.settings) {
      updateData.settings = {
        ...user.get('settings'),
        ...data.settings
      };
    }

    // Update email if provided (requires reverification)
    if (data.email && data.email !== user.get('email')) {
      updateData.email = data.email.toLowerCase().trim();
      updateData.email_verified = false;
      // TODO: Send new verification email
    }

    // Update user using DataModel
    const updatedUser = await user.update(updateData);
    
    logger?.info?.('User updated', { userId });
    timer?.end({ success: true });
    
    return { 
      success: true, 
      user: updatedUser.toJSON()
    };
    
  } catch (err) {
    logger?.error?.('Failed to update user', err);
    timer?.end({ error: true });
    
    return {
      success: false,
      error: err.message
    };
  }
}
