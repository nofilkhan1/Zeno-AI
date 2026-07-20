# Architecture

## Stack (fixed — matches existing Expense Tracker project)

```
expo: ~57.0.7
expo-router: ^57.0.7
react: 19.2.3
react-native: 0.86.0
typescript: ~6.0.3

expo-constants: ^57.0.6
expo-file-system: ^57.0.1
expo-linking: ^57.0.3
expo-sharing: ^57.0.6
expo-splash-screen: ^57.0.4
expo-status-bar: ~57.0.1

react-native-reanimated: 4.5.0
react-native-worklets: 0.10.0
react-native-gesture-handler: ~2.32.0
react-native-screens: 4.25.2
react-native-safe-area-context: ~5.7.0
react-native-svg: 15.15.4
lucide-react-native: ^1.25.0

@supabase/supabase-js: ^2.110.7
@react-native-async-storage/async-storage: 2.2.0
react-hook-form: ^7.82.0
@tanstack/react-query: latest
```

`react-native-gifted-charts` is not needed for this app (that's an Expense Tracker dependency) — do not install it.

Model calls are made from a Supabase Edge Function (server-side), never from the app directly. Web search is called from the same Edge Function.

## Model provider — NVIDIA NIM only for now
OpenRouter is **deferred, not built**. Build everything so adding a second provider later is a one-file change (see `lib/models.ts` below), but do not write OpenRouter code in Phase 6. Phase 6 is skipped for now.

## Why calls go through a Supabase Edge Function, not the app directly
NVIDIA NIM key, OpenRouter key, and the search API key must never ship inside the mobile app bundle. Anyone can extract keys from an app binary. The app calls a Supabase Edge Function; the Edge Function holds the keys as secrets and calls the providers.

```
[Expo App] --invoke--> [Supabase Edge Function: chat] --calls--> [NVIDIA NIM or OpenRouter]
                                                        --calls--> [Tavily search, if needed]
[Expo App] <--stream/response-- [Edge Function]
[Edge Function] --writes--> [Supabase Postgres: chats, messages]
```

## Auth
Supabase Auth, email + password. Session stored via `@supabase/supabase-js` with `AsyncStorage` as the storage adapter (this is what makes login persist on the device across app restarts). No magic links, no OAuth — password auth only, for now.

## Database schema (run this exactly, in Supabase SQL editor or via MCP)

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz default now()
);

create table chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text default 'New Chat',
  model text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid references chats(id) on delete cascade not null,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  used_web_search boolean default false,
  sources jsonb,
  created_at timestamptz default now()
);

alter table profiles enable row level security;
alter table chats enable row level security;
alter table messages enable row level security;

create policy "own profile" on profiles for all using (auth.uid() = id);
create policy "own chats" on chats for all using (auth.uid() = user_id);
create policy "own messages" on messages for all using (
  chat_id in (select id from chats where user_id = auth.uid())
);
```

## Model config (fixed list format, edit values only)

```ts
// lib/models.ts
export const MODELS = [
  { id: 'meta/llama-3.3-70b-instruct', provider: 'nvidia', label: 'Llama 3.3 70B (NVIDIA)' },
  // more NVIDIA NIM models can be added here later, same shape
  // OpenRouter entries will be added in a future phase — not now
];
```

NVIDIA NIM uses an OpenAI-compatible `/chat/completions` endpoint at `https://integrate.api.nvidia.com/v1/chat/completions`. The Edge Function calls this directly with the model id and the NVIDIA_NIM_API_KEY secret.

## Web search
Fixed behavior: the model always has a `search_web` tool available (function-calling, not a manual toggle). The Edge Function passes the tool definition to the model. If the model calls it, the Edge Function runs the Tavily search, feeds results back to the model, and the model produces the final answer. No UI toggle. No manual mode. This is the only search behavior — build it this way from Phase 8, do not build a toggle first.

## Folder structure (fixed)

```
/app
  /(auth)/sign-in.tsx
  /(chat)/index.tsx              -- chat list / drawer home
  /(chat)/chat/[chatId].tsx      -- chat screen
  _layout.tsx
/components
  Sidebar.tsx
  ChatScreen.tsx
  MessageBubble.tsx
  ModelPicker.tsx
  InputBar.tsx
/lib
  supabase.ts                    -- client init with AsyncStorage
  models.ts
  types.ts
/supabase
  /functions
    /chat
      index.ts                   -- Edge Function: receives message, calls model, handles search tool, saves to DB
  schema.sql
```

## Env vars

App (`.env`, `EXPO_PUBLIC_` prefix required by Expo, safe to expose):
```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

Supabase Edge Function secrets (set via `supabase secrets set`, never in app code):
```
NVIDIA_NIM_API_KEY=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
TAVILY_API_KEY=<get from tavily.com, see note below>
```

**Web search key — Tavily.** Sign up free at tavily.com (email only, no card needed). Free tier = 1000 search credits/month, plenty for dev and personal use. Copy the API key from the dashboard after signup and set it as the secret above. OpenRouter key is not needed yet — that provider is deferred.

**Security note:** this key is committed to this plan file for your own reference during development. Do not push this file, or `.env`, to a public GitHub repo. Set the actual value only via `supabase secrets set`, never inside app source code.
