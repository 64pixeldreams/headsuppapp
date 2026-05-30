import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { stableId } from '../src/services/ids/stable-id.js';
import { foreticForecastWatchDefinitions } from '../src/services/foretic/forecast-watch-defaults.js';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const wranglerBin = resolve(__dirname, '../node_modules/wrangler/bin/wrangler.js');

function usage() {
  return `Usage:
  node scripts/audit-repair-channel.mjs --workspace-id <id> --channel-id <id> [--database headsup_db] [--remote] [--repair] [--create-foretic-defaults]

Dry-run is the default. --repair normalizes legacy email destinations and disables duplicate subscriber/watch rows.
Use --create-foretic-defaults with --repair to create missing Foretic default signals and watches.`;
}

function parseArgs(argv) {
  const args = {
    database: process.env.HEADSUPP_D1_DATABASE || 'headsup_db',
    remote: false,
    repair: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--workspace-id') args.workspaceId = argv[++index];
    else if (arg === '--channel-id') args.channelId = argv[++index];
    else if (arg === '--database') args.database = argv[++index];
    else if (arg === '--remote') args.remote = true;
    else if (arg === '--repair') args.repair = true;
    else if (arg === '--create-foretic-defaults') args.createForeticDefaults = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function sqlString(value) {
  return `'${String(value || '').replaceAll("'", "''")}'`;
}

function sqlJson(value) {
  return sqlString(JSON.stringify(value || {}));
}

function extractWranglerJson(output) {
  const start = output.indexOf('[\n');
  if (start === -1) throw new Error(`Could not find wrangler JSON results in output:\n${output}`);
  return JSON.parse(output.slice(start));
}

async function d1({ database, remote }, sql) {
  const args = [wranglerBin, 'd1', 'execute', database, '--json', '--command', sql];
  if (remote) args.splice(4, 0, '--remote');
  const { stdout } = await execFileAsync(process.execPath, args, { maxBuffer: 1024 * 1024 * 4 });
  const resultSets = extractWranglerJson(stdout);
  const resultSet = [...resultSets].reverse().find((entry) => Array.isArray(entry.results));
  return resultSet?.results || [];
}

async function createMissingForeticDefaults(args, { workspaceId, channelId }) {
  const channelRows = await d1(
    args,
    `SELECT * FROM channels WHERE workspace_id = ${sqlString(workspaceId)} AND channel_id = ${sqlString(channelId)} LIMIT 1;`,
  );
  const channel = channelRows[0];
  if (!channel) return { ok: false, reason: 'channel_not_found', created_signals: 0, created_watches: 0 };

  const now = new Date().toISOString();
  const context = {
    source_app: channel.source_app || 'foretic',
    external_tenant_id: channel.external_tenant_id || null,
    external_user_id: channel.external_user_id || null,
    external_resource_id: channel.external_resource_id || null,
  };
  const definitions = foreticForecastWatchDefinitions({ channel, context, now });
  const signalKeys = Array.from(new Set(definitions.map((definition) => definition.signal_key)));
  let createdSignals = 0;
  let createdWatches = 0;
  let updatedWatches = 0;

  for (const signalKey of signalKeys) {
    const signalId = stableId('sig', `${channelId}:${signalKey}`);
    const result = await d1(
      args,
      `INSERT OR IGNORE INTO signals
         (id, signal_id, workspace_id, channel_id, signal_key, signal_type, value_mode, status, created_at, updated_at)
       VALUES
         (${sqlString(signalId)}, ${sqlString(signalId)}, ${sqlString(workspaceId)}, ${sqlString(channelId)},
          ${sqlString(signalKey)}, 'metric', 'last', 'active', ${sqlString(now)}, ${sqlString(now)});
       SELECT changes() AS changed;`,
    );
    createdSignals += Number(result[0]?.changed || 0);
  }

  const storedSignals = await d1(
    args,
    `SELECT signal_id, signal_key
     FROM signals
     WHERE workspace_id = ${sqlString(workspaceId)} AND channel_id = ${sqlString(channelId)};`,
  );
  const signalIdByKey = new Map(storedSignals.map((signal) => [signal.signal_key, signal.signal_id]));

  for (const definition of definitions) {
    const signalId = signalIdByKey.get(definition.signal_key) || stableId('sig', `${channelId}:${definition.signal_key}`);
    const updated = await d1(
      args,
      `UPDATE watches
       SET signal_id = ${sqlString(signalId)},
           name = ${sqlString(definition.name)},
           watch_type = ${sqlString(definition.watch_type)},
           config_json = ${sqlJson(definition.config)},
           cooldown_seconds = ${Number(definition.cooldown_seconds || 86400)},
           escalation_json = ${definition.escalation_json ? sqlJson(definition.escalation_json) : 'NULL'},
           recovery_json = ${definition.recovery_json ? sqlJson(definition.recovery_json) : 'NULL'},
           enabled = 1,
           updated_at = ${sqlString(now)}
       WHERE workspace_id = ${sqlString(workspaceId)}
         AND channel_id = ${sqlString(channelId)}
         AND watch_id = ${sqlString(definition.watch_id)};
       SELECT changes() AS changed;`,
    );
    const updatedCount = Number(updated[0]?.changed || 0);
    updatedWatches += updatedCount;
    if (updatedCount > 0) continue;

    const inserted = await d1(
      args,
      `INSERT OR IGNORE INTO watches
         (id, watch_id, workspace_id, channel_id, signal_id, watch_group_id, band_key, name, watch_type,
          config_json, cooldown_seconds, escalation_json, recovery_json, enabled, created_at, updated_at)
       VALUES
         (${sqlString(definition.watch_id)}, ${sqlString(definition.watch_id)}, ${sqlString(workspaceId)},
          ${sqlString(channelId)}, ${sqlString(signalId)}, NULL, NULL, ${sqlString(definition.name)},
          ${sqlString(definition.watch_type)}, ${sqlJson(definition.config)}, ${Number(definition.cooldown_seconds || 86400)},
          ${definition.escalation_json ? sqlJson(definition.escalation_json) : 'NULL'},
          ${definition.recovery_json ? sqlJson(definition.recovery_json) : 'NULL'}, 1,
          ${sqlString(now)}, ${sqlString(now)});
       SELECT changes() AS changed;`,
    );
    createdWatches += Number(inserted[0]?.changed || 0);
  }

  return { ok: true, created_signals: createdSignals, created_watches: createdWatches, updated_watches: updatedWatches };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.workspaceId || !args.channelId) {
    console.error(usage());
    process.exit(1);
  }

  const ws = sqlString(args.workspaceId);
  const ch = sqlString(args.channelId);
  const report = {
    ok: true,
    mode: args.repair ? 'repair' : 'dry_run',
    database: args.database,
    remote: args.remote,
    workspace_id: args.workspaceId,
    channel_id: args.channelId,
    duplicate_email_subscribers: await d1(
      args,
      `SELECT workspace_id, channel_id, COALESCE(subscriber_scope, 'channel') AS subscriber_scope,
              mode, lower(trim(COALESCE(normalized_destination, destination_url))) AS normalized_destination,
              COUNT(*) AS row_count,
              SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) AS enabled_count
       FROM subscribers
       WHERE workspace_id = ${ws} AND channel_id = ${ch} AND subscriber_type = 'email'
       GROUP BY workspace_id, channel_id, subscriber_scope, mode, normalized_destination
       HAVING COUNT(*) > 1;`,
    ),
    pending_shadowing_authorized: await d1(
      args,
      `SELECT p.subscriber_id AS pending_subscriber_id, a.subscriber_id AS authorized_subscriber_id,
              lower(trim(COALESCE(p.normalized_destination, p.destination_url))) AS normalized_destination
       FROM subscribers p
       JOIN subscribers a
         ON a.workspace_id = p.workspace_id
        AND a.channel_id = p.channel_id
        AND COALESCE(a.subscriber_scope, 'channel') = COALESCE(p.subscriber_scope, 'channel')
        AND a.subscriber_type = p.subscriber_type
        AND a.mode = p.mode
        AND lower(trim(COALESCE(a.normalized_destination, a.destination_url))) =
            lower(trim(COALESCE(p.normalized_destination, p.destination_url)))
       WHERE p.workspace_id = ${ws} AND p.channel_id = ${ch}
         AND p.subscriber_type = 'email'
         AND json_extract(p.config_json, '$.authorization.status') = 'pending'
         AND json_extract(a.config_json, '$.authorization.status') = 'authorized';`,
    ),
    signals_without_watches: await d1(
      args,
      `SELECT s.signal_id, s.signal_key
       FROM signals s
       LEFT JOIN watches w ON w.signal_id = s.signal_id AND w.enabled = 1
       WHERE s.workspace_id = ${ws} AND s.channel_id = ${ch}
       GROUP BY s.signal_id, s.signal_key
       HAVING COUNT(w.watch_id) = 0;`,
    ),
    duplicate_logical_watches: await d1(
      args,
      `SELECT channel_id, signal_id, COALESCE(watch_group_id, '') AS watch_group_id,
              COALESCE(band_key, '') AS band_key, watch_type, config_json, COUNT(*) AS row_count
       FROM watches
       WHERE workspace_id = ${ws} AND channel_id = ${ch}
       GROUP BY channel_id, signal_id, watch_group_id, band_key, watch_type, config_json
       HAVING COUNT(*) > 1;`,
    ),
    watch_groups_missing_bands: await d1(
      args,
      `SELECT wg.watch_group_id, wg.group_key, COUNT(w.watch_id) AS enabled_band_count
       FROM watch_groups wg
       LEFT JOIN watches w ON w.watch_group_id = wg.watch_group_id AND w.enabled = 1
       WHERE wg.workspace_id = ${ws} AND wg.channel_id = ${ch}
       GROUP BY wg.watch_group_id, wg.group_key
       HAVING COUNT(w.watch_id) = 0;`,
    ),
  };

  if (args.repair) {
    report.repairs = {
      normalized_email_destinations: await d1(
        args,
        `UPDATE subscribers
         SET normalized_destination = lower(trim(destination_url)), updated_at = datetime('now')
         WHERE workspace_id = ${ws} AND channel_id = ${ch}
           AND subscriber_type = 'email'
           AND (normalized_destination IS NULL OR normalized_destination = '');
         SELECT changes() AS changed;`,
      ),
      disabled_duplicate_email_subscribers: await d1(
        args,
        `WITH ranked AS (
           SELECT id,
                  ROW_NUMBER() OVER (
                    PARTITION BY workspace_id, channel_id, COALESCE(subscriber_scope, 'channel'),
                                 subscriber_type, mode, lower(trim(COALESCE(normalized_destination, destination_url)))
                    ORDER BY
                      CASE WHEN json_extract(config_json, '$.authorization.status') = 'authorized' THEN 0 ELSE 1 END,
                      CASE WHEN enabled = 1 THEN 0 ELSE 1 END,
                      updated_at DESC,
                      id ASC
                  ) AS rn
           FROM subscribers
           WHERE workspace_id = ${ws} AND channel_id = ${ch} AND subscriber_type = 'email'
         )
         UPDATE subscribers
         SET enabled = 0, updated_at = datetime('now')
         WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
         SELECT changes() AS changed;`,
      ),
      disabled_duplicate_watches: await d1(
        args,
        `WITH ranked AS (
           SELECT id,
                  ROW_NUMBER() OVER (
                    PARTITION BY channel_id, signal_id, COALESCE(watch_group_id, ''),
                                 COALESCE(band_key, ''), watch_type, config_json
                    ORDER BY enabled DESC, updated_at DESC, id ASC
                  ) AS rn
           FROM watches
           WHERE workspace_id = ${ws} AND channel_id = ${ch}
         )
         UPDATE watches
         SET enabled = 0, updated_at = datetime('now')
         WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
         SELECT changes() AS changed;`,
      ),
    };
    if (args.createForeticDefaults) {
      report.repairs.created_foretic_defaults = await createMissingForeticDefaults(args, {
        workspaceId: args.workspaceId,
        channelId: args.channelId,
      });
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

run().catch((error) => {
  console.error(JSON.stringify({ ok: false, message: error.message }, null, 2));
  process.exit(1);
});

