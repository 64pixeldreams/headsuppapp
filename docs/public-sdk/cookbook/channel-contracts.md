# Cookbook: Channel Contracts

Channel contracts define default aggregation and validation rules inherited by signals on the channel.

## Create contract

```js
const contract = await headsup.createChannelContract({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  contract: {
    default_bucket_types: ['minute', 'hour', 'day', 'week'],
    dimensions: ['region', 'product'],
    value_mode: 'last',
  },
});
// contract.channel_contract_id
```

## Update contract (new version)

```js
const updated = await headsup.updateChannelContract({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  channel_contract_id: contract.channel_contract_id,
  contract: {
    default_bucket_types: ['minute', 'hour', 'day', 'week', 'month'],
    dimensions: ['region'],
  },
});
```

## Signal inherits contract

```js
const signalResult = await headsup.createSignal({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  signal_key: 'orders.count',
  signal_type: 'metric',
  value_mode: 'last',
  contract: {
    dimensions: ['region'],
  },
});
```

Per-signal `contract` merges with the active channel contract.

## List versions (escape hatch)

```js
const versions = await headsup.requestFunction('admin.listChannelContractVersions', {
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
});
```

## What you should see

- Aggregates use bucket types from the effective contract
- `createSignal` without explicit buckets still gets defaults from channel contract
