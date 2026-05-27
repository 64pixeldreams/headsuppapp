# Cookbook: Email Alerts

Email subscribers use `subscriber_type: 'email'` and `destination_url` as the recipient address.

## Create subscriber

```js
const emailSubscriber = await headsup.createSubscriber({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  subscriber_type: 'email',
  name: 'Martin',
  destination_url: 'martin@example.com',
  mode: 'alert',
  config: {
    template_id: 'base_alert_v1',
    actions: ['snooze_1h', 'snooze_1d', 'stop_watching'],
    value_format: 'money_usd_2',
    locale: 'en-US',
    timezone: 'UTC',
    branding: {
      brand_name: 'Coffee Ops',
      brand_url: 'https://example.com',
      footer_brand_name: 'Coffee Ops',
      footer_brand_url: 'https://example.com',
      cta_variant: 'warning',
    },
    labels: {
      title_template: 'Highest coffee purchase: {value}',
      summary_template: 'Reached {value}; threshold is {threshold}.',
      current_label: 'Highest purchase',
      threshold_label: 'Alert threshold',
    },
  },
});
```

`{value}` and `{threshold}` render at delivery time using `value_format` (for example `money_gbp_2`, `percent_1`).

## Optional double opt-in

```js
config: {
  authorization: {
    required: true,
    ttl_seconds: 604800,
  },
}
```

When `authorization.required` is true, the subscriber starts disabled until the recipient confirms via the emailed link (`GET /v1/subscribers/confirm?token=...` on the API host).

## Watch and send (same as webhook path)

```js
const watch = await headsup.createWatch({
  workspace_id: workspace.workspace_id,
  channel_id: channel.channel_id,
  signal_id: signalResult.signal.signal_id,
  name: 'Coffee purchase high',
  watch_type: 'LAST_VALUE_GT',
  config: { threshold: 8, severity: 'warning', bucket_type: 'minute' },
});

await headsup.sendEvent({
  connectorKey: connector.connector_key,
  connectorSecret: connector.connector_secret,
  event: {
    idempotency_key: `email_${Date.now()}`,
    signal_key: 'spend.coffee.usd',
    occurred_at: new Date().toISOString(),
    value: { num: 9.5 },
    cta: {
      label: 'Open coffee ledger',
      url: 'https://example.com/coffee',
      color_class: 'warning',
    },
  },
});
```

## What you should see

- Subject/heading use formatted `{value}` (for example `$9.50`)
- Severity shown as styled badge in HTML template
- Optional action buttons when `config.actions` is set
- CTA buttons use `cta.variant` or `cta.color_class` (`primary`, `success`, `warning`, `danger`, `info`, `dark`, `light`)
- Footer brand links use `branding.footer_brand_name`/`footer_brand_url`, falling back to `brand_name`/`brand_url`
- Confirmation email first when authorization is required
