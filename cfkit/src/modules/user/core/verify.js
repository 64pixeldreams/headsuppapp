/**
 * Email verification logic
 * Verify email addresses with tokens
 */

/**
 * Verify user email with token
 * @param {string} userId - User ID (for validation)
 * @param {string} token - Verification token
 * @param {Datastore} datastore - Authenticated datastore instance
 * @param {Logger} logger - Logger instance
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function verifyEmail(userId, token, datastore, logger) {
  const timer = logger?.timer('user.verify');
  
  try {
    // Get verification token
    const verifyData = await datastore.get('VERIFY', token);
    if (!verifyData) {
      throw new Error('Invalid or expired verification token');
    }

    // Check expiry
    if (new Date(verifyData.expires) < new Date()) {
      await datastore.delete('VERIFY', token);
      throw new Error('Verification token has expired');
    }

    // Check type
    if (verifyData.type !== 'email') {
      throw new Error('Invalid token type');
    }

    // Validate user ID matches (if provided)
    if (userId && verifyData.user_id !== userId) {
      throw new Error('Token does not match user');
    }

    // Get user
    const user = await datastore.get('USER', verifyData.user_id);
    if (!user) {
      throw new Error('User not found');
    }

    // Check email matches
    if (user.email !== verifyData.email) {
      throw new Error('Email mismatch');
    }

    // Update user
    user.email_verified = true;
    user.updated = new Date().toISOString();
    await datastore.put('USER', verifyData.user_id, user);
    
    // Delete used token
    await datastore.delete('VERIFY', token);
    
    logger?.info('Email verified', { userId: verifyData.user_id });
    timer?.end({ success: true });
    
    return { 
      success: true,
      userId: verifyData.user_id 
    };
    
  } catch (err) {
    logger?.error('Failed to verify email', err);
    timer?.end({ error: true });
    
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Resend verification email
 * @param {string} userId - User ID
 * @param {Datastore} datastore - Authenticated datastore instance
 * @param {Messenger} messenger - Messaging instance
 * @param {Logger} logger - Logger instance
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function resendVerification(userId, datastore, messenger, logger) {
  const timer = logger?.timer('user.resendVerification');
  
  try {
    // Get user
    const user = await datastore.get('USER', userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Check if already verified
    if (user.email_verified) {
      return { 
        success: true, 
        message: 'Email already verified' 
      };
    }

    // Generate new verification token
    const { generateToken } = await import('../utils/tokens.js');
    const verifyToken = await generateToken();
    const verifyData = {
      user_id: userId,
      email: user.email,
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      type: 'email'
    };
    
    // Store verification token
    await datastore.put('VERIFY', verifyToken, verifyData);
    
    // Send verification email
    await messenger.sendTemplate('verification', user.email, {
      name: user.profile.name || user.email,
      email: user.email,
      verificationLink: `${messenger.env.APP_URL}/verify?token=${verifyToken}`
    });
    
    logger?.info('Verification email resent', { userId });
    timer?.end({ success: true });
    
    return { success: true };
    
  } catch (err) {
    logger?.error('Failed to resend verification', err);
    timer?.end({ error: true });
    
    return {
      success: false,
      error: err.message
    };
  }
}
