# Verification Checklist

Pass every box in a phase before starting the next one.

### Phase 0
- [ ] `npx expo start` runs, app loads on emulator with no errors
- [ ] Repo on GitHub, `.gitignore` excludes `node_modules`, `.env`

### Phase 1
- [ ] `profiles`, `chats`, `messages` tables exist
- [ ] RLS enabled on all three
- [ ] `.env` not committed to git

### Phase 2
- [ ] Sign in works
- [ ] Kill and reopen the app → still signed in
- [ ] Sign out clears session, protected screens redirect to sign-in

### Phase 3
- [ ] Sidebar, chat screen, input bar, model picker all render
- [ ] No console errors

### Phase 4
- [ ] New Chat creates a row and navigates to it
- [ ] Sidebar shows only the signed-in user's chats
- [ ] Message send saves to `messages`, persists after app restart
- [ ] Second test account cannot see first account's chats

### Phase 5
- [ ] Message gets a real NVIDIA NIM reply, saved as `role='assistant'`
- [ ] No API key appears in app code, network requests from the device, or the app bundle
- [ ] Edge Function error (bad key, rate limit) shows a clean error in the app, not a crash

### Phase 6
- [ ] Switching model in picker changes provider/model actually used (check Edge Function logs)
- [ ] `chats.model` stores the selection
- [ ] Both NVIDIA and OpenRouter return valid replies

### Phase 7
- [ ] Tokens render incrementally, not all at once
- [ ] Killing the app mid-stream does not leave a corrupted saved message

### Phase 8
- [ ] A time-sensitive/factual question triggers a search call automatically, no toggle involved
- [ ] Sources shown are real URLs
- [ ] A simple question (math, greeting) does not trigger search
- [ ] Search API failure does not crash the chat

### Phase 9
- [ ] Chat titles are meaningful
- [ ] Delete/rename works and reflects in Supabase
- [ ] Loading/error states present, no blank screens

### Regression check — run after every phase
- [ ] Sign in still works
- [ ] Old chats still load with correct history
- [ ] No new console errors
- [ ] Diff for this phase only touches files listed as in-scope for that phase
