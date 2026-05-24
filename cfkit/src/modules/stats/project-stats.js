/**
 * ProjectStats - Atomic project stats updates backed by D1 JSON and KV mirroring
 *
 * Source of truth: D1 table project_meta.stats (JSON)
 * UI read cache: KV project.stats mirrored from D1 after each change
 *
 * Operations provided:
 * - applyCreate(projectId, status)
 * - applyStatusChange(projectId, oldStatus, newStatus)
 * - recomputeSnapshot(projectId)  // Full COUNT-based snapshot, on-demand
 */

import { DataModel } from '../../modules/datamodel/index.js';
import { Datastore } from '../../modules/datastore/index.js';

export class ProjectStats {
  /**
   * @param {object} env - Worker environment
   * @param {object} logger - Logger instance
   */
  constructor(env, logger) {
    this.env = env;
    this.logger = logger?.init?.('ProjectStats') || logger;
    this.datastore = new Datastore(env, this.logger);
  }

  /**
   * Handle page creation: increment total_pages; optionally adjust processing
   */
  async applyCreate(projectId, status) {
    await this.#incTotalPages(projectId, +1);
    if (status === 'processing') {
      await this.#incProcessing(projectId, +1);
    }
    await this.#mirrorKvFromD1(projectId);
    // Debounced recount (safety net)
    await this.maybeTriggerRecountDebounced(projectId, 5);
  }

  /**
   * Handle page status change transitions
   */
  async applyStatusChange(projectId, oldStatus, newStatus) {
    try {
      if (oldStatus === newStatus) {
        return;
      }

      // processing counter adjustments
      if (oldStatus === 'processing' && newStatus !== 'processing') {
        await this.#incProcessing(projectId, -1);
      }
      if (oldStatus !== 'processing' && newStatus === 'processing') {
        await this.#incProcessing(projectId, +1);
      }

      // completed counter: increment when we reach completed from a different state
      if (newStatus === 'completed' && oldStatus !== 'completed') {
        await this.#incCompleted(projectId, +1);
      }

      await this.#setLastActivity(projectId);
      await this.#mirrorKvFromD1(projectId);
      // Debounced recount (safety net)
      await this.maybeTriggerRecountDebounced(projectId, 5);
    } catch (error) {
      this.logger?.error('ProjectStats.applyStatusChange failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Recompute stats from D1 page_meta (full snapshot) and mirror to KV
   */
  async recomputeSnapshot(projectId) {
    const totals = await this.#computeTotalsFromD1(projectId);
    await this.#writeTotalsToD1(projectId, totals);
    await this.#mirrorKvFromD1(projectId);
    return totals;
  }

  /**
   * Debounced recount: if last_recount older than windowSeconds, run snapshot
   */
  async maybeTriggerRecountDebounced(projectId, windowSeconds = 5) {
    try {
      const now = new Date();
      const stats = await this.#selectStatsJson(projectId);
      const last = stats.last_recount ? new Date(stats.last_recount) : null;
      const shouldRecount = !last || (now - last) / 1000 >= windowSeconds;
      if (!shouldRecount) return;
      const totals = await this.#computeTotalsFromD1(projectId);
      totals.last_recount = now.toISOString();
      await this.#writeTotalsToD1(projectId, totals);
      await this.#mirrorKvFromD1(projectId);
    } catch (e) {
      this.logger?.warn('Debounced recount skipped', { error: e.message });
    }
  }

  // ===== Internals: D1 atomic JSON updates =====

  async #incTotalPages(projectId, delta) {
    const query = `
      UPDATE project_meta
      SET stats = json_set(
        COALESCE(stats, '{}'),
        '$.total_pages', COALESCE(json_extract(stats,'$.total_pages'),0) + ?,
        '$.last_activity', CURRENT_TIMESTAMP
      )
      WHERE project_id = ?
    `;
    await this.datastore.D1.execute(query, [delta, projectId]);
  }

  async #incProcessing(projectId, delta) {
    const query = `
      UPDATE project_meta
      SET stats = json_set(
        COALESCE(stats, '{}'),
        '$.processing_pages', COALESCE(json_extract(stats,'$.processing_pages'),0) + ?,
        '$.last_activity', CURRENT_TIMESTAMP
      )
      WHERE project_id = ?
    `;
    await this.datastore.D1.execute(query, [delta, projectId]);
  }

  async #incCompleted(projectId, delta) {
    const query = `
      UPDATE project_meta
      SET stats = json_set(
        COALESCE(stats, '{}'),
        '$.completed_pages', COALESCE(json_extract(stats,'$.completed_pages'),0) + ?,
        '$.last_activity', CURRENT_TIMESTAMP
      )
      WHERE project_id = ?
    `;
    await this.datastore.D1.execute(query, [delta, projectId]);
  }

  async #setLastActivity(projectId) {
    const query = `
      UPDATE project_meta
      SET stats = json_set(
        COALESCE(stats, '{}'),
        '$.last_activity', CURRENT_TIMESTAMP
      )
      WHERE project_id = ?
    `;
    await this.datastore.D1.execute(query, [projectId]);
  }

  async #selectStatsJson(projectId) {
    const query = `SELECT stats FROM project_meta WHERE project_id = ?`;
    const result = await this.datastore.D1.execute(query, [projectId]);
    const row = result?.results?.[0] || result?.data?.[0] || result?.[0];
    const stats = row?.stats;
    if (!stats) return { total_pages: 0, processing_pages: 0, completed_pages: 0, last_activity: null };
    if (typeof stats === 'string') {
      try {
        return JSON.parse(stats);
      } catch {
        return { total_pages: 0, processing_pages: 0, completed_pages: 0, last_activity: null };
      }
    }
    return stats;
  }

  async #mirrorKvFromD1(projectId) {
    // Read from D1 and write into KV via DataModel
    const statsJson = await this.#selectStatsJson(projectId);
    const project = await DataModel.get('PROJECT', this.datastore, projectId, this.logger);
    await project.update({ stats: statsJson });
  }

  async #computeTotalsFromD1(projectId) {
    const query = `
      SELECT 
        COUNT(*) as total_pages,
        SUM(CASE WHEN status='processing' THEN 1 ELSE 0 END) as processing_pages,
        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed_pages
      FROM page_meta
      WHERE project_id = ? AND deleted_at IS NULL
    `;
    const res = await this.datastore.D1.execute(query, [projectId]);
    const row = res?.results?.[0] || res?.data?.[0] || res?.[0] || {};
    return {
      total_pages: Number(row.total_pages || 0),
      processing_pages: Number(row.processing_pages || 0),
      completed_pages: Number(row.completed_pages || 0),
      last_activity: new Date().toISOString()
    };
  }

  async #writeTotalsToD1(projectId, totals) {
    const query = `
      UPDATE project_meta
      SET stats = json_set(
        COALESCE(stats, '{}'),
        '$.total_pages', ?,
        '$.processing_pages', ?,
        '$.completed_pages', ?,
        '$.last_activity', ?,
        '$.last_recount', ?
      )
      WHERE project_id = ?
    `;
    await this.datastore.D1.execute(query, [
      totals.total_pages,
      totals.processing_pages,
      totals.completed_pages,
      totals.last_activity,
      totals.last_recount || new Date().toISOString(),
      projectId
    ]);
  }
}


