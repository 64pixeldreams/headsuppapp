/**
 * User creation logic
 * Creates new user with email verification flow using DataModel
 */

import { DataModel } from '../../datamodel/index.js';
import { UserModel } from '../../../models/user.js';
import { hashPassword } from '../../auth/utils/passwords.js';
import { generateToken } from '../utils/tokens.js';

// Register User model
DataModel.registerModel(UserModel);

/**
 * Create a new user
 * @param {string} email - User email
 * @param {string} password - Plain text password
 * @param {object} profile - Optional profile data
 * @param {object} env - Cloudflare environment
 * @param {Messenger} messenger - Messaging instance
 * @param {Logger} logger - Logger instance
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
export async function createUser(email, password, profile = {}, env, messenger, logger) {
  const timer = logger?.timer('user.create');
  
  try {
    // Initialize datastore
    const { Datastore } = await import('../../datastore/index.js');
    const datastore = new Datastore(env, logger);
    
    // Check if user already exists by email
    const existingUser = await DataModel.query('USER', datastore, logger)
      .where('email', email.toLowerCase().trim())
      .first();
    
    if (existingUser) {
      throw new Error('User already exists with this email');
    }

    // Hash password
    const passwordHash = await hashPassword(password);
    const nowIso = new Date().toISOString();
    
    // Create user using DataModel
    const user = await DataModel.create('USER', datastore, {
      email: email.toLowerCase().trim(),
      password_hash: passwordHash,
      email_verified: false,
      profile: {
        name: profile.name || '',
        company: profile.company || '',
        timezone: profile.timezone || 'UTC',
        // Onboarding state (KV-only via `profile` JSON).
        // Present only for new accounts; clients treat missing as "not required".
        onboarding: {
          v: 1,
          state: 'pending',
          step: 'dataset',
          dataset_id: '',
          created_at: nowIso,
          updated_at: nowIso,
          completed_at: ''
        },
        ...profile
      },
      settings: {
        notifications: true,
        newsletter: false
      },
      status: 'active'
    }, logger);
    
    // Generate verification token
    const verifyToken = await generateToken();
    const verifyData = {
      user_id: user.get('user_id'),
      email: user.get('email'),
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      type: 'email'
    };
    
    // Store verification token
    await datastore.put('VERIFY', verifyToken, verifyData);
    
    // Send verification email
    if (messenger) {
      await messenger.sendTemplate('verification', user.get('email'), {
        name: user.get('profile').name || user.get('email'),
        email: user.get('email'),
        verificationLink: `${messenger.env.APP_URL}/verify?token=${verifyToken}`
      });
    }
    
    logger?.log('User created', { userId: user.get('user_id'), email: user.get('email') });
    timer?.end({ success: true });
    
    return { 
      success: true, 
      user: user.toJSON(),
      verificationToken: verifyToken 
    };
    
  } catch (err) {
    logger?.error('Failed to create user', err);
    timer?.end({ error: true });
    
    return {
      success: false,
      error: err.message
    };
  }
}
