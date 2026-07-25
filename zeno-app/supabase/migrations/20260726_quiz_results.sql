create table if not exists quiz_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  score int not null,
  total int not null,
  surah int,
  created_at timestamptz default now()
);

alter table quiz_results enable row level security;

create policy "Users can view their own quiz results"
  on quiz_results for select
  using (auth.uid() = user_id);

create policy "Users can insert their own quiz results"
  on quiz_results for insert
  with check (auth.uid() = user_id);
