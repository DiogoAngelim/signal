import path from 'node:path';
import { OperationalLedger, restoreLedger } from '../src/operational-ledger.mjs';
import { readPrivateConfig } from '../src/server.mjs';

// Never takes broker credentials or submits orders. Restore always targets a new, offline file.
const [command, target, trustedSha256] = process.argv.slice(2);
if (command === 'restore') {
  const snapshot = process.env.VERIFIED_BACKUP_FILE;
  if (!snapshot || !target) throw Error('Use VERIFIED_BACKUP_FILE and restore <new-absolute-ledger-path> <independently-recorded-sha256>');
  console.log(JSON.stringify(restoreLedger(path.resolve(snapshot), target, { trustedSha256 })));
} else {
  const config = readPrivateConfig(process.env.VERIFIED_INVESTING_CONFIG);
  const ledger = new OperationalLedger(config.ledgerFile, { owner: config.owner, mode: config.mode || 'paper' });
  try {
    if (command === 'verify') console.log(JSON.stringify(ledger.verifyIntegrity()));
    else if (command === 'backup' && target) console.log(JSON.stringify(ledger.backup(target)));
    else throw Error('Expected verify, backup <absolute-file>, or restore <new-absolute-file> <sha256>');
  } finally { ledger.close(); }
}
