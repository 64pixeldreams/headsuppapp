/**
 * Query Builder for D1
 * Provides chainable API for building queries
 */

import { DataProxy } from './data-proxy.js';

export class QueryBuilder {
  constructor(modelName, modelDef, datastore, logger) {
    this.modelName = modelName;
    this.modelDef = modelDef;
    this.datastore = datastore;
    this.logger = logger;
    
    // Query parts
    this.whereClauses = [];
    this.orderByClause = null;
    this.limitValue = 20;
    this.offsetValue = 0;
    this.includeDeletedFlag = false;
    this.onlyDeletedFlag = false;
    this.withDataFlag = false;
  }
  
  /**
   * Add WHERE clause
   */
  where(field, value) {
    this.whereClauses.push({ field, operator: '=', value });
    return this;
  }
  
  /**
   * Add WHERE IN clause
   */
  whereIn(field, values) {
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error('whereIn requires non-empty array');
    }
    this.whereClauses.push({ field, operator: 'IN', value: values });
    return this;
  }
  
  /**
   * Add ORDER BY
   */
  orderBy(field, direction = 'asc') {
    this.orderByClause = { field, direction: direction.toUpperCase() };
    return this;
  }
  
  /**
   * Set limit
   */
  limit(n) {
    this.limitValue = n;
    return this;
  }
  
  /**
   * Set offset
   */
  offset(n) {
    this.offsetValue = n;
    return this;
  }
  
  /**
   * Set page (calculates offset)
   */
  page(n) {
    this.offsetValue = (n - 1) * this.limitValue;
    return this;
  }
  
  /**
   * Include soft-deleted records
   */
  includeDeleted() {
    this.includeDeletedFlag = true;
    return this;
  }
  
  /**
   * Only show deleted records
   */
  onlyDeleted() {
    this.onlyDeletedFlag = true;
    return this;
  }
  
  /**
   * Hydrate full data from KV
   */
  withData() {
    this.withDataFlag = true;
    return this;
  }
  
  /**
   * Execute query and return results
   */
  async list() {
    const timer = this.logger?.timer('datamodel.query');
    
    try {
      // Build query
      const { query, bindings } = this.buildQuery();
      
      // Execute count query
      const countQuery = this.buildCountQuery();
      const countResult = await this.datastore.D1.execute(
        countQuery.query,
        countQuery.bindings
      );
      const total = countResult.results[0]?.count || 0;
      
      // Execute main query
      const result = await this.datastore.D1.execute(query, bindings);
      
      // Convert D1 results to DataProxy objects
      let data = result.results.map(row => 
        new DataProxy(row, this.modelName, this.datastore, this.logger)
      );
      
      // Auto-hydrate from KV if requested
      if (this.withDataFlag && data.length > 0) {
        data = await DataProxy.fetchDataAll(data);
      }
      
      // Calculate pagination
      const page = Math.floor(this.offsetValue / this.limitValue) + 1;
      const pages = Math.ceil(total / this.limitValue);
      
      timer?.end({ 
        model: this.modelName, 
        count: data.length,
        total 
      });
      
      return {
        data,
        pagination: {
          total,
          limit: this.limitValue,
          offset: this.offsetValue,
          page,
          pages,
          hasNext: page < pages,
          hasPrev: page > 1
        }
      };
      
    } catch (error) {
      this.logger?.error('Query failed', error);
      timer?.end({ error: true });
      return {
        data: [],
        pagination: {
          total: 0,
          limit: this.limitValue,
          offset: this.offsetValue,
          page: 1,
          pages: 0,
          hasNext: false,
          hasPrev: false
        },
        error: error.message
      };
    }
  }
  
  /**
   * Build SQL query
   */
  buildQuery() {
    const table = this.modelDef.d1?.table;
    if (!table) {
      throw new Error(`No D1 table defined for ${this.modelName}`);
    }
    
    let query = `SELECT * FROM ${table}`;
    const bindings = [];
    
    // Add WHERE clauses
    const whereConditions = [...this.whereClauses];
    
    // Add auth filter
    if (this.datastore.authContext) {
      whereConditions.push({ 
        field: 'user_id', 
        operator: '=', 
        value: this.datastore.authContext 
      });
    }
    
    // Add soft delete filter (only if model has softDelete enabled)
    // Models without softDelete won't have deleted_at column in their D1 table
    const hasSoftDelete = this.modelDef.options?.softDelete || this.modelDef.softDelete;
    if (hasSoftDelete && !this.includeDeletedFlag && !this.onlyDeletedFlag) {
      whereConditions.push({ 
        field: 'deleted_at', 
        operator: 'IS', 
        value: null 
      });
    } else if (hasSoftDelete && this.onlyDeletedFlag) {
      whereConditions.push({ 
        field: 'deleted_at', 
        operator: 'IS NOT', 
        value: null 
      });
    }
    
    // Build WHERE clause
    if (whereConditions.length > 0) {
      const whereParts = whereConditions.map(w => {
        if (w.operator === 'IS' || w.operator === 'IS NOT') {
          return `${w.field} ${w.operator} NULL`;
        } else if (w.operator === 'IN') {
          const placeholders = w.value.map(() => '?').join(', ');
          bindings.push(...w.value);
          return `${w.field} IN (${placeholders})`;
        } else {
          bindings.push(w.value);
          return `${w.field} ${w.operator} ?`;
        }
      });
      query += ` WHERE ${whereParts.join(' AND ')}`;
    }
    
    // Add ORDER BY
    if (this.orderByClause) {
      query += ` ORDER BY ${this.orderByClause.field} ${this.orderByClause.direction}`;
    }
    
    // Add LIMIT and OFFSET
    query += ` LIMIT ${this.limitValue} OFFSET ${this.offsetValue}`;
    
    return { query, bindings };
  }
  
  /**
   * Execute count query
   * @returns {Promise<number>} Total count of matching records
   */
  async count() {
    const timer = this.logger?.timer(`QueryBuilder.count.${this.modelName}`);
    
    try {
      const countQuery = this.buildCountQuery();
      const result = await this.datastore.D1.execute(
        countQuery.query,
        countQuery.bindings
      );
      
      const total = result.results[0]?.count || 0;
      
      timer?.end({ model: this.modelName, count: total });
      
      return total;
    } catch (error) {
      timer?.error(error);
      throw error;
    }
  }
  
  /**
   * Build count query
   */
  buildCountQuery() {
    const table = this.modelDef.d1?.table;
    let query = `SELECT COUNT(*) as count FROM ${table}`;
    const bindings = [];
    
    // Same WHERE logic as main query
    const whereConditions = [...this.whereClauses];
    
    if (this.datastore.authContext) {
      whereConditions.push({ 
        field: 'user_id', 
        operator: '=', 
        value: this.datastore.authContext 
      });
    }
    
    // Add soft delete filter (only if model has softDelete enabled)
    // Models without softDelete won't have deleted_at column in their D1 table
    const hasSoftDelete = this.modelDef.options?.softDelete || this.modelDef.softDelete;
    if (hasSoftDelete && !this.includeDeletedFlag && !this.onlyDeletedFlag) {
      whereConditions.push({ 
        field: 'deleted_at', 
        operator: 'IS', 
        value: null 
      });
    } else if (hasSoftDelete && this.onlyDeletedFlag) {
      whereConditions.push({ 
        field: 'deleted_at', 
        operator: 'IS NOT', 
        value: null 
      });
    }
    
    if (whereConditions.length > 0) {
      const whereParts = whereConditions.map(w => {
        if (w.operator === 'IS' || w.operator === 'IS NOT') {
          return `${w.field} ${w.operator} NULL`;
        } else if (w.operator === 'IN') {
          const placeholders = w.value.map(() => '?').join(', ');
          bindings.push(...w.value);
          return `${w.field} IN (${placeholders})`;
        } else {
          bindings.push(w.value);
          return `${w.field} ${w.operator} ?`;
        }
      });
      query += ` WHERE ${whereParts.join(' AND ')}`;
    }
    
    return { query, bindings };
  }
  
  /**
   * Hydrate records from KV (deprecated - using DataProxy.fetchDataAll)
   */
  async hydrateFromKV(records) {
    // Legacy method - now handled by DataProxy.fetchDataAll
    const proxies = records.map(record => 
      new DataProxy(record, this.modelName, this.datastore, this.logger)
    );
    return await DataProxy.fetchDataAll(proxies);
  }
  
  /**
   * Get primary key field name
   */
  getPrimaryKey() {
    for (const [fieldName, fieldDef] of Object.entries(this.modelDef.fields || {})) {
      if (fieldDef.primary) {
        return fieldName;
      }
    }
    return `${this.modelName.toLowerCase()}_id`;
  }

  /**
   * Get first result or null
   */
  async first() {
    const timer = this.logger?.timer('query.first');
    
    try {
      // Set limit to 1
      this.limitValue = 1;
      this.offsetValue = 0;
      
      // Execute query
      const result = await this.list();
      
      timer?.end({ found: result.data.length > 0 });
      
      // Return first item or null
      return result.data.length > 0 ? result.data[0] : null;
      
    } catch (error) {
      this.logger?.error('Query first failed', error);
      timer?.end({ error: true });
      return null;
    }
  }
}
