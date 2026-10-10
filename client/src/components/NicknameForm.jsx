import { useState } from 'react';
import { api } from '../api.js';

export default function NicknameForm({ sessionId, onSaved, cta = 'Join the leaderboard' }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { nickname } = await api.setNickname(sessionId, name);
      onSaved?.(nickname);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm">
      <label htmlFor="nickname" className="block text-left text-sm text-mist-300">
        Choose a nickname (3–20 letters, numbers, spaces, _ . -). Don't use your real name.
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="nickname"
          value={name}
          onChange={(e) => setName(e.target.value)}
          minLength={3}
          maxLength={20}
          autoComplete="off"
          placeholder="Nickname"
          className="h-11 min-w-0 flex-1 rounded-xl border border-vault-600 bg-vault-850 px-3.5 text-parchment-50 placeholder:text-mist-500 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/30"
        />
        <button
          type="submit"
          disabled={saving || name.trim().length < 3}
          className="h-11 shrink-0 rounded-xl bg-gold-500 px-4 font-semibold text-vault-950 transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Saving…' : cta}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-left text-sm text-ember-400">
          {error}
        </p>
      )}
    </form>
  );
}
