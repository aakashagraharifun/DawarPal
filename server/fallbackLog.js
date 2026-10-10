import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PATH = fileURLToPath(new URL('./logs/unsaved-rows.jsonl', import.meta.url));

// If a DB write fails, the row is appended here (one JSON object per line) so no
// attempt is silently lost. Rows can be re-inserted later. Server-side only.
export function createFallbackLog(path = DEFAULT_PATH) {
  return async function fallbackLog(table, row, error) {
    const line = JSON.stringify({ table, row, error: String(error?.message ?? error), at: new Date().toISOString() });
    try {
      await mkdir(dirname(path), { recursive: true });
      await appendFile(path, line + '\n', 'utf8');
    } catch (err) {
      // Last resort: the console.
      console.error('[fallback-log failed]', err?.message, line);
    }
  };
}
