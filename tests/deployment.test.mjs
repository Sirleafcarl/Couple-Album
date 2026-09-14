import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const env = { ...process.env, POSTGRES_PASSWORD: 'test-only-not-a-real-secret', GALLERY_ROOT: '/tmp/gallery-deployment-test', APP_ORIGIN: 'http://127.0.0.1:28088' };
const config = (extra = {}) => spawnSync('docker', ['compose', '--env-file', '/dev/null', '-f', 'compose.production.yaml', 'config', '--format', 'json'], { env: { ...env, ...extra }, encoding: 'utf8' });
test('production deployment files exist', () => {
  for (const file of ['compose.production.yaml', '.dockerignore', 'docker/production/Dockerfile']) assert.ok(existsSync(file), file);
});
test('only web publishes a port, data persists and migration gates application startup', () => {
  const result = config();
  assert.equal(result.status, 0, result.stderr);
  const { services } = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(services).filter(k => services[k].ports?.length), ['web']);
  assert.equal(services.api.depends_on.migrate.condition, 'service_completed_successfully');
  assert.equal(services.worker.environment.IMAGE_WORKER_CONCURRENCY, '1');
  assert.ok(services.postgres.volumes.some(v => v.source.endsWith('/postgres')));
  assert.ok(services.api.volumes.some(v => v.source.endsWith('/media') && v.target === '/data'));
  assert.ok(!JSON.stringify(services).includes('tsx'));
});
test('empty production password fails closed', () => {
  assert.notEqual(config({ POSTGRES_PASSWORD: '' }).status, 0);
});
test('initial deployment keeps a single image worker without an unmeasured memory cap', () => {
  const result = config();
  assert.equal(result.status, 0, result.stderr);
  const { services } = JSON.parse(result.stdout);
  assert.equal(services.worker.environment.IMAGE_WORKER_CONCURRENCY, '1');
  for (const service of Object.values(services)) {
    assert.equal(service.mem_limit, undefined);
    assert.equal(service.deploy?.resources?.limits?.memory, undefined);
  }
});
test('build excludes credentials and local data; web preserves private media authorization', () => {
  const ignore = readFileSync('.dockerignore', 'utf8');
  for (const pattern of ['.env', 'data', 'docs', '.git']) assert.ok(ignore.split('\n').includes(pattern));
  const nginx = readFileSync('docker/production/nginx.conf', 'utf8');
  assert.match(nginx, /proxy_pass http:\/\/api:23001/);
  assert.doesNotMatch(nginx, /alias\s+\/data/);
});
