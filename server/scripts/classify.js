// Offline: classify attempts and estimate leaks. Run manually after a playtest:
//
//   node scripts/classify.js              # everything still unclassified / unjudged
//   node scripts/classify.js --limit 40   # a small batch (watch your daily quota)
//   node scripts/classify.js --count      # just report how many rows need work
//
// Safe to stop (Ctrl+C) and re-run at any time.
import { parseArgs } from 'node:util';
import { config } from '../config.js';
import { fetchAllPages } from '../store/supabaseStore.js';
import { createScriptLlm, requireDb } from './lib.js';
import { runClassification } from './classifyCore.js';

const { values } = parseArgs({
  options: {
    limit: { type: 'string' },
    count: { type: 'boolean', default: false },
  },
});

const request = requireDb();

if (values.count) {
  const rows = await fetchAllPages(
    request,
    'attempts?select=attack_category,offline_leak&or=(attack_category.is.null,offline_leak.is.null)&order=id.asc',
  );
  const needClass = rows.filter((r) => r.attack_category === null).length;
  const needLeak = rows.filter((r) => r.offline_leak === null).length;
  console.log(`${rows.length} row(s) need work: ${needClass} unclassified, ${needLeak} without offline_leak.`);
  process.exit(0);
}

const limit = values.limit ? Number(values.limit) : Infinity;
if (!(limit > 0)) {
  console.error('--limit must be a positive number');
  process.exit(1);
}

const rate = config.judgeModel.startsWith('groq:') ? config.llm.groqMaxPerMinute : config.llm.maxPerMinute;
console.log(`Model: ${config.judgeModel}  |  rate: ${rate}/min`);
const summary = await runClassification({
  request,
  llm: createScriptLlm(),
  model: config.judgeModel,
  limit,
  timeoutMs: config.llm.timeoutMs,
});
console.log('\nDone:', summary);
