/**
 * DataModel Module
 * Provides unified interface for KV and D1 storage
 * See specs/06-datamodel.md for implementation details
 */

export { DataModel } from './core/datamodel.js';
export { DataProxy } from './core/data-proxy.js';
export { generateUUID } from './utils/uuid.js';
export { validateFields } from './utils/validator.js';
export { QueryBuilder } from './core/query-builder.js';
