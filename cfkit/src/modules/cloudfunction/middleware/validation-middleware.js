/**
 * Validation Middleware
 * Handles payload validation for CloudFunction requests
 */

import { validateFields } from '../../datamodel/utils/validator.js';
import { LOGS } from '../../logs/index.js';

export class ValidationMiddleware {
  /**
   * Process validation for a payload
   * @param {Object} payload - Request payload
   * @param {Object} validationRules - Validation rules
   * @returns {Promise<Object>} Validated payload
   */
  async process(payload, validationRules) {
    const logger = LOGS.init('cloudfunction.validation');

    // Skip validation if no rules defined
    if (!validationRules || Object.keys(validationRules).length === 0) {
      return payload;
    }

    try {
      logger.debug('Validating payload', { rules: Object.keys(validationRules) });

      // Convert validation rules to field definitions format
      const fieldDefinitions = this.convertValidationRules(validationRules);

      // Validate payload
      const validation = validateFields(payload, fieldDefinitions);
      
      if (!validation.valid) {
        const error = new Error('Validation failed');
        error.code = 'VALIDATION_ERROR';
        error.details = validation.errors;
        throw error;
      }

      logger.debug('Payload validation successful');
      return payload;

    } catch (error) {
      logger.error('Validation failed', error);
      throw error;
    }
  }

  /**
   * Convert validation rules to field definitions format
   * @param {Object} rules - Validation rules
   * @returns {Object} Field definitions
   */
  convertValidationRules(rules) {
    const fieldDefinitions = {};

    for (const [fieldName, rule] of Object.entries(rules)) {
      fieldDefinitions[fieldName] = {
        type: rule.type || 'string',
        required: rule.required || false,
        validation: rule.validation || null,
        default: rule.default
      };
    }

    return fieldDefinitions;
  }
}
