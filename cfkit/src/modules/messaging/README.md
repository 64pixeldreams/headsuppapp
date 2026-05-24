# MESSAGING Module

The MESSAGING module provides email sending capabilities for the platform using MailerSend as the email service provider. It includes a rich template system for common transactional emails.

## Features

- **MailerSend Integration**: Direct integration with MailerSend API
- **Template System**: Pre-built templates for common emails
- **Retry Logic**: Automatic retries with exponential backoff
- **Input Validation**: Email address and content validation
- **Mock Client**: Testing support with mock email sending
- **Error Handling**: Comprehensive error handling and logging

## Installation

The module is part of the cf-platform and doesn't require separate installation.

## Configuration

Required environment variables in `wrangler.toml`:

```toml
[vars]
MAILERSEND_API_KEY = "your_api_key_here"
DEFAULT_FROM_EMAIL = "noreply@yourapp.com"
DEFAULT_FROM_NAME = "Your App"
APP_NAME = "Your App"
APP_URL = "https://yourapp.com"

# Optional
USE_MOCK_CLIENT = false  # Set to true for testing
```

## Usage

### Basic Setup

```javascript
import { Messenger } from '@/modules/messaging';
import { LOGS } from '@/modules/logs';

// Initialize messenger
const messenger = new Messenger(env, LOGS);
```

### Sending Raw Emails

```javascript
// Send a simple email
const result = await messenger.sendEmail(
  'user@example.com',
  'noreply@yourapp.com',
  'Welcome to Our App!',
  '<h1>Welcome!</h1><p>Thanks for joining us.</p>',
  'Welcome! Thanks for joining us.' // Optional plain text
);

if (result.success) {
  console.log('Email sent:', result.messageId);
} else {
  console.error('Failed to send:', result.error);
}
```

### Using Templates

```javascript
// Send password reset email
await messenger.sendTemplate('password-reset', 'user@example.com', {
  name: 'John Doe',
  resetLink: 'https://app.com/reset?token=xyz123'
});

// Send welcome email
await messenger.sendTemplate('welcome', 'user@example.com', {
  name: 'Jane Smith',
  activationLink: 'https://app.com/activate?token=abc456'
});

// Send verification email with code
await messenger.sendTemplate('verification', 'user@example.com', {
  name: 'Bob Johnson',
  email: 'bob@example.com',
  verificationCode: '123456'
});

// Send API key created notification
await messenger.sendTemplate('api-key', 'user@example.com', {
  userName: 'Alice Cooper',
  keyName: 'Production API Key',
  keyHint: 'sk_live_...xyz',
  email: 'alice@example.com'
});
```

### Template Options

```javascript
// Override template defaults
await messenger.sendTemplate('api-key', 'user@example.com', {
  userName: 'Developer',
  keyName: 'Test Key',
  keyHint: 'sk_test_...abc',
  email: 'dev@example.com'
}, {
  from: 'security@yourapp.com',     // Override sender
  replyTo: 'support@yourapp.com'    // Set reply-to address
});
```

## Available Templates

### password-reset
Reset password functionality
- Required data: `name`, `resetLink`
- Optional: `expiryHours` (default: 24)

### welcome
Welcome new users
- Required data: `name`
- Optional: `activationLink`

### verification
Email verification
- Required data: `name`, `email`
- Optional: `verificationCode` or `verificationLink`

### api-key
API key creation notification
- Required data: `userName`, `keyName`, `keyHint`, `email`
- Optional: `expiresAt`, `dashboardLink`

## Custom Templates

Register custom templates:

```javascript
import { registerTemplate } from '@/modules/messaging';

registerTemplate('invoice', {
  name: 'invoice',
  subject: 'Invoice #{{invoiceNumber}} from {{APP_NAME}}',
  from: {
    email: '{{FROM_EMAIL}}',
    name: '{{FROM_NAME}}'
  },
  html: `<h1>Invoice #{{invoiceNumber}}</h1>...`,
  text: `Invoice #{{invoiceNumber}}...`,
  requiredData: ['invoiceNumber', 'amount'],
  defaultData: {
    currency: 'USD'
  }
});
```

## Error Handling

The module returns structured error responses:

```javascript
const result = await messenger.send(...);

if (!result.success) {
  console.error(result.error);
  // {
  //   type: 'ValidationError',
  //   message: 'Invalid email address',
  //   details: { field: 'to', value: 'invalid-email' }
  // }
}
```

Error types:
- `ValidationError`: Invalid input data
- `TemplateError`: Template not found or invalid
- `MailerSendError`: API communication errors
- `RateLimitError`: Too many requests
- `ConfigurationError`: Missing configuration

## Testing

For testing, use the mock client:

```javascript
// In your test environment
const messenger = new Messenger({
  MAILERSEND_API_KEY: 'test_key',
  USE_MOCK_CLIENT: true
}, logger);

// Send emails (they won't actually be sent)
await messenger.send(...);

// Access sent emails in tests
const client = messenger.client;
const sentEmails = client.getSentEmails();
expect(sentEmails).toHaveLength(1);
expect(sentEmails[0].to.email).toBe('user@example.com');
```

## Performance

- **Retry Logic**: Automatic retries with exponential backoff for failed requests
- **Timeout**: 5 second timeout per request
- **Rate Limiting**: Respects MailerSend rate limits

## Security

- API keys are never logged or exposed
- Email addresses are validated before sending
- Template variables are sanitized to prevent injection
- All communication uses HTTPS

## API Reference

### Messenger Class

#### constructor(env, logger)
Initialize the messenger with environment and optional logger.

#### async send(to, from, subject, html, text)
Send a raw email.
- `to`: Recipient email address
- `from`: Sender email address
- `subject`: Email subject line
- `html`: HTML content
- `text`: Optional plain text content
- Returns: `{ success, messageId?, error? }`

#### async sendTemplate(templateName, to, data, options)
Send an email using a template.
- `templateName`: Name of the template
- `to`: Recipient email address
- `data`: Template variables
- `options`: Optional overrides (from, replyTo)
- Returns: `{ success, messageId?, error? }`

#### async validateApiKey()
Validate the MailerSend API key.
- Returns: `boolean`

## Integration Examples

### With AUTH Module

```javascript
// In password reset flow
async function sendPasswordReset(user, resetToken, messenger) {
  const resetLink = `https://app.com/reset?token=${resetToken}`;
  
  await messenger.sendTemplate('password-reset', user.email, {
    name: user.name,
    resetLink,
    expiryHours: 2
  });
}
```

### With API Key Module

```javascript
// After creating an API key
if (sendEmailNotification) {
  await messenger.sendTemplate('api-key', user.email, {
    userName: user.name,
    keyName: apiKey.name,
    keyHint: `${apiKey.prefix}_...${apiKey.key.slice(-4)}`,
    email: user.email
  });
}
```

## Troubleshooting

### Common Issues

1. **MAILERSEND_API_KEY not configured**
   - Ensure the API key is set in wrangler.toml
   - Check that the env object is properly passed

2. **Rate limiting errors**
   - The module handles rate limits automatically
   - Consider implementing request queuing for high volume

3. **Template not found**
   - Verify template name matches exactly
   - Check that custom templates are registered before use

4. **Invalid email format**
   - Emails are validated before sending
   - Check for typos or formatting issues

## Running Tests

```bash
# Run messaging module tests
npm run test:messaging

# Run with coverage
npm run test:messaging -- --coverage
```
