import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEmailTestPayload,
  emailTestText,
  processEmailTestReceipt,
  signEmailWorkerPayload,
  verifyEmailWorkerSignature,
} from '../../src/services/email/test-message-log.js';

test('email test payload includes alert and delivery proof fields', () => {
  const message = buildEmailTestPayload({
    alert: {
      id: 'alert_123',
      current_value: 42,
      threshold_value: 40,
      severity: 'warning',
    },
    delivery: { id: 'delivery_123' },
    subscriber: { destination_url: 'tester@aibox.headsupp.io' },
    emailTest: {
      run_id: 'run_123',
      case_id: 'last_value_gt',
      watch_type: 'LAST_VALUE_GT',
      signal_key: 'demo.metric',
    },
    now: '2026-05-28T18:00:00.000Z',
  });

  assert.equal(message.id, 'email_test_delivery_123');
  assert.equal(message.expected.delivery_id, 'delivery_123');
  assert.equal(message.expected.alert_id, 'alert_123');
  assert.equal(message.expected.current_value, 42);
  assert.match(emailTestText(message.expected), /HEADSUPP_EMAIL_TEST_JSON_BEGIN/);
});

test('email test payload can derive per-watch scheduled case metadata', () => {
  const message = buildEmailTestPayload({
    alert: {
      id: 'alert_123',
      watch_id: 'watch_digest',
      current_value: 1,
      threshold_value: null,
      severity: 'info',
    },
    delivery: { id: 'delivery_123' },
    subscriber: { destination_url: 'tester@aibox.headsupp.io' },
    emailTest: {
      enabled: true,
      run_id: 'run_123',
      signal_key: 'demo.metric',
      cases_by_watch_id: {
        watch_digest: {
          case_id: 'digest',
          watch_type: 'DIGEST',
        },
      },
    },
  });

  assert.equal(message.expected.case_id, 'digest');
  assert.equal(message.expected.watch_type, 'DIGEST');
  assert.equal(message.expected.signal_key, 'demo.metric');
});


test('verifies signed email worker payloads', async () => {
  const rawBody = JSON.stringify({ payload: { delivery_id: 'delivery_123' } });
  const timestamp = '2026-05-28T18:00:00.000Z';
  const signature = await signEmailWorkerPayload({ secret: 'secret', timestamp, rawBody });

  const result = await verifyEmailWorkerSignature({
    secret: 'secret',
    timestamp,
    signature,
    rawBody,
    nowMs: Date.parse(timestamp),
  });

  assert.equal(result.ok, true);
});

test('processes matching inbox receipt as tested', async () => {
  const calls = [];
  const row = {
    id: 'email_test_delivery_123',
    expected_json: JSON.stringify({
      run_id: 'run_123',
      case_id: 'last_value_gt',
      watch_type: 'LAST_VALUE_GT',
      signal_key: 'demo.metric',
      severity: 'warning',
      current_value: 42,
      threshold_value: 40,
      alert_id: 'alert_123',
      delivery_id: 'delivery_123',
    }),
  };
  const db = {
    prepare(sql) {
      return {
        bind(...params) {
          calls.push({ sql, params });
          return {
            async first() {
              return row;
            },
            async run() {
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };

  const result = await processEmailTestReceipt({
    db,
    receipt: {
      message_id: '<message@example.test>',
      received_at: '2026-05-28T18:00:01.000Z',
      payload: {
        run_id: 'run_123',
        case_id: 'last_value_gt',
        watch_type: 'LAST_VALUE_GT',
        signal_key: 'demo.metric',
        severity: 'warning',
        current_value: 42,
        threshold_value: 40,
        alert_id: 'alert_123',
        delivery_id: 'delivery_123',
      },
    },
    now: '2026-05-28T18:00:02.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(calls[1].params[1], 'tested');
  assert.equal(calls[1].params[4], null);
});
