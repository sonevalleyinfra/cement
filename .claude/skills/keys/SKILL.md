---
name: keys
description: Show which keys (Razorpay, LiveKit, Google, Firebase, S3...) this app needs and where each is set - computer, test keys, live keys, previews, production - and help add missing ones safely.
argument-hint: "[push]"
allowed-tools: Bash(pnpm keys) Bash(pnpm keys push)
---

Help with the key safe (`~/.config/app-factory/`: `test.env` + `test/` for test keys, `prod.env` + `prod/` for live keys).

**Never** read, print or ask for key values. Don't open those files, and don't accept keys pasted in chat
(if the owner pastes a live key, don't use it; advise them to create a new one and delete the pasted one).

- `/keys push`: run `pnpm keys push` (sends this app's keys to Coolify: test → previews, live → production).
- Otherwise run `pnpm keys` and explain the table: which keys are missing where, and why it matters
  (production refuses to release without its required live keys).
- To add a key, give the owner the exact command for **their own terminal** (the input is hidden):
  `pnpm keys set RAZORPAY_KEY_SECRET --test` (or `--live`), or for a JSON file:
  `pnpm keys add-file ~/Downloads/firebase-service-account.json --live`.
  Or they can edit `~/.config/app-factory/test.env` / `prod.env` in their editor (e.g. `code ~/.config/app-factory/test.env`).
- After adding: `/dev` restarts pick up test keys, `/ship` gives previews theirs, `/release` checks production.
