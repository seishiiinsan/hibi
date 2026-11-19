// Usage : pnpm hash-password > secrets/admin_password_hash  (le mot de passe est lu sur stdin, sans écho)
import { hash } from '@node-rs/argon2';
import { createInterface } from 'node:readline';

async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
  }
  process.stderr.write('Mot de passe : ');
  const rl = createInterface({ input: process.stdin, terminal: true });
  (rl as unknown as { _writeToOutput: () => void })._writeToOutput = () => {};
  const pw = await new Promise<string>((res) => rl.question('', res));
  rl.close();
  process.stderr.write('\n');
  return pw;
}

const pw = await readPassword();
if (pw.length < 12) {
  process.stderr.write('Mot de passe trop court (12 caractères minimum).\n');
  process.exit(1);
}
// Algorithm.Argon2id = 2 ; paramètres OWASP (19 Mio, t=2, p=1).
process.stdout.write((await hash(pw, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 })) + '\n');
