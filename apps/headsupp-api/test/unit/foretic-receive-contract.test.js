import assert from 'node:assert/strict';
import test from 'node:test';

import { createAggregateDelivery } from '../../src/services/aggregate-forward/delivery.js';
import { genericAlertPayload } from '../../src/services/delivery/webhook.js';
import { classifyForeticCallbackPayload } from '../../src/services/foretic/receive-contract.js';

function dbRecorder() {
  return {
    prepare() {
      return {
        bind() {
          return {
            async run() {
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

test('Foretic can classify received alert callbacks with CTA', () => {
  const payload = genericAlertPayload({
    id: 'alert_123',
    workspace_id: 'ws_123',
    channel_id: 'ch_123',
    signal_id: 'sig_123',
    watch_id: 'watch_123',
    severity: 'warning',
    summary_text: 'Forecast pace warning',
    current_value: 84,
    threshold_value: 85,
    triggered_at: '2026-05-24T10:00:00.000Z',
    cta_label: 'View forecast',
    cta_url: 'https://foretic.test/forecasts/oracle_forecast:mlfl1bfqrxnbk1',
  });

  const classified = classifyForeticCallbackPayload(payload);

  assert.equal(classified.ok, true);
  assert.equal(classified.kind, 'alert');
  assert.equal(classified.dedupe_key, 'alert_123');
  assert.equal(classified.cta.url.includes('foretic.test/forecasts'), true);
});

test('Foretic can classify aggregate-forward callbacks with stable dedupe id', async () => {
  const delivery = await createAggregateDelivery({
    db: dbRecorder(),
    aggregate: {
      workspace_id: 'ws_123',
      channel_id: 'ch_123',
      signal_id: 'sig_123',
      bucket_type: 'hour',
      bucket_start_at: '2026-05-24T10:00:00.000Z',
      sum_value: 98,
      count_value: 7,
      avg_value: 14,
      min_value: 4,
      max_value: 21,
      last_value: 4,
    },
    signal: { signal_key: 'oxygen.percent' },
    channel: { channel_id: 'ch_123' },
    subscriber: { subscriber_id: 'sub_foretic' },
    now: '2026-05-24T11:01:00.000Z',
  });

  const payload = JSON.parse(delivery.payload_json);
  const classified = classifyForeticCallbackPayload(payload);

  assert.equal(classified.ok, true);
  assert.equal(classified.kind, 'aggregate_forward');
  assert.equal(classified.id, delivery.id);
  assert.equal(classified.dedupe_key, 'sub_foretic:sig_123:hour:2026-05-24T10:00:00.000Z');
  assert.equal(classified.values.avg, 14);
  assert.equal(payload.raw_events, undefined);
});

test('Foretic receive contract rejects unknown callback payloads', () => {
  const result = classifyForeticCallbackPayload({ type: 'raw_event', value: 10 });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'UNKNOWN_HEADS_UP_CALLBACK');
});
