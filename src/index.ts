import Fastify from 'fastify';
import { versionRoute } from './routes/version.js';
import { healthRoute } from './routes/health.js';
import { tamarTurnRoute } from './routes/runtime.tamar-turn.js';
import { metaWebhookRoute } from './routes/meta.webhook.js';

const app = Fastify({ logger: true });

app.register(healthRoute);
app.register(versionRoute);
app.register(tamarTurnRoute);
app.register(metaWebhookRoute);

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

try {
  await app.listen({ port, host });
  app.log.info({ port, host }, 'community-intelligence railway brain started');
} catch (error) {
  app.log.error(error, 'failed to start railway brain');
  process.exit(1);
}
