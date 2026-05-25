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
  assert.match(rendered.html, /display:block;width:100%;box-sizing:border-box;background:#111827/);
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

  assert.match(rendered.subject, /Coffee <Budget> exceeded: 126\.40/);
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
