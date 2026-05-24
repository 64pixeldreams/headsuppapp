/**
 * Enhanced DataModel Registration
 * 
 * Provides a simple API for registering models with auto CloudFunction generation
 * Integrates with the existing DataModel system while adding auto-registration
 */

import { DataModel } from './index.js';
import { autoCloudFunctionRegistry } from './auto-cloudfunctions.js';

/**
 * Enhanced DataModel Registration Class
 * 
 * Provides a clean API for model registration with automatic CloudFunction generation
 */
class EnhancedDataModel {
  /**
   * Register a model with enhanced features
   * 
   * @param {Object} model - DataModel definition
   * @param {Object} options - Registration options
   * @param {boolean} options.auth - Require authentication for all operations
   * @param {Array} options.excludeFunctions - Functions to exclude (e.g., ['delete'])
   * @param {Object} options.customFunctions - Custom CloudFunctions to add
   */
  static registerModel(model, options = {}) {
    // Validate model structure
    if (!model.name || !model.fields) {
      throw new Error('Model must have name and fields properties');
    }

    // Register with existing DataModel system (unchanged)
    DataModel.registerModel(model);

    // Register with auto CloudFunction system (new)
    autoCloudFunctionRegistry.registerModel(model, options);

    console.log(`✅ Enhanced registration complete: ${model.name}`);
  }

  /**
   * Get all registered models
   * @returns {Array} List of registered model names
   */
  static getRegisteredModels() {
    return Array.from(autoCloudFunctionRegistry.registeredModels.keys());
  }

  /**
   * Check if a model is registered
   * @param {string} modelName - Model name to check
   * @returns {boolean} True if registered
   */
  static isModelRegistered(modelName) {
    return autoCloudFunctionRegistry.registeredModels.has(modelName);
  }

  /**
   * Get model configuration
   * @param {string} modelName - Model name
   * @returns {Object|null} Model configuration or null
   */
  static getModelConfig(modelName) {
    return autoCloudFunctionRegistry.registeredModels.get(modelName) || null;
  }
}

// Export the enhanced registration class
export { EnhancedDataModel };

// Also export the auto registry for direct access if needed
export { autoCloudFunctionRegistry };