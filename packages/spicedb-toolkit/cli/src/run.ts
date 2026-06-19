import { flush, handle } from '@oclif/core';
import { runWrappedZed } from './index.js';

/** Boots the zed wrapper and delegates execution to the official zed binary. */
async function main() {
  const exitCode = await runWrappedZed(process.argv.slice(2));
  await flush();
  process.exitCode = exitCode;
}

main().catch(async (error: unknown) => {
  const normalizedError = error instanceof Error ? error : new Error(String(error));
  await handle(normalizedError);
});
