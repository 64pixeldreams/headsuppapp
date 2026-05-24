/**
 * API key created email template
 */

export const apiKeyTemplate = {
  name: 'api-key',
  subject: 'New API Key Created - {{APP_NAME}}',
  from: {
    email: '{{FROM_EMAIL}}',
    name: '{{FROM_NAME}}'
  },
  html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>API Key Created</title>
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f4f4f4;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: #F59E0B;
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .content {
      padding: 40px 30px;
    }
    .key-info {
      background: #FEF3C7;
      border: 1px solid #F59E0B;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }
    .key-info h3 {
      margin-top: 0;
      color: #92400E;
    }
    .key-hint {
      font-family: monospace;
      font-size: 16px;
      color: #92400E;
      background: #FFFBEB;
      padding: 8px 12px;
      border-radius: 4px;
      display: inline-block;
    }
    .security-notice {
      background: #FEE2E2;
      border: 1px solid #EF4444;
      border-radius: 6px;
      padding: 15px;
      margin: 20px 0;
      font-size: 14px;
    }
    .footer {
      background: #f8f9fa;
      padding: 20px 30px;
      font-size: 14px;
      color: #666;
      text-align: center;
    }
    ul {
      margin: 10px 0;
      padding-left: 20px;
    }
    li {
      margin: 5px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>API Key Created</h1>
    </div>
    <div class="content">
      <p>Hi {{userName}},</p>
      
      <p>A new API key has been created for your {{APP_NAME}} account.</p>
      
      <div class="key-info">
        <h3>API Key Details:</h3>
        <p><strong>Name:</strong> {{keyName}}</p>
        <p><strong>Key Hint:</strong> <span class="key-hint">{{keyHint}}</span></p>
        <p><strong>Created:</strong> {{createdDate}}</p>
        {{#if expiresAt}}
        <p><strong>Expires:</strong> {{expiresAt}}</p>
        {{/if}}
      </div>
      
      <div class="security-notice">
        <strong>🔒 Security Notice:</strong> 
        <ul>
          <li>Your full API key was displayed only once when created</li>
          <li>We do not store or have access to your full API key</li>
          <li>Keep your API key secure and never share it publicly</li>
          <li>If you suspect your key has been compromised, revoke it immediately</li>
        </ul>
      </div>
      
      <h3>What can you do with this API key?</h3>
      <ul>
        <li>Authenticate API requests to {{APP_NAME}}</li>
        <li>Access your account resources programmatically</li>
        <li>Integrate {{APP_NAME}} with your applications</li>
      </ul>
      
      <h3>Best Practices:</h3>
      <ul>
        <li>Store API keys in environment variables, not in code</li>
        <li>Use different keys for different environments (dev, staging, prod)</li>
        <li>Regularly rotate your API keys</li>
        <li>Monitor API key usage in your dashboard</li>
      </ul>
      
      <p>You can manage all your API keys, view usage statistics, and revoke keys from your 
      <a href="{{dashboardLink}}" style="color: #F59E0B;">API Keys Dashboard</a>.</p>
      
      <p>If you didn't create this API key, please revoke it immediately and secure your account.</p>
      
      <p>Best regards,<br>
      The {{APP_NAME}} Team</p>
    </div>
    <div class="footer">
      <p>This security notification was sent to {{email}}</p>
      <p>© {{year}} {{APP_NAME}}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `,
  text: `
API Key Created

Hi {{userName}},

A new API key has been created for your {{APP_NAME}} account.

API Key Details:
- Name: {{keyName}}
- Key Hint: {{keyHint}}
- Created: {{createdDate}}
{{#if expiresAt}}- Expires: {{expiresAt}}{{/if}}

🔒 Security Notice:
- Your full API key was displayed only once when created
- We do not store or have access to your full API key
- Keep your API key secure and never share it publicly
- If you suspect your key has been compromised, revoke it immediately

What can you do with this API key?
- Authenticate API requests to {{APP_NAME}}
- Access your account resources programmatically
- Integrate {{APP_NAME}} with your applications

Best Practices:
- Store API keys in environment variables, not in code
- Use different keys for different environments (dev, staging, prod)
- Regularly rotate your API keys
- Monitor API key usage in your dashboard

You can manage all your API keys, view usage statistics, and revoke keys from your 
API Keys Dashboard: {{dashboardLink}}

If you didn't create this API key, please revoke it immediately and secure your account.

Best regards,
The {{APP_NAME}} Team

---
This security notification was sent to {{email}}
© {{year}} {{APP_NAME}}. All rights reserved.
  `,
  requiredData: ['userName', 'keyName', 'keyHint', 'email'],
  defaultData: {
    dashboardLink: '{{APP_URL}}/dashboard/api-keys',
    createdDate: new Date().toLocaleString(),
    year: new Date().getFullYear()
  }
};
