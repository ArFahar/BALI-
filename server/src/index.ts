import { createApp } from './app.js';
import { bootstrap } from './bootstrap.js';
import { config } from './config.js';

const started = Date.now();
const { pipeline, store, feedback, embedder, llm, translator } = await bootstrap();

const app = createApp({
  pipeline,
  store,
  feedback,
  info: { llm: llm?.id ?? null, embedder: embedder.id, translator: translator?.id ?? null, corsOrigins: config.corsOrigins },
});

app.listen(config.port, () => {
  console.log(
    `LocalNorm API on http://localhost:${config.port} | kb=${store.kind} | translator=${translator?.id ?? 'off'} | embedder=${embedder.id} | llm=${llm?.id ?? 'none (extractive mode)'} | ready in ${Date.now() - started}ms`,
  );
});
