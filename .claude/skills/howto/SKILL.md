---
name: howto
description: List the App Factory slash commands and answer "how do I..." questions about building, shipping, launching and maintaining this app, in plain language.
argument-hint: "[question]"
---

The owner is a beginner. Answer in plain, short language.

If there is a question ($ARGUMENTS), answer it from `docs/GUIDE.md` (and `docs/OPERATIONS.md` for details),
and end with the slash command to use. If there is no question, show this list:

| Command | What it does |
| --- | --- |
| `/dev` | Start the app on this computer (http://localhost:3000) |
| `/ship [what changed]` | Check, save and send your change for review; get a preview link |
| `/release [PR number]` | Put a reviewed change live (only if checks are green and live keys are ready) |
| `/health` | Is everything OK? Production, backups, pull requests, what to do next |
| `/checkup` | Is this computer ready? |
| `/new-app <name>` | Start a new app (run in the app-factory folder) |
| `/launch [email]` | Put this app on the internet, once |
| `/keys` | Which keys (Razorpay, LiveKit, Google...) this app needs and where they are set |
| `/integrate <service>` | Add payments, video calls, Google sign-in, Firebase, file storage, SMS... |
| `/db-change <what>` | Change the database tables safely |
| `/fix-checks` | Fix a red ✗ on a pull request |
| `/diagnose` | Something is broken: find out why |
| `/backup` | Back up the production database now |
| `/restore` | Put the database back to an earlier backup (step by step) |
| `/rollback` | Undo the last release |
| `/major-upgrade <package>` | Do a big package upgrade (e.g. Next.js 17) carefully |
| `/kit-update` | Get the newest version of these tools into this app |
