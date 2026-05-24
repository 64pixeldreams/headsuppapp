/**
 * CloudFunction Core Class
 * Main dispatcher for function-based API operations
 */

import { FunctionRegistry } from './function-registry.js';
import { AuthMiddleware } from '../middleware/auth-middleware.js';
import { ValidationMiddleware } from '../middleware/validation-middleware.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { ResponseBuilder } from '../utils/response-builder.js';
import { LOGS } from '../../logs/index.js';

export class CloudFunction {
  constructor(env) {
    this.env = env;
    this.registry = new FunctionRegistry();
    this.authMiddleware = new AuthMiddleware(env);
    this.validationMiddleware = new ValidationMiddleware();
    this.errorHandler = new ErrorHandler();
    this.responseBuilder = new ResponseBuilder();
  }

  /**
   * Define a function handler
   * @param {string} action - Function action name
   * @param {Function} handler - Function handler
   * @param {Object} options - Function options
   */
  define(action, handler, options = {}) {
    this.registry.register(action, handler, options);
  }

  /**
   * Execute a function
   * @param {string} action - Function action name
   * @param {Object} payload - Function payload
   * @param {Object} request - Original request object
   * @param {Object} ctx - Cloudflare Worker execution context (for waitUntil)
   * @returns {Promise<Response>} Function response
   */
  async execute(action, payload, request, ctx = null) {
    const requestId = crypto.randomUUID();
    const logger = LOGS.init(`cloudfunction.${action}`);
    const timer = logger.timer('execute');

    try {
      // Set request context
      LOGS.setRequest({
        requestId,
        action,
        url: request.url,
        method: request.method
      });

      logger.log('Function execution started', { action, payload });

      // Check if function exists
      if (!this.registry.exists(action)) {
        throw new Error(`Function '${action}' not found`);
      }

      // Get function metadata
      const metadata = this.registry.getMetadata(action);
      const handler = this.registry.getHandler(action);

      // Apply authentication middleware
      const auth = await this.authMiddleware.process(request, metadata);
      if (metadata.auth && !auth) {
        throw new Error('Authentication required');
      }

      // Apply validation middleware
      const validatedPayload = await this.validationMiddleware.process(
        payload, 
        metadata.validation
      );

      // Create request context
      const requestContext = {
        payload: validatedPayload,
        auth,
        env: this.env,
        ctx,
        request,
        logger: logger.init(`function.${action}`),
        requestId
      };

      // Execute function with timeout
      const result = await this.executeWithTimeout(
        handler, 
        requestContext, 
        metadata.timeout
      );

      timer.end({ success: true });
      logger.log('Function execution completed', { action, success: true });

      return this.responseBuilder.success(result, {
        action,
        requestId,
        duration: timer.elapsed()
      });

    } catch (error) {
      timer.end({ error: true });
      logger.error('Function execution failed', error);

      return this.errorHandler.handle(error, {
        action,
        requestId,
        duration: timer.elapsed()
      });
    }
  }

  /**
   * Execute function with timeout
   * @param {Function} handler - Function handler
   * @param {Object} context - Request context
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<any>} Function result
   */
  async executeWithTimeout(handler, context, timeout) {
    return Promise.race([
      handler(context),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Function timeout')), timeout)
      )
    ]);
  }

  /**
   * Get function info
   * @param {string} action - Function action name
   * @returns {Object} Function info
   */
  getInfo(action) {
    return this.registry.getInfo(action);
  }

  /**
   * List all registered functions
   * @returns {Array} List of function names
   */
  list() {
    return this.registry.list();
  }
}
