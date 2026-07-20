# Overview

Mobile app. Expo + React Native + expo-router. Same stack family as the Expense Tracker app. Not a web app.

## What we are building
1. Chat interface styled like the Claude mobile app (sidebar/drawer with chat list, chat screen, input bar)
2. Model picker — NVIDIA NIM models and OpenRouter models, both callable
3. Supabase — auth, chat storage, message storage
4. Sign in screen — session persists on device after first login
5. Web search — model can search the web and answer using results

## Files in this package
- `01_ARCHITECTURE.md` — stack, schema, folder structure, data flow. Fixed. Not a menu of choices.
- `02_EXECUTION_PLAN.md` — phases, in order. Do not skip or merge phases.
- `03_VERIFICATION.md` — checklist per phase. Must pass before next phase starts.
- `04_PROMPTS.md` — exact prompts to give OpenCode, one per phase, in order. Copy-paste as-is, only fill in the marked blanks.

## Rules
- One phase at a time. No jumping ahead.
- Do not touch files outside the current phase's scope.
- Do not disable Row Level Security.
- Do not put API keys in client code or in `EXPO_PUBLIC_` env vars.
- If a phase breaks something that worked before, fix it before starting the next phase.
