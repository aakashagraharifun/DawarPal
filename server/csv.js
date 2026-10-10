// RFC 4180 CSV helpers.
//
// `safe` (default) guards against spreadsheet formula injection: player messages are
// attacker-controlled, so a cell starting with = + - @ (or tab/CR) gets a leading
// apostrophe. Use safe=false for analysis tools (pandas, R) that want the raw text.

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value, { safe = true } = {}) {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (safe && typeof value === 'string' && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(values, opts) {
  return values.map((v) => csvCell(v, opts)).join(',') + '\r\n';
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

// Parse into objects keyed by the header row.
export function parseCsvObjects(text) {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ''])));
}

// Columns exported per table. sessions deliberately excludes `passwords`.
export const EXPORT_COLUMNS = {
  attempts: [
    'id', 'session_id', 'level', 'created_at', 'user_message', 'bot_reply', 'shown_reply',
    'blocked_by', 'judge_leak', 'judge_reason', 'bot_model', 'judge_model', 'latency_ms',
    'led_to_win', 'attack_category', 'attack_secondary', 'offline_leak',
  ],
  guesses: ['id', 'session_id', 'level', 'guess', 'correct', 'created_at'],
  llm_errors: ['id', 'session_id', 'level', 'kind', 'detail', 'user_message', 'created_at'],
  sessions: ['id', 'nickname', 'created_at', 'current_level', 'completed_at'],
};
