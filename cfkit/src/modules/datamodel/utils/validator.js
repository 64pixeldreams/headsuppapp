/**
 * Field Validation Utility
 * Validates model fields based on schema definitions
 */

/**
 * Validate fields against schema
 * @param {object} data - Data to validate
 * @param {object} fields - Field definitions
 * @returns {object} { valid: boolean, errors: string[] }
 */
export function validateFields(data, fields) {
  const errors = [];
  
  // Check required fields
  for (const [fieldName, fieldDef] of Object.entries(fields)) {
    const value = data[fieldName];
    
    // Required field check
    if (fieldDef.required && (value === undefined || value === null || value === '')) {
      errors.push(`Field '${fieldName}' is required`);
      continue;
    }
    
    // Skip further validation if value is undefined/null and not required
    if (value === undefined || value === null) {
      continue;
    }
    
    // Type validation
    if (fieldDef.type && !validateType(value, fieldDef.type)) {
      errors.push(`Field '${fieldName}' must be of type ${fieldDef.type}`);
      continue;
    }
    
    // Custom validation rules
    if (fieldDef.validation) {
      const validationError = validateRule(value, fieldDef.validation, fieldName);
      if (validationError) {
        errors.push(validationError);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate field type
 * @param {any} value - Value to check
 * @param {string} type - Expected type
 * @returns {boolean} Is valid
 */
function validateType(value, type) {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'json':
    case 'object':
      return typeof value === 'object';
    case 'array':
      return Array.isArray(value);
    case 'timestamp':
      return typeof value === 'string' || value instanceof Date;
    case 'text':
      return typeof value === 'string';
    default:
      return true;
  }
}

/**
 * Validate using custom validation rules
 * @param {any} value - Value to validate
 * @param {string|array|object} rule - Validation rule
 * @param {string} fieldName - Field name for error messages
 * @returns {string|null} Error message or null if valid
 */
function validateRule(value, rule, fieldName) {
  // Enum validation (array of allowed values)
  if (Array.isArray(rule)) {
    if (!rule.includes(value)) {
      return `Field '${fieldName}' must be one of: ${rule.join(', ')}`;
    }
    return null;
  }
  
  // String validation rules
  if (typeof rule === 'string') {
    switch (rule) {
      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          return `Field '${fieldName}' must be a valid email address`;
        }
        break;
        
      case 'url':
        try {
          new URL(value);
        } catch {
          return `Field '${fieldName}' must be a valid URL`;
        }
        break;
        
      case 'url-optional':
        // Only validate URL if value is not empty
        if (value && value.trim() !== '') {
          try {
            new URL(value);
          } catch {
            return `Field '${fieldName}' must be a valid URL or empty`;
          }
        }
        break;
        
      case 'domain':
        const domainRegex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i;
        if (!domainRegex.test(value)) {
          return `Field '${fieldName}' must be a valid domain`;
        }
        break;
        
      case 'object':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return `Field '${fieldName}' must be an object`;
        }
        break;
        
      default:
        // Unknown validation rule, skip
        break;
    }
    return null;
  }
  
  // Object validation rules (e.g., { min: 0, max: 100 })
  if (typeof rule === 'object' && rule !== null) {
    if ('min' in rule && value < rule.min) {
      return `Field '${fieldName}' must be at least ${rule.min}`;
    }
    if ('max' in rule && value > rule.max) {
      return `Field '${fieldName}' must be at most ${rule.max}`;
    }
    if ('minLength' in rule && value.length < rule.minLength) {
      return `Field '${fieldName}' must be at least ${rule.minLength} characters`;
    }
    if ('maxLength' in rule && value.length > rule.maxLength) {
      return `Field '${fieldName}' must be at most ${rule.maxLength} characters`;
    }
    if ('pattern' in rule) {
      const regex = new RegExp(rule.pattern);
      if (!regex.test(value)) {
        return `Field '${fieldName}' does not match required pattern`;
      }
    }
  }
  
  return null;
}
