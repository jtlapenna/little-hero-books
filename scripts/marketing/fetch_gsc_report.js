#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');

function usage() {
  return [
    'Usage:',
    '  npm run marketing:gsc:pull -- --start-date YYYY-MM-DD --end-date YYYY-MM-DD --label report-label',
    '',
    'Options:',
    '  --start-date YYYY-MM-DD  Start date for Search Console data',
    '  --end-date YYYY-MM-DD    End date for Search Console data',
    '  --label VALUE            Output folder label under reports/seo/raw',
    '  --site-url VALUE         GSC property, e.g. sc-domain:littleherolabs.com',
    '  --help                   Show this help',
  ].join('\n');
}

function parseArgs(argv) {
  const today = new Date().toISOString().slice(0, 10);
  const args = {
    startDate: '2026-05-12',
    endDate: today,
    label: `${today}-gsc`,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else if (arg === '--start-date' && next) {
      args.startDate = next;
      index += 1;
    } else if (arg === '--end-date' && next) {
      args.endDate = next;
      index += 1;
    } else if (arg === '--label' && next) {
      args.label = next;
      index += 1;
    } else if (arg === '--site-url' && next) {
      args.siteUrl = next;
      index += 1;
    }
  }

  assertDate(args.startDate, '--start-date');
  assertDate(args.endDate, '--end-date');

  return args;
}

function assertDate(value, flag) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${flag} must use YYYY-MM-DD.`);
  }
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const values = {};
  const text = readFileSync(filePath, 'utf8');

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    values[key] = stripQuotes(rawValue.trim());
  }

  return values;
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function resolveConfig(args) {
  const localEnv = parseEnvFile(resolve('.lhl-growth', '.env.local'));
  const siteUrl = args.siteUrl || process.env.LHL_GSC_SITE_URL || localEnv.LHL_GSC_SITE_URL;

  if (!siteUrl) {
    throw new Error('Missing LHL_GSC_SITE_URL. Add it to .lhl-growth/.env.local or pass --site-url.');
  }

  return {
    siteUrl,
    gcloudCandidates: [
      process.env.LHL_GCLOUD_BIN,
      localEnv.LHL_GCLOUD_BIN,
      '/usr/local/share/google-cloud-sdk/bin/gcloud',
      '/opt/homebrew/bin/gcloud',
      'gcloud',
    ].filter(Boolean),
  };
}

function getAccessToken(candidates) {
  const errors = [];

  for (const candidate of candidates) {
    try {
      return execFileSync(candidate, ['auth', 'application-default', 'print-access-token'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    } catch (error) {
      errors.push(`${candidate}: ${error.message}`);
    }
  }

  throw new Error(`Could not get a Google ADC access token.\n${errors.join('\n')}`);
}

async function queryGsc(token, siteUrl, body) {
  const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
    siteUrl,
  )}/searchAnalytics/query`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GSC request failed with ${response.status}: ${text.slice(0, 500)}`);
  }

  const json = await response.json();
  return json.rows || [];
}

function summarize(rows) {
  const clicks = rows.reduce((sum, row) => sum + (row.clicks || 0), 0);
  const impressions = rows.reduce((sum, row) => sum + (row.impressions || 0), 0);
  const weightedPosition = rows.reduce(
    (sum, row) => sum + (row.position || 0) * (row.impressions || 0),
    0,
  );

  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    avgPosition: impressions > 0 ? weightedPosition / impressions : 0,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = resolveConfig(args);
  const token = getAccessToken(config.gcloudCandidates);
  const baseBody = {
    startDate: args.startDate,
    endDate: args.endDate,
    rowLimit: 25000,
    searchType: 'web',
  };

  const [daily, queries, pages, queryPages] = await Promise.all([
    queryGsc(token, config.siteUrl, { ...baseBody, dimensions: ['date'] }),
    queryGsc(token, config.siteUrl, { ...baseBody, dimensions: ['query'] }),
    queryGsc(token, config.siteUrl, { ...baseBody, dimensions: ['page'] }),
    queryGsc(token, config.siteUrl, { ...baseBody, dimensions: ['query', 'page'] }),
  ]);

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      startDate: args.startDate,
      endDate: args.endDate,
      siteUrl: config.siteUrl,
      source: 'Google Search Console Search Analytics API',
      note: 'Rows are safe to commit. OAuth tokens and credentials are not stored in this artifact.',
    },
    summary: summarize(daily),
    reports: {
      daily,
      queries,
      pages,
      queryPages,
    },
  };

  const outputPath = resolve('reports', 'seo', 'raw', args.label, 'gsc.json');
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Fetched GSC data for ${config.siteUrl}`);
  console.log(`Window: ${args.startDate} to ${args.endDate}`);
  console.log(`Wrote ${outputPath}`);
  console.log(
    `Daily totals: ${report.summary.clicks} clicks, ${report.summary.impressions} impressions, CTR ${(
      report.summary.ctr * 100
    ).toFixed(2)}%, avg position ${report.summary.avgPosition.toFixed(2)}`,
  );
  console.log(
    `Rows: daily=${daily.length}, queries=${queries.length}, pages=${pages.length}, queryPages=${queryPages.length}`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
