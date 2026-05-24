/**
 * Hello World API - CFKit Example Worker
 * 
 * A minimal example demonstrating how to build an API using CFKit CloudFunctions.
 * This worker shows:
 * - Basic CloudFunction registration
 * - Parameter validation
 * - Error handling
 * - CORS handling
 * - Logging
 */

import { CloudFunction } from '../../src/modules/cloudfunction/index.js';
import { LOGS } from '../../src/modules/logs/index.js';

// Initialize CloudFunction registry (lazy initialization)
let cloudFunction = null;

/**
 * Register example CloudFunctions
 */
async function registerHelloWorldFunctions(cloudFunction) {
  // Example 1: Simple hello world (no parameters, no auth)
  cloudFunction.define('hello.world', async (requestContext) => {
    const { logger, payload } = requestContext;
    
    logger.log('Hello World called', payload);
    
    return {
      success: true,
      message: 'Hello, World!',
      timestamp: new Date().toISOString(),
      received: payload
    };
  }, {
    auth: false,
    validation: {
      name: { type: 'string' } // Optional parameter
    }
  });

  // Example 2: Greet function (requires name parameter)
  cloudFunction.define('hello.greet', async (requestContext) => {
    const { logger, payload } = requestContext;
    
    const name = payload.name || 'Guest';
    logger.log('Greet called', { name });
    
    return {
      success: true,
      message: `Hello, ${name}!`,
      timestamp: new Date().toISOString()
    };
  }, {
    auth: false,
    validation: {
      name: { type: 'string', required: true }
    }
  });

  // Example 3: Echo function (requires message parameter)
  cloudFunction.define('hello.echo', async (requestContext) => {
    const { logger, payload } = requestContext;
    
    logger.log('Echo called', payload);
    
    return {
      success: true,
      echo: payload,
      timestamp: new Date().toISOString()
    };
  }, {
    auth: false,
    validation: {
      message: { type: 'string', required: true }
    }
  });

  console.log('✅ Hello World CloudFunctions registered:');
  console.log('   - hello.world (no params required)');
  console.log('   - hello.greet (requires name)');
  console.log('   - hello.echo (requires message)');
}

/**
 * Cloudflare Worker Entry Point
 */
export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    // Initialize logger
    LOGS.setRequest({
      requestId: crypto.randomUUID(),
      method: request.method,
      url: request.url
    });

    const logger = LOGS.init('HELLO_WORLD');

    try {
      const url = new URL(request.url);

      // Health check endpoint (direct route, not a CloudFunction)
      if (url.pathname === '/health') {
        return new Response(JSON.stringify({
          status: 'ok',
          message: 'Hello World API is running!',
          framework: 'CFKit',
          timestamp: new Date().toISOString()
        }), {
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // CloudFunction API endpoint
      if (url.pathname === '/api/function' && request.method === 'POST') {
        // Initialize CloudFunction on first request
        if (!cloudFunction) {
          cloudFunction = new CloudFunction(env);
          await registerHelloWorldFunctions(cloudFunction);
        }

        // Parse request body
        const body = await request.json();
        const { action, payload } = body;

        if (!action) {
          return new Response(JSON.stringify({
            success: false,
            error: { code: 'MISSING_ACTION', message: 'Action is required' }
          }), {
            status: 400,
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }

        // Execute CloudFunction
        const response = await cloudFunction.execute(action, payload || {}, request);
        
        // Add CORS headers to response
        const newResponse = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: {
            ...Object.fromEntries(response.headers.entries()),
            'Access-Control-Allow-Origin': '*'
          }
        });
        
        return newResponse;
      }

      // 404 for other routes
      return new Response(JSON.stringify({
        error: 'Not Found',
        message: 'Endpoint not found. Try /health or /api/function'
      }), {
        status: 404,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (error) {
      logger.error('Worker error', error);
      return new Response(JSON.stringify({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};

