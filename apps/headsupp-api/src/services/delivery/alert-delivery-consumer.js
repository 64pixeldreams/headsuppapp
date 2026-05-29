import { dispatchAlertDeliveryBySubscriberType } from './alert-router.js';

export async function loadAlertDeliveryBundle(db, deliveryId) {
  const delivery = await db.prepare('SELECT * FROM alert_deliveries WHERE id = ? LIMIT 1').bind(deliveryId).first();
  if (!delivery) return null;

  const alert = await db.prepare('SELECT * FROM alerts WHERE id = ? LIMIT 1').bind(delivery.alert_id).first();
  const subscriber = await db.prepare('SELECT * FROM subscribers WHERE id = ? OR subscriber_id = ? LIMIT 1').bind(
    delivery.subscriber_id,
    delivery.subscriber_id,
  ).first();
  const channel = await db
    .prepare('SELECT * FROM channels WHERE id = ? OR channel_id = ? LIMIT 1')
    .bind(alert?.channel_id, alert?.channel_id)
    .first();

  return {
    delivery,
    alert,
    subscriber,
    channel,
  };
}

export async function processAlertDeliveryMessage(message, env, options = {}) {
  const deliveryId = message.alertDeliveryId || message.deliveryId;
  const bundle = await loadAlertDeliveryBundle(env.DB, deliveryId);
  if (!bundle) {
    return {
      processed: false,
      reason: 'DELIVERY_NOT_FOUND',
    };
  }
  if (!bundle.subscriber) {
    return {
      processed: false,
      reason: 'SUBSCRIBER_NOT_FOUND',
    };
  }
  if (['sent', 'failed', 'suppressed_duplicate', 'ignored'].includes(bundle.delivery.status)) {
    return {
      processed: true,
      reason: 'DELIVERY_TERMINAL_STATE',
      result: { status: bundle.delivery.status },
    };
  }

  const result = await dispatchAlertDeliveryBySubscriberType({
    db: env.DB,
    delivery: bundle.delivery,
    alert: bundle.alert,
    subscriber: bundle.subscriber,
    channel: bundle.channel,
    env,
    fetchFn: options.fetchFn,
    now: options.now,
  });

  return {
    processed: true,
    result,
  };
}
