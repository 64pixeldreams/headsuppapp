import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateWatchAgainstAggregates } from '../../src/services/watches/evaluate-watch.js';

test('triggers LAST_VALUE_LT when aggregate last value is below threshold', () => {
  const result = evaluateWatchAgainstAggregates(
    {
      watch_type: 'LAST_VALUE_LT',
      threshold: 85,
      severity: 'warning',
    },
    [{ last_value: 84 }],
  );

  assert.equal(result.triggered, true);
  assert.equal(result.current_value, 84);
  assert.equal(result.severity, 'warning');
});

test('does not trigger LAST_VALUE_LT when value is above threshold', () => {
  const result = evaluateWatchAgainstAggregates(
    {
      watch_type: 'LAST_VALUE_LT',
      threshold: 85,
    },
    [{ last_value: 90 }],
  );

  assert.equal(result.triggered, false);
});

test('triggers LAST_VALUE_GT when aggregate last value is above threshold', () => {
  const result = evaluateWatchAgainstAggregates(
    {
      watch_type: 'LAST_VALUE_GT',
      config_json: JSON.stringify({ threshold: 300, severity: 'critical' }),
    },
    [{ last_value: 301 }],
  );

  assert.equal(result.triggered, true);
  assert.equal(result.severity, 'critical');
});

test('evaluates WINDOW_AVG_LT across aggregate rows', () => {
  const result = evaluateWatchAgainstAggregates(
    {
      watch_type: 'WINDOW_AVG_LT',
      threshold: 15,
    },
    [
      { sum_value: 10, count_value: 1 },
      { sum_value: 12, count_value: 1 },
    ],
  );

  assert.equal(result.triggered, true);
  assert.equal(result.current_value, 11);
});

test('evaluates WINDOW_SUM_GT across aggregate rows', () => {
  const result = evaluateWatchAgainstAggregates(
    {
      watch_type: 'WINDOW_SUM_GT',
      threshold: 300,
    },
    [
      { sum_value: 150, count_value: 1 },
      { sum_value: 151, count_value: 1 },
    ],
  );

  assert.equal(result.triggered, true);
  assert.equal(result.current_value, 301);
});

test('evaluates WINDOW_COUNT_GT across aggregate rows', () => {
  const result = evaluateWatchAgainstAggregates(
    {
      watch_type: 'WINDOW_COUNT_GT',
      threshold: 10,
    },
    [
      { sum_value: 0, count_value: 6 },
      { sum_value: 0, count_value: 5 },
    ],
  );

  assert.equal(result.triggered, true);
  assert.equal(result.current_value, 11);
});

test('evaluates PERCENT_CHANGE_GT from adjacent aggregate rows', () => {
  const result = evaluateWatchAgainstAggregates(
    {
      watch_type: 'PERCENT_CHANGE_GT',
      threshold: 50,
    },
    [{ last_value: 100 }, { last_value: 180 }],
  );

  assert.equal(result.triggered, true);
  assert.equal(result.current_value, 80);
});

test('evaluates PERCENT_CHANGE_LT for drops from adjacent aggregate rows', () => {
  const result = evaluateWatchAgainstAggregates(
    {
      watch_type: 'PERCENT_CHANGE_LT',
      threshold: -25,
    },
    [{ last_value: 100 }, { last_value: 60 }],
  );

  assert.equal(result.triggered, true);
  assert.equal(result.current_value, -40);
});

test('evaluates PREVIOUS_PERIOD_RATIO_GT for suddenly doubles rules', () => {
  const result = evaluateWatchAgainstAggregates(
    {
      watch_type: 'PREVIOUS_PERIOD_RATIO_GT',
      threshold: 2,
    },
    [{ last_value: 100 }, { last_value: 250 }],
  );

  assert.equal(result.triggered, true);
  assert.equal(result.current_value, 2.5);
});

test('does not trigger relative-change watches when previous value is zero', () => {
  const percent = evaluateWatchAgainstAggregates(
    {
      watch_type: 'PERCENT_CHANGE_GT',
      threshold: 50,
    },
    [{ last_value: 0 }, { last_value: 100 }],
  );
  const ratio = evaluateWatchAgainstAggregates(
    {
      watch_type: 'PREVIOUS_PERIOD_RATIO_GT',
      threshold: 2,
    },
    [{ last_value: 0 }, { last_value: 100 }],
  );

  assert.equal(percent.triggered, false);
  assert.equal(percent.current_value, null);
  assert.equal(ratio.triggered, false);
  assert.equal(ratio.current_value, null);
});

test('evaluates SPIKE_GT as a percent increase alias', () => {
  const result = evaluateWatchAgainstAggregates(
    {
      watch_type: 'SPIKE_GT',
      threshold: 100,
    },
    [{ last_value: 10 }, { last_value: 25 }],
  );

  assert.equal(result.triggered, true);
  assert.equal(result.current_value, 150);
});
