import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeSubscriberAlertFilters,
  normalizeSubscriberConfigAlertFilters,
  subscriberMatchesAlertFilters,
} from '../../src/services/subscribers/alert-filters.js';

const context = {
  signal_key: 'forecast.goal.risk',
  watch_group_key: 'forecast_goal_health',
  watch_key: 'watch_goal_warning',
  watch_id: 'watch_goal_warning',
  band_key: 'critical',
  fields: { forecast_id: 'forecast_123' },
};

function subscriber(filters) {
  return {
    subscriber_id: 'sub_123',
    config_json: JSON.stringify(filters === undefined ? {} : { filters }),
  };
}

test('subscriber alert filters treat no filters as receive all', () => {
  assert.equal(subscriberMatchesAlertFilters(subscriber(), context), true);
});

test('subscriber alert filters match signal keys', () => {
  assert.equal(subscriberMatchesAlertFilters(subscriber({ signal_keys: ['forecast.goal.risk'] }), context), true);
  assert.equal(subscriberMatchesAlertFilters(subscriber({ signal_keys: ['forecast.revenue.pace'] }), context), false);
});

test('subscriber alert filters match watch group keys', () => {
  assert.equal(subscriberMatchesAlertFilters(subscriber({ watch_group_keys: ['forecast_goal_health'] }), context), true);
  assert.equal(subscriberMatchesAlertFilters(subscriber({ watch_group_keys: ['forecast_pace_health'] }), context), false);
});

test('subscriber alert filters match watch keys and ids', () => {
  assert.equal(subscriberMatchesAlertFilters(subscriber({ watch_keys: ['watch_goal_warning'] }), context), true);
  assert.equal(subscriberMatchesAlertFilters(subscriber({ watch_keys: ['watch_other'] }), context), false);
});

test('subscriber alert filters match band keys', () => {
  assert.equal(subscriberMatchesAlertFilters(subscriber({ band_keys: ['critical'] }), context), true);
  assert.equal(subscriberMatchesAlertFilters(subscriber({ band_keys: ['warning'] }), context), false);
});

test('subscriber alert filters use OR semantics across dimensions', () => {
  assert.equal(
    subscriberMatchesAlertFilters(
      subscriber({
        signal_keys: ['forecast.revenue.pace'],
        band_keys: ['critical'],
      }),
      context,
    ),
    true,
  );
});

test('subscriber alert filters ignore empty arrays', () => {
  const result = normalizeSubscriberAlertFilters({
    signal_keys: [],
    watch_group_keys: ['forecast_goal_health'],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.filters, { watch_group_keys: ['forecast_goal_health'] });
});

test('subscriber alert filters reject malformed filter arrays', () => {
  const result = normalizeSubscriberConfigAlertFilters({
    filters: {
      signal_keys: 'forecast.goal.risk',
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_SUBSCRIBER_FILTERS');
});

test('subscriber alert filters scope by dimension value', () => {
  assert.equal(subscriberMatchesAlertFilters(subscriber({ dimensions: { forecast_id: ['forecast_123'] } }), context), true);
  assert.equal(subscriberMatchesAlertFilters(subscriber({ dimensions: { forecast_id: ['forecast_999'] } }), context), false);
});

test('subscriber alert filters AND type with dimension scope', () => {
  // goal-risk on forecast_123 -> delivered
  assert.equal(
    subscriberMatchesAlertFilters(
      subscriber({ signal_keys: ['forecast.goal.risk'], dimensions: { forecast_id: ['forecast_123'] } }),
      context,
    ),
    true,
  );
  // right type, wrong forecast -> not delivered (dimension is an AND scope)
  assert.equal(
    subscriberMatchesAlertFilters(
      subscriber({ signal_keys: ['forecast.goal.risk'], dimensions: { forecast_id: ['forecast_999'] } }),
      context,
    ),
    false,
  );
  // right forecast, wrong type -> not delivered
  assert.equal(
    subscriberMatchesAlertFilters(
      subscriber({ signal_keys: ['forecast.revenue.pace'], dimensions: { forecast_id: ['forecast_123'] } }),
      context,
    ),
    false,
  );
});

test('subscriber alert dimension filter requires the dimension to be present on the alert', () => {
  const withoutField = { ...context, fields: {} };
  assert.equal(subscriberMatchesAlertFilters(subscriber({ dimensions: { forecast_id: ['forecast_123'] } }), withoutField), false);
});

test('subscriber alert filters accept fields as an alias for dimensions', () => {
  const result = normalizeSubscriberAlertFilters({ fields: { forecast_id: ['forecast_123'] } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.filters, { dimensions: { forecast_id: ['forecast_123'] } });
});

test('subscriber alert filters reject malformed dimension shapes', () => {
  const result = normalizeSubscriberConfigAlertFilters({ filters: { dimensions: { forecast_id: 'forecast_123' } } });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_SUBSCRIBER_FILTERS');
});
