/**
 * Schema Generator Utility
 * Generates D1 SQL schema from DataModel definitions
 */

/**
 * Map field types to SQL types
 */
const TYPE_MAPPINGS = {
  'string': 'TEXT',
  'text': 'TEXT',
  'number': 'INTEGER',
  'boolean': 'INTEGER', // 0 or 1
  'json': 'TEXT',       // JSON stored as string
  'object': 'TEXT',     // JSON stored as string
  'timestamp': 'TIMESTAMP'
};

/**
 * Generate CREATE TABLE statement for a model
 * @param {object} modelDef - Model definition
 * @returns {string} SQL CREATE TABLE statement
 */
export function generateTableSchema(modelDef) {
  if (!modelDef.d1?.table) {
    return null; // Skip models without D1 config
  }
  
  const tableName = modelDef.d1.table;
  const syncFields = modelDef.d1.syncFields || [];
  const fields = [];
  const indexes = [];
  
  // Get primary key field
  const primaryKeyField = Object.entries(modelDef.fields || {})
    .find(([_, def]) => def.primary)?.[0];
  
  // Auto-add standard fields if not already included
  const standardFields = ['created_at', 'updated_at'];
  if (modelDef.options?.softDelete || modelDef.softDelete) {
    standardFields.push('deleted_at');
  }
  
  // Merge standard fields with syncFields (avoid duplicates)
  const allFields = [...new Set([...syncFields, ...standardFields])];
  
  // Add synced fields
  allFields.forEach(fieldName => {
    // Handle built-in fields
    if (['created_at', 'updated_at', 'deleted_at'].includes(fieldName)) {
      if (fieldName === 'deleted_at') {
        fields.push(`  ${fieldName} TIMESTAMP`);
      } else {
        fields.push(`  ${fieldName} TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
      }
    } else if (fieldName === 'user_id') {
      // Special case: user_id is primary key in users table
      if (tableName === 'users' && fieldName === primaryKeyField) {
        fields.push(`  user_id TEXT PRIMARY KEY`);
      } else {
        fields.push(`  user_id TEXT NOT NULL`);
        indexes.push(`CREATE INDEX IF NOT EXISTS idx_${tableName}_user_id ON ${tableName} (user_id);`);
      }
    } else if (fieldName === primaryKeyField) {
      fields.push(`  ${fieldName} TEXT PRIMARY KEY`);
    } else {
      // Regular field from model definition
      const fieldDef = modelDef.fields?.[fieldName];
      if (fieldDef) {
        const sqlType = TYPE_MAPPINGS[fieldDef.type] || 'TEXT';
        const notNull = fieldDef.required ? ' NOT NULL' : '';
        const defaultVal = fieldDef.default !== undefined ? 
          ` DEFAULT ${formatDefault(fieldDef.default, fieldDef.type)}` : '';
        
        fields.push(`  ${fieldName} ${sqlType}${notNull}${defaultVal}`);
        
        // Add index for foreign keys
        if (fieldName.endsWith('_id')) {
          indexes.push(`CREATE INDEX IF NOT EXISTS idx_${tableName}_${fieldName} ON ${tableName} (${fieldName});`);
        }
      } else {
        // Field not in definition, assume TEXT
        fields.push(`  ${fieldName} TEXT`);
      }
    }
  });
  
  // Build CREATE TABLE
  let sql = `-- Table: ${tableName}\n`;
  sql += `CREATE TABLE IF NOT EXISTS ${tableName} (\n`;
  sql += fields.join(',\n');
  sql += '\n);\n\n';
  
  // Add indexes
  if (indexes.length > 0) {
    sql += indexes.join('\n') + '\n';
  }
  
  return sql;
}

/**
 * Format default value for SQL
 */
function formatDefault(value, type) {
  if (value === null) return 'NULL';
  if (type === 'boolean') return value ? '1' : '0';
  if (type === 'number') return value.toString();
  if (type === 'json' || type === 'object') return `'${JSON.stringify(value)}'`;
  return `'${value}'`;
}

/**
 * Generate schema for all registered models
 * @param {Map} modelRegistry - Map of registered models
 * @returns {string} Complete SQL schema
 */
export function generateCompleteSchema(modelRegistry) {
  let schema = '-- DataModel Generated Schema\n';
  schema += '-- Generated at: ' + new Date().toISOString() + '\n\n';
  
  // Generate tables
  for (const [modelName, modelDef] of modelRegistry) {
    const tableSchema = generateTableSchema(modelDef);
    if (tableSchema) {
      schema += tableSchema + '\n';
    }
  }
  
  return schema;
}
