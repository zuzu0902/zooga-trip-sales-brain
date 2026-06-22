import type { FastifyInstance } from 'fastify';

export async function healthRoute(app: FastifyInstance) {
  app.get('/health', async () => {
    return {
      ok: true,
      service: 'community-intelligence-railway-brain',
      status: 'healthy',
      now: new Date().toISOString(),
    };
  });
}
