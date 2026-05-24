/**
 * Notification email template
 * For sending email notifications about system events
 */

export const notificationTemplate = {
  name: 'notification',
  subject: '{{title}} - {{APP_NAME}}',
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
  <title>{{title}} - {{APP_NAME}}</title>
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f8f9fa;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 20px auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.05);
      overflow: hidden;
    }
    .header {
      background: #ffffff;
      border-bottom: 1px solid #e5e7eb;
      padding: 24px 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
      color: #111827;
    }
    .content {
      padding: 30px;
    }
    .notification-box {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 24px;
      margin: 20px 0;
    }
    .notification-box h3 {
      margin-top: 0;
      color: #111827;
      font-size: 18px;
      font-weight: 600;
    }
    .button {
      display: inline-block;
      background: #111827;
      color: #ffffff;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 500;
      margin: 20px 0;
      transition: background-color 0.2s;
    }
    .button:hover {
      background: #374151;
    }
    .footer {
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
      padding: 24px 30px;
      font-size: 14px;
      color: #6b7280;
      text-align: center;
    }
    .footer .company-info {
      margin-top: 12px;
      font-size: 13px;
      color: #9ca3af;
    }
    .timestamp {
      color: #6b7280;
      font-size: 14px;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
    }
    @media (max-width: 600px) {
      .container {
        margin: 10px;
        border-radius: 8px;
      }
      .header, .content, .footer {
        padding: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{icon}} {{title}}</h1>
    </div>
    <div class="content">
      <p>Hi {{userName}},</p>
      
      <div class="notification-box">
        <h3>{{title}}</h3>
        <p>{{message}}</p>
        {{#if details}}
        <p><strong>Details:</strong> {{details}}</p>
        {{/if}}
      </div>
      
      {{#if actionUrl}}
      <center>
        <a href="{{actionUrl}}" class="button">{{actionText}}</a>
      </center>
      {{/if}}
      
      <p>This notification was generated automatically by {{APP_NAME}}. 
      You can manage your notification preferences in your account settings.</p>
      
      <div class="timestamp">
        <p>Sent: {{timestamp}}</p>
      </div>
    </div>
    <div class="footer">
      <p>© 2024 {{APP_NAME}}. All rights reserved.</p>
      <div class="company-info">
        <p>INC 64LLC<br>
        30 N Gould St Ste N<br>
        Sheridan, WY, 82801, USA</p>
      </div>
      <p>If you no longer wish to receive these notifications, you can 
      <a href="{{unsubscribeUrl}}" style="color: #6b7280;">unsubscribe here</a>.</p>
    </div>
  </div>
</body>
</html>
  `,
  text: `
{{title}} - {{APP_NAME}}

Hi {{userName}},

{{title}}
{{message}}

{{#if details}}
Details: {{details}}
{{/if}}

{{#if actionUrl}}
{{actionText}}: {{actionUrl}}
{{/if}}

This notification was generated automatically by {{APP_NAME}}. 
You can manage your notification preferences in your account settings.

Sent: {{timestamp}}

---
© 2024 {{APP_NAME}}. All rights reserved.
INC 64LLC
30 N Gould St Ste N
Sheridan, WY, 82801, USA

If you no longer wish to receive these notifications, visit: {{unsubscribeUrl}}
  `,
  requiredData: ['title', 'message', 'userName'],
  defaultData: {
    icon: '🔔',
    actionText: 'View Details',
    timestamp: new Date().toLocaleString(),
    unsubscribeUrl: '{{APP_URL}}/settings/notifications'
  }
};
