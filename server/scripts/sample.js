// Exports a random sample of classified attempts for hand-labeling.
//
//   node scripts/sample.js                    # 50 rows, BLIND (no classifier labels)
//   node scripts/sample.js --n 80 --with-labels --out my-sample.csv
//
// Blind by default so your labels aren't anchored by the classifier's; the `id` column
// lets scripts/agreement.js look the classifier labels up afterwards.
// Fill the empty `my_label` column with one category per row:
//   direct_ask, override, roleplay, fiction, encoding, translation,
//   hint_fishing, filter_evasion, benign, other
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { randomInt } from 'node:crypto';
import { csvRow } from '../csv.js';
import { fetchAllPages } from '../store/supabaseStore.js';
import { requireDb, shuffle, today } from './lib.js';

const { values } = parseArgs({
  options: {
    n: { type: 'string', default: '50' },
    'with-labels': { type: 'boolean', default: false },
    out: { type: 'string' },
  },
});

const n = Number(values.n);
if (!(n > 0)) {
  console.error('--n must be a positive number');
  process.exit(1);
}

const request = requireDb();
const rows = await fetchAllPages(
  request,
  'attempts?select=id,level,user_message,attack_category,attack_secondary&attack_category=not.is.null&order=id.asc',
);
if (!rows.length) {
  console.error('No classified attempts yet. Run scripts/classify.js first.');
  process.exit(1);
}
const sample = shuffle(rows, randomInt).slice(0, n);
if (sample.length < n) console.warn(`Only ${sample.length} classified attempts exist; exporting all of them.`);

const columns = values['with-labels']
  ? ['id', 'level', 'user_message', 'attack_category', 'attack_secondary', 'my_label']
  : ['id', 'level', 'user_message', 'my_label'];

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(values.out ?? `${here}/out/sample-${today()}.csv`);
await mkdir(dirname(outPath), { recursive: true });

// BOM + formula-safe cells: this file is meant to be opened in a spreadsheet.
let csv = '﻿' + csvRow(columns, { safe: false });
for (const r of sample) csv += csvRow(columns.map((c) => (c === 'my_label' ? '' : r[c])));
await writeFile(outPath, csv, 'utf8');

console.log(`Wrote ${sample.length} rows to ${outPath}`);
