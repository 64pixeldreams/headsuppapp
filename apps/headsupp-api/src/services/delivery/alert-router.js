import { dispatchAlertDelivery as dispatchWebhookAlertDelivery } from './webhook.js';
import { dispatchEmailAlertDelivery } from './email-alert.js';

export async function dispatchAlertDeliveryBySubscriberType(options) {
  const type = options?.subscriber?.subscriber_type || 'webhook';
  if (type === 'email') {
    return dispatchEmailAlertDelivery(options);
  }
  return dispatchWebhookAlertDelivery(options);
}
