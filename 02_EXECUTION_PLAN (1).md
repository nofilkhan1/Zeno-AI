# Execution Plan

Phases run in order. Each phase = one prompt to OpenCode from `04_PROMPTS.md`. Verify with `03_VERIFICATION.md` before starting the next phase.

### Phase 0 — Project init
New Expo project, TypeScript, expo-router. Push to a new GitHub repo, separate from Expense Tracker. No Supabase, no models yet.

### Phase 1 — Supabase project + schema
Create Supabase project. Run `schema.sql` from `01_ARCHITECTURE.md`. Confirm RLS is on. Add `.env` with the two `EXPO_PUBLIC_` vars. Install `@supabase/supabase-js`, `@react-native-async-storage/async-storage`, `@tanstack/react-query`.

### Phase 2 — Auth screen + session persistence
Sign-in screen (email + password) using Supabase Auth. Supabase client configured with AsyncStorage so session survives app restart. Protected routes redirect to sign-in when no session.

### Phase 3 — UI shell
Drawer/sidebar with chat list (dummy data), chat screen with message list + input bar, model picker dropdown (dummy list). No backend writes yet.

### Phase 4 — Chat CRUD in Supabase
"New Chat" creates a row in `chats`. Sidebar lists real chats for the signed-in user. Sending a message saves a row in `messages` (role='user' only, no AI reply yet). Opening a chat loads its message history.

### Phase 5 — Supabase Edge Function + first model
Create the `chat` Edge Function. Wire it to NVIDIA NIM only, one hardcoded model. App calls the Edge Function via `supabase.functions.invoke`. Reply is saved as `role='assistant'` and rendered. No streaming yet.

### Phase 6 — SKIPPED for now
OpenRouter integration is deferred. Do not build it. `lib/models.ts` already supports adding a second provider later without touching other files, when you're ready.

### Phase 7 — Streaming
Edge Function streams tokens back. App renders tokens as they arrive.

### Phase 8 — Web search via tool-calling
Edge Function gives the model a `search_web` tool backed by Tavily. Model decides when to call it. Results are fed back to the model for the final answer. Save `used_web_search` and `sources` on the message. Show sources in the message bubble when present. No manual toggle — this is automatic from the start.

### Phase 9 — Polish
Auto-generate chat titles from first message. Delete/rename chat. Loading and error states. Basic rate limiting on the Edge Function.
