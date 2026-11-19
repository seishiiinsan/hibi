import { build } from 'esbuild';

// Un seul fichier : le package domain (TypeScript) est embarqué, les dépendances npm restent dans node_modules.
await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: ['better-sqlite3', '@node-rs/argon2', 'fastify', '@fastify/*'],
  sourcemap: true,
  logLevel: 'info',
});
