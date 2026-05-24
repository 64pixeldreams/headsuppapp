/**
 * Core Logger class
 * Handles logging with context, levels, and request tracking
 */

import { LogLevel } from '../utils/levels.js';
import { formatEntry } from '../utils/formatter.js';
import { Timer } from '../utils/timer.js';

export class Logger {
  constructor(context = '') {
    this.context = context;
    this.logs = [];
    this.requestContext = {};
  }
  
  /**
   * Create sub-logger with additional context
   */
  init(subContext) {
    const newContext = this.context 
      ? `${this.context}.${subContext}` 
      : subContext;
    const subLogger = new Logger(newContext);
    subLogger.logs = this.logs; // Share log array
    subLogger.requestContext = this.requestContext;
    return subLogger;
  }

  /**
   * Set request context for all logs
   */
  setRequest(context) {
    this.requestContext = context;
  }

  /**
   * Log info message
   */
  log(message, data = {}) {
    this._addEntry('info', message, data);
  }

  /**
   * Log debug message
   */
  debug(message, data = {}) {
    this._addEntry('debug', message, data);
  }

  /**
   * Log warning
   */
  warn(message, data = {}) {
    this._addEntry('warn', message, data);
  }

  /**
   * Log error (always logged)
   */
  error(message, error) {
    const errorData = {
      message: error?.message,
      stack: error?.stack,
      name: error?.name
    };
    this._addEntry('error', message, errorData, true);
  }

  /**
   * Log fatal error
   */
  fatal(message, error) {
    const errorData = {
      message: error?.message,
      stack: error?.stack,
      name: error?.name
    };
    this._addEntry('fatal', message, errorData, true);
  }

  /**
   * Create a timer for performance tracking
   */
  timer(operation) {
    return new Timer(this, operation);
  }

  /**
   * Get recent log entries
   */
  getRecent(count = 10) {
    return this.logs.slice(-count);
  }

  /**
   * Get all logs as structured data
   */
  getStructured() {
    return [...this.logs];
  }

  /**
   * Get request ID if set
   */
  getRequestId() {
    return this.requestContext.requestId;
  }

  /**
   * Internal: Add log entry
   */
  _addEntry(level, message, data, forceLog = false) {
    // Check if we should log this level (unless forced)
    if (!forceLog && !LogLevel.shouldLog(level)) {
      return;
    }
    
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
      data,
      ...this.requestContext
    };
    
    this.logs.push(entry);
    
    // Console output
    const formatted = formatEntry(entry);
    if (level === 'error' || level === 'fatal') {
      console.error(formatted);
    } else {
      console.log(formatted);
    }
  }

  /**
   * Check if should console log (handled by singleton)
   */
  _shouldConsoleLog(level, forceLog) {
    // This will be controlled by the singleton
    return forceLog || LogLevel.shouldLog(level);
  }
}
