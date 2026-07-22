# Web Search — How It Works

## Overview

When the user toggles the globe icon and sends a message, the app performs a
web search via **Tavily**, feeds the results into an **NVIDIA NIM** model (via
OpenAI-compatible tool/function calling), and renders the model's answer with
inline citation markers that link back to the sources.

```
┌──────────┐   searchArmed=true    ┌──────────────────┐
│  InputBar │ ──────────────────→  │  ChatListScreen   │
│  (globe)  │                      │  (handleSend)     │
└──────────┘                      └────────┬─────────┘
                                           │ POST /functions/v1/chat
                                           │ body: { chatId, message, searchRequested: true }
                                           ▼
                                  ┌──────────────────┐
                                  │  Supabase Edge    │
                                  │  Function (chat)  │
                                  └────────┬─────────┘
                                           │
                              ┌────────────┴────────────┐
                              │                         │
                              ▼                         ▼
                     ┌─────────────────┐      ┌──────────────────┐
                     │  NVIDIA NIM      │      │  Tavily Search   │
                     │  (first call     │      │  (web search)    │
                     │   with tools)    │      │                  │
                     └────────┬────────┘      └────────┬─────────┘
                              │                         │
                              │  tool_calls[0]          │ search results
                              │  = search_web(query)    │ (title, url, content)
                              ▼                         │
                     ┌─────────────────┐                │
                     │  NVIDIA NIM     │◄───────────────┘
                     │  (second call   │
                     │   with results) │
                     └────────┬────────┘
                              │
                              │ content with [1], [2] markers
                              ▼
                     ┌──────────────────┐
                     │  MessageBubble    │
                     │  (parseCitations) │
                     │  → superscript ¹  │
                     │  → tap popup      │
                     └──────────────────┘
```

---

## 1. User Arms Search (Client — `components/InputBar.tsx`)

The globe icon in the input bar acts as a one-shot toggle.

```
Press Globe → onToggleSearch() → searchArmed flips true
Globe icon fills with accent color to indicate "armed for next message"
```

Key detail: `searchArmed` resets to `false` after the **next sent message**,
regardless of outcome. It's one-search-per-press, not a sticky mode.

**Files:**
- `components/InputBar.tsx:79-89` — Globe button, accent fill when armed
- `app/(chat)/index.tsx:89-95` — `handleToggleSearch` toggles state + ref

---

## 2. Message Is Sent (Client — `app/(chat)/index.tsx:99-172`)

When the user presses Send:

1. A user message row is optimistically inserted into local state
2. An empty assistant placeholder row is inserted (shows "Thinking…")
3. A POST request goes to the Supabase Edge Function:

```js
body = { chatId, message: "what is...", searchRequested: true }
```

The `searchRequested` boolean is the only signal the backend needs.

---

## 3. Edge Function Orchestrates (Server — `supabase/functions/chat/index.ts`)

### 3a. Auth & Rate Limit

- Extracts the user from the `Authorization` Bearer token via Supabase Auth
- Checks in-memory rate limit: **30 requests per minute per user** (line 50-62)

### 3b. Model Selection & Auto-Swap

```ts
const selectedModel = modelOverride || chat?.model || DEFAULT_MODEL;
const selectedSupportsTools = TOOLS_CAPABLE_SET.has(selectedModel);
```

If the user's selected model **does not support tool calling** (checked against a
hardcoded list of 9 tool-capable models), the function **auto-swaps** to
`meta/llama-3.1-8b-instruct` for that request only. The original model is
preserved in the chat's `model` column — the swap is transparent and
one-request.

9 tool-capable models (from `TOOLS_CAPABLE_MODELS` at line 19-29):
- `meta/llama-3.1-70b-instruct`, `meta/llama-3.1-8b-instruct`
- `mistralai/mistral-small-4-119b-2603`
- `nvidia/llama-3.3-nemotron-super-49b-v1`
- `nvidia/nemotron-3-ultra-550b-a55b`
- `nvidia/nemotron-nano-12b-v2-vl`
- `openai/gpt-oss-120b`, `openai/gpt-oss-20b`
- `poolside/laguna-xs-2.1`

### 3c. Message History Assembly

```ts
const history = await supabase.from('messages').select('role, content')
  .eq('chat_id', chatId).order('created_at');
const msgs = (history || []).map(m => ({ role: m.role, content: m.content }));
```

Only `role` and `content` are sent. The array is ordered by `created_at` (oldest
first), producing a clean alternating user/assistant conversation history.

A system message with the current date is prepended **first** (line 258):

```ts
const dateMsg = {
  role: 'system',
  content: `Internal note — today's actual date is ${today}. This is only for your
private reference... Never state, hint at, or call attention to this date...`
};
const msgsWithDate = [dateMsg, ...msgs];
```

This gives the model temporal context without leaking it into replies.

### 3d. Search Flow — Two NVIDIA Calls

If `searchRequested === true`, the function calls `runSearchFlow()`:

**Call 1 — Model decides to search (line 154):**

```
POST https://integrate.api.nvidia.com/v1/chat/completions
{
  model: "meta/llama-3.1-8b-instruct",
  messages: [
    { role: "system", content: "Internal note — today's date..." },
    { role: "user", content: "What is the capital of France?" },
    ...
  ],
  tools: [{
    type: "function",
    function: {
      name: "search_web",
      description: "Search the web for current information.",
      parameters: { ... }
    }
  }]
}
```

The model either:
- Returns a `tool_calls[0].function.name === "search_web"` with a `query`
  argument → continues to Tavily
- Returns plain text content → falls through to the normal (non-search) path

**Tavily search (line 177-181):**

```ts
fetch(TAVILY_ENDPOINT, {
  method: 'POST',
  body: { api_key: tavilyApiKey, query, search_depth: 'basic', max_results: 5 }
});
```

Returns up to 5 results. Each result has `title`, `url`, and `content` (snippet).

**Search results formatted for the model (line 187-189):**

```
[1] Title
URL
Content snippet...

[2] Title
URL
Content snippet...
```

**Call 2 — Model answers with search results (line 201):**

A second NVIDIA call sends the conversation history + the tool call + the search
results + a citation instruction. No tools are attached this time — the model
is expected to produce a natural-language answer with `[N]` inline citations:

```
messages: [
  ...history (with date system msg),
  { role: "assistant", content: null, tool_calls: [...] },
  { role: "tool", tool_call_id: tc.id,
    content: "[1] The Eiffel Tower\nhttps://...\nThe Eiffel Tower is 330m tall..." },
  { role: "system", content: "CRITICAL: You MUST cite sources inline
    using bracketed numbers. Write [1] after a fact from the first source..." }
]
```

The model's output looks like:

> The capital of France is Paris[1]. It has a population of 2.1 million[2].

### 3e. Response Format

```json
{
  "content": "The capital of France is Paris[1]. It has a population of 2.1 million[2].",
  "usedSearch": true,
  "sources": [
    { "title": "Paris - Wikipedia", "url": "https://en.wikipedia.org/wiki/Paris" },
    { "title": "France Population", "url": "https://worldpopulationreview.com/countries/france" }
  ],
  "answeredByModel": "meta/llama-3.1-8b-instruct"
}
```

The response is also saved to the `messages` table with `used_web_search: true`
and the `sources` JSONB array.

---

## 4. Client Renders Citations (Client — `components/MessageBubble.tsx`)

### 4a. Content Parsing

`parseCitations(content)` runs a regex `\[\s*(\d+)\s*\]` over the content string,
splitting it into an array of segments:

```
[ { type: 'text', text: 'The capital of France is Paris' },
  { type: 'citation', index: 1 },
  { type: 'text', text: '. It has a population of 2.1 million' },
  { type: 'citation', index: 2 },
  { type: 'text', text: '.' } ]
```

### 4b. Rendering

- **Text segments** → plain `<Text>` inside the parent body `<Text>`
- **Citation segments** → tappable `<Text>` styled as an orange superscript
  number (`fontSize: 12, lineHeight: 16` against the body's `fontSize: 16,
  lineHeight: 26`, giving a raised appearance)

```tsx
<Text style={[sr.citationMark, { color: colors.accent }]}
      onPress={(e) => { ... setPopup({ index, x: pageX, y: pageY }) }}>
  {seg.index}
</Text>
```

Only messages with `sources.length > 0` trigger citation parsing. Normal
assistant messages render as plain text with no citation logic.

### 4c. Floating Popup (Modal)

Tapping a citation number opens a `Modal` containing:

- A full-screen transparent `Pressable` backdrop (tap to dismiss)
- An `Animated.View` positioned near the tap coordinates with a 150ms
  fade+scale entry animation
- Inside: a card (`width: 260`) with:
  - **Favicon** (20×20, via `https://www.google.com/s2/favicons?domain=...`)
  - **Domain name** (muted, 12px)
  - **Article title** (primary color, 13px, 2-line max)
  - The whole card is tappable → opens the source URL via `Linking.openURL`

Tapping the **same citation number again** dismisses the popup. Tapping outside
also dismisses it.

### 4d. Answered-By Label

Below the message body, a small italic line shows:

```
Answered using Llama 3.1 8B (web search)
```

This appears when the model was auto-swapped (`answeredByModel !== chatModel`)
or when `webSearch` is true without a swap.

---

## Key Design Decisions

1. **One-shot toggle, not sticky** — The globe arms search for the *next*
   message only. After that message is sent, `searchArmed` resets to `false`.
   This prevents accidental repeated searches and saves API costs.

2. **Auto-swap to tool-capable model** — Most models in the catalog don't
   support tool calling. The function transparently upgrades to
   `meta/llama-3.1-8b-instruct` when search is requested and the user's model
   can't handle tools. The user's original model selection is preserved in the
   chat settings.

3. **Two NVIDIA calls, not one** — The first call gives the model the
   opportunity to decide whether to search. If it does, the search results are
   fed back in a second call. This is the standard ReAct / tool-use pattern and
   costs two model invocations per search.

4. **Citations live in the text, not in a separate block** — The system prompt
   explicitly instructs the model to place `[1]`, `[2]` markers inline after
   specific claims. The client parses these out of the content string rather
   than relying on a separate `sources` field for rendering. The `sources` array
   is used only by the popup for title/URL lookup.

5. **No tools attached when search not requested** — The `tools` array is only
   added to the NVIDIA request body when `searchRequested === true`. Normal
   messages are cheaper and faster since they don't carry the tool definition
   overhead and don't risk the model hallucinating tool calls.

---

## Files Involved

| File | Role |
|---|---|
| `components/InputBar.tsx` | Globe button, toggles `searchArmed` |
| `app/(chat)/index.tsx` | Sends `searchRequested: true` in body, stores response + sources in state |
| `supabase/functions/chat/index.ts` | Orchestrates auth, rate limit, model swap, Tavily search, dual NVIDIA calls |
| `components/MessageBubble.tsx` | Parses `[N]` markers, renders superscript citations, floating popup |
| `lib/types.ts` | `Source {title, url}`, `Message {sources, used_web_search}` |
| `lib/models.ts` | `Model.supportsTools` flag, `TOOLS_CAPABLE_MODELS` list synced from catalog |
