/**
 * Error Handler
 * Centralized error handling for CloudFunction responses
 */

import { LOGS } from '../../logs/index.js';

export class ErrorHandler {
  /**
   * Handle an error and return appropriate response
   * @param {Error} error - Error object
   * @param {Object} context - Error context
   * @returns {Response} Error response
   */
  handle(error, context) {
    const logger = LOGS.init('cloudfunction.error');
    const { action, requestId, duration } = context;

    // Log error details
    logger.error('Function error', {
      action,
      requestId,
      error: error.message,
      stack: error.stack,
      duration
    });

    // Determine error type and status code
    const errorInfo = this.categorizeError(error);

    // Build error response
    const errorResponse = {
      success: false,
      error: {
        code: errorInfo.code,
        message: errorInfo.message,
        details: error.details || null
      },
      logs: LOGS.getRecent(50),
      requestId,
      duration,
      function: action
    };

    return new Response(
      JSON.stringify(errorResponse),
      {
        status: errorInfo.status,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }

  /**
   * Categorize error and determine response
   * @param {Error} error - Error object
   * @returns {Object} Error info
   */
  categorizeError(error) {
    // Authentication errors
    if (error.message.includes('Authentication required') || 
        error.message.includes('Unauthorized')) {
      return {
        code: 'AUTHENTICATION_ERROR',
        message: 'Authentication required',
        status: 401
      };
    }

    // Validation errors
    if (error.code === 'VALIDATION_ERROR' || 
        error.message.includes('Validation failed')) {
      return {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        status: 400
      };
    }

    // Function not found
    if (error.message.includes('not found')) {
      return {
        code: 'FUNCTION_NOT_FOUND',
        message: 'Function not found',
        status: 404
      };
    }

    // Timeout errors
    if (error.message.includes('timeout')) {
      return {
        code: 'TIMEOUT_ERROR',
        message: 'Function execution timeout',
        status: 408
      };
    }

    // Permission errors
    if (error.message.includes('permission') || 
        error.message.includes('forbidden')) {
      return {
        code: 'PERMISSION_ERROR',
        message: 'Insufficient permissions',
        status: 403
      };
    }

    // Default server error
    return {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      status: 500
    };
  }
}
