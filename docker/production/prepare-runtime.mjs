import { mkdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { join } from 'node:path';

// Only runs in the image builder. Source workspace manifests are never changed.
const target = '/runtime';
mkdirSync(target, { recursive: true });
for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) cpSync(file, join(target, file));
for (const name of ['apps/api', 'apps/worker', 'packages/contracts', 'packages/db', 'packages/media']) {
  const output = join(target, name);
  mkdirSync(output, { recursive: true });
  const manifest = JSON.parse(readFileSync(`${name}/package.json`, 'utf8'));
  if (manifest.exports) {
    manifest.exports = Object.fromEntries(Object.entries(manifest.exports).map(([key, value]) => [key, value.replace('./src/', './dist/').replace(/\.ts$/, '.js')]));
  }
  writeFileSync(join(output, 'package.json'), JSON.stringify(manifest, null, 2));
  cpSync(`${name}/dist`, join(output, 'dist'), { recursive: true });
}
cpSync('packages/db/migrations', join(target, 'packages/db/migrations'), { recursive: true });
