/**
 * Timer utility for performance tracking
 * Measures operation duration and logs results
 */

export class Timer {
  constructor(logger, operation) {
    this.logger = logger;
    this.operation = operation;
    this.startTime = Date.now();
    this.running = true;
  }

  /**
   * End timer and log duration
   */
  end(data = {}) {
    if (!this.running) {
      return this.elapsed(); // Return elapsed time without logging again
    }
    
    const duration = Date.now() - this.startTime;
    this.running = false;
    
    this.logger.log(`${this.operation} took ${this.formatDuration(duration)}`, {
      duration_ms: duration,
      ...data
    });
    
    return duration;
  }

  /**
   * Get elapsed time without ending
   */
  elapsed() {
    return Date.now() - this.startTime;
  }

  /**
   * Format duration for display
   */
  formatDuration(ms) {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    
    const seconds = (ms / 1000).toFixed(2);
    return `${seconds}s`;
  }

  /**
   * Cancel timer without logging
   */
  cancel() {
    this.running = false;
  }
}
