import { useEffect, useMemo, useState } from 'react';
import NavLinks from '../components/NavLinks.jsx';
import {
  ChartCard,
  DataTable,
  Legend,
  RAMP_GRADIENT,
  SERIES,
  StackedRows,
  VerticalBars,
  niceMax,
  pct,
  rampColor,
  useTooltip,
} from '../components/charts.jsx';
import { api } from '../api.js';
import { navigate } from '../router.js';

const BLOCK_KEYS = ['none', 'input_filter', 'output_check', 'judge', 'judge_error'];
const BLOCK_LABELS = {
  none: 'Not blocked',
  input_filter: 'Input filter',
  output_check: 'Output check',
  judge: 'Judge',
  judge_error: 'Judge error (fail-closed)',
};
const CATEGORY_LABELS = {
  direct_ask: 'Direct ask',
  override: 'Override',
  roleplay: 'Roleplay',
  fiction: 'Fiction',
  encoding: 'Encoding',
  translation: 'Translation',
  hint_fishing: 'Hint fishing',
  filter_evasion: 'Filter evasion',
  benign: 'Benign',
  other: 'Other',
};
const catLabel = (c) => CATEGORY_LABELS[c] ?? c;

function StatTile({ label, value, sub }) {
  return (
    <div className="rounded-2xl border border-vault-700/70 bg-vault-900/70 p-4">
      <p className="text-xs uppercase tracking-wider text-mist-300">{label}</p>
      <p className="mt-1 font-display text-3xl tabular-nums text-parchment-50">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-mist-500">{sub}</p>}
    </div>
  );
}

function AttemptsAndClears({ levels }) {
  const attemptsMax = Math.max(4, niceMax(Math.max(...levels.map((l) => l.attempts))));
  const attemptItems = levels.map((l) => ({
    label: `Gate ${l.level}`,
    value: l.attempts,
    display: String(l.attempts),
    tip: (
      <>
        <div className="font-medium">Gate {l.level}</div>
        <div className="text-mist-300">{l.attempts} messages from {l.players} players</div>
      </>
    ),
  }));
  const clearItems = levels.map((l) => {
    const rate = l.players ? l.cleared / l.players : 0;
    return {
      label: `Gate ${l.level}`,
      value: rate,
      display: l.players ? pct(rate) : '—',
      tip: (
        <>
          <div className="font-medium">Gate {l.level}</div>
          <div className="text-mist-300">
            {l.cleared} of {l.players} players opened it
            {l.cleared ? ` · ${(l.attempts / l.cleared).toFixed(1)} messages per clear` : ''}
          </div>
        </>
      ),
    };
  });
  const table = (
    <DataTable
      columns={['Gate', 'Messages', 'Players', 'Cleared', 'Clear rate', 'Msgs / clear']}
      rows={levels.map((l) => [
        `Gate ${l.level}`,
        l.attempts,
        l.players,
        l.cleared,
        l.players ? pct(l.cleared / l.players) : '—',
        l.cleared ? (l.attempts / l.cleared).toFixed(1) : '—',
      ])}
    />
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Messages per gate" subtitle="Every logged attempt, by the gate it was sent at." table={table}>
        <VerticalBars items={attemptItems} max={attemptsMax} formatTick={(t) => t} integerTicks />
      </ChartCard>
      <ChartCard
        title="Clear rate per gate"
        subtitle="Share of players who tried a gate and then opened it."
        table={table}
      >
        <VerticalBars items={clearItems} max={1} formatTick={(t) => pct(t)} />
      </ChartCard>
    </div>
  );
}

function BlockedBreakdown({ levels }) {
  const rows = levels.map((l) => ({
    label: `Gate ${l.level}`,
    counts: l.blocked,
    total: BLOCK_KEYS.reduce((s, k) => s + l.blocked[k], 0),
  }));
  return (
    <ChartCard
      title="Where attempts were stopped"
      subtitle="Share of messages at each gate, by the defense that blocked them."
      legend={<Legend items={BLOCK_KEYS.map((k) => ({ key: k, label: BLOCK_LABELS[k], color: SERIES[k] }))} />}
      table={
        <DataTable
          columns={['Gate', ...BLOCK_KEYS.map((k) => BLOCK_LABELS[k]), 'Total']}
          rows={rows.map((r) => [r.label, ...BLOCK_KEYS.map((k) => r.counts[k]), r.total])}
        />
      }
      note="Gates 1–2 have no blocking stages, so everything there is 'not blocked'. Each message is stopped by at most one stage: the first that fires."
    >
      <StackedRows rows={rows} keys={BLOCK_KEYS} colors={SERIES} labels={BLOCK_LABELS} />
    </ChartCard>
  );
}

const METRICS = {
  wins: {
    label: 'Led to a win',
    rate: (c) => (c.n ? c.wins / c.n : null),
    detail: (c) => `${c.wins} of ${c.n} attempts led to a correct guess`,
    note: 'A "win" is the last message a player sent on a gate before guessing correctly, the attempt most likely to have leaked it. Only one attempt per cleared gate gets this mark, so rates are low by design.',
  },
  leaks: {
    label: 'Leaked (offline judge)',
    rate: (c) => (c.judged ? c.leaks / c.judged : null),
    detail: (c) => `${c.leaks} of ${c.judged} judged replies leaked`,
    note: 'Estimated afterwards by re-running the judge on what the player actually saw (scripts/classify.js), so it covers Gates 1–4 too, where no judge ran live.',
  },
};

function Heatmap({ heatmap, levels }) {
  const [metric, setMetric] = useState('wins');
  const { ref, bind, el } = useTooltip();
  const m = METRICS[metric];
  const byKey = useMemo(() => new Map(heatmap.cells.map((c) => [`${c.category}|${c.level}`, c])), [heatmap]);
  const rates = heatmap.cells.map(m.rate).filter((r) => r !== null);
  const max = rates.length ? Math.max(...rates) : 0;
  const categories = heatmap.categories;
  const levelNums = levels.map((l) => l.level);

  const table = (
    <DataTable
      columns={['Category', ...levelNums.map((l) => `Gate ${l}`)]}
      rows={categories.map((cat) => [
        catLabel(cat),
        ...levelNums.map((l) => {
          const c = byKey.get(`${cat}|${l}`);
          const r = c ? m.rate(c) : null;
          return r === null ? '—' : `${pct(r, 1)} (n=${metric === 'wins' ? c.n : c.judged})`;
        }),
      ])}
    />
  );

  return (
    <ChartCard
      title="Which attacks work where"
      subtitle="Attack category (rows) × gate (columns). Darker = lower, lighter = higher."
      table={table}
      note={m.note}
      legend={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Metric" className="inline-flex rounded-lg border border-vault-600 p-0.5 text-xs">
            {Object.entries(METRICS).map(([k, v]) => (
              <button
                key={k}
                type="button"
                aria-pressed={metric === k}
                onClick={() => setMetric(k)}
                className={`rounded-md px-2.5 py-1 ${metric === k ? 'bg-vault-700 text-gold-300' : 'text-mist-300 hover:text-parchment-50'}`}
              >
                {v.label}
              </button>
            ))}
          </div>
          {heatmap.cells.length > 0 && (
            <div className="flex items-center gap-2 text-[11px] tabular-nums text-mist-300">
              0%
              <span aria-hidden className="h-2.5 w-28 rounded-[3px]" style={{ background: RAMP_GRADIENT }} />
              {pct(max, 1)}
            </div>
          )}
        </div>
      }
    >
      {heatmap.cells.length === 0 ? (
        <p className="py-8 text-center text-sm text-mist-300">
          No attempts have been classified yet. Run <code className="text-gold-300">node scripts/classify.js</code>.
        </p>
      ) : (
        <div ref={ref} className="relative overflow-x-auto">
          <div className="grid min-w-[30rem] gap-[2px]" style={{ gridTemplateColumns: `8.5rem repeat(${levelNums.length}, minmax(0, 1fr))` }}>
            <span />
            {levelNums.map((l) => (
              <span key={l} className="pb-1 text-center text-xs text-mist-300">
                Gate {l}
              </span>
            ))}
            {categories.map((cat) => (
              <Row key={cat} cat={cat} levelNums={levelNums} byKey={byKey} m={m} metric={metric} max={max} bind={bind} />
            ))}
          </div>
          {el}
        </div>
      )}
    </ChartCard>
  );
}

function Row({ cat, levelNums, byKey, m, metric, max, bind }) {
  return (
    <>
      <span className="flex items-center pr-2 text-xs text-parchment-200">{catLabel(cat)}</span>
      {levelNums.map((l) => {
        const c = byKey.get(`${cat}|${l}`);
        const r = c ? m.rate(c) : null;
        if (r === null) {
          return (
            <div
              key={l}
              className="h-10 rounded-[4px] border border-dashed border-vault-700"
              aria-label={`${catLabel(cat)}, Gate ${l}: no data`}
            />
          );
        }
        const { bg, ink } = rampColor(max ? r / max : 0);
        const n = metric === 'wins' ? c.n : c.judged;
        return (
          <div
            key={l}
            className="flex h-10 flex-col items-center justify-center rounded-[4px] text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            style={{ background: bg, color: ink }}
            {...bind(
              <>
                <div className="font-medium">
                  {catLabel(cat)} · Gate {l}
                </div>
                <div className="text-mist-300">{m.detail(c)}</div>
              </>,
              `${catLabel(cat)}, Gate ${l}: ${pct(r, 1)} of ${n}`,
            )}
          >
            <span className="font-medium">{pct(r, r < 0.1 && r > 0 ? 1 : 0)}</span>
            <span className="text-[10px] opacity-75">n={n}</span>
          </div>
        );
      })}
    </>
  );
}

function FalsePositives({ items }) {
  const { ref, bind, el } = useTooltip();
  const max = niceMax(Math.max(1, ...items.map((i) => i.blocked)));
  return (
    <ChartCard
      title="False positives"
      subtitle="Normal (benign) messages that a defense blocked anyway."
      table={
        <DataTable
          columns={['Defense', 'Benign blocked', 'Benign msgs where active', 'Rate']}
          rows={items.map((i) => [
            BLOCK_LABELS[i.defense],
            i.blocked,
            i.benignAtActiveLevels,
            i.benignAtActiveLevels ? pct(i.blocked / i.benignAtActiveLevels, 1) : '—',
          ])}
        />
      }
      note="'Benign' comes from the offline classifier. The denominator counts benign messages on every gate where that defense is active (Gate 3+ for the input filter, 4+ for the output check, 5 for the judge)."
    >
      <div ref={ref} className="relative space-y-3">
        {items.map((i) => (
          <div key={i.defense} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="w-full shrink-0 text-xs text-parchment-200 sm:w-44">{BLOCK_LABELS[i.defense]}</span>
            <div className="h-6 flex-1">
              <div
                className="h-full rounded-r-[4px] outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                style={{ width: `${(i.blocked / max) * 100}%`, minWidth: i.blocked ? 2 : 0, background: SERIES[i.defense] }}
                {...bind(
                  <>
                    <div className="font-medium">{BLOCK_LABELS[i.defense]}</div>
                    <div className="text-mist-300">
                      {i.blocked} of {i.benignAtActiveLevels} benign messages (Gate {i.fromLevel}+)
                    </div>
                  </>,
                  `${BLOCK_LABELS[i.defense]}: ${i.blocked} benign messages blocked`,
                )}
              />
            </div>
            <span className="w-28 shrink-0 text-right text-xs tabular-nums text-mist-300">
              {i.blocked} / {i.benignAtActiveLevels}
              {i.benignAtActiveLevels ? ` (${pct(i.blocked / i.benignAtActiveLevels)})` : ''}
            </span>
          </div>
        ))}
        {el}
      </div>
    </ChartCard>
  );
}

function ResearcherExport() {
  const [token, setToken] = useState('');
  const [table, setTable] = useState('attempts');
  const [raw, setRaw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function download(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const { blob, name } = await api.exportCsv(token, table, raw);
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      a.click();
      URL.revokeObjectURL(url);
      setMsg({ ok: true, text: `Downloaded ${name}` });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-2xl border border-vault-700/70 bg-vault-900/70 p-4 sm:p-5">
      <summary className="cursor-pointer font-display text-gold-300">Researcher export</summary>
      <form onSubmit={download} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <label className="text-xs text-mist-300">
          Admin token
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
            className="mt-1 h-10 w-full rounded-lg border border-vault-600 bg-vault-850 px-3 text-sm text-parchment-50 focus:border-gold-500 focus:outline-none"
          />
        </label>
        <label className="text-xs text-mist-300">
          Table
          <select
            value={table}
            onChange={(e) => setTable(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-vault-600 bg-vault-850 px-2 text-sm text-parchment-50"
          >
            <option value="attempts">attempts</option>
            <option value="guesses">guesses</option>
            <option value="llm_errors">llm_errors</option>
            <option value="sessions">sessions (no passwords)</option>
          </select>
        </label>
        <label className="flex h-10 items-center gap-2 text-xs text-mist-300" title="Exact text for pandas/R; off = safe to open in Excel">
          <input type="checkbox" checked={raw} onChange={(e) => setRaw(e.target.checked)} />
          Raw (for pandas/R)
        </label>
        <button
          type="submit"
          disabled={!token || busy}
          className="h-10 rounded-lg bg-gold-500 px-4 text-sm font-semibold text-vault-950 disabled:opacity-40"
        >
          {busy ? 'Exporting…' : 'Download CSV'}
        </button>
      </form>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? 'text-jade-400' : 'text-ember-400'}`}>{msg.text}</p>}
    </details>
  );
}

export default function Results() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.stats().then(setStats, (err) => setError(err.message));
  }, []);

  return (
    <main className="mx-auto min-h-dvh max-w-6xl space-y-6 px-4 py-6">
      <header className="flex items-center justify-between">
        <button type="button" onClick={() => navigate('/')} className="font-display text-xl font-bold text-gold-300">
          Dwarpal
        </button>
        <NavLinks current="/results" />
      </header>

      <div className="pt-4">
        <h1 className="font-display text-4xl font-bold text-gold-300">Results</h1>
        <p className="mt-2 max-w-2xl text-sm text-mist-300">
          How players attacked the gatekeeper, and which defenses held. Aggregated and anonymous: no messages are shown
          here.
          {stats && ` Updated ${new Date(stats.generatedAt).toLocaleString()}.`}
        </p>
      </div>

      {error && <p role="alert" className="text-ember-400">{error}</p>}
      {!stats && !error && <p className="text-mist-300" aria-busy="true">Gathering the records…</p>}

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Players" value={stats.totals.players} sub={`${stats.totals.sessions} sessions started`} />
            <StatTile label="Messages" value={stats.totals.attempts} />
            <StatTile
              label="Opened all 5"
              value={stats.totals.completed}
              sub={stats.totals.players ? `${pct(stats.totals.completed / stats.totals.players)} of players` : null}
            />
            <StatTile
              label="Classified"
              value={pct(stats.totals.attempts ? stats.totals.classified / stats.totals.attempts : NaN)}
              sub={`${stats.totals.classified} of ${stats.totals.attempts} messages`}
            />
          </div>

          <AttemptsAndClears levels={stats.levels} />
          <BlockedBreakdown levels={stats.levels} />
          <Heatmap heatmap={stats.heatmap} levels={stats.levels} />
          <FalsePositives items={stats.falsePositives} />
          <ResearcherExport />
        </>
      )}
    </main>
  );
}
