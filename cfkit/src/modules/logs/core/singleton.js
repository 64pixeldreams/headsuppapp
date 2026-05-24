/**
 * LOGS Singleton
 * Global logger instance with performance controls
 */

import { Logger } from './logger.js';
import { SavedLogger } from './saved-logger.js';
import { LogLevel } from '../utils/levels.js';

class LogsSingleton extends Logger {
  constructor() {
    super();
    this.consoleEnabled = true;
  }

  /**
   * Disable all logging except errors
   */
  off() {
    LogLevel.setLevel('error');
    this.consoleEnabled = false;
  }

  /**
   * Enable all logging
   */
  on() {
    LogLevel.setLevel('debug');
    this.consoleEnabled = true;
  }

  /**
   * Only log errors and above
   */
  errorsOnly() {
    LogLevel.setLevel('error');
    this.consoleEnabled = true;
  }

  /**
   * Set specific log level
   */
  setLevel(level) {
    LogLevel.setLevel(level);
    this.consoleEnabled = true;
  }

  /**
   * Get current log level
   */
  getLevel() {
    return LogLevel.getCurrentLevel();
  }

  /**
   * Create a saved logger for persistent storage
   */
  saved(datastore, auth, entityId) {
    return new SavedLogger(datastore, auth, entityId);
  }

  /**
   * Clear all logs
   */
  clear() {
    this.logs = [];
  }

  /**
   * Set sampling rate (for production)
   */
  setSampling(rate) {
    // TODO: Implement sampling
    this.samplingRate = rate;
  }

  /**
   * Override to respect singleton console setting
   */
  _shouldConsoleLog(level, forceLog) {
    if (!this.consoleEnabled && !forceLog) {
      return false;
    }
    return forceLog || LogLevel.shouldLog(level);
  }
}

// Export singleton instance
export const LOGS = new LogsSingleton();
