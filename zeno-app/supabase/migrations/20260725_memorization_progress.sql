create table if not exists memorization_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  surah int not null,
  ayah int not null,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'memorized')),
  last_reviewed_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, surah, ayah)
);

alter table memorization_progress enable row level security;

create policy "Users can view their own progress"
  on memorization_progress for select
  using (auth.uid() = user_id);

create policy "Users can insert their own progress"
  on memorization_progress for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own progress"
  on memorization_progress for update
  using (auth.uid() = user_id);
