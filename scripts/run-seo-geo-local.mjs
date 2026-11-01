import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
if (process.argv.length !== 2) throw new Error('This local-only runner accepts no arguments.');
const output = path.join(root, 'artifacts/qa/seo-geo');
await mkdir(output, { recursive: true });
// Explicit OS-only child environment: do not inherit provider credentials or
// runtime endpoints. Existing build script also enforces its local URL contract.
const allowed = ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOME', 'COMSPEC'];
const environment = { ...Object.fromEntries(allowed.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]])),
  ASTRO_TELEMETRY_DISABLED: '1', ASTRO_DISABLE_UPDATE_CHECK: 'true', CLOUDFLARE_CF_FETCH_ENABLED: 'false',
  WRANGLER_SEND_METRICS: 'false', NO_UPDATE_NOTIFIER: '1',
};
const config = path.join(output, 'build-local.toml');
await writeFile(config, `name = "lensden-geo-local"
compatibility_date = "2026-05-17"
compatibility_flags = ["nodejs_compat"]
send_metrics = false
[vars]
SUPABASE_URL = "http://127.0.0.1:47831"
SUPABASE_ANON_KEY = "local-geo-anon"
PUBLIC_SUPABASE_URL = "http://127.0.0.1:47831"
PUBLIC_SUPABASE_ANON_KEY = "local-geo-anon"
SITE_ORIGIN = "https://127.0.0.1"
AUTH_CAPTCHA_MODE = "off"
`);
for (const [name, args] of [
  ['unit', ['--test', 'scripts/test-seo-geo.mjs', 'scripts/test-geo-monitor.mjs']],
  ['build', ['scripts/build-workers.mjs', '--local-config', config]],
  ['rendered', ['scripts/test-seo-rendered.mjs']],
]) {
  const result = spawnSync(process.execPath, args, { cwd: root, env: environment, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 180000 });
  await writeFile(path.join(output, `${name}.log`), `${result.stdout ?? ''}${result.stderr ?? ''}`);
  if (result.error || result.status !== 0) {
    console.error(`${name.toUpperCase()}=FAIL; inspect artifacts/qa/seo-geo/${name}.log`);
    process.exit(result.status || 1);
  }
  console.log(`${name.toUpperCase()}=PASS`);
}
