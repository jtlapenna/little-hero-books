import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createExactBookIdentitySupabaseReader, lookupExactBookIdentity } from '../src/lib/books/exact-book-identity';

const execFileAsync = promisify(execFile);

// psql is a local transport stand-in, not a test of PostgREST or hosted roles.
function localReader(role: 'service_role' | 'anon' = 'service_role') {
  return createExactBookIdentitySupabaseReader({
    async rpc(name, args) {
      assert.equal(name, 'lhl_strict_book_identity');
      try {
        const { stdout } = await execFileAsync('psql', [
          '-X', '-v', 'ON_ERROR_STOP=1', '-qAt',
          '-c', `SET ROLE ${role}; SELECT public.lhl_strict_book_identity('${args.p_book_id.replaceAll("'", "''")}');`,
        ]);
        return { data: JSON.parse(stdout), error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
  });
}

async function main() {
  const reader = localReader();
  const found = await lookupExactBookIdentity('BOOK-A', reader);
  assert.equal(found.status, 'found');
  if (found.status === 'found') assert.equal(found.row.id, '9007199254740993');
  assert.equal((await lookupExactBookIdentity('MISSING', reader)).status, 'absent');
  assert.equal((await lookupExactBookIdentity('DUPLICATE', reader)).status, 'ambiguous');
  assert.equal((await lookupExactBookIdentity('CONFLICT', reader)).status, 'ambiguous');
  assert.equal((await lookupExactBookIdentity('BOOK-A', localReader('anon'))).status, 'unavailable');
  console.log('local PostgreSQL to identity adapter tests passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
