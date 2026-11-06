import { mkdirSync, rmSync } from 'node:fs';

/** Reserve a new directory and clean it after a caught write failure. */
export function writeLocalProof(output: string, write: () => void): void {
  mkdirSync(output);
  try { write(); }
  catch (error) { rmSync(output, {recursive:true,force:true}); throw error; }
}
