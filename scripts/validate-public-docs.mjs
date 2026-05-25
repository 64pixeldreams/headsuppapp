#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const publicRoot = path.join(repoRoot, 'docs', 'public-sdk');
const manifestPath = path.join(repoRoot, 'scripts', 'sdk-doc-sync-manifest.json');

const forbiddenPatterns = [
  { regex: /ghp_[A-Za-z0-9]{20,}/, reason: 'GitHub token pattern' },
  { regex: /xox[baprs]-[A-Za-z0-9-]{10,}/, reason: 'Slack token pattern' },
  { regex: /BEGIN [A-Z ]*PRIVATE KEY/, reason: 'Private key material pattern' },
  { regex: /C:\/Users\//, reason: 'Local absolute path pattern' },
  { regex: /docs\/archive\//, reason: 'Archive docs should not be exported' },
  { regex: /operations-runbook\.md/, reason: 'Operational runbook should not be exported' },
  { regex: /final-smoke-runbook\.md/, reason: 'Smoke runbook should not be exported' }
];

async function readManifest() {
  const raw = await fs.readFile(manifestPath, 'utf8');
  const parsed = JSON.parse(raw);
  return parsed.exports ?? [];
}

async function main() {
  const entries = await readManifest();
  const requiredPublicFiles = new Set(['README.md', ...entries.map((item) => item.publicTarget)]);
  const failures = [];

  for (const relPath of requiredPublicFiles) {
    const filePath = path.join(publicRoot, relPath);
    let content = '';
    try {
      content = await fs.readFile(filePath, 'utf8');
    } catch {
      failures.push(`Missing required public doc: docs/public-sdk/${relPath}`);
      continue;
    }

    for (const pattern of forbiddenPatterns) {
      if (pattern.regex.test(content)) {
        failures.push(`Forbidden content (${pattern.reason}) in docs/public-sdk/${relPath}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error('Public docs validation failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log('Public docs validation passed.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
