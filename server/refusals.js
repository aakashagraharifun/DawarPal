// What the player sees when a defense blocks. Generic on purpose: never derived from the
// bot reply or the judge's reason. Keyed by blocked_by.

export const REFUSALS = {
  input_filter:
    'Dwarpal raises a hand. "Those words are forbidden at this gate. Speak differently, traveler."',
  output_check:
    'Dwarpal begins to answer, then falls silent. "No. Some things must stay behind the gate."',
  judge:
    'A watcher whispers in Dwarpal\'s ear. "I nearly said too much. Ask me something else."',
  judge_error:
    'Dwarpal hesitates. "The watcher is silent, so I will say nothing this time. Try again."',
};
