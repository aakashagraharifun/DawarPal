import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import DwarpalAvatar from './DwarpalAvatar.jsx';
import { BLOCK_LABELS } from '../defenses.js';

const MAX_CHARS = 1000;

function BlockedBadge({ blockedBy }) {
  return (
    <span className="mb-1.5 inline-flex items-center gap-1 rounded-full border border-ember-500/40 bg-ember-500/10 px-2 py-0.5 text-[11px] font-medium text-ember-400">
      🛡 {BLOCK_LABELS[blockedBy] ?? 'Blocked'}
    </span>
  );
}

function BotBubble({ children, blockedBy, thinking = false }) {
  return (
    <div className="flex items-end gap-2.5">
      <DwarpalAvatar size={34} thinking={thinking} className="shrink-0" />
      <div
        className={`max-w-[85%] rounded-2xl rounded-bl-sm border px-4 py-2.5 text-[15px] leading-relaxed ${
          blockedBy ? 'border-ember-500/30 bg-vault-800/90' : 'border-vault-600/60 bg-vault-800'
        }`}
      >
        {blockedBy && <BlockedBadge blockedBy={blockedBy} />}
        <div className="whitespace-pre-wrap break-words text-parchment-50">{children}</div>
      </div>
    </div>
  );
}

function UserBubble({ children }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-gold-500/90 px-4 py-2.5 text-[15px] leading-relaxed text-vault-950">
        {children}
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <BotBubble thinking>
      <span className="inline-flex items-center gap-2 text-mist-300">
        Dwarpal is thinking
        <span className="inline-flex gap-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="size-1.5 rounded-full bg-gold-400"
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </span>
      </span>
    </BotBubble>
  );
}

export default function ChatPanel({ levelInfo, messages, sending, error, disabled, cooldown = 0, onSend }) {
  const [draft, setDraft] = useState('');
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, sending]);

  useEffect(() => {
    setDraft('');
  }, [levelInfo?.level]);

  async function submit(e) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || sending || disabled || cooldown > 0) return;
    setDraft('');
    const ok = await onSend(text);
    if (!ok) setDraft(text); // restore so the player can resend
    inputRef.current?.focus();
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <section
      aria-label="Chat with Dwarpal"
      className="flex min-h-[60dvh] flex-col overflow-hidden rounded-2xl border border-vault-700/70 bg-vault-900/70 backdrop-blur lg:h-full lg:min-h-0"
    >
      <header className="flex items-center gap-3 border-b border-vault-700/70 px-4 py-3">
        <DwarpalAvatar size={40} thinking={sending} />
        <div>
          <h1 className="font-display text-lg leading-tight text-gold-300">Dwarpal</h1>
          <p className="text-xs text-mist-300">Keeper of Gate {levelInfo?.level}</p>
        </div>
      </header>

      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto px-4 py-5" aria-live="polite">
        {levelInfo && (
          <BotBubble>
            <span className="italic text-parchment-200">{levelInfo.greeting}</span>
          </BotBubble>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {m.role === 'user' ? (
                <UserBubble>{m.text}</UserBubble>
              ) : (
                <BotBubble blockedBy={m.blockedBy}>{m.text}</BotBubble>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {sending && <Thinking />}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="border-t border-vault-700/70 p-3">
        {error && (
          <p
            role="alert"
            className={`mb-2 rounded-lg px-3 py-2 text-sm ${
              error.busy ? 'bg-gold-500/10 text-gold-300' : 'bg-ember-500/10 text-ember-400'
            }`}
          >
            {error.text}
          </p>
        )}
        <div className="flex items-end gap-2">
          <label htmlFor="chat-input" className="sr-only">
            Message Dwarpal
          </label>
          <textarea
            id="chat-input"
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={MAX_CHARS}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={disabled ? 'The gate is open.' : 'Speak to the gatekeeper…'}
            className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-vault-600 bg-vault-850 px-3.5 py-2.5 text-[15px] text-parchment-50 placeholder:text-mist-500 field-sizing-content focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/30 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending || disabled || cooldown > 0}
            aria-label={cooldown > 0 ? `Send available in ${cooldown} seconds` : 'Send'}
            className="h-11 min-w-16 shrink-0 rounded-xl bg-gold-500 px-4 font-semibold tabular-nums text-vault-950 transition hover:bg-gold-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {cooldown > 0 ? `${cooldown}s` : 'Send'}
          </button>
        </div>
        <p className="mt-1.5 flex justify-between text-[11px] text-mist-500">
          <span>Dwarpal has no memory: each message stands alone.</span>
          {draft.length > MAX_CHARS * 0.8 && (
            <span>
              {draft.length}/{MAX_CHARS}
            </span>
          )}
        </p>
      </form>
    </section>
  );
}
