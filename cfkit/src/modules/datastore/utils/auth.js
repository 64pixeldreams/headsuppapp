/**
 * Auth context utilities for datastore
 * Manages _auth arrays and access control
 * See specs/00-datastore.md for auth implementation
 */

/**
 * Add auth context to data object
 * @param {Object} data - Data to add auth to
 * @param {string} authContext - User ID for auth
 * @returns {Object} Data with _auth array
 */
export function addAuthContext(data, authContext) {
  if (!authContext) {
    return data;
  }
  
  // Create new object to avoid mutation
  const dataWithAuth = { ...data };
  
  // Initialize _auth array if not present
  if (!dataWithAuth._auth) {
    dataWithAuth._auth = [];
  }
  
  // Add auth context if not already present
  if (!dataWithAuth._auth.includes(authContext)) {
    dataWithAuth._auth.push(authContext);
  }
  
  return dataWithAuth;
}

/**
 * Check if user has access to data
 * @param {Object} data - Data with potential _auth array
 * @param {string} authContext - User ID to check
 * @returns {boolean} True if user has access
 */
export function checkAuthAccess(data, authContext) {
  // No auth context means no restrictions
  if (!authContext) {
    return true;
  }
  
  // No _auth array means public access
  if (!data._auth || !Array.isArray(data._auth)) {
    return true;
  }

  // Wildcard/shared access tokens
  // - '*' means accessible to any authenticated user
  // - 'public' means accessible to any authenticated user (alias)
  if (data._auth.includes('*') || data._auth.includes('public')) {
    return true;
  }
  
  // Check if user is in _auth array
  return data._auth.includes(authContext);
}

/**
 * Remove auth data before returning to client
 * @param {Object} data - Data with _auth array
 * @returns {Object} Data without _auth
 */
export function stripAuthData(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  const { _auth, ...cleanData } = data;
  return cleanData;
}
