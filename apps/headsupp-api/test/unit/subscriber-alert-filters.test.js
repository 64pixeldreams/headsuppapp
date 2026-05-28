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
