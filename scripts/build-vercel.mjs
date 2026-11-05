import { spawnSync } from 'node:child_process';

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this build with npm run build:vercel');

const env = { ...process.env, LOCALNORM_BUILD: '1', EMBEDDING_PROVIDER: 'local' };

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// 1. Compile server + web.
run([npmCli, 'run', 'build']);

// 2. Download the query-embedding model into server/.cache/models so the function runs offline.
//    The knowledge base itself is prebuilt (knowledge/processing/, embedded with the same model) - no ingest step.
//    The OPUS-MT translation models (~200 MB) are NOT bundled: they exceed the function size limit, so Vercel uses
//    QUERY_TRANSLATOR=llm (SumoPod) or glossary terms (see server/src/config.ts).
run(['--input-type=module', '-e', `
  const { LocalEmbedder } = await import('./server/dist/rag/embeddings.js');
  const { FileKbStore } = await import('./server/dist/kb/store.js');
  const { config } = await import('./server/dist/config.js');
  const embedder = new LocalEmbedder();
  await embedder.embedQuery('warmup');
  const store = FileKbStore.load(config.processingDir);
  const indexed = await store.embeddingModel();
  if (indexed !== embedder.id) throw new Error('Knowledge base model ' + indexed + ' != ' + embedder.id);
  console.log('[build:vercel] knowledge base: ' + (await store.count()) + ' chunks, model ' + indexed);
`]);
