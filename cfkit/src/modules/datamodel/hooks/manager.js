/**
 * Hook Manager
 * Executes lifecycle hooks for models
 */

/**
 * Execute a hook if defined
 * @param {object} modelDef - Model definition
 * @param {string} hookName - Hook to execute
 * @param {object} instance - Model instance
 * @param {any} data - Additional data for hook
 * @param {object} env - Environment
 * @param {object} logger - Logger instance
 * @param {object} context - Additional context (auth, etc.)
 */
export async function executeHook(modelDef, hookName, instance, data, env, logger, context) {
  console.log('🔧 HOOK MANAGER: executeHook called', {
    model: modelDef.name,
    hook: hookName,
    hasHook: !!modelDef.hooks?.[hookName],
    hookNames: modelDef.hooks ? Object.keys(modelDef.hooks) : []
  });
  
  // Also log to the logger so it appears in the response
  logger?.log('🔧 HOOK MANAGER: executeHook called', {
    model: modelDef.name,
    hook: hookName,
    hasHook: !!modelDef.hooks?.[hookName],
    hookNames: modelDef.hooks ? Object.keys(modelDef.hooks) : []
  });
  
  if (!modelDef.hooks?.[hookName]) {
    console.log('🔧 HOOK MANAGER: No hook found, returning');
    return;
  }
  
  const timer = logger?.timer(`hook.${hookName}`);
  
  try {
    console.log('🔧 HOOK MANAGER: Executing hook...');
    await modelDef.hooks[hookName](instance, data, env, logger, context);
    console.log('🔧 HOOK MANAGER: Hook executed successfully');
    timer?.end({ model: modelDef.name, hook: hookName });
  } catch (error) {
    console.log('🔧 HOOK MANAGER: Hook failed with error:', error);
    logger?.error(`Hook ${hookName} failed`, error);
    timer?.end({ error: true });
    // Don't throw - hooks shouldn't break operations
  }
}

/**
 * Get available hooks
 * @returns {string[]} List of hook names
 */
export function getAvailableHooks() {
  return [
    'beforeCreate',
    'afterCreate',
    'beforeUpdate',
    'afterUpdate',
    'beforeDelete',
    'afterDelete',
    'afterGet',
    'afterList'
  ];
}
