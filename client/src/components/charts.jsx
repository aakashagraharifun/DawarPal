import { useRef, useState } from 'react';

// Dark-surface chart tokens. Categorical steps are the validated dark-mode slots
// (checked against the #12101b surface: CVD ΔE ≥ 8.4, contrast ≥ 3:1).
export const SERIES = {
  none: '#77708f', // neutral: "not blocked"
  input_filter: '#3987e5',
  output_check: '#d95926',
  judge: '#199e70',
  judge_error: '#c98500',
};
export const PRIMARY = '#3987e5';

// Sequential blue, dark → light (near-zero recedes into the dark surface).
const RAMP = ['#0d366b', '#104281', '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef', '#9ec5f4', '#b7d3f6', '#cde2fb'];
const FIRST_LIGHT_STEP = 8; // from here on, cells need dark ink

export function rampColor(t) {
  const i = Math.round(Math.min(1, Math.max(0, t)) * (RAMP.length - 1));
  return { bg: RAMP[i], ink: i >= FIRST_LIGHT_STEP ? '#0a0910' : '#f7f1e3' };
}
export const RAMP_GRADIENT = `linear-gradient(90deg, ${RAMP.join(', ')})`;

export function niceMax(v) {
  if (!(v > 0)) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * pow) return m * pow;
  return 10 * pow;
}

export const pct = (x, digits = 0) => (Number.isFinite(x) ? `${(x * 100).toFixed(digits)}%` : '—');

// Hover/focus tooltip scoped to one chart. Marks spread `bind(content)`.
export function useTooltip() {
  const ref = useRef(null);
  const [tip, setTip] = useState(null);

  function show(e, content) {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const pointer = e.type.startsWith('pointer') || e.type.startsWith('mouse');
    const r = e.currentTarget.getBoundingClientRect();
    const x = pointer ? e.clientX - box.left : r.left + r.width / 2 - box.left;
    const y = pointer ? e.clientY - box.top : r.top - box.top;
    setTip({ x: Math.min(Math.max(x, 90), box.width - 90), y, content });
  }
  const hide = () => setTip(null);
  const bind = (content, label) => ({
    tabIndex: 0,
    'aria-label': label,
    onPointerEnter: (e) => show(e, content),
    onPointerMove: (e) => show(e, content),
    onPointerLeave: hide,
    onFocus: (e) => show(e, content),
    onBlur: hide,
  });
  const el = tip && (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[calc(100%+12px)] whitespace-nowrap rounded-lg border border-vault-600 bg-vault-950/95 px-3 py-2 text-xs leading-relaxed text-parchment-50 shadow-xl"
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.content}
    </div>
  );
  return { ref, bind, el };
}

export function ChartCard({ title, subtitle, legend, table, note, children }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className="rounded-2xl border border-vault-700/70 bg-vault-900/70 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg text-gold-300">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-mist-300">{subtitle}</p>}
        </div>
        {table && (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-pressed={showTable}
            className="shrink-0 rounded-lg border border-vault-600 px-2.5 py-1 text-xs text-mist-300 hover:border-gold-500 hover:text-parchment-50"
          >
            {showTable ? 'Show chart' : 'Show table'}
          </button>
        )}
      </div>
      {legend && !showTable && <div className="mt-3">{legend}</div>}
      <div className="mt-4">{showTable ? table : children}</div>
      {note && <p className="mt-4 text-xs leading-relaxed text-mist-500">{note}</p>}
    </section>
  );
}

export function Legend({ items }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-parchment-200">
      {items.map((it) => (
        <li key={it.key} className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: it.color }} />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

export function DataTable({ columns, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wider text-mist-300">
          <tr>
            {columns.map((c, i) => (
              <th key={c} scope="col" className={`border-b border-vault-700 px-2 py-2 ${i ? 'text-right' : ''}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="border-b border-vault-800 last:border-0">
              {r.map((cell, i) => (
                <td key={i} className={`px-2 py-1.5 ${i ? 'text-right tabular-nums' : 'text-parchment-200'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Single-series vertical bars with a recessive grid.
export function VerticalBars({ items, max, formatTick, integerTicks = false, color = PRIMARY }) {
  const { ref, bind, el } = useTooltip();
  // Count axes only label whole numbers (no "0, 1, 1" when max is 1).
  const ticks = [0, max / 2, max].filter((t) => !integerTicks || Number.isInteger(t));
  return (
    <div ref={ref} className="relative">
      <div className="relative ml-10 mt-6 h-48">
        {ticks.map((t) => (
          <div key={t} className="absolute inset-x-0 border-t border-vault-700/50" style={{ bottom: `${(t / max) * 100}%` }}>
            <span className="absolute -left-10 w-8 -translate-y-1/2 text-right text-[11px] tabular-nums text-mist-500">
              {formatTick(t)}
            </span>
          </div>
        ))}
        <div className="relative flex h-full items-end gap-3 px-2 sm:gap-6">
          {items.map((it) => (
            <div
              key={it.label}
              className="group relative flex h-full flex-1 items-end justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
              {...bind(it.tip, `${it.label}: ${it.display}`)}
            >
              <div
                className="relative w-full max-w-12 rounded-t-[4px] transition-opacity group-hover:opacity-85"
                style={{ height: `${(it.value / max) * 100}%`, minHeight: it.value > 0 ? 2 : 0, background: color }}
              >
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs tabular-nums text-parchment-200">
                  {it.display}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="ml-10 mt-2 flex gap-3 px-2 sm:gap-6">
        {items.map((it) => (
          <span key={it.label} className="flex-1 text-center text-xs text-mist-300">
            {it.label}
          </span>
        ))}
      </div>
      {el}
    </div>
  );
}

// Horizontal 100% stacked bars: one row per group, 2px surface gaps between segments.
export function StackedRows({ rows, keys, colors, labels }) {
  const { ref, bind, el } = useTooltip();
  return (
    <div ref={ref} className="relative space-y-2.5">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-xs text-mist-300">{row.label}</span>
          <div className="flex h-7 flex-1 gap-[2px]">
            {row.total === 0 ? (
              <div className="flex-1 rounded-[4px] border border-dashed border-vault-600" aria-label={`${row.label}: no data`} />
            ) : (
              keys
                .filter((k) => row.counts[k] > 0)
                .map((k, i, shown) => (
                  <div
                    key={k}
                    className={`h-full outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-gold-400 ${
                      i === 0 ? 'rounded-l-[4px]' : ''
                    } ${i === shown.length - 1 ? 'rounded-r-[4px]' : ''}`}
                    style={{ width: `${(row.counts[k] / row.total) * 100}%`, background: colors[k] }}
                    {...bind(
                      <>
                        <div className="font-medium">{row.label} · {labels[k]}</div>
                        <div className="text-mist-300">
                          {row.counts[k]} of {row.total} ({pct(row.counts[k] / row.total)})
                        </div>
                      </>,
                      `${row.label}, ${labels[k]}: ${row.counts[k]} of ${row.total}`,
                    )}
                  />
                ))
            )}
          </div>
          <span className="w-12 shrink-0 text-right text-xs tabular-nums text-mist-500">n={row.total}</span>
        </div>
      ))}
      {el}
    </div>
  );
}
