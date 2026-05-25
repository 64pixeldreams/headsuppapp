const required = ['CLOUDFLARE_API_TOKEN'];
const slackRequired = process.argv.includes('--slack-required');
const operatorRequired = process.argv.includes('--operator-required');
if (slackRequired) required.push('HEADSUPP_SMOKE_SLACK_WEBHOOK_URL');
if (operatorRequired) required.push('HEADSUPP_BOOTSTRAP_TOKEN', 'HEADSUPP_OPERATOR_TOKEN');

const missing = required.filter((name) => !String(process.env[name] || '').trim());

if (missing.length > 0) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        missing,
        message: 'Required release smoke environment variables are missing.',
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      checked: required,
    },
    null,
    2,
  ),
);
