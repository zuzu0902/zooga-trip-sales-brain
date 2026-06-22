import type { FastifyInstance } from 'fastify';
import { versionInfo } from '../version.js';

export async function versionRoute(app: FastifyInstance) {
  app.get('/version', async () => {
    return versionInfo();
  });
}
