import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sdkDocsRoot = join(appRoot, '..', 'headsuppclientsdk', 'docs');
const publicRoot = join(appRoot, 'docs', 'public-sdk');

if (!existsSync(sdkDocsRoot)) {
  console.error(`sync-public-sdk-docs: SDK docs not found at ${sdkDocsRoot}`);
  console.error('Clone 64pixeldreams/headsuppclientsdk beside headsuppapp or set HEADSUPP_SDK_DOCS.');
  process.exit(1);
}

const copyPaths = [
  'getting-started.md',
  'client-reference.md',
  'quickstart.md',
  'sdk-readme.md',
  'webhook-receivers.md',
  'openapi.yaml',
  'reference.md',
  'watch-types.md',
  'use-cases.md',
  'aggregate-forwarding.md',
  'cookbook',
  'concepts',
  'appendix',
];

function copyRecursive(src, dest) {
  if (!existsSync(src)) return;
  const stat = statSync(src);
  if (stat.isDirectory()) {
    mkdirSync(dest, { recursive: true });
    for (const entry of readdirSync(src)) {
      copyRecursive(join(src, entry), join(dest, entry));
    }
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
}

mkdirSync(publicRoot, { recursive: true });
for (const rel of copyPaths) {
  const src = join(sdkDocsRoot, rel);
  const dest = join(publicRoot, rel);
  if (!existsSync(src)) {
    console.warn(`skip missing: ${rel}`);
    continue;
  }
  if (statSync(src).isDirectory()) {
    rmSync(dest, { recursive: true, force: true });
  }
  copyRecursive(src, dest);
  console.log(`copied ${rel}`);
}

const publicReadme = `# Public SDK Docs

Synced from [\`headsuppclientsdk/docs\`](https://github.com/64pixeldreams/headsuppclientsdk/tree/main/docs).

Start here: [getting-started.md](getting-started.md)

Run sync from the app repo:

\`\`\`bash
node scripts/sync-public-sdk-docs.mjs
\`\`\`
`;

cpSync(
  join(appRoot, '..', 'headsuppclientsdk', 'README.md'),
  join(publicRoot, 'README.md'),
  { force: true },
);

console.log('sync-public-sdk-docs: done');
