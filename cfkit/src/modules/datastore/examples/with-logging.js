/**
 * Example: Using DATASTORE with LOGS module
 * Shows how to integrate logging for better debugging
 */

import { Datastore } from '../index.js';
import { LOGS } from '../../logs/index.js';

export async function exampleWithLogging(env) {
  // Set up request context
  LOGS.setRequest({
    requestId: crypto.randomUUID(),
    userId: 'user_123',
    method: 'POST',
    url: '/api/projects'
  });

  // Create logger for this operation
  const logger = LOGS.init('API.createProject');
  
  try {
    // Initialize datastore with logger
    const datastore = new Datastore(env, logger);
    const db = datastore.auth('user_123');
    
    // Operations are now logged automatically
    const projectData = {
      name: 'My Project',
      description: 'Test project with logging',
      created: new Date().toISOString()
    };
    
    logger.log('Creating new project', { name: projectData.name });
    
    // This will log timing and debug info
    await db.put('PROJECT', 'proj_456', projectData);
    
    // Retrieve to verify
    const saved = await db.get('PROJECT', 'proj_456');
    
    logger.log('Project created successfully', { 
      projectId: 'proj_456',
      hasData: saved !== null 
    });
    
    return saved;
    
  } catch (error) {
    logger.error('Failed to create project', error);
    
    // Return error with logs for debugging
    throw {
      message: error.message,
      logs: LOGS.getRecent(20),
      requestId: LOGS.getRequestId()
    };
  }
}

/**
 * Example: Creating audit trail with SavedLogger
 */
export async function exampleAuditTrail(env) {
  const datastore = new Datastore(env);
  const auth = { user_id: 'user_123', project_id: 'proj_456' };
  
  // Create saved logger for AI optimization
  const audit = LOGS.saved(datastore, auth, 'page_789');
  
  try {
    audit.log('Optimization started', { 
      model: 'gpt-4',
      page: 'page_789' 
    });
    
    // Simulate AI processing
    audit.log('Content extracted', { length: 5000 });
    audit.log('Prompt built', { tokens: 1500 });
    audit.log('AI response received', { 
      status: 200,
      duration: '2.3s' 
    });
    audit.log('Changes applied', { count: 12 });
    
    // Save audit trail to datastore
    const logId = await audit.persist();
    console.log('Audit trail saved:', logId);
    
    return logId;
    
  } catch (error) {
    audit.error('Optimization failed', error);
    await audit.persist(); // Save even on failure
    throw error;
  }
}

/**
 * Example: Performance monitoring
 */
export async function examplePerformance(env) {
  const logger = LOGS.init('PERFORMANCE.test');
  const datastore = new Datastore(env, logger);
  
  // Overall timer
  const totalTimer = logger.timer('total_operation');
  
  // KV operations
  const kvTimer = logger.timer('kv_operations');
  await datastore.KV.put('USER', 'user_123', { name: 'Test' });
  await datastore.KV.get('USER', 'user_123');
  kvTimer.end({ operations: 2 });
  
  // List operations
  const listTimer = logger.timer('list_operations');
  await datastore.KV.queryListAddItem('projects', 'user_123', 'proj_1');
  await datastore.KV.queryListAddItem('projects', 'user_123', 'proj_2');
  const projects = await datastore.KV.queryListByPointer('projects', 'user_123');
  listTimer.end({ items: projects.length });
  
  totalTimer.end();
  
  // Get performance summary
  const logs = LOGS.getStructured();
  const timings = logs
    .filter(log => log.message.includes('took'))
    .map(log => ({
      operation: log.message.split(' took')[0],
      duration: log.data.duration_ms
    }));
  
  return timings;
}
