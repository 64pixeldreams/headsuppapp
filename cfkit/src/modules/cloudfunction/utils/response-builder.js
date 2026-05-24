/**
 * Response Builder
 * Builds consistent responses for CloudFunction operations
 */

import { LOGS } from '../../logs/index.js';

export class ResponseBuilder {
  /**
   * Build success response
   * @param {any} data - Response data
   * @param {Object} context - Response context
   * @returns {Response} Success response
   */
  success(data, context) {
    const { action, requestId, duration } = context;

    // Check if data is already wrapped with success field
    if (data && typeof data === 'object' && data.hasOwnProperty('success')) {
      // Already wrapped, add metadata and return as-is
      const wrappedResponse = {
        ...data,
        logs: LOGS.getRecent(10),
        requestId,
        duration,
        function: action
      };
      
      return new Response(
        JSON.stringify(wrappedResponse),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }

    // Normal wrapping for unwrapped data
    const response = {
      success: true,
      data,
      logs: LOGS.getRecent(50),
      requestId,
      duration,
      function: action
    };

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }

  /**
   * Build error response
   * @param {Object} error - Error information
   * @param {Object} context - Response context
   * @returns {Response} Error response
   */
  error(error, context) {
    const { action, requestId, duration } = context;

    const response = {
      success: false,
      error: {
        code: error.code || 'UNKNOWN_ERROR',
        message: error.message || 'An error occurred',
        details: error.details || null
      },
      logs: LOGS.getRecent(50),
      requestId,
      duration,
      function: action
    };

    return new Response(
      JSON.stringify(response),
      {
        status: error.status || 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }

  /**
   * Build validation error response
   * @param {Array} errors - Validation errors
   * @param {Object} context - Response context
   * @returns {Response} Validation error response
   */
  validationError(errors, context) {
    const { action, requestId, duration } = context;

    const response = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: errors
      },
      logs: LOGS.getRecent(50),
      requestId,
      duration,
      function: action
    };

    return new Response(
      JSON.stringify(response),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
}
