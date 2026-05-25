#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(repoRoot, 'scripts', 'sdk-doc-sync-manifest.json');
const publicRoot = path.join(repoRoot, 'docs', 'public-sdk');

function parseArgs(argv) {
  const args = {
    exportOnly: false,
    dryRun: false,
    sdkRepoPath: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--export-only') args.exportOnly = true;
    else if (value === '--dry-run') args.dryRun = true;
    else if (value === '--sdk-repo-path') args.sdkRepoPath = argv[i + 1] ? path.resolve(argv[i + 1]) : null;
    if (value === '--sdk-repo-path') i += 1;
  }
  return args;
}

async function readManifest() {
  const raw = await fs.readFile(manifestPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.exports) || parsed.exports.length === 0) {
    throw new Error('Manifest has no exports.');
  }
  return parsed.exports;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readText(filePath) {
  return fs.readFile(filePath, 'utf8');
}

async function writeIfChanged(targetPath, content, dryRun) {
  let existing = null;
  try {
    existing = await fs.readFile(targetPath, 'utf8');
  } catch {
    existing = null;
  }

  if (existing === content) return false;
  if (!dryRun) {
    await ensureDir(path.dirname(targetPath));
    await fs.writeFile(targetPath, content, 'utf8');
  }
  return true;
}

async function syncEntries({ entries, destinationResolver, dryRun }) {
  const changed = [];
  for (const entry of entries) {
    const sourcePath = path.join(repoRoot, entry.source);
    const content = await readText(sourcePath);
    const destinationPath = destinationResolver(entry);
    const replacements = entry.replacements ?? [];
    let rewritten = content;
    for (const replacement of replacements) {
      rewritten = rewritten.split(replacement.from).join(replacement.to);
    }
    const wasChanged = await writeIfChanged(destinationPath, rewritten, dryRun);
    if (wasChanged) changed.push(destinationPath);
  }
  return changed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const entries = await readManifest();

  await ensureDir(publicRoot);
  const publicChanged = await syncEntries({
    entries: entries.map((entry) => ({
      ...entry,
      replacements: entry.publicReplacements ?? [],
    })),
    dryRun: args.dryRun,
    destinationResolver: (entry) => path.join(publicRoot, entry.publicTarget),
  });

  let sdkChanged = [];
  if (!args.exportOnly && args.sdkRepoPath) {
    sdkChanged = await syncEntries({
      entries: entries.map((entry) => ({
        ...entry,
        replacements: entry.sdkReplacements ?? entry.publicReplacements ?? [],
      })),
      dryRun: args.dryRun,
      destinationResolver: (entry) => path.join(args.sdkRepoPath, entry.sdkTarget),
    });
  }

  const summary = {
    exportOnly: args.exportOnly,
    dryRun: args.dryRun,
    sdkRepoPath: args.sdkRepoPath,
    publicChangedCount: publicChanged.length,
    sdkChangedCount: sdkChanged.length,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
