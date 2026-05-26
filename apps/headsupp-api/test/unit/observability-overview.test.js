import assert from 'node:assert/strict';
import test from 'node:test';

import { getObservabilityOverview } from '../../src/services/observability/overview.js';

test('observability overview returns operational counts without payloads', async () => {
  const values = [2, 1, 3, 0, 4, 1, 2, 99, 2, 1, 1, 0, 1, 0, 0];
  const db = {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              if (/operational_status/.test(sql)) {
                return {
                  status: 'ok',
                  last_success_at: '2026-05-24T18:00:00.000Z',
                  updated_at: '2026-05-24T18:00:00.000Z',
                };
              }
              return { count: values.shift() };
            },
            async all() {
              if (/FROM alert_deliveries delivery/.test(sql)) {
                return {
                  results: [
                    {
                      subscriber_type: 'email',
                      severity: 'warning',
                      template_id: 'base_alert_v1',
                      sent_count: 2,
                      retrying_count: 1,
                      failed_count: 0,
                    },
                  ],
                };
              }
              return { results: [] };
            },
          };
        },
      };
    },
  };

  const overview = await getObservabilityOverview(db);

  assert.equal(overview.active_watches, 2);
  assert.equal(overview.deliveries.alerts.retrying, 3);
  assert.equal(overview.deliveries.aggregates.pending, 4);
  assert.equal(overview.deliveries.quiet_summaries.pending, 1);
  assert.equal(overview.aggregate_rows, 99);
  assert.equal(overview.status, 'degraded');
  assert.equal(overview.operator_health.retry_backlog.alerts_due, 2);
  assert.equal(overview.operator_health.scheduled_tasks.status, 'ok');
  assert.equal(overview.deliveries.alert_breakdown[0].subscriber_type, 'email');
  assert.equal(overview.deliveries.alert_breakdown[0].template_id, 'base_alert_v1');
  assert.equal(JSON.stringify(overview).includes('payload_json'), false);
});

test('observability overview tolerates alert breakdown query failures', async () => {
  const values = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const db = {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              if (/operational_status/.test(sql)) return null;
              return { count: values.shift() ?? 0 };
            },
            async all() {
              if (/FROM alert_deliveries delivery/.test(sql)) {
                throw new Error('D1_ERROR: malformed JSON: SQLITE_ERROR');
              }
              return { results: [] };
            },
          };
        },
      };
    },
  };

  const overview = await getObservabilityOverview(db);
  assert.equal(overview.deliveries.alert_breakdown.length, 0);
  assert.equal(overview.status, 'ok');
});
