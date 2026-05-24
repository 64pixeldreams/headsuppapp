import assert from 'node:assert/strict';
import test from 'node:test';

import { cooldownUntil, decideAlertAction, recoveryTriggered, severityIncreased } from '../../src/services/watches/alert-decision.js';

const now = '2026-05-24T10:00:00.000Z';

test('allows first alert when watch triggers', () => {
  const decision = decideAlertAction({
    watch: { cooldown_seconds: 3600 },
    evaluation: {
      supported: true,
      triggered: true,
      severity: 'warning',
      current_value: 84,
    },
    now,
  });

  assert.equal(decision.action, 'alert');
  assert.equal(decision.severity, 'warning');
});

test('suppresses same-severity alert during cooldown', () => {
  const decision = decideAlertAction({
    watch: { cooldown_seconds: 3600 },
    evaluation: {
      supported: true,
      triggered: true,
      severity: 'warning',
      current_value: 82,
    },
    state: {
      last_status: 'triggered',
      last_alert_severity: 'warning',
      cooldown_until: '2026-05-24T11:00:00.000Z',
    },
    now,
  });

  assert.equal(decision.action, 'none');
  assert.equal(decision.reason, 'COOLDOWN_ACTIVE');
});

test('allows post-cooldown alert', () => {
  const decision = decideAlertAction({
    watch: { cooldown_seconds: 3600 },
    evaluation: {
      supported: true,
      triggered: true,
      severity: 'warning',
      current_value: 82,
    },
    state: {
      last_status: 'triggered',
      last_alert_severity: 'warning',
      cooldown_until: '2026-05-24T09:59:00.000Z',
    },
    now,
  });

  assert.equal(decision.action, 'alert');
});

test('allows severity escalation during cooldown', () => {
  const decision = decideAlertAction({
    watch: { cooldown_seconds: 3600 },
    evaluation: {
      supported: true,
      triggered: true,
      severity: 'critical',
      current_value: 69,
    },
    state: {
      last_status: 'triggered',
      last_alert_severity: 'warning',
      cooldown_until: '2026-05-24T11:00:00.000Z',
    },
    now,
  });

  assert.equal(decision.action, 'escalation');
  assert.equal(severityIncreased('warning', 'critical'), true);
});

test('allows recovery alert from triggered state', () => {
  const watch = {
    recovery_json: JSON.stringify({
      enabled: true,
      condition: 'value >= 95',
      severity: 'recovery',
    }),
  };
  const decision = decideAlertAction({
    watch,
    evaluation: {
      supported: true,
      triggered: false,
      current_value: 97,
    },
    state: {
      last_status: 'triggered',
      last_alert_severity: 'critical',
      cooldown_until: '2026-05-25T10:00:00.000Z',
    },
    now,
  });

  assert.equal(recoveryTriggered(watch, 97), true);
  assert.equal(decision.action, 'recovery');
  assert.equal(decision.severity, 'recovery');
});

test('calculates cooldown until timestamp', () => {
  assert.equal(cooldownUntil(now, 60), '2026-05-24T10:01:00.000Z');
});
