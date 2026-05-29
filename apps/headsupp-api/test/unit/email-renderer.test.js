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
    defaults: {
      logo_url: 'https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/8235abd3-01d4-4c36-9c44-8955f77cc500/public',
    },
  });

  assert.match(rendered.html, /https:\/\/imagedelivery\.net\/qt9RmNSrfrSKuYiyxWVj5A\/8235abd3-01d4-4c36-9c44-8955f77cc500\/public/);
  assert.match(rendered.html, /width="48" height="48" alt="Heads Up"/);
  assert.match(rendered.text, /From headsupp\.io/);
  assert.match(rendered.text, /Powered by headsupp\.io/);
  assert.match(rendered.html, /From <a href="https:\/\/headsupp\.io\/"/);
  assert.match(rendered.html, />headsupp\.io<\/a>/);
  assert.match(rendered.html, /Powered by <a href="https:\/\/headsupp\.io\/"/);
  assert.match(rendered.html, /INC64 LLC\. 30N St Ste N, Sheridan, WY 82801\./);
});

test('renders configured linked footer brand override with platform footer below card', () => {
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
  assert.match(rendered.text, /Powered by headsupp\.io/);
  assert.match(rendered.html, /From <a href="https:\/\/foretic\.io\/"/);
  assert.match(rendered.html, />Foretic<\/a>/);
  assert.match(rendered.html, /Powered by <a href="https:\/\/headsupp\.io\/"/);
  assert.match(rendered.html, /Forecast intelligence from Foretic\./);
  assert.match(rendered.html, /INC64 LLC\. 30N St Ste N, Sheridan, WY 82801\./);
  assert.doesNotMatch(rendered.html, /Fewer surprises\. Just a heads up\./);
});

test('partial integrator branding does not inherit Heads Up footer defaults', () => {
  const rendered = renderAlertEmail({
    alert: baseAlert,
    subscriber: {
      config_json: JSON.stringify({
        branding: {
          title: 'Foretic Alerts',
          logo_url: 'https://example.com/foretic-logo.png',
        },
      }),
    },
    channel: {},
  });

  assert.match(rendered.html, /Foretic Alerts/);
  assert.match(rendered.html, /https:\/\/example\.com\/foretic-logo\.png/);
  assert.match(rendered.text, /Powered by headsupp\.io/);
  assert.match(rendered.html, /Powered by <a href="https:\/\/headsupp\.io\/"/);
  assert.doesNotMatch(rendered.html, /Fewer surprises\. Just a heads up\./);
  assert.match(rendered.html, /INC64 LLC\. 30N St Ste N, Sheridan, WY 82801\./);
});

test('partial integrator branding without logo does not inherit Heads Up logo', () => {
  const rendered = renderAlertEmail({
    alert: baseAlert,
    subscriber: {
      config_json: JSON.stringify({
        branding: {
          brand_name: 'Foretic',
          brand_url: 'https://foretic.io',
        },
      }),
    },
    channel: {},
    defaults: {
      logo_url: 'https://imagedelivery.net/qt9RmNSrfrSKuYiyxWVj5A/8235abd3-01d4-4c36-9c44-8955f77cc500/public',
    },
  });

  assert.match(rendered.html, /Foretic/);
  assert.doesNotMatch(rendered.html, /8235abd3-01d4-4c36-9c44-8955f77cc500/);
  assert.match(rendered.html, /Powered by <a href="https:\/\/headsupp\.io\/"/);
});

test('explicit integrator company line renders when provided', () => {
  const rendered = renderAlertEmail({
    alert: baseAlert,
    subscriber: {
      config_json: JSON.stringify({
        branding: {
          brand_name: 'Foretic',
          brand_url: 'https://foretic.io',
          footer_text: 'Forecast intelligence from Foretic.',
          company_line: 'Foretic Ltd.',
        },
      }),
    },
    channel: {},
  });

  assert.match(rendered.html, /Forecast intelligence from Foretic\./);
  assert.match(rendered.html, /Foretic Ltd\./);
  assert.match(rendered.html, /Powered by <a href="https:\/\/headsupp\.io\/"/);
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
  assert.match(rendered.html, /Powered by <a href="https:\/\/headsupp\.io\/"/);
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

test('renders forecast win template from success tone with shared shell', () => {
  const rendered = renderAlertEmail({
    alert: {
      ...baseAlert,
      severity: 'success',
      current_value: 1,
      threshold_value: 1,
      cta_label: 'View forecast',
      cta_url: 'https://example.com/forecasts/q2-revenue',
      payload_json: JSON.stringify({
        cta: {
          label: 'View forecast',
          url: 'https://example.com/forecasts/q2-revenue',
          variant: 'success',
        },
        fields: {
          event_type: 'goal_reached',
          tone: 'success',
          icon_variant: 'trophy',
          forecast_name: 'Q2 Revenue',
          resource_name: 'Q2 Revenue',
          notification: {
            title: 'Q2 Revenue',
            summary: 'Goal reached: £10,000 hit 6 days early.',
            detail: 'Best value to date is £10,250 against a £10,000 goal.',
            headline_value: '£10,000',
            headline_label: 'Goal reached',
          },
          display: {
            goal_value: '£10,000',
            observed_to_date: '£10,250',
            reached_on: '24 Jun 2026',
            days_early: '6 days early',
          },
          metrics: [
            { label: 'Goal', value: '£10,000' },
            { label: 'Observed', value: '£10,250' },
            { label: 'Reached on', value: '24 Jun 2026' },
            { label: 'Days early', value: '6' },
          ],
        },
      }),
    },
    subscriber: {
      destination_url: 'martin@inc64.com',
      config_json: JSON.stringify({
        template_id: 'forecast_alert_v1',
        branding: {
          brand_name: 'Foretic',
          brand_url: 'https://foretic.io',
          logo_url: 'https://example.com/foretic-logo.png',
        },
      }),
    },
    channel: { name: 'Revenue goals' },
  });

  assert.equal(rendered.template_id, 'forecast_win_v1');
  assert.equal(rendered.subject, 'Success: Q2 Revenue');
  assert.match(rendered.html, /Foretic/);
  assert.match(rendered.html, /https:\/\/example\.com\/foretic-logo\.png/);
  assert.match(rendered.html, /Goal reached/);
  assert.match(rendered.html, /£10,000/);
  assert.match(rendered.html, /Best value to date is £10,250/);
  assert.match(rendered.html, /data-cta-variant="success"/);
  assert.match(rendered.html, /background:#198754;color:#ffffff/);
  assert.match(rendered.html, /ce7f99d4-1b03-403d-79a0-7e2084346100/);
  assert.doesNotMatch(rendered.html, />WIN<\/div>/);
  assert.match(rendered.html, /Powered by <a href="https:\/\/headsupp\.io\/"/);
  assert.match(rendered.html, /INC64 LLC\. 30N St Ste N, Sheridan, WY 82801\./);
});

test('renders forecast win fallback icon and display metrics when headline is absent', () => {
  const rendered = renderAlertEmail({
    alert: {
      ...baseAlert,
      severity: 'info',
      current_value: 1,
      threshold_value: 1,
      payload_json: JSON.stringify({
        fields: {
          template_kind: 'forecast_win',
          icon_variant: 'target_hit',
          forecast_name: 'Q3 Pipeline',
          notification: {
            summary: 'Target met for the quarter.',
          },
          display: {
            goal_value: '$20,000',
            observed_to_date: '$21,500',
            reached_on: '30 Sep 2026',
          },
        },
      }),
    },
    subscriber: { config_json: '{}' },
    channel: {},
  });

  assert.equal(rendered.template_id, 'forecast_win_v1');
  assert.match(rendered.html, /72fd0fa0-a91b-4ad4-fc9f-319d362cb500/);
  assert.doesNotMatch(rendered.html, />HIT<\/div>/);
  assert.match(rendered.html, /Milestone achieved/);
  assert.match(rendered.html, /\$20,000/);
  assert.match(rendered.html, /Observed/);
  assert.match(rendered.text, /Target met for the quarter\./);
});

test('platform default renders the company address only once (footer, not duplicated in card)', () => {
  const rendered = renderAlertEmail({
    alert: baseAlert,
    subscriber: { config_json: '{}' },
    channel: {},
    // Mirror production: HEADSUPP_EMAIL_COMPANY_LINE feeds defaults.company_line.
    defaults: { company_line: 'INC64 LLC. 30N St Ste N, Sheridan, WY 82801.' },
  });

  const occurrences = rendered.html.match(/INC64 LLC\. 30N St Ste N, Sheridan, WY 82801\./g) || [];
  assert.equal(occurrences.length, 1);
});

test('does not surface an opaque resource id as the header subtitle', () => {
  const rendered = renderAlertEmail({
    alert: {
      ...baseAlert,
      payload_json: JSON.stringify({ fields: { resource_name: 'oracle_forecast:mn9cxnv3muoleo' } }),
    },
    subscriber: { config_json: '{}' },
    channel: {},
  });

  assert.doesNotMatch(rendered.html, /oracle_forecast:mn9cxnv3muoleo/);
});

test('prefers a real forecast name over an opaque resource id', () => {
  const rendered = renderAlertEmail({
    alert: {
      ...baseAlert,
      payload_json: JSON.stringify({
        fields: { forecast_name: 'Q2 Revenue', resource_name: 'oracle_forecast:mn9cxnv3muoleo' },
      }),
    },
    subscriber: { config_json: '{}' },
    channel: {},
  });

  assert.match(rendered.html, /Q2 Revenue/);
  assert.doesNotMatch(rendered.html, /oracle_forecast:mn9cxnv3muoleo/);
});

test('ignores debug fields when debug render mode is off', () => {
  const rendered = renderAlertEmail({
    alert: {
      ...baseAlert,
      payload_json: JSON.stringify({
        fields: {
          notification: { title: 'Forecast pace alert', summary: 'Clean summary.' },
          debug: {
            id: 'oracle_forecast:mn9cxnv3muoleo',
            event_ref: 'foretic:oracle_forecast:mn9cxnv3muoleo:forecast_state',
          },
        },
      }),
    },
    subscriber: { config_json: '{}' },
    channel: {},
  });

  assert.doesNotMatch(rendered.subject, /oracle_forecast:mn9cxnv3muoleo/);
  assert.doesNotMatch(rendered.text, /oracle_forecast:mn9cxnv3muoleo/);
  assert.doesNotMatch(rendered.html, /oracle_forecast:mn9cxnv3muoleo/);
});

test('renders debug footer and subject suffix for debug subscriber', () => {
  const rendered = renderAlertEmail({
    alert: {
      ...baseAlert,
      payload_json: JSON.stringify({
        fields: {
          notification: { title: 'Forecast pace alert', summary: 'Clean summary.' },
          debug: {
            id: 'oracle_forecast:mn9cxnv3muoleo',
            event_ref: 'foretic:oracle_forecast:mn9cxnv3muoleo:forecast_state',
          },
        },
      }),
    },
    subscriber: { config_json: JSON.stringify({ debug: true }) },
    channel: {},
  });

  assert.match(rendered.subject, /\[oracle_forecast:mn9cxnv3muoleo\]$/);
  assert.match(rendered.text, /Debug: oracle_forecast:mn9cxnv3muoleo · evt foretic:oracle_forecast:mn9cxnv3muoleo:forecast_state/);
  assert.match(rendered.html, /Debug: oracle_forecast:mn9cxnv3muoleo · evt foretic:oracle_forecast:mn9cxnv3muoleo:forecast_state/);
  assert.match(rendered.html, /<h1[^>]*>Forecast pace alert<\/h1>/);
});

test('renders debug footer from per-event debug mode', () => {
  const rendered = renderAlertEmail({
    alert: {
      ...baseAlert,
      payload_json: JSON.stringify({
        fields: {
          notification: { title: 'Forecast pace alert', summary: 'Clean summary.' },
          debug: {
            id: 'oracle_forecast:mn9cxnv3muoleo',
            mode: 'debug',
          },
        },
      }),
    },
    subscriber: { config_json: '{}' },
    channel: {},
  });

  assert.match(rendered.subject, /\[oracle_forecast:mn9cxnv3muoleo\]$/);
  assert.match(rendered.text, /Debug: oracle_forecast:mn9cxnv3muoleo/);
});

test('debug_subject false keeps footer debug line without subject suffix', () => {
  const rendered = renderAlertEmail({
    alert: {
      ...baseAlert,
      payload_json: JSON.stringify({
        fields: {
          notification: { title: 'Forecast pace alert', summary: 'Clean summary.' },
          debug: { id: 'oracle_forecast:mn9cxnv3muoleo' },
        },
      }),
    },
    subscriber: { config_json: JSON.stringify({ debug: true, debug_subject: false }) },
    channel: {},
  });

  assert.doesNotMatch(rendered.subject, /\[oracle_forecast:mn9cxnv3muoleo\]/);
  assert.match(rendered.text, /Debug: oracle_forecast:mn9cxnv3muoleo/);
});

test('debug values are escaped in html', () => {
  const rendered = renderAlertEmail({
    alert: {
      ...baseAlert,
      payload_json: JSON.stringify({
        fields: {
          notification: { title: 'Forecast pace alert', summary: 'Clean summary.' },
          debug: {
            id: 'forecast:<script>',
            event_ref: 'evt:<b>1</b>',
            mode: 'debug',
          },
        },
      }),
    },
    subscriber: { config_json: '{}' },
    channel: {},
  });

  assert.match(rendered.html, /forecast:&lt;script&gt;/);
  assert.match(rendered.html, /evt:&lt;b&gt;1&lt;\/b&gt;/);
  assert.doesNotMatch(rendered.html, /<script>/);
  assert.doesNotMatch(rendered.html, /<b>1<\/b>/);
});

test('renders all Heads Up-owned forecast win icon asset aliases', () => {
  const cases = [
    ['medal', 'ec9d77a6-8193-4631-1f06-52698ad24b00'],
    ['award', 'df51dfa6-5392-46b6-9c01-1ddfae3f5600'],
    ['trophy', 'ce7f99d4-1b03-403d-79a0-7e2084346100'],
    ['trendup', '38fbbbf5-7a77-4382-efef-26930f115100'],
    ['rocket', '38fbbbf5-7a77-4382-efef-26930f115100'],
  ];

  for (const [iconVariant, assetId] of cases) {
    const rendered = renderAlertEmail({
      alert: {
        ...baseAlert,
        severity: 'success',
        current_value: 1,
        threshold_value: 1,
        payload_json: JSON.stringify({
          fields: {
            tone: 'success',
            icon_variant: iconVariant,
            forecast_name: 'Q4 Revenue',
            notification: {
              summary: 'Milestone achieved.',
              headline_value: '$25,000',
            },
          },
        }),
      },
      subscriber: { config_json: '{}' },
      channel: {},
    });

    assert.equal(rendered.template_id, 'forecast_win_v1');
    assert.match(rendered.html, new RegExp(assetId));
  }
});
