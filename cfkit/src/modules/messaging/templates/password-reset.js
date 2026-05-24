/**
 * Password reset email template
 */

export const passwordResetTemplate = {
  name: 'password-reset',
  subject: 'Reset Your Password - {{APP_NAME}}',
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
  <title>Reset Your Password</title>
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
      background: #4F46E5;
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
    .button {
      display: inline-block;
      background: #4F46E5;
      color: white;
      padding: 12px 30px;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 500;
      margin: 20px 0;
    }
    .button:hover {
      background: #4338CA;
    }
    .footer {
      background: #f8f9fa;
      padding: 20px 30px;
      font-size: 14px;
      color: #666;
      text-align: center;
    }
    .warning {
      background: #FEF3C7;
      border: 1px solid #F59E0B;
      border-radius: 6px;
      padding: 15px;
      margin: 20px 0;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Password Reset Request</h1>
    </div>
    <div class="content">
      <p>Hi {{name}},</p>
      
      <p>We received a request to reset your password for your {{APP_NAME}} account. 
      If you didn't make this request, you can safely ignore this email.</p>
      
      <p>To reset your password, click the button below:</p>
      
      <center>
        <a href="{{resetLink}}" class="button">Reset Password</a>
      </center>
      
      <div class="warning">
        <strong>⚠️ Security Notice:</strong> This link will expire in {{expiryHours}} hours. 
        For your security, password reset links can only be used once.
      </div>
      
      <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
      <p style="word-break: break-all; color: #4F46E5;">{{resetLink}}</p>
      
      <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
      
      <p>Best regards,<br>
      The {{APP_NAME}} Team</p>
    </div>
    <div class="footer">
      <p>This is an automated message from {{APP_NAME}}. Please do not reply to this email.</p>
      <p>© {{year}} {{APP_NAME}}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `,
  text: `
Password Reset Request

Hi {{name}},

We received a request to reset your password for your {{APP_NAME}} account. 
If you didn't make this request, you can safely ignore this email.

To reset your password, visit the following link:
{{resetLink}}

⚠️ Security Notice: This link will expire in {{expiryHours}} hours. 
For your security, password reset links can only be used once.

If you have any questions or need assistance, please don't hesitate to contact our support team.

Best regards,
The {{APP_NAME}} Team

---
This is an automated message from {{APP_NAME}}. Please do not reply to this email.
© {{year}} {{APP_NAME}}. All rights reserved.
  `,
  requiredData: ['name', 'resetLink'],
  defaultData: {
    expiryHours: 24,
    year: new Date().getFullYear()
  }
};
