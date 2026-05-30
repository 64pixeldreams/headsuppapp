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

## Group related bands

Warning and critical bands for the same customer moment should be grouped so Heads Up chooses one winner before creating a customer alert:

```js
await headsup.provisionChannel({
  workspace,
  channel,
  signals: [{ signal_key: 'forecast.revenue.pace' }],
  watch_groups: [
    {
      group_key: 'forecast_pace_health',
      signal_key: 'forecast.revenue.pace',
      winner_policy: 'highest_severity_wins',
      replaces: {
        watch_id_patterns: [':pace:warning', ':pace:critical'],
      },
      bands: [
        { band_key: 'critical', watch_type: 'LAST_VALUE_LT', config: { threshold: 70, severity: 'critical' } },
        { band_key: 'warning', watch_type: 'LAST_VALUE_LT', config: { threshold: 85, severity: 'warning' } },
      ],
    },
  ],
});
```

`replaces` disables older ungrouped watches for the same workspace/channel/signal, so migrations do not leave legacy rules active next to the grouped policy.

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

Resume is a deliberate operator action. Heads Up treats it as a dedupe reset for that watch/signal target, so the next matching alert can deliver immediately (even if it lands in the same minute bucket as a pre-resume alert).

## Disable durably (vs snooze/mute)

Snooze and mute are temporary. To turn a watch off for good (until you re-enable it) — for example when migrating a user off an old channel — use `disableWatch`:

```js
await headsup.disableWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  watch_id: watch.watch_id,
});

// Reversible:
await headsup.enableWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  watch_id: watch.watch_id,
});
```

```text
snooze   temporary, until snooze_until
mute     until you resume
disable  durable off, reversible with enableWatch
delete   not available yet — disable instead
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
- Resume: dedupe reset for that target; next matching alert can deliver immediately
- Grouped bands: one winning alert, not warning plus critical
- Attention dedupe: lower-severity duplicate deliveries are marked `suppressed_duplicate`
- `getWatchState` reflects controls applied to the watch
