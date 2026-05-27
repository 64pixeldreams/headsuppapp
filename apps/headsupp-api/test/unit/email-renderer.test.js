import assert from 'node:assert/strict';
import test from 'node:test';

import { renderAlertEmail } from '../../src/services/email/render-alert-email.js';

const baseAlert = {
  id: 'alert_123',
  severity: 'critical',
  summary_text: 'Weekly coffee budget exceeded.',
  current_value: 126.4,
  threshold_value: 100,
  cta_label: 'View coffee spend',
  cta_url: 'https://example.com/coffee/spend',
  payload_json: JSON.stringify({
    fields: {
      merchant: 'Blue Bottle',
    },
  }),
};

test('renders fallback template with formatting profile', () => {
  const rendered = renderAlertEmail({
    alert: baseAlert,
    subscriber: {
      name: 'Martin',
      destination_url: 'martin@inc64.com',
      config_json: JSON.stringify({
        value_format: 'money_gbp_2',
        locale: 'en-GB',
      }),
    },
    channel: {},
    unsubscribe_url: 'https://headsupp.io/v1/subscribers/unsubscribe?token=test',
  });

  assert.match(rendered.subject, /^Critical:/);
  assert.match(rendered.subject, /Weekly coffee budget exceeded\.: £126\.40/);
  assert.match(rendered.text, /£126\.40/);
  assert.match(rendered.text, /Unsubscribe:/);
  assert.match(rendered.text, /Signal reached £126\.40/);
  assert.match(rendered.html, /href="https:\/\/headsupp\.io\/v1\/subscribers\/unsubscribe\?token=test"/);
  assert.match(rendered.html, /Critical/);
  assert.match(rendered.html, /background:#FEE2E2/);
  assert.match(rendered.html, /View coffee spend/);
  assert.match(rendered.html, /min-width:148px;background:#212529;color:#ffffff/);
  assert.match(rendered.html, /max-width:560px/);
  assert.match(rendered.html, /border:1px solid #d0d7de/);
  assert.doesNotMatch(rendered.html, /<strong>Severity:<\/strong>/);
  assert.doesNotMatch(rendered.text, /Severity:/);
});

test('renders notification overrides and escapes HTML content', () => {
  const rendered = renderAlertEmail({
    alert: {
      ...baseAlert,
      payload_json: JSON.stringify({
        fields: {
          notification: {
            title: 'Coffee <Budget> exceeded',
            summary: 'Reached <b>126.40</b> this week.',
            detail: 'Use card less often.',
          },
        },
      }),
    },
    subscriber: { config_json: '{}' },
    channel: {},
  });

  assert.equal(rendered.subject, 'Critical: Coffee <Budget> exceeded');
  assert.match(rendered.html, /Coffee &lt;Budget&gt; exceeded/);
  assert.doesNotMatch(rendered.html, /<b>126\.40<\/b>/);
});

test('omits CTA button when URL is invalid', () => {
  const rendered = renderAlertEmail({
    alert: {
      ...baseAlert,
      cta_url: 'javascript:alert(1)',
    },
    subscriber: { config_json: '{}' },
    channel: {},
  });
  assert.doesNotMatch(rendered.html, /View coffee spend/);
});

test('uses email-derived recipient name when subscriber label is generic', () => {
  const rendered = renderAlertEmail({
    alert: baseAlert,
    subscriber: {
      name: 'Coffee Email Alerts',
      destination_url: 'martin@inc64.com',
      config_json: '{}',
    },
    channel: {},
  });

  assert.match(rendered.text, /Hi Martin,/);
});

test('normalizes title by removing status and trailing high/low suffix', () => {
  const rendered = renderAlertEmail({
    alert: {
      ...baseAlert,
      severity: 'warning',
      summary_text: 'Highest coffee purchase high is warning at 9.5.',
    },
    subscriber: {
      destination_url: 'martin@inc64.com',
      config_json: '{}',
    },
    channel: {},
  });

  assert.equal(rendered.subject, 'Warning: Highest coffee purchase: 126.40');
});

test('renders configured title template placeholders with formatted values', () => {
  const rendered = renderAlertEmail({
    alert: {
      ...baseAlert,
      severity: 'warning',
      summary_text: 'Highest coffee purchase high is warning at 9.5.',
      current_value: 9.5,
      threshold_value: 8,
    },
    subscriber: {
      destination_url: 'martin@inc64.com',
      config_json: JSON.stringify({
        value_format: 'money_usd_2',
        locale: 'en-US',
        labels: {
          title_template: 'Highest coffee purchase: {value}',
          summary_template: 'Your highest coffee purchase reached {value}; threshold is {threshold}.',
        },
      }),
    },
    channel: {},
  });

  assert.equal(rendered.subject, 'Warning: Highest coffee purchase: $9.50');
  assert.match(rendered.text, /Your highest coffee purchase reached \$9\.50; threshold is \$8\.00\./);
});

test('renders configured alert action links in html and text', () => {
  const rendered = renderAlertEmail({
    alert: baseAlert,
    subscriber: {
      name: 'Martin',
      destination_url: 'martin@inc64.com',
      config_json: '{}',
    },
    channel: {},
    action_links: [
      { id: 'snooze_1h', label: 'SNOOZE 1H', url: 'https://headsupp.io/v1/subscribers/email-action?token=s1' },
      { id: 'stop_watching', label: 'STOP WATCHING', url: 'https://headsupp.io/v1/subscribers/email-action?token=s2' },
    ],
  });

  assert.deepEqual(rendered.action_ids, ['snooze_1h', 'stop_watching']);
  assert.match(rendered.text, /Alert controls:/);
  assert.match(rendered.text, /SNOOZE 1H: https:\/\/headsupp\.io\/v1\/subscribers\/email-action\?token=s1/);
  assert.match(rendered.html, /Alert controls/);
  assert.match(rendered.html, /SNOOZE 1H/);
  assert.match(rendered.html, /STOP WATCHING/);
  assert.match(rendered.html, /width="50%"/);
  assert.match(rendered.html, /border-radius:8px/);
  assert.match(rendered.html, /font-weight:600/);
});

test('renders generic metric alert with branding and event-supplied metric rows', () => {
  const rendered = renderAlertEmail({
    alert: {
      ...baseAlert,
      severity: 'warning',
      payload_json: JSON.stringify({
        fields: {
          notification: {
            title: 'Revenue forecast needs attention',
            summary: 'You are $2,500 behind expected pace with 3 days left.',
            icon_url: 'https://example.com/alert.svg',
          },
          resource_name: 'RB sales history',
          metrics: [
            { label: 'Actual', value: '$7,500' },
            { label: 'Target', value: '$10,000' },
            { label: 'Time left', value: '3 days' },
          ],
        },
      }),
    },
    subscriber: {
      destination_url: 'martin@inc64.com',
      config_json: JSON.stringify({
        template_id: 'metric_alert_v1',
        branding: {
          brand_name: 'Foretic',
          logo_url: 'https://example.com/logo.png',
          accent_color: '#0969da',
          company_line: 'Foretic Ltd',
        },
      }),
    },
    channel: { name: 'Revenue pace' },
  });

  assert.equal(rendered.template_id, 'metric_alert_v1');
  assert.equal(rendered.subject, 'Warning: Revenue forecast needs attention');
  assert.match(rendered.html, /Foretic/);
  assert.match(rendered.html, /https:\/\/example\.com\/logo\.png/);
  assert.match(rendered.html, /width="48" height="48"/);
  assert.match(rendered.html, /https:\/\/example\.com\/alert\.svg/);
  assert.match(rendered.html, /width="128" height="128"/);
  assert.match(rendered.html, /border-radius:24px/);
  assert.match(rendered.html, /RB sales history/);
  assert.match(rendered.html, /Actual/);
  assert.match(rendered.html, /\$7,500/);
  assert.match(rendered.html, /Foretic Ltd/);
});

test('renders CTA variant colors from event payload', () => {
  const rendered = renderAlertEmail({
    alert: {
      ...baseAlert,
      payload_json: JSON.stringify({
        cta: {
          label: 'View forecast',
          url: 'https://example.com/forecast',
          variant: 'success',
        },
        fields: {
          notification: {
            title: 'Forecast is back on track',
            summary: 'The forecast recovered above target pace.',
          },
        },
      }),
    },
    subscriber: { config_json: '{}' },
    channel: {},
  });

  assert.match(rendered.html, /data-cta-variant="success"/);
  assert.match(rendered.html, /background:#198754;color:#ffffff/);
  assert.match(rendered.html, /border:1px solid #198754/);
});

test('falls back to dark CTA variant for invalid color class', () => {
  const rendered = renderAlertEmail({
    alert: {
      ...baseAlert,
      payload_json: JSON.stringify({
        cta: {
          label: 'View forecast',
          url: 'https://example.com/forecast',
          color_class: 'neon',
        },
      }),
    },
    subscriber: { config_json: '{}' },
    channel: {},
  });

  assert.match(rendered.html, /data-cta-variant="dark"/);
  assert.match(rendered.html, /background:#212529;color:#ffffff/);
});

test('renders default linked footer brand', () => {
  const rendered = renderAlertEmail({
    alert: baseAlert,
    subscriber: { config_json: '{}' },
    channel: {},
  });

  assert.match(rendered.text, /From headsupp\.io/);
  assert.match(rendered.html, /From <a href="https:\/\/headsupp\.io\/"/);
  assert.match(rendered.html, />headsupp\.io<\/a>/);
});

test('renders configured linked footer brand override', () => {
  const rendered = renderAlertEmail({
    alert: baseAlert,
    subscriber: {
      config_json: JSON.stringify({
        branding: {
          brand_name: 'Foretic',
          brand_url: 'https://foretic.io',
          footer_text: 'Forecast intelligence from Foretic.',
        },
      }),
    },
    channel: {},
  });

  assert.match(rendered.text, /From Foretic/);
  assert.match(rendered.html, /From <a href="https:\/\/foretic\.io\/"/);
  assert.match(rendered.html, />Foretic<\/a>/);
  assert.match(rendered.html, /Forecast intelligence from Foretic\./);
});

test('renders brand header without placeholder logo when logo is absent', () => {
  const rendered = renderAlertEmail({
    alert: baseAlert,
    subscriber: {
      destination_url: 'martin@inc64.com',
      config_json: JSON.stringify({
        template_id: 'brand_alert_v1',
        branding: {
          title: 'Acme Alerts',
          subtitle: 'Production monitors',
        },
      }),
    },
    channel: {},
  });

  assert.match(rendered.html, /Acme Alerts/);
  assert.match(rendered.html, /Production monitors/);
  assert.doesNotMatch(rendered.html, /width:32px;height:32px;border-radius:7px;background/);
  assert.match(rendered.html, /INC64 LLC\. 30N St Ste N, Sheridan, WY 82801\./);
});

test('infers forecast alert from generic forecast fields without Foretic-specific config', () => {
  const rendered = renderAlertEmail({
    alert: {
      ...baseAlert,
      severity: 'warning',
      current_value: 64,
      threshold_value: 85,
      payload_json: JSON.stringify({
        fields: {
          event_type: 'forecast_state',
          forecast_name: 'RB sales history (stripe)',
          notification: {
            summary: 'You are behind pace with 3 days left in the period.',
          },
          display: {
            actual_to_date: '$7,500',
            target: '$10,000',
            gap: '$2,500 behind',
            days_remaining: '3 days',
            pace_percent: '64%',
            threshold_value: '85%',
          },
        },
      }),
      cta_label: 'View forecast',
      cta_url: 'https://app.example.com/forecast/123',
    },
    subscriber: {
      destination_url: 'martin@inc64.com',
      config_json: JSON.stringify({
        branding: {
          brand_name: 'Acme Forecasts',
        },
      }),
    },
    channel: { name: 'Revenue pace' },
  });

  assert.equal(rendered.template_id, 'forecast_alert_v1');
  assert.equal(rendered.subject, 'Warning: RB sales history (stripe)');
  assert.match(rendered.html, /Acme Forecasts/);
  assert.match(rendered.html, /RB sales history \(stripe\)/);
  assert.match(rendered.html, /Actual to date/);
  assert.match(rendered.html, /\$7,500/);
  assert.match(rendered.html, /View forecast/);
});
