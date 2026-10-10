-- Dwarpal schema. Run once in the Supabase SQL editor (safe to re-run).
--
-- Access model: the browser NEVER talks to Supabase. Only the server does, using the
-- service-role/secret key. RLS is enabled with no policies and anon/authenticated
-- privileges are revoked, so a leaked anon key can read nothing (incl. passwords).

-- ---------------------------------------------------------------- sessions
create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  nickname      text,
  created_at    timestamptz not null default now(),
  passwords     jsonb not null,                       -- {"1":"...",...,"5":"..."} server-only
  current_level int not null default 1 check (current_level between 1 and 5),
  completed_at  timestamptz
);

-- ---------------------------------------------------------------- attempts
create table if not exists public.attempts (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.sessions(id) on delete cascade,
  level            int not null check (level between 1 and 5),
  created_at       timestamptz not null default now(),
  user_message     text not null,
  bot_reply        text,              -- null when input-filtered (bot never called)
  shown_reply      text not null,     -- what the player actually saw
  blocked_by       text check (blocked_by in ('input_filter', 'output_check', 'judge', 'judge_error')),
  judge_leak       boolean,
  judge_reason     text,              -- may mention the password: never sent to client
  bot_model        text,              -- null when input-filtered
  judge_model      text,
  latency_ms       int,
  led_to_win       boolean not null default false,
  attack_category  text,              -- filled offline (scripts/classify.js)
  attack_secondary text,              -- filled offline
  offline_leak     boolean            -- filled offline
);

create index if not exists attempts_session_level_idx
  on public.attempts (session_id, level, created_at desc);
create index if not exists attempts_level_idx on public.attempts (level);
create index if not exists attempts_unclassified_idx
  on public.attempts (created_at) where attack_category is null;

-- ---------------------------------------------------------------- guesses
create table if not exists public.guesses (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  level      int not null check (level between 1 and 5),
  guess      text not null,
  correct    boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists guesses_session_idx on public.guesses (session_id, level);

-- ---------------------------------------------------------------- llm_errors
-- Requests that failed (rate limited / LLM error). NOT attempts: no defense result exists.
create table if not exists public.llm_errors (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid references public.sessions(id) on delete cascade,
  level        int,
  kind         text not null check (kind in ('busy', 'llm_error')),
  detail       text,
  user_message text,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- complete_level
-- Atomically: mark the most recent attempt on this level as led_to_win, then advance.
-- Idempotent: if the session is no longer on p_level (double-submit), nothing changes.
create or replace function public.complete_level(p_session_id uuid, p_level int, p_max_level int)
returns table (new_level int, completed boolean)
language plpgsql
as $$
declare
  s public.sessions%rowtype;
begin
  select * into s from public.sessions where id = p_session_id for update;
  if not found then
    raise exception 'session % not found', p_session_id;
  end if;

  if s.current_level = p_level and s.completed_at is null then
    update public.attempts a
       set led_to_win = true
     where a.id = (
       select a2.id from public.attempts a2
        where a2.session_id = p_session_id and a2.level = p_level
        order by a2.created_at desc, a2.id desc
        limit 1
     );

    if p_level >= p_max_level then
      update public.sessions set completed_at = now() where id = p_session_id
      returning * into s;
    else
      update public.sessions set current_level = p_level + 1 where id = p_session_id
      returning * into s;
    end if;
  end if;

  return query select s.current_level, s.completed_at is not null;
end;
$$;

-- ---------------------------------------------------------------- lock down
alter table public.sessions   enable row level security;
alter table public.attempts   enable row level security;
alter table public.guesses    enable row level security;
alter table public.llm_errors enable row level security;

revoke all on public.sessions, public.attempts, public.guesses, public.llm_errors
  from anon, authenticated;
revoke execute on function public.complete_level(uuid, int, int) from public, anon, authenticated;
grant  execute on function public.complete_level(uuid, int, int) to service_role;
