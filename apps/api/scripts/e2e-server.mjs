// Démarre l'app buildée sur une base vierge, avec un compte de test.
import { hash } from '@node-rs/argon2';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'hibi-e2e-'));
const hashFile = join(dir, 'hash');
writeFileSync(hashFile, await hash('e2e-password-123', { algorithm: 2 }));
Object.assign(process.env, {
  ADMIN_USER: 'e2e',
  ADMIN_PASSWORD_HASH_FILE: hashFile,
  DATA_DIR: dir,
  PORT: process.argv[2] ?? '3200',
  HOST: '127.0.0.1',
});
await import('../dist/server.js');
