import { spawnSync } from 'node:child_process';

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this build with npm run build:vercel');

for (const script of ['build', 'ingest']) {
  const result = spawnSync(process.execPath, [npmCli, 'run', script], {
    stdio: 'inherit',
    env: { ...process.env, LOCALNORM_BUILD: '1', EMBEDDING_PROVIDER: 'local', VECTOR_STORE: 'memory' },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
