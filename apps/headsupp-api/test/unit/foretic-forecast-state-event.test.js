import assert from 'node:assert/strict';
import test from 'node:test';

import { verifyConnectorHmac } from '../../src/services/connectors/hmac.js';
import {
  buildForeticForecastStateEvent,
  buildSignedForeticIngestRequest,
  forecastStatusFromPace,
} from '../../src/services/foretic/forecast-state-event.js';
import { normalizeIncomingPayload } from '../../src/services/ingest/event-validation.js';

test('builds Foretic forecast_state event payload', () => {
  const event = buildForeticForecastStateEvent({
    forecastId: 'oracle_forecast:mlfl1bfqrxnbk1',
    forecastName: 'RB sales history (stripe)',
    pacePercent: 69,
    occurredAt: '2026-05-24T10:00:00Z',
    ctaUrl: 'https://foretic.test/forecasts/oracle_forecast:mlfl1bfqrxnbk1',
  });

  assert.equal(event.signal_key, 'forecast.revenue.pace');
  assert.equal(event.value.num, 69);
  assert.equal(event.fields.event_type, 'forecast_state');
  assert.equal(event.fields.status, 'critical');
  assert.equal(event.cta.label, 'View forecast');
  assert.equal(normalizeIncomingPayload(event).ok, true);
});

test('maps pace percent to forecast state status', () => {
  assert.equal(forecastStatusFromPace(69), 'critical');
  assert.equal(forecastStatusFromPace(84), 'warning');
  assert.equal(forecastStatusFromPace(96), 'recovered');
  assert.equal(forecastStatusFromPace(90), 'ok');
});

test('builds signed Foretic ingest request that verifies with connector HMAC', async () => {
  const event = buildForeticForecastStateEvent({
    forecastId: 'oracle_forecast:mlfl1bfqrxnbk1',
    forecastName: 'RB sales history (stripe)',
    pacePercent: 84,
    occurredAt: '2026-05-24T10:00:00Z',
  });
  const request = await buildSignedForeticIngestRequest({
    eventUrl: 'https://headsupp.test/v1/events/ck_test',
    connectorSecret: 'hu_sec_test_secret',
    event,
    timestamp: '2026-05-24T10:00:00.000Z',
  });

  const verified = await verifyConnectorHmac({
    connector: {
      enabled: true,
      connector_secret: 'hu_sec_test_secret',
    },
    timestamp: request.headers['X-HeadsUp-Timestamp'],
    signature: request.headers['X-HeadsUp-Signature'],
    rawBody: request.body,
    nowMs: Date.parse('2026-05-24T10:00:01.000Z'),
  });

  assert.equal(request.method, 'POST');
  assert.equal(verified.ok, true);
});
