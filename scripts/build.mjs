import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const publishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '');
const isCloudflare = Boolean(process.env.CF_PAGES);

if (isCloudflare && (!/^https:\/\/.+\.supabase\.co$/.test(url) || publishableKey.length < 20)) {
  throw new Error('Cloudflare Pages requires SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.');
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of ['index.html', 'app.js', 'manifest.webmanifest', 'icon.svg', 'sw.js', 'zxing-browser.min.js', 'zxing-LICENSE']) {
  await cp(resolve(root, file), resolve(output, file));
}

const runtimeConfig = `window.__SUPABASE_CONFIG__ = ${JSON.stringify({ url, publishableKey })};\n`;
await writeFile(resolve(output, 'config.js'), runtimeConfig, 'utf8');

const headers = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(self)
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self' https://*.supabase.co; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'

/config.js
  Cache-Control: no-store

/sw.js
  Cache-Control: no-cache
`;
await writeFile(resolve(output, '_headers'), headers, 'utf8');

console.log(`Built ${output}${url ? ' with Supabase runtime configuration' : ' for local UI testing (Supabase not configured)'}.`);
