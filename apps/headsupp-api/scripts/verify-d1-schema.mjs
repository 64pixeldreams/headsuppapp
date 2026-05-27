import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

const databaseName = process.env.HEADSUPP_D1_DATABASE || 'headsup_db';
const wranglerBin = resolve(__dirname, '../node_modules/wrangler/bin/wrangler.js');

const requiredColumns = {
  workspaces: ['id', 'workspace_id', 'workspace_key', 'name', 'source_app', 'external_tenant_id', 'external_user_id'],
  channels: [
    'id',
    'channel_id',
    'workspace_id',
    'name',
    'channel_key',
    'purpose',
    'source_app',
    'external_tenant_id',
    'external_user_id',
    'external_resource_id',
    'metadata_json',
  ],
  connectors: ['id', 'connector_id', 'workspace_id', 'channel_id', 'connector_key', 'connector_secret'],
  signals: ['id', 'signal_id', 'workspace_id', 'channel_id', 'signal_key'],
  watches: ['id', 'watch_id', 'workspace_id', 'channel_id', 'signal_id', 'config_json', 'enabled'],
  subscribers: ['id', 'subscriber_id', 'workspace_id', 'channel_id', 'subscriber_type', 'destination_url', 'config_json', 'enabled'],
  control_plane_audit_logs: ['id', 'action', 'request_id', 'success', 'error_code', 'metadata_json'],
};

function extractWranglerJson(output) {
  const start = output.indexOf('[\n');
  if (start === -1) throw new Error(`Could not find wrangler JSON results in output:\n${output}`);
  return JSON.parse(output.slice(start));
}

async function tableColumns(table) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [wranglerBin, 'd1', 'execute', databaseName, '--remote', '--json', '--command', `PRAGMA table_info(${table});`],
    { maxBuffer: 1024 * 1024 },
  );
  const result = extractWranglerJson(stdout);
  return new Set((result[0]?.results || []).map((row) => row.name));
}

const missing = [];

for (const [table, columns] of Object.entries(requiredColumns)) {
  const actual = await tableColumns(table);
  if (actual.size === 0) {
    missing.push({ table, column: '*', message: `Table ${table} is missing or has no columns.` });
    continue;
  }
  for (const column of columns) {
    if (!actual.has(column)) missing.push({ table, column });
  }
}

if (missing.length > 0) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        code: 'D1_SCHEMA_MISMATCH',
        database: databaseName,
        missing,
        message: 'Remote D1 schema is missing columns required by the deployed Heads Up API.',
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
      database: databaseName,
      checked_tables: Object.keys(requiredColumns),
    },
    null,
    2,
  ),
);
