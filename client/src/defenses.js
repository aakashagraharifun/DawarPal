// UI labels for the defenses. Which ones are active per level comes from GET /api/levels.
export const DEFENSES = [
  { key: 'protectedPrompt', short: 'Rules', label: 'Sworn rules', desc: 'Dwarpal has strict orders never to reveal or hint at the password.' },
  { key: 'inputFilter', short: 'Filter', label: 'Input filter', desc: 'Messages containing forbidden words are refused before Dwarpal hears them.' },
  { key: 'outputCheck', short: 'Check', label: 'Output check', desc: 'Replies containing the password (or its reverse) are silenced.' },
  { key: 'judge', short: 'Judge', label: 'Judge', desc: 'A second AI reviews every reply for leaks and hints.' },
];

export const activeDefenses = (levelInfo) => DEFENSES.filter((d) => levelInfo?.[d.key]);

export const BLOCK_LABELS = {
  input_filter: 'Blocked by input filter',
  output_check: 'Blocked by output check',
  judge: 'Blocked by the judge',
  judge_error: 'Blocked: the judge was unavailable',
};
