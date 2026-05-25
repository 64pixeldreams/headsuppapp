import { dispatchAggregateDelivery } from './aggregate-webhook.js';

export async function loadAggregateDeliveryBundle(db, deliveryId) {
  const delivery = await db.prepare('SELECT * FROM aggregate_deliveries WHERE id = ? LIMIT 1').bind(deliveryId).first();
  if (!delivery) return null;
  const subscriber = await db.prepare('SELECT * FROM subscribers WHERE id = ? OR subscriber_id = ? LIMIT 1').bind(
    delivery.subscriber_id,
    delivery.subscriber_id,
  ).first();
  return { delivery, subscriber };
}

export async function processAggregateDeliveryMessage(message, env, options = {}) {
  const deliveryId = message.aggregateDeliveryId;
  const bundle = await loadAggregateDeliveryBundle(env.DB, deliveryId);
  if (!bundle) return { processed: false, reason: 'DELIVERY_NOT_FOUND' };
  if (bundle.delivery.status === 'sent' || bundle.delivery.status === 'failed') {
    return {
      processed: true,
      skipped: true,
      reason: 'TERMINAL_STATUS',
      status: bundle.delivery.status,
    };
  }
  const result = await dispatchAggregateDelivery({
    db: env.DB,
    delivery: bundle.delivery,
    subscriber: bundle.subscriber,
    env,
    fetchFn: options.fetchFn,
    now: options.now,
  });
  return { processed: true, result };
}
