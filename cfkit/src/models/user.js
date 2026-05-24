import { EnhancedDataModel } from '../modules/datamodel/enhanced-registration.js';
import { storePasswordHash } from '../modules/auth/utils/passwords.js';

/**
 * USER model
 *
 * Required by CFKit user/auth modules (`src/modules/user/*`, `src/modules/auth/*`).
 */
export const UserModel = {
  name: 'USER',

  fields: {
    user_id: { type: 'string', primary: true, auto: true, prefix: 'us' },
    email: { type: 'string', required: true },

    // Stored by user creation logic
    password_hash: { type: 'string', required: true },
    email_verified: { type: 'boolean', default: false },

    profile: { type: 'json', default: {} },
    settings: { type: 'json', default: {} },

    status: { type: 'string', default: 'active', enum: ['active', 'disabled'] }
  },

  kv: { namespace: 'USERS', keyPattern: 'user:{id}' },

  d1: {
    table: 'users',
    syncFields: ['user_id', 'email', 'email_verified', 'status', 'created_at', 'updated_at']
  },

  hooks: {
    // Store email->password hash mapping for login lookups.
    // This is KV-only (EMAIL class in CACHE namespace) and does not affect D1.
    async afterCreate(instance, _data, env, logger) {
      const email = instance.get('email');
      const userId = instance.get('user_id');
      const passwordHash = instance.get('password_hash');
      if (!email || !userId || !passwordHash) return;
      await storePasswordHash(env, email.toLowerCase(), userId, passwordHash, logger);
    }
  },

  options: { timestamps: true, softDelete: true, auth: true }
};

EnhancedDataModel.registerModel(UserModel, { auth: false });

