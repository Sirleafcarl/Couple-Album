import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createUnusedDependencies } from './test-dependencies.js';

describe('GET /api/health', () => {
  it('reports that the API is alive', async () => {
    const app = buildApp(createUnusedDependencies());
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
