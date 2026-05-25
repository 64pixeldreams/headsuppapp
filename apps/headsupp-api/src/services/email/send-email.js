export class EmailBindingError extends Error {
  constructor(message, { code = 'EMAIL_BINDING_ERROR', retryable = true } = {}) {
    super(message);
    this.name = 'EmailBindingError';
    this.code = code;
    this.retryable = retryable;
  }
}

export async function sendEmail({ env, message }) {
  if (!env?.SEND_EMAIL?.send) {
    throw new EmailBindingError('SEND_EMAIL binding is not configured.', {
      code: 'SEND_EMAIL_NOT_CONFIGURED',
      retryable: false,
    });
  }
  return env.SEND_EMAIL.send(message);
}
