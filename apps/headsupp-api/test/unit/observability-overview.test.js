import assert from 'node:assert/strict';
import test from 'node:test';

import { getObservabilityOverview } from '../../src/services/observability/overview.js';

test('observability overview returns operational counts without payloads', async () => {
  const values = [2, 1, 3, 0, 4, 1, 2, 99];
  const db = {
    prepare() {
      return {
        bind() {
          return {
            async first() {
              return { count: values.shift() };
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
  assert.equal(overview.aggregate_rows, 99);
  assert.equal(JSON.stringify(overview).includes('payload_json'), false);
});
