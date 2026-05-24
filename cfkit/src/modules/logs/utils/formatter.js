/**
 * Log formatting utilities
 * Formats log entries for console output
 */

/**
 * Format log entry for console output
 */
export function formatEntry(entry) {
  const parts = [];
  
  // Add request ID if present
  if (entry.requestId) {
    parts.push(`[${entry.requestId.substring(0, 8)}]`);
  }
  
  // Add user ID if present
  if (entry.userId) {
    parts.push(`[${entry.userId}]`);
  }
  
  // Add context
  if (entry.context) {
    parts.push(`[${entry.context}]`);
  }
  
  // Add level for warn/error/fatal
  if (['warn', 'error', 'fatal'].includes(entry.level)) {
    parts.push(`${entry.level.toUpperCase()}:`);
  }
  
  // Add message
  parts.push(entry.message);
  
  // Add data if present
  if (entry.data && Object.keys(entry.data).length > 0) {
    parts.push(formatData(entry.data));
  }
  
  return parts.join(' ');
}

/**
 * Format data object for output
 */
function formatData(data) {
  // Handle errors specially
  if (data.stack) {
    return `\n  ${data.message}\n  Stack: ${data.stack}`;
  }
  
  // Mask sensitive data
  const masked = maskSensitiveData(data);
  
  // For simple objects, inline
  const keys = Object.keys(masked);
  if (keys.length <= 3 && !hasComplexValues(masked)) {
    return JSON.stringify(masked);
  }
  
  // For complex objects, pretty print
  return '\n' + JSON.stringify(masked, null, 2)
    .split('\n')
    .map(line => '  ' + line)
    .join('\n');
}

/**
 * Check if object has complex values
 */
function hasComplexValues(obj) {
  return Object.values(obj).some(val => 
    typeof val === 'object' && val !== null
  );
}

/**
 * Mask sensitive data in logs
 */
function maskSensitiveData(data) {
  const sensitive = [
    'password', 'token', 'secret', 'key', 'auth',
    'authorization', 'cookie', 'session'
  ];
  
  const masked = { ...data };
  
  Object.keys(masked).forEach(key => {
    const lowerKey = key.toLowerCase();
    if (sensitive.some(s => lowerKey.includes(s))) {
      masked[key] = '[REDACTED]';
    }
  });
  
  return masked;
}
