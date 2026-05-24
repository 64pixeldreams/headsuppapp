/**
 * Database Initializer
 * Handles automatic table creation and schema updates on app startup
 */

import { generateTableSchema } from './schema-generator.js';

/**
 * Initialize all tables for registered models
 * Called on app startup
 * @param {Map} modelRegistry - Registered models
 * @param {object} datastore - Datastore instance
 * @param {object} logger - Logger instance
 */
export async function initializeDatabase(modelRegistry, datastore, logger) {
  const timer = logger?.timer('db.initialize');
  let tablesCreated = 0;
  let tablesChecked = 0;
  let columnsAdded = 0;
  
  try {
    logger?.log('Database initialization started');
    
    for (const [modelName, modelDef] of modelRegistry) {
      if (!modelDef.d1?.table) {
        continue; // Skip models without D1 tables
      }
      
      const tableName = modelDef.d1.table;
      tablesChecked++;
      
      try {
        // Check if table exists
        const checkQuery = `SELECT name FROM sqlite_master WHERE type='table' AND name=?`;
        const result = await datastore.D1.execute(checkQuery, [tableName]);
        
        if (!result.results || result.results.length === 0) {
          // Table doesn't exist - create it
          const createSQL = generateTableSchema(modelDef);
          await datastore.D1.execute(createSQL);
          
          logger?.log('Table created', { model: modelName, table: tableName });
          tablesCreated++;
        } else {
          // Table exists - ensure schema is up to date (add new columns only).
          const added = await ensureMissingColumns(modelDef, datastore, logger);
          columnsAdded += added;
          logger?.log('Table exists', { model: modelName, table: tableName, columnsAdded: added });
        }
        
      } catch (error) {
        logger?.error('Table initialization failed', { 
          model: modelName, 
          table: tableName, 
          error: error.message 
        });
        // Continue with other tables
      }
    }
    
    logger?.log('Database initialization completed', { 
      tablesChecked, 
      tablesCreated,
      columnsAdded
    });
    timer?.end({ tablesChecked, tablesCreated, columnsAdded, success: true });
    
  } catch (error) {
    logger?.error('Database initialization failed', error);
    timer?.end({ error: true });
    throw error;
  }
}

async function ensureMissingColumns(modelDef, datastore, logger) {
  const tableName = modelDef.d1?.table;
  if (!tableName) return 0;

  // Build desired column set from syncFields + standard fields.
  const syncFields = modelDef.d1?.syncFields || [];
  const standardFields = ['created_at', 'updated_at'];
  if (modelDef.options?.softDelete || modelDef.softDelete) {
    standardFields.push('deleted_at');
  }
  const desired = new Set([...syncFields, ...standardFields]);

  // Read existing columns
  const pragma = await datastore.D1.execute(`PRAGMA table_info(${tableName});`);
  const existing = new Set((pragma.results || []).map((r) => r.name));

  let added = 0;
  for (const col of desired) {
    if (existing.has(col)) continue;

    // Determine type/default using the same rules as schema-generator.
    let sqlType = 'TEXT';
    let notNull = '';
    let defaultVal = '';

    if (['created_at', 'updated_at'].includes(col)) {
      sqlType = 'TIMESTAMP';
      defaultVal = ' DEFAULT CURRENT_TIMESTAMP';
    } else if (col === 'deleted_at') {
      sqlType = 'TIMESTAMP';
    } else if (col === 'user_id') {
      sqlType = 'TEXT';
      notNull = ' NOT NULL';
    } else {
      const fieldDef = modelDef.fields?.[col];
      if (fieldDef) {
        const typeMap = { string: 'TEXT', text: 'TEXT', number: 'INTEGER', boolean: 'INTEGER', json: 'TEXT', object: 'TEXT', timestamp: 'TIMESTAMP' };
        sqlType = typeMap[fieldDef.type] || 'TEXT';
        if (fieldDef.required) notNull = ' NOT NULL';
        if (fieldDef.default !== undefined && col !== 'created_at' && col !== 'updated_at') {
          // Keep default formatting simple and safe
          if (fieldDef.type === 'boolean') defaultVal = ` DEFAULT ${fieldDef.default ? 1 : 0}`;
          else if (fieldDef.type === 'number') defaultVal = ` DEFAULT ${Number(fieldDef.default)}`;
          else if (fieldDef.type === 'json' || fieldDef.type === 'object') defaultVal = ` DEFAULT '${JSON.stringify(fieldDef.default)}'`;
          else defaultVal = ` DEFAULT '${String(fieldDef.default)}'`;
        }
      }
    }

    // ALTER TABLE only supports ADD COLUMN (no IF NOT EXISTS in SQLite/D1).
    const alter = `ALTER TABLE ${tableName} ADD COLUMN ${col} ${sqlType}${notNull}${defaultVal};`;
    try {
      await datastore.D1.execute(alter);
      added++;
    } catch (e) {
      logger?.error?.('Failed adding missing column', { table: tableName, col, error: e?.message });
    }
  }
  return added;
}
