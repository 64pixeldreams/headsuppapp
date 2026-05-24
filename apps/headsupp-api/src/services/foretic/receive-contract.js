export function classifyForeticCallbackPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, code: 'INVALID_PAYLOAD', message: 'Payload must be an object.' };
  }

  if (payload.type === 'heads_up.alert') {
    return {
      ok: true,
      kind: 'alert',
      id: payload.alert_id,
      dedupe_key: payload.alert_id,
      severity: payload.severity,
      cta: payload.cta || null,
    };
  }

  if (payload.source === 'heads_up' && payload.event_type === 'aggregate_bucket_closed') {
    return {
      ok: true,
      kind: 'aggregate_forward',
      id: payload.delivery_id,
      dedupe_key: payload.dedupe_key || payload.delivery_id,
      bucket: payload.bucket,
      values: payload.values || {},
    };
  }

  return {
    ok: false,
    code: 'UNKNOWN_HEADS_UP_CALLBACK',
    message: 'Payload is not a recognized Heads Up callback.',
  };
}
