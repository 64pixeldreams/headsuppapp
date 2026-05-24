/**
 * Welcome email template
 */

export const welcomeTemplate = {
  name: 'welcome',
  subject: 'Welcome to {{APP_NAME}}! 🎉',
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
  <title>Welcome to {{APP_NAME}}</title>
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
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
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
    .feature-box {
      background: #F3F4F6;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }
    .feature-box h3 {
      margin-top: 0;
      color: #4F46E5;
    }
    .footer {
      background: #f8f9fa;
      padding: 20px 30px;
      font-size: 14px;
      color: #666;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to {{APP_NAME}}! 🎉</h1>
    </div>
    <div class="content">
      <p>Hi {{name}},</p>
      
      <p>Welcome aboard! We're thrilled to have you join {{APP_NAME}}. Your account has been successfully created, 
      and you're all set to start exploring everything we have to offer.</p>
      
      <center>
        <a href="{{activationLink}}" class="button">Get Started</a>
      </center>
      
      <h2>Here's what you can do next:</h2>
      
      <div class="feature-box">
        <h3>🚀 Complete Your Profile</h3>
        <p>Add more details to your profile to get the most personalized experience.</p>
      </div>
      
      <div class="feature-box">
        <h3>📚 Explore Our Features</h3>
        <p>Discover all the powerful tools and features available to help you succeed.</p>
      </div>
      
      <div class="feature-box">
        <h3>💬 Join Our Community</h3>
        <p>Connect with other users, share experiences, and get tips from our community.</p>
      </div>
      
      <p>If you have any questions or need help getting started, our support team is here for you. 
      Just reply to this email or visit our help center.</p>
      
      <p>Once again, welcome to {{APP_NAME}}! We can't wait to see what you'll accomplish.</p>
      
      <p>Best regards,<br>
      The {{APP_NAME}} Team</p>
    </div>
    <div class="footer">
      <p>Follow us on social media for updates and tips!</p>
      <p>© {{year}} {{APP_NAME}}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `,
  text: `
Welcome to {{APP_NAME}}! 🎉

Hi {{name}},

Welcome aboard! We're thrilled to have you join {{APP_NAME}}. Your account has been successfully created, 
and you're all set to start exploring everything we have to offer.

Get Started: {{activationLink}}

Here's what you can do next:

🚀 Complete Your Profile
Add more details to your profile to get the most personalized experience.

📚 Explore Our Features
Discover all the powerful tools and features available to help you succeed.

💬 Join Our Community
Connect with other users, share experiences, and get tips from our community.

If you have any questions or need help getting started, our support team is here for you. 
Just reply to this email or visit our help center.

Once again, welcome to {{APP_NAME}}! We can't wait to see what you'll accomplish.

Best regards,
The {{APP_NAME}} Team

---
Follow us on social media for updates and tips!
© {{year}} {{APP_NAME}}. All rights reserved.
  `,
  requiredData: ['name'],
  defaultData: {
    activationLink: '{{APP_URL}}/dashboard',
    year: new Date().getFullYear()
  }
};
