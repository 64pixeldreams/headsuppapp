import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeIncomingPayload } from '../../src/services/ingest/event-validation.js';

test('normalizes a valid single event payload', () => {
  const result = normalizeIncomingPayload({
    idempotency_key: 'evt_123',
    signal_key: 'oxygen.percent',
    occurred_at: '2026-05-23T14:00:00Z',
    value: { num: 16.4 },
    fields: { machine_id: 'machine_a' },
    cta: { label: 'View machine', url: 'https://example.com/machines/a', kind: 'view' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].occurred_at, '2026-05-23T14:00:00.000Z');
  assert.equal(result.events[0].value.num, 16.4);
});

test('normalizes a valid batch event payload', () => {
  const result = normalizeIncomingPayload({
    events: [
      { idempotency_key: 'evt_001', signal_key: 'oxygen.percent', occurred_at: '2026-05-23T14:00:00Z', value: { num: 10 } },
      { idempotency_key: 'evt_002', signal_key: 'oxygen.percent', occurred_at: '2026-05-23T14:00:01Z', value: { num: 20 } },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.events.length, 2);
});

test('accepts nullable CTA after ingest normalization', () => {
  const firstPass = normalizeIncomingPayload({
    idempotency_key: 'evt_nullable_cta',
    signal_key: 'oxygen.percent',
    occurred_at: '2026-05-23T14:00:00Z',
    value: { num: 10 },
  });
  const secondPass = normalizeIncomingPayload(firstPass.events[0]);

  assert.equal(firstPass.ok, true);
  assert.equal(firstPass.events[0].cta, null);
  assert.equal(secondPass.ok, true);
});

test('rejects event missing signal key', () => {
  const result = normalizeIncomingPayload({
    occurred_at: '2026-05-23T14:00:00Z',
    value: { num: 10 },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'MISSING_SIGNAL_KEY');
});

test('rejects event missing numeric value', () => {
  const result = normalizeIncomingPayload({
    signal_key: 'oxygen.percent',
    occurred_at: '2026-05-23T14:00:00Z',
    value: { num: '10' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_VALUE');
});

test('rejects invalid batch shape', () => {
  const result = normalizeIncomingPayload({ events: [] });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'EMPTY_BATCH');
});
