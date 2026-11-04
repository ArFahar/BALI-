import { createApp } from '../server/dist/app.js';
import { bootstrap } from '../server/dist/bootstrap.js';
import { config } from '../server/dist/config.js';

let appPromise;

export default async function handler(req, res) {
  try {
    appPromise ??= bootstrap().then(({ pipeline, store, feedback, embedder, llm }) => {
      const app = createApp({
        pipeline, store, feedback,
        info: { llm: llm?.id ?? null, embedder: embedder.id, corsOrigins: config.corsOrigins },
      });
      app.set('trust proxy', 1);
      return app;
    }).catch((error) => {
      appPromise = undefined;
      throw error;
    });
    const app = await appPromise;
    return app(req, res);
  } catch {
    console.error('[api] LocalNorm initialization failed');
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'LocalNorm is starting. Please try again.' } }));
  }
}
