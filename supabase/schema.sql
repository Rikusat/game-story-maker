-- =====================
-- ユーザープロフィール
-- =====================
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  avatar_url text,
  created_at timestamptz default now() not null
);

-- =====================
-- ルーム
-- =====================
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_id uuid references profiles not null,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  max_players int not null default 4,
  created_at timestamptz default now() not null
);

-- =====================
-- ルーム参加者
-- =====================
create table if not exists room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms on delete cascade not null,
  user_id uuid references profiles not null,
  is_active boolean default true not null,
  joined_at timestamptz default now() not null,
  unique(room_id, user_id)
);

-- =====================
-- ノベルセッション
-- =====================
create table if not exists novel_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms on delete cascade not null unique,
  title text,
  genre text not null default 'fantasy',
  full_text text default '' not null,
  status text not null default 'generating' check (status in ('generating', 'choice', 'completed')),
  current_scene int default 0 not null,
  mbti_result text,
  created_at timestamptz default now() not null
);

-- =====================
-- シーン選択肢
-- =====================
create table if not exists scene_choices (
  id uuid primary key default gen_random_uuid(),
  novel_session_id uuid references novel_sessions on delete cascade not null,
  scene_number int not null,
  story_segment text not null,
  choice_a text not null,
  choice_b text not null,
  mbti_dimension text not null check (mbti_dimension in ('EI', 'SN', 'TF', 'JP')),
  choice_a_type text not null,
  choice_b_type text not null,
  winning_choice text check (winning_choice in ('A', 'B')),
  vote_deadline timestamptz,
  created_at timestamptz default now() not null
);

-- =====================
-- 投票
-- =====================
create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  scene_choice_id uuid references scene_choices on delete cascade not null,
  room_id uuid references rooms not null,
  user_id uuid references profiles not null,
  choice text not null check (choice in ('A', 'B')),
  created_at timestamptz default now() not null,
  unique(scene_choice_id, user_id)
);

-- =====================
-- 保存ノベル
-- =====================
create table if not exists saved_novels (
  id uuid primary key default gen_random_uuid(),
  novel_session_id uuid references novel_sessions not null,
  user_id uuid references profiles not null,
  title text not null,
  saved_at timestamptz default now() not null,
  unique(novel_session_id, user_id)
);

-- =====================
-- RLS 有効化
-- =====================
alter table profiles enable row level security;
alter table rooms enable row level security;
alter table room_players enable row level security;
alter table novel_sessions enable row level security;
alter table scene_choices enable row level security;
alter table votes enable row level security;
alter table saved_novels enable row level security;

-- profiles
create policy "profiles_select" on profiles for select using (true);
create policy "profiles_insert" on profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on profiles for update using (auth.uid() = id);

-- rooms
create policy "rooms_select" on rooms for select using (true);
create policy "rooms_insert" on rooms for insert with check (auth.uid() = host_id);
create policy "rooms_update" on rooms for update using (true);

-- room_players
create policy "room_players_select" on room_players for select using (true);
create policy "room_players_insert" on room_players for insert with check (auth.uid() = user_id);
create policy "room_players_update" on room_players for update using (auth.uid() = user_id);

-- novel_sessions
create policy "novel_sessions_select" on novel_sessions for select using (true);
create policy "novel_sessions_insert" on novel_sessions for insert with check (true);
create policy "novel_sessions_update" on novel_sessions for update using (true);

-- scene_choices
create policy "scene_choices_select" on scene_choices for select using (true);
create policy "scene_choices_insert" on scene_choices for insert with check (true);
create policy "scene_choices_update" on scene_choices for update using (true);

-- votes
create policy "votes_select" on votes for select using (true);
create policy "votes_insert" on votes for insert with check (auth.uid() = user_id);

-- saved_novels
create policy "saved_novels_select" on saved_novels for select using (auth.uid() = user_id);
create policy "saved_novels_insert" on saved_novels for insert with check (auth.uid() = user_id);
create policy "saved_novels_delete" on saved_novels for delete using (auth.uid() = user_id);

-- =====================
-- Realtime 有効化
-- =====================
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table room_players;
alter publication supabase_realtime add table novel_sessions;
alter publication supabase_realtime add table scene_choices;
alter publication supabase_realtime add table votes;

-- =====================
-- 新規ユーザー自動プロフィール作成
-- =====================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================
-- Migration: 17ページ構成対応
-- =====================

-- novel_sessions: current_scene → current_page
alter table novel_sessions rename column current_scene to current_page;

-- novel_sessions: status に 'reading' を追加
alter table novel_sessions drop constraint if exists novel_sessions_status_check;
alter table novel_sessions add constraint novel_sessions_status_check
  check (status in ('generating', 'reading', 'choice', 'completed'));

-- novel_sessions: mbti_result 削除
alter table novel_sessions drop column if exists mbti_result;

-- scene_choices: MBTI列削除
alter table scene_choices drop column if exists mbti_dimension;
alter table scene_choices drop column if exists choice_a_type;
alter table scene_choices drop column if exists choice_b_type;

-- scene_choices: page_number追加
alter table scene_choices add column if not exists page_number int not null default 0;

-- scene_choices: choice_a/choice_b を nullable に（テキストページは null）
alter table scene_choices alter column choice_a drop not null;
alter table scene_choices alter column choice_b drop not null;

-- room_players: 「次へ」ボタン同期用カラム
alter table room_players add column if not exists ready_page int default null;

-- room_players: ボットプレイヤー識別カラム
alter table room_players add column if not exists is_bot boolean not null default false;
