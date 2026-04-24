import request from 'supertest';
import { setupTestApp, teardownTestApp } from '../../test/setup';
import { app } from '../../test/setup';

describe('API versioning middleware', () => {
  beforeAll(async () => {
    await setupTestApp();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it('routes v1 status requests and returns deprecation headers', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/status').expect(200);
    expect(response.headers['x-api-version']).toBe('v1');
    expect(response.headers['deprecation']).toBe('true');
    expect(response.headers['sunset']).toBeDefined();
    expect(response.headers['link']).toContain('</api/v2>');
    expect(response.body.version).toBe('v1');
  });

  it('routes v2 status requests without deprecation headers', async () => {
    const response = await request(app.getHttpServer()).get('/api/v2/status').expect(200);
    expect(response.headers['x-api-version']).toBe('v2');
    expect(response.headers['deprecation']).toBeUndefined();
    expect(response.body.version).toBe('v2');
  });

  it('negotiates version from X-API-Version on unversioned paths', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/status')
      .set('X-API-Version', 'v2')
      .expect(200);

    expect(response.headers['x-api-version']).toBe('v2');
    expect(response.body.version).toBe('v2');
  });

  it('returns 400 for unsupported API versions', async () => {
    await request(app.getHttpServer())
      .get('/api/status')
      .set('X-API-Version', 'v99')
      .expect(400);
  });
});
