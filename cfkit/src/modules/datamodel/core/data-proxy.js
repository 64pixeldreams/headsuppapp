/**
 * DataProxy Class
 * Lightweight wrapper for D1 query results with lazy KV loading
 */

import { DataModel } from './datamodel.js';

export class DataProxy {
  constructor(d1Data, modelName, datastore, logger) {
    this.d1Data = d1Data;
    this.kvData = null;
    this.modelName = modelName;
    this.datastore = datastore;
    this.logger = logger;
    this.isHydrated = false;
    
    // Expose D1 fields directly on the proxy object
    Object.assign(this, d1Data);
  }

  /**
   * Fetch full data from KV
   * @param {boolean} refresh - Force refresh from KV (default: false)
   * @returns {DataProxy} This proxy with full data loaded
   */
  async fetchData(refresh = false) {
    const timer = this.logger?.timer('dataproxy.fetchData');
    
    try {
      if (!this.isHydrated || refresh) {
        this.logger?.log('Fetching full data from KV', { 
          model: this.modelName, 
          id: this.getPrimaryKeyValue(),
          refresh 
        });
        
        // Get full object from KV
        this.kvData = await this.datastore.get(this.modelName, this.getPrimaryKeyValue());
        
        if (!this.kvData) {
          throw new Error(`${this.modelName} ${this.getPrimaryKeyValue()} not found in KV`);
        }
        
        // Merge KV data into proxy (overwrites D1 data with fresh KV data)
        Object.assign(this, this.kvData);
        this.isHydrated = true;
        
        timer?.end({ success: true, refresh });
      } else {
        this.logger?.log('Using cached KV data', { 
          model: this.modelName, 
          id: this.getPrimaryKeyValue() 
        });
        timer?.end({ cached: true });
      }
      
      return this;
      
    } catch (error) {
      this.logger?.error('fetchData failed', error);
      timer?.end({ error: true });
      throw error;
    }
  }

  /**
   * Get field value with KV-aware error handling
   * @param {string} fieldName - Field to retrieve
   * @returns {any} Field value
   */
  get(fieldName) {
    // If field exists in current data (D1 or hydrated KV), return it
    if (this.hasOwnProperty(fieldName)) {
      return this[fieldName];
    }
    
    // If not hydrated, check if this might be a KV-only field
    if (!this.isHydrated) {
      throw new Error(`Field '${fieldName}' requires fetchData() - stored in KV only`);
    }
    
    // Field doesn't exist at all
    return undefined;
  }

  /**
   * Check if proxy has full KV data loaded
   * @returns {boolean} True if KV data is loaded
   */
  isFullyLoaded() {
    return this.isHydrated;
  }

  /**
   * Get the primary key value for this record
   * @returns {string} Primary key value
   */
  getPrimaryKeyValue() {
    // ✅ FIX: Look up primary key from model definition (not hardcoded)
    const modelDef = DataModel.getDefinition(this.modelName);
    
    // Find the field marked as primary: true
    if (modelDef?.fields) {
      for (const [fieldName, fieldDef] of Object.entries(modelDef.fields)) {
        if (fieldDef.primary) {
          return this[fieldName];
        }
      }
    }
    
    // Fallback to convention if no primary key found
    const pkField = `${this.modelName.toLowerCase()}_id`;
    return this[pkField] || this.id;
  }

  /**
   * Convert to plain JSON object
   * @returns {object} Plain object with all current data
   */
  toJSON() {
    const result = {};
    
    // Include all enumerable properties
    for (const key in this) {
      if (this.hasOwnProperty(key) && !key.startsWith('_') && 
          typeof this[key] !== 'function' && 
          !['d1Data', 'kvData', 'modelName', 'datastore', 'logger', 'isHydrated'].includes(key)) {
        result[key] = this[key];
      }
    }
    
    return result;
  }

  /**
   * Placeholder for future batch loading enhancement
   * @returns {Promise<DataProxy[]>} Array of proxies with data loaded
   */
  static async fetchDataAll(proxies, refresh = false) {
    // TODO: Implement batch KV loading for performance
    // For now, fetch individually
    const promises = proxies.map(proxy => proxy.fetchData(refresh));
    return await Promise.all(promises);
  }
}
