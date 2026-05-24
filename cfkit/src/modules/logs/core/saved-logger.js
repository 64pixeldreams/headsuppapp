/**
 * SavedLogger class
 * Creates persistent audit trails that can be saved to datastore
 */

export class SavedLogger {
  constructor(datastore, auth, entityId) {
    this.datastore = datastore.auth(auth.user_id);
    this.entityId = entityId;
    this.entries = [];
    this.startTime = Date.now();
    this.metadata = {
      userId: auth.user_id,
      projectId: auth.project_id || null
    };
  }
  
  /**
   * Log entry to be persisted
   */
  log(message, data = {}) {
    this.entries.push({
      timestamp: new Date().toISOString(),
      message,
      data,
      elapsed: Date.now() - this.startTime
    });
  }

  /**
   * Log error to be persisted
   */
  error(message, error) {
    this.entries.push({
      timestamp: new Date().toISOString(),
      message,
      error: {
        message: error?.message,
        stack: error?.stack,
        name: error?.name
      },
      elapsed: Date.now() - this.startTime,
      level: 'error'
    });
  }
  
  /**
   * Save log to datastore
   */
  async persist() {
    const logId = `${this.entityId}:${Date.now()}`;
    
    await this.datastore.put('LOG', logId, {
      entityId: this.entityId,
      type: this._inferType(),
      startTime: new Date(this.startTime).toISOString(),
      duration: Date.now() - this.startTime,
      entries: this.entries,
      summary: this.generateSummary(),
      metadata: this.metadata
    });
    
    return logId;
  }
  
  /**
   * Generate summary of log entries
   */
  generateSummary() {
    const hasErrors = this.entries.some(e => 
      e.level === 'error' || e.message.includes('ERROR')
    );
    
    return {
      total_steps: this.entries.length,
      duration_ms: Date.now() - this.startTime,
      success: !hasErrors,
      error_count: this.entries.filter(e => 
        e.level === 'error' || e.message.includes('ERROR')
      ).length
    };
  }

  /**
   * Infer log type from entries
   */
  _inferType() {
    const messages = this.entries.map(e => e.message.toLowerCase()).join(' ');
    
    if (messages.includes('ai') || messages.includes('optimization')) {
      return 'ai_optimization';
    }
    if (messages.includes('extraction')) {
      return 'content_extraction';
    }
    if (messages.includes('batch')) {
      return 'batch_processing';
    }
    
    return 'general';
  }
}
