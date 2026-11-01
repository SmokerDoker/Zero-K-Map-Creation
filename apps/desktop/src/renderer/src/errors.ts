/** Turns an IPC rejection into the plain message thrown in the main process (Electron prefixes it
 * with "Error invoking remote method '<channel>': Error: ", which is noise for users). */
export function formatError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return message.replace(/^Error invoking remote method '[^']*': (?:\w*Error: )?/, '')
}
