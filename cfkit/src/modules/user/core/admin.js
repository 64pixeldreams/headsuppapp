/**
 * Admin functions for user management
 * List, search, suspend, activate users
 */

/**
 * List users with pagination
 * @param {object} options - Query options
 * @param {Datastore} datastore - Authenticated datastore instance
 * @param {Logger} logger - Logger instance
 * @returns {Promise<{success: boolean, users?: array, total?: number, error?: string}>}
 */
export async function listUsers(options = {}, datastore, logger) {
  const timer = logger?.timer('user.list');
  
  try {
    // Validate admin access
    if (datastore.authContext !== 'admin') {
      throw new Error('Admin access required');
    }

    const {
      limit = 20,
      offset = 0,
      status = 'active',
      orderBy = 'created',
      order = 'DESC'
    } = options;

    // Query users
    // TODO: Implement D1 query method in datastore or use alternative approach
    // For now, this would need to be implemented differently
    // const result = await datastore.D1.query('USER', {
    //   where: status !== 'all' ? { status } : undefined,
    //   limit,
    //   offset,
    //   orderBy,
    //   order
    // });
    
    // Temporary: Return empty result
    const result = { items: [], total: 0 };

    // Remove sensitive data
    const users = result.items.map(user => {
      const { password_hash, ...safeUser } = user;
      return safeUser;
    });

    logger?.info('Users listed', { count: users.length });
    timer?.end({ success: true });
    
    return { 
      success: true,
      users,
      total: result.total,
      limit,
      offset
    };
    
  } catch (err) {
    logger?.error('Failed to list users', err);
    timer?.end({ error: true });
    
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Find user by email
 * @param {string} email - User email
 * @param {Datastore} datastore - Authenticated datastore instance
 * @param {Logger} logger - Logger instance
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
export async function findByEmail(email, datastore, logger) {
  const timer = logger?.timer('user.findByEmail');
  
  try {
    // Validate admin access
    if (datastore.authContext !== 'admin') {
      throw new Error('Admin access required');
    }

    // Find by email using email mapping
    const emailKey = `email:${email.toLowerCase().trim()}`;
    const emailMapping = await datastore.get('EMAIL', emailKey);
    
    if (!emailMapping) {
      return { 
        success: true,
        user: null 
      };
    }

    // Get the user
    const user = await datastore.get('USER', emailMapping.user_id);
    if (!user) {
      return { 
        success: true,
        user: null 
      };
    }

    // Remove sensitive data
    const { password_hash, ...safeUser } = user;
    
    logger?.info('User found by email', { userId: safeUser.user_id });
    timer?.end({ success: true });
    
    return { 
      success: true,
      user: safeUser 
    };
    
  } catch (err) {
    logger?.error('Failed to find user by email', err);
    timer?.end({ error: true });
    
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Suspend user account
 * @param {string} userId - User ID
 * @param {string} reason - Suspension reason
 * @param {Datastore} datastore - Authenticated datastore instance
 * @param {Logger} logger - Logger instance
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function suspendUser(userId, reason, datastore, logger) {
  const timer = logger?.timer('user.suspend');
  
  try {
    // Validate admin access
    if (datastore.authContext !== 'admin') {
      throw new Error('Admin access required');
    }

    // Get user
    const user = await datastore.get('USER', userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Update status
    user.status = 'suspended';
    user.suspended_at = new Date().toISOString();
    user.suspended_reason = reason;
    user.updated = new Date().toISOString();
    
    await datastore.put('USER', userId, user);
    
    // Deactivate all API keys
    const apiKeys = await datastore.get('LIST', `apikeys:${userId}`);
    if (apiKeys && apiKeys.items) {
      for (const keyHash of apiKeys.items) {
        const key = await datastore.get('APIKEY', keyHash);
        if (key && key.active) {
          key.active = false;
          key.suspended_at = new Date().toISOString();
          await datastore.put('APIKEY', keyHash, key);
        }
      }
    }
    
    logger?.info('User suspended', { userId, reason });
    timer?.end({ success: true });
    
    return { success: true };
    
  } catch (err) {
    logger?.error('Failed to suspend user', err);
    timer?.end({ error: true });
    
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Activate suspended user account
 * @param {string} userId - User ID
 * @param {Datastore} datastore - Authenticated datastore instance
 * @param {Logger} logger - Logger instance
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function activateUser(userId, datastore, logger) {
  const timer = logger?.timer('user.activate');
  
  try {
    // Validate admin access
    if (datastore.authContext !== 'admin') {
      throw new Error('Admin access required');
    }

    // Get user
    const user = await datastore.get('USER', userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Check if suspended
    if (user.status !== 'suspended') {
      return { 
        success: true,
        message: 'User is not suspended' 
      };
    }

    // Update status
    user.status = 'active';
    delete user.suspended_at;
    delete user.suspended_reason;
    user.updated = new Date().toISOString();
    
    await datastore.put('USER', userId, user);
    
    // Reactivate API keys that were suspended
    const apiKeys = await datastore.get('LIST', `apikeys:${userId}`);
    if (apiKeys && apiKeys.items) {
      for (const keyHash of apiKeys.items) {
        const key = await datastore.get('APIKEY', keyHash);
        if (key && key.suspended_at && !key.revoked_at) {
          key.active = true;
          delete key.suspended_at;
          await datastore.put('APIKEY', keyHash, key);
        }
      }
    }
    
    logger?.info('User activated', { userId });
    timer?.end({ success: true });
    
    return { success: true };
    
  } catch (err) {
    logger?.error('Failed to activate user', err);
    timer?.end({ error: true });
    
    return {
      success: false,
      error: err.message
    };
  }
}
