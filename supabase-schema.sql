-- 在 Supabase SQL Editor 中执行一次。
create table if not exists public.practice_sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  time text,
  category text,
  focus text,
  scenario text,
  question text,
  first_transcript text,
  first_feedback jsonb,
  second_transcript text,
  second_feedback jsonb,
  audio_path text,
  created_at timestamptz not null default now()
);

alter table public.practice_sessions enable row level security;
drop policy if exists "users can read own practice sessions" on public.practice_sessions;
drop policy if exists "users can insert own practice sessions" on public.practice_sessions;
drop policy if exists "users can update own practice sessions" on public.practice_sessions;
drop policy if exists "users can delete own practice sessions" on public.practice_sessions;
create policy "users can read own practice sessions" on public.practice_sessions for select using (auth.uid() = user_id);
create policy "users can insert own practice sessions" on public.practice_sessions for insert with check (auth.uid() = user_id);
create policy "users can update own practice sessions" on public.practice_sessions for update using (auth.uid() = user_id);
create policy "users can delete own practice sessions" on public.practice_sessions for delete using (auth.uid() = user_id);

insert into storage.buckets (id, name, public) values ('practice-audio', 'practice-audio', false) on conflict (id) do nothing;
drop policy if exists "users can manage own practice audio" on storage.objects;
create policy "users can manage own practice audio" on storage.objects for all to authenticated using (bucket_id = 'practice-audio' and (storage.foldername(name))[1] = (select auth.uid()::text)) with check (bucket_id = 'practice-audio' and (storage.foldername(name))[1] = (select auth.uid()::text));
