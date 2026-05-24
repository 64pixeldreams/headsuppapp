import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildForeticForecastContext,
  foreticForecastChannelKey,
  foreticWorkspaceKey,
  normalizeForeticTenantContext,
} from '../../src/services/foretic/tenant-context.js';

const foreticFixture = {
  forecast_id: 'oracle_forecast:mlfl1bfqrxnbk1',
  user_id: 'user:mkfoxvxgoyfbtd',
  name: 'RB sales history (stripe)',
};

test('normalizes current Foretic user-only context using user_id as tenant', () => {
  const result = normalizeForeticTenantContext(foreticFixture);

  assert.equal(result.ok, true);
  assert.deepEqual(result.context, {
    source_app: 'foretic',
    external_tenant_id: 'user:mkfoxvxgoyfbtd',
    external_user_id: 'user:mkfoxvxgoyfbtd',
    external_account_id: 'user:mkfoxvxgoyfbtd',
    external_resource_id: 'oracle_forecast:mlfl1bfqrxnbk1',
  });
});

test('preserves future explicit Foretic tenant id', () => {
  const result = normalizeForeticTenantContext({
    external_tenant_id: 'org:repairs-by-post',
    external_user_id: 'user:mkfoxvxgoyfbtd',
    external_account_id: 'acct:rbp',
  });

  assert.equal(result.ok, true);
  assert.equal(result.context.external_tenant_id, 'org:repairs-by-post');
  assert.equal(result.context.external_user_id, 'user:mkfoxvxgoyfbtd');
  assert.equal(result.context.external_account_id, 'acct:rbp');
});

test('rejects missing Foretic user identity', () => {
  assert.deepEqual(normalizeForeticTenantContext({ forecast_id: 'fc_123' }), {
    ok: false,
    code: 'MISSING_EXTERNAL_USER_ID',
    message: 'Foretic external_user_id or user_id is required.',
  });
});

test('creates stable Foretic workspace key', () => {
  const result = normalizeForeticTenantContext(foreticFixture);

  assert.equal(foreticWorkspaceKey(result.context), 'foretic:user:mkfoxvxgoyfbtd');
});

test('creates stable Foretic forecast channel key', () => {
  const result = normalizeForeticTenantContext(foreticFixture);
  const channel = foreticForecastChannelKey(result.context, foreticFixture.forecast_id);

  assert.deepEqual(channel, {
    ok: true,
    channel_key: 'foretic:user:mkfoxvxgoyfbtd:forecast:oracle_forecast:mlfl1bfqrxnbk1',
  });
});

test('builds full forecast context for first Foretic integration fixture', () => {
  const result = buildForeticForecastContext(foreticFixture);

  assert.equal(result.ok, true);
  assert.equal(result.context.source_app, 'foretic');
  assert.equal(result.context.external_tenant_id, 'user:mkfoxvxgoyfbtd');
  assert.equal(result.context.external_user_id, 'user:mkfoxvxgoyfbtd');
  assert.equal(result.context.forecast_id, 'oracle_forecast:mlfl1bfqrxnbk1');
  assert.equal(result.context.forecast_name, 'RB sales history (stripe)');
  assert.equal(result.context.workspace_key, 'foretic:user:mkfoxvxgoyfbtd');
  assert.equal(
    result.context.channel_key,
    'foretic:user:mkfoxvxgoyfbtd:forecast:oracle_forecast:mlfl1bfqrxnbk1',
  );
});

test('rejects forecast channel key without forecast id', () => {
  const result = normalizeForeticTenantContext({ user_id: 'user:mkfoxvxgoyfbtd' });

  assert.deepEqual(foreticForecastChannelKey(result.context), {
    ok: false,
    code: 'MISSING_FORECAST_ID',
    message: 'forecast_id is required to create a Foretic forecast channel key.',
  });
});
