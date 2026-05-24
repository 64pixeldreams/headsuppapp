/**
 * DATASTORE Module - Public API
 * Exports the main Datastore class and utilities
 * See specs/00-datastore.md for implementation details
 */

export { Datastore } from './core/datastore.js';
export { compositeKey } from './utils/keys.js';
export { stripAuthData } from './utils/auth.js';
