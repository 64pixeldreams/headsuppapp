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
      config_json: JSON.stringify({
        value_format: 'money_gbp_2',
        locale: 'en-GB',
      }),
    },
    channel: {},
    unsubscribe_url: 'https://headsupp.io/v1/subscribers/unsubscribe?token=test',
  });

  assert.match(rendered.subject, /^Critical:/);
  assert.match(rendered.text, /£126\.40/);
  assert.match(rendered.text, /Unsubscribe:/);
  assert.match(rendered.html, /href="https:\/\/headsupp\.io\/v1\/subscribers\/unsubscribe\?token=test"/);
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

  assert.match(rendered.subject, /Coffee <Budget> exceeded/);
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
