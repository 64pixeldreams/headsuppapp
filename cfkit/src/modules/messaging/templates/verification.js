/**
 * Email verification template
 */

export const verificationTemplate = {
  name: 'verification',
  subject: 'Verify Your Email Address - {{APP_NAME}}',
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
  <title>Verify Your Email</title>
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
      background: #10B981;
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
      background: #10B981;
      color: white;
      padding: 12px 30px;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 500;
      margin: 20px 0;
    }
    .button:hover {
      background: #059669;
    }
    .code-box {
      background: #F3F4F6;
      border: 2px dashed #D1D5DB;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
      text-align: center;
      font-family: monospace;
      font-size: 24px;
      letter-spacing: 4px;
      color: #4F46E5;
    }
    .footer {
      background: #f8f9fa;
      padding: 20px 30px;
      font-size: 14px;
      color: #666;
      text-align: center;
    }
    .info {
      background: #EFF6FF;
      border: 1px solid #3B82F6;
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
      <h1>Verify Your Email Address</h1>
    </div>
    <div class="content">
      <p>Hi {{name}},</p>
      
      <p>Thanks for signing up for {{APP_NAME}}! To complete your registration and ensure 
      the security of your account, please verify your email address.</p>
      
      {{#if verificationCode}}
      <p>Your verification code is:</p>
      
      <div class="code-box">
        {{verificationCode}}
      </div>
      
      <p>Enter this code on the verification page to confirm your email address.</p>
      {{else}}
      <p>Click the button below to verify your email address:</p>
      
      <center>
        <a href="{{verificationLink}}" class="button">Verify Email Address</a>
      </center>
      
      <p>Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all; color: #10B981;">{{verificationLink}}</p>
      {{/if}}
      
      <div class="info">
        <strong>ℹ️ Important:</strong> This verification {{#if verificationCode}}code{{else}}link{{/if}} 
        will expire in {{expiryHours}} hours. If it expires, you'll need to request a new one.
      </div>
      
      <p>Verifying your email helps us ensure that we can:</p>
      <ul>
        <li>Send you important account notifications</li>
        <li>Help you recover your account if needed</li>
        <li>Keep your account secure</li>
      </ul>
      
      <p>If you didn't create an account with {{APP_NAME}}, please ignore this email.</p>
      
      <p>Thanks,<br>
      The {{APP_NAME}} Team</p>
    </div>
    <div class="footer">
      <p>This email was sent to {{email}} because an account was created with this address.</p>
      <p>© {{year}} {{APP_NAME}}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `,
  text: `
Verify Your Email Address

Hi {{name}},

Thanks for signing up for {{APP_NAME}}! To complete your registration and ensure 
the security of your account, please verify your email address.

{{#if verificationCode}}
Your verification code is:

{{verificationCode}}

Enter this code on the verification page to confirm your email address.
{{else}}
Click the link below to verify your email address:
{{verificationLink}}
{{/if}}

ℹ️ Important: This verification {{#if verificationCode}}code{{else}}link{{/if}} 
will expire in {{expiryHours}} hours. If it expires, you'll need to request a new one.

Verifying your email helps us ensure that we can:
- Send you important account notifications
- Help you recover your account if needed
- Keep your account secure

If you didn't create an account with {{APP_NAME}}, please ignore this email.

Thanks,
The {{APP_NAME}} Team

---
This email was sent to {{email}} because an account was created with this address.
© {{year}} {{APP_NAME}}. All rights reserved.
  `,
  requiredData: ['name', 'email'],
  defaultData: {
    expiryHours: 24,
    year: new Date().getFullYear()
  }
};
