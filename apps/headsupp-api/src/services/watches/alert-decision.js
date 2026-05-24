import { parseWatchJson } from './evaluate-watch.js';

const SEVERITY_RANK = {
  info: 0,
  watch: 1,
  warning: 2,
  critical: 3,
  recovery: 4,
};

export function severityIncreased(previousSeverity, nextSeverity) {
  return (SEVERITY_RANK[nextSeverity] ?? 0) > (SEVERITY_RANK[previousSeverity] ?? 0);
}

function isCoolingDown(state, now) {
  return Boolean(state?.cooldown_until && Date.parse(state.cooldown_until) > Date.parse(now));
}

export function cooldownUntil(now, cooldownSeconds = 86400) {
  return new Date(Date.parse(now) + Number(cooldownSeconds) * 1000).toISOString();
}

function recoveryConfig(watch) {
  const config = parseWatchJson(watch.recovery_json);
  return {
    enabled: Boolean(config.enabled),
    severity: config.severity || 'recovery',
    condition: config.condition || null,
  };
}

export function recoveryTriggered(watch, currentValue) {
  const recovery = recoveryConfig(watch);
  if (!recovery.enabled || !recovery.condition || currentValue === null || currentValue === undefined) return false;

  const match = recovery.condition.match(/^value\s*(>=|>|<=|<)\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return false;

  const threshold = Number(match[2]);
  if (match[1] === '>=') return currentValue >= threshold;
  if (match[1] === '>') return currentValue > threshold;
  if (match[1] === '<=') return currentValue <= threshold;
  return currentValue < threshold;
}

export function decideAlertAction({ watch, evaluation, state = null, now = new Date().toISOString() }) {
  if (!evaluation.supported) {
    return {
      action: 'none',
      reason: evaluation.reason,
    };
  }

  if (!evaluation.triggered) {
    if (state?.last_status === 'triggered' && recoveryTriggered(watch, evaluation.current_value)) {
      return {
        action: 'recovery',
        severity: recoveryConfig(watch).severity,
        current_value: evaluation.current_value,
      };
    }

    return {
      action: 'none',
      reason: 'WATCH_NOT_TRIGGERED',
    };
  }

  const nextSeverity = evaluation.severity || 'warning';
  if (isCoolingDown(state, now)) {
    if (severityIncreased(state?.last_alert_severity, nextSeverity)) {
      return {
        action: 'escalation',
        severity: nextSeverity,
        current_value: evaluation.current_value,
      };
    }

    return {
      action: 'none',
      reason: 'COOLDOWN_ACTIVE',
    };
  }

  return {
    action: 'alert',
    severity: nextSeverity,
    current_value: evaluation.current_value,
  };
}
