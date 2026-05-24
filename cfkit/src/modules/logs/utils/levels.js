/**
 * Log level management
 * Controls which log levels are active
 */

const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4
};

class LogLevelManager {
  constructor() {
    this.currentLevel = 'info'; // Default
  }

  /**
   * Set the current log level
   */
  setLevel(level) {
    if (!LEVELS.hasOwnProperty(level)) {
      throw new Error(`Invalid log level: ${level}`);
    }
    this.currentLevel = level;
  }

  /**
   * Get current log level
   */
  getCurrentLevel() {
    return this.currentLevel;
  }

  /**
   * Check if a log level should be output
   */
  shouldLog(level) {
    return LEVELS[level] >= LEVELS[this.currentLevel];
  }

  /**
   * Get numeric value for level
   */
  getLevelValue(level) {
    return LEVELS[level] || 0;
  }

  /**
   * Get all available levels
   */
  getAvailableLevels() {
    return Object.keys(LEVELS);
  }
}

// Export singleton instance
export const LogLevel = new LogLevelManager();
