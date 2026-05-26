# Cookbook: Noise Control

Reduce alert fatigue with cooldowns, renotify policy, snooze, mute, and ignore.

## Cooldown on create

```js
const watch = await headsup.createWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  signal_id: signalResult.signal.signal_id,
  name: 'Spend spike',
  watch_type: 'LAST_VALUE_GT',
  config: { threshold: 100, severity: 'warning', bucket_type: 'minute' },
  cooldown_seconds: 3600,
});
```

Default behavior: repeat alerts respect `cooldown_seconds` while still triggered.

## Once until recovered

```js
await headsup.createWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  signal_id: signalResult.signal.signal_id,
  name: 'Price above target',
  watch_type: 'LAST_VALUE_GT',
  config: {
    threshold: 100,
    severity: 'warning',
    bucket_type: 'minute',
    renotify_policy: 'once_until_recovered',
  },
  recovery: {
    enabled: true,
    condition: 'value <= 95',
    severity: 'recovery',
  },
});
```

## Snooze, mute, resume

```js
await headsup.snoozeWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  watch_id: watch.watch_id,
  snooze_until: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
  reason: 'Known deploy',
});

await headsup.muteWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  watch_id: watch.watch_id,
});

await headsup.resumeWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  watch_id: watch.watch_id,
});
```

## Ignore one alert

```js
const { alerts } = await headsup.listChannelAlerts({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  limit: 1,
});

if (alerts[0]) {
  await headsup.ignoreAlert({
    workspace_id: workspace.workspace_id,
    channel_id: channel.channel_id,
    alert_id: alerts[0].alert_id,
  });
}
```

## Inspect state

```js
const state = await headsup.getWatchState({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  watch_id: watch.watch_id,
});
// state.last_status, state.last_triggered_at, etc.
```

## What you should see

- `once_until_recovered`: one alert per incident until recovery fires
- Snooze: no new deliveries until `snooze_until`
- `getWatchState` reflects controls applied to the watch
