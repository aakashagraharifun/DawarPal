// Compares your hand labels (my_label) with the classifier's attack_category.
//
//   node scripts/agreement.js scripts/out/sample-2026-10-10.csv
//
// Reports exact agreement, Cohen's kappa, "lenient" agreement (your label matches the
// classifier's primary OR secondary), a confusion list and every disagreement.
import { readFile } from 'node:fs/promises';
import { parseCsvObjects } from '../csv.js';
import { ATTACK_CATEGORIES } from '../categories.js';
import { cohensKappa, requireDb } from './lib.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/agreement.js <labeled.csv>');
  process.exit(1);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rows = parseCsvObjects(await readFile(file, 'utf8'));
const labeled = [];
const unknown = [];
for (const r of rows) {
  const label = (r.my_label ?? '').trim().toLowerCase();
  if (!label) continue;
  if (!UUID_RE.test((r.id ?? '').trim())) unknown.push(`bad id "${r.id}"`);
  else if (!ATTACK_CATEGORIES.includes(label)) unknown.push(`${r.id}: "${r.my_label}"`);
  else labeled.push({ id: r.id.trim(), mine: label });
}
if (unknown.length) {
  console.warn(`Skipping ${unknown.length} row(s) with an unrecognized my_label:\n  ${unknown.join('\n  ')}\n`);
}
if (!labeled.length) {
  console.error('No rows with a valid my_label.');
  process.exit(1);
}

// Look up the classifier's labels (works for blind samples too).
const request = requireDb();
const classifier = new Map();
for (let i = 0; i < labeled.length; i += 100) {
  const ids = labeled.slice(i, i + 100).map((r) => r.id);
  const found = await request(`attempts?select=id,attack_category,attack_secondary&id=in.(${ids.join(',')})`);
  for (const f of found) classifier.set(f.id, f);
}

const pairs = [];
let lenient = 0;
const disagreements = [];
const confusion = new Map();
for (const { id, mine } of labeled) {
  const c = classifier.get(id);
  if (!c?.attack_category) continue;
  pairs.push([mine, c.attack_category]);
  if (mine === c.attack_category || mine === c.attack_secondary) lenient++;
  if (mine !== c.attack_category) {
    disagreements.push({ id, mine, classifier: c.attack_category, secondary: c.attack_secondary });
    const key = `${mine} → ${c.attack_category}`;
    confusion.set(key, (confusion.get(key) ?? 0) + 1);
  }
}

const { n, agreement, kappa } = cohensKappa(pairs);
const pct = (x) => `${(x * 100).toFixed(1)}%`;
console.log(`Compared:            ${n} rows`);
console.log(`Exact agreement:     ${pct(agreement)}`);
console.log(`Lenient agreement:   ${pct(lenient / n)}  (your label = classifier primary or secondary)`);
console.log(`Cohen's kappa:       ${kappa.toFixed(3)}`);
if (confusion.size) {
  console.log('\nMost common disagreements (you → classifier):');
  for (const [k, v] of [...confusion].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
  console.log('\nAll disagreements:');
  console.table(disagreements);
}
