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

test('once_until_recovered suppresses post-cooldown repeat while still triggered', () => {
  const decision = decideAlertAction({
    watch: {
      cooldown_seconds: 60,
      config_json: JSON.stringify({ renotify_policy: 'once_until_recovered' }),
    },
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

  assert.equal(decision.action, 'none');
  assert.equal(decision.reason, 'ALREADY_TRIGGERED_UNTIL_RECOVERY');
});

test('once_until_recovered allows a new alert after recovered state', () => {
  const decision = decideAlertAction({
    watch: {
      cooldown_seconds: 60,
      config_json: JSON.stringify({ renotify_policy: 'once_until_recovered' }),
    },
    evaluation: {
      supported: true,
      triggered: true,
      severity: 'warning',
      current_value: 82,
    },
    state: {
      last_status: 'recovered',
      last_alert_severity: 'recovery',
      cooldown_until: null,
    },
    now,
  });

  assert.equal(decision.action, 'alert');
});

test('once_until_recovered suppresses same incident escalation until recovery', () => {
  const decision = decideAlertAction({
    watch: {
      cooldown_seconds: 60,
      config_json: JSON.stringify({ renotify_policy: 'once_until_recovered' }),
    },
    evaluation: {
      supported: true,
      triggered: true,
      severity: 'critical',
      current_value: 99,
    },
    state: {
      last_status: 'triggered',
      last_alert_severity: 'warning',
      cooldown_until: '2026-05-24T09:59:00.000Z',
    },
    now,
  });

  assert.equal(decision.action, 'none');
  assert.equal(decision.reason, 'ALREADY_TRIGGERED_UNTIL_RECOVERY');
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

test('snoozed watch suppresses triggered alerts before cooldown logic', () => {
  const decision = decideAlertAction({
    watch: { cooldown_seconds: 3600 },
    evaluation: {
      supported: true,
      triggered: true,
      severity: 'critical',
      current_value: 99,
    },
    actionControls: [
      {
        id: 'act_snooze',
        action_type: 'snooze',
        status: 'active',
        expires_at: '2026-05-24T11:00:00.000Z',
      },
    ],
    now,
  });

  assert.equal(decision.action, 'none');
  assert.equal(decision.reason, 'WATCH_SNOOZED');
});

test('muted watch suppresses recovery notifications too', () => {
  const decision = decideAlertAction({
    watch: {
      recovery_json: JSON.stringify({ enabled: true, condition: 'value >= 95', severity: 'recovery' }),
    },
    evaluation: {
      supported: true,
      triggered: false,
      current_value: 99,
    },
    state: { last_status: 'triggered' },
    actionControls: [{ id: 'act_mute', action_type: 'mute', status: 'active', expires_at: null }],
    now,
  });

  assert.equal(decision.action, 'none');
  assert.equal(decision.reason, 'WATCH_MUTED');
});

test('expired snooze no longer suppresses alerts', () => {
  const decision = decideAlertAction({
    watch: { cooldown_seconds: 3600 },
    evaluation: {
      supported: true,
      triggered: true,
      severity: 'warning',
      current_value: 82,
    },
    actionControls: [
      {
        id: 'act_snooze',
        action_type: 'snooze',
        status: 'active',
        expires_at: '2026-05-24T09:59:00.000Z',
      },
    ],
    now,
  });

  assert.equal(decision.action, 'alert');
});
