/**
 * User deletion logic
 * GDPR-compliant soft delete with grace period using DataModel
 */

import { DataModel } from '../../datamodel/index.js';
import { UserModel } from '../../../models/user.js';

// Register User model
DataModel.registerModel(UserModel);

/**
 * Soft delete user (30 day grace period)
 * @param {string} userId - User ID
 * @param {object} env - Cloudflare environment
 * @param {string} authUserId - Authenticated user ID
 * @param {Logger} logger - Logger instance
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteUser(userId, env, authUserId, logger) {
  const timer = logger?.timer('user.delete');
  
  try {
    // Initialize datastore
    const { Datastore } = await import('../../datastore/index.js');
    const datastore = new Datastore(env, logger);
    
    // Validate user can delete (must match auth context)
    if (authUserId !== userId && authUserId !== 'admin') {
      throw new Error('Unauthorized to delete this user');
    }

    // Get user
    const user = await DataModel.get('USER', datastore, userId, logger);
    if (!user) {
      throw new Error('User not found');
    }

    // Mark as deleted (soft delete) using DataModel
    const deletionScheduled = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
    await user.update({
      status: 'deleted',
      deletion_scheduled: deletionScheduled
    });
    
    // Revoke all API keys
    const apiKeys = await datastore.get('LIST', `apikeys:${userId}`);
    if (apiKeys && apiKeys.items) {
      for (const keyHash of apiKeys.items) {
        const key = await datastore.get('APIKEY', keyHash);
        if (key) {
          key.active = false;
          key.revoked_at = new Date().toISOString();
          key.revoked_reason = 'User account deleted';
          await datastore.put('APIKEY', keyHash, key);
        }
      }
    }
    
    // Invalidate all sessions
    // TODO: Call AUTH.invalidateSessions(userId)
    
    logger?.info('User marked for deletion', { userId, scheduledDeletion: deletionScheduled });
    timer?.end({ success: true });
    
    return { 
      success: true,
      message: 'Account scheduled for deletion in 30 days. You can recover your account by logging in before then.'
    };
    
  } catch (err) {
    logger?.error('Failed to delete user', err);
    timer?.end({ error: true });
    
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Immediately purge user data (GDPR request)
 * @param {string} userId - User ID
 * @param {Datastore} datastore - Authenticated datastore instance
 * @param {Logger} logger - Logger instance
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function purgeUser(userId, datastore, logger) {
  const timer = logger?.timer('user.purge');
  
  try {
    // Get user for logging
    const user = await datastore.get('USER', userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Anonymize user data
    const anonymizedUser = {
      user_id: userId,
      email: `deleted_${userId}@anonymized.local`,
      password_hash: 'DELETED',
      email_verified: false,
      created: user.created,
      updated: new Date().toISOString(),
      deleted_at: new Date().toISOString(),
      profile: {
        name: 'Deleted User',
        company: '',
        timezone: 'UTC'
      },
      settings: {},
      status: 'purged'
    };
    
    await datastore.put('USER', userId, anonymizedUser);
    
    // Delete all user data
    // - API keys
    const apiKeys = await datastore.get('LIST', `apikeys:${userId}`);
    if (apiKeys && apiKeys.items) {
      for (const keyHash of apiKeys.items) {
        await datastore.delete('APIKEY', keyHash);
      }
      await datastore.delete('LIST', `apikeys:${userId}`);
    }
    
    // - Projects
    const projects = await datastore.get('LIST', `projects:${userId}`);
    if (projects && projects.items) {
      for (const projectId of projects.items) {
        await datastore.delete('PROJECT', projectId);
        // TODO: Delete associated pages, batches, etc.
      }
      await datastore.delete('LIST', `projects:${userId}`);
    }
    
    logger?.info('User data purged', { userId });
    timer?.end({ success: true });
    
    return { success: true };
    
  } catch (err) {
    logger?.error('Failed to purge user', err);
    timer?.end({ error: true });
    
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Export all user data (GDPR request)
 * @param {string} userId - User ID
 * @param {Datastore} datastore - Authenticated datastore instance
 * @param {Logger} logger - Logger instance
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function exportUserData(userId, datastore, logger) {
  const timer = logger?.timer('user.export');
  
  try {
    const exportData = {
      exported_at: new Date().toISOString(),
      user: {},
      api_keys: [],
      projects: [],
      activity: []
    };
    
    // Get user data
    const user = await datastore.get('USER', userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    // Remove sensitive data
    const { password_hash, ...safeUser } = user;
    exportData.user = safeUser;
    
    // Get API keys
    const apiKeys = await datastore.get('LIST', `apikeys:${userId}`);
    if (apiKeys && apiKeys.items) {
      for (const keyHash of apiKeys.items) {
        const key = await datastore.get('APIKEY', keyHash);
        if (key) {
          exportData.api_keys.push({
            name: key.name,
            created: key.created,
            last_used: key.last_used,
            active: key.active
          });
        }
      }
    }
    
    // Get projects
    const projects = await datastore.get('LIST', `projects:${userId}`);
    if (projects && projects.items) {
      for (const projectId of projects.items) {
        const project = await datastore.get('PROJECT', projectId);
        if (project) {
          exportData.projects.push(project);
        }
      }
    }
    
    logger?.info('User data exported', { userId });
    timer?.end({ success: true });
    
    return { 
      success: true,
      data: exportData 
    };
    
  } catch (err) {
    logger?.error('Failed to export user data', err);
    timer?.end({ error: true });
    
    return {
      success: false,
      error: err.message
    };
  }
}
