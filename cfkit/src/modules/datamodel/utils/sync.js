/**
 * Sync Utility
 * Handles synchronization between KV and D1
 */

/**
 * Get effective sync fields with auto-appended system fields
 * @param {object} modelDef - Model definition
 * @returns {array} Complete sync fields list
 */
function getEffectiveSyncFields(modelDef) {
  const userSyncFields = modelDef.d1?.syncFields || [];
  const systemFields = [];
  
  // Auto-detect primary key field
  const primaryKeyField = `${modelDef.name.toLowerCase()}_id`;
  if (!userSyncFields.includes(primaryKeyField)) {
    systemFields.push(primaryKeyField);
  }
  
  // Auto-add timestamp fields if timestamps are enabled
  if (modelDef.options?.timestamps !== false) {
    if (!userSyncFields.includes('created_at')) {
      systemFields.push('created_at');
    }
    if (!userSyncFields.includes('updated_at')) {
      systemFields.push('updated_at');
    }
  }
  
  // Auto-add deleted_at if soft delete is enabled
  if (modelDef.options?.softDelete === true) {
    if (!userSyncFields.includes('deleted_at')) {
      systemFields.push('deleted_at');
    }
  }
  
  // Combine user fields + system fields (no duplicates)
  return [...userSyncFields, ...systemFields];
}

/**
 * Prepare data for KV storage
 * @param {object} data - All model data
 * @param {object} modelDef - Model definition
 * @returns {object} Data ready for KV
 */
export function prepareKVData(data, modelDef) {
  const kvData = { ...data };
  
  // Add timestamps if enabled
  if (modelDef.options?.timestamps !== false) {
    if (!kvData.created_at) {
      kvData.created_at = new Date().toISOString();
    }
    kvData.updated_at = new Date().toISOString();
  }
  
  return kvData;
}

/**
 * Prepare data for D1 storage
 * @param {object} data - All model data
 * @param {object} modelDef - Model definition
 * @returns {object} Only fields that should sync to D1
 */
export function prepareD1Data(data, modelDef) {
  const d1Data = {};
  
  // Auto-append system fields to syncFields
  const syncFields = getEffectiveSyncFields(modelDef);
  
  // Only include fields specified in syncFields
  if (syncFields && syncFields.length > 0) {
    for (const field of syncFields) {
      if (data[field] !== undefined) {
        const fieldDef = modelDef.fields[field];
        const value = data[field];
        
        // Handle structured fields by stringifying them (D1 binds do not accept arrays/objects).
        // NOTE: 'json' fields are expected to be stored as TEXT in D1.
        if ((fieldDef?.type === 'json' || fieldDef?.type === 'object' || fieldDef?.type === 'array') && value !== null && value !== undefined) {
          d1Data[field] = typeof value === 'string' ? value : JSON.stringify(value);
        } else {
          d1Data[field] = value;
        }
      }
    }
  }
  
  return d1Data;
}

/**
 * Build D1 insert query
 * @param {string} table - Table name
 * @param {object} data - Data to insert
 * @returns {object} { query: string, bindings: array }
 */
export function buildInsertQuery(table, data) {
  const fields = Object.keys(data);
  const placeholders = fields.map(() => '?').join(', ');
  const values = Object.values(data);
  
  return {
    query: `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`,
    bindings: values
  };
}

/**
 * Build D1 update query
 * @param {string} table - Table name
 * @param {object} data - Data to update
 * @param {string} idField - Primary key field
 * @param {string} id - Record ID
 * @returns {object} { query: string, bindings: array }
 */
export function buildUpdateQuery(table, data, idField, id) {
  const fields = Object.keys(data).filter(f => f !== idField);
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => data[f]);
  values.push(id);
  
  return {
    query: `UPDATE ${table} SET ${setClause} WHERE ${idField} = ?`,
    bindings: values
  };
}
