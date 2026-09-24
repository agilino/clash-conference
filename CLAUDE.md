@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

clash-conference is the programme workspace of one event: an organiser keeps a single Settings record (event
name, CLASH venue name, host email) and a list of talks in a local SQLite file, and publishes each talk to
CLASH — the community app cloned next door in `../clash` — through a Claude Agent SDK run that talks to
CLASH's MCP server.

It is the second repository of task 19 "Build your own MCP" in the mastering-claude-code workshop (Part IV).
Steps 1–13 happen in the participant's CLASH clone (they build `mcp/server.ts`); steps 14–19 happen here:
clone, `git checkout 19-start`, `cp .env.example .env`, `npm install`, `npm run db:migrate`,
`npm run db:seed`, `npm run dev` on port 3001, then they prompt Claude Code to write
`app/api/publish/route.ts` with the `query()` call inside it, publish one talk (it turns `published` and
appears in CLASH) and one with an unknown venue (it turns `failed` with the agent's message). The course
names the route contract, the env vars, the script names, the port, the seed values and the status words
verbatim — changing any of them here breaks the course text. Docs say "your CLASH clone" and
"clash-conference", never a bare "the repo": both repositories have a `19-start` branch.

When `_bmad-output/` is present (BMAD v6 drives the work; the folder is untracked at the moment), it is the
record: `planning-artifacts/` holds the PRD with its addendum (reference prompt, `query()` options), the
`ARCHITECTURE-SPINE.md` whose numbered decisions (AD-n) the code cites in comments, the UX documents and
`epics.md` with every story's acceptance criteria; `implementation-artifacts/` holds one `spec-N-M-*.md` per
story with its review triage, `sprint-status.yaml` (one writer) and `deferred-work.md`. Read a story's ACs
and its spec before changing what it built.

## Commands

- `npm run dev` — Next dev server on port 3001; CLASH runs on 3000 and the two apps run side by side.
- `npm run build`, `npm run lint` (zero warnings is the gate), `npx tsc --noEmit`. The typed route helpers
  (`PageProps<"/talks/[id]/edit">`) come from Next's generated route types, so after adding a route run
  `npm run build` (or `npx next typegen`) before trusting `tsc`.
- Database (Prisma 7, SQLite through the better-sqlite3 adapter; the generated client in
  `lib/generated/prisma` is git-ignored and produced by `postinstall`): `cp .env.example .env`, then
  `npm run db:migrate` (`prisma migrate dev`; run `npx prisma generate` if the client is stale afterwards)
  and `npm run db:seed`. The seed is destructive — it deletes every Talk and Settings row in `./dev.db`, the
  same file the dev server reads — and leaves "CLASH Community Day", venue "Holzmarkt 25", host
  `anna.schmidt@example.com` and three future draft talks. `npm run db:reset` is refused by Prisma 7 when an
  AI agent runs it; use `npx prisma migrate deploy` followed by `npx prisma db seed` instead.
- Tests: `npm test` runs Playwright (Chromium, one worker, no parallelism — every spec shares `dev.db`).
  The global setup reseeds and then asserts the seeded state (`tests/assert-seeded-state.ts`). One file:
  `npx playwright test tests/settings.spec.ts`; one test: `npx playwright test -g "part of the title"`.
  `webServer.reuseExistingServer` is true, so whatever already answers on 3001 gets tested — if another app
  holds the port, `tests/app.spec.ts` fails on the document title instead of passing against it.
- Playwright's loader cannot import the generated Prisma client (CJS/ESM clash). Specs that need the database
  run a small `tsx` script as a child process (`execSync("npx tsx tests/…")`, see `tests/talk-db.ts` and
  `tests/assert-one-settings-row.ts`) or open `dev.db` with better-sqlite3 directly (no type package: one
  `@ts-expect-error` with a reason). Such scripts import the client by relative path
  (`../lib/generated/prisma/client`), because tsx does not apply the `@/` alias.

## Architecture rules that span files

- **Data model** (`prisma/schema.prisma`): `Settings` is one row, upserted by `findFirst` → `update` else
  `create`; `Talk.status` is a `String` holding one of `TALK_STATUS` in `lib/constants.ts`, and
  `asTalkStatus` there is the only string → `TalkStatus` conversion — comparisons use the constants, never
  literals. `Talk.clashId` points into CLASH's database; there is no relation and this app never opens it.
- **One writer per field group.** `app/actions/settings.ts` is the only writer of `Settings`;
  `app/actions/talks.ts` writes only `title`, `description`, `startsAt`, `room` and deletes rows;
  `app/api/publish/route.ts` is the only writer of `status`, `clashId`, `lastMessage`. Nothing else writes.
- **Reads** go through `lib/data/*` (`import "server-only"`), called from async Server Components; no page
  or component holds a query, and row types are the generated Prisma types (no DTO layer). `lib/**` never
  imports `app/**` or `components/**`; a `"use client"` file never imports `@/lib/prisma` or `@/lib/data/*`.
  The root layout is `force-dynamic` because the header reads `Settings` on every render.
- **Forms** share one contract (`lib/form.ts`): a Server Action
  `(prev: FormState, formData: FormData) => Promise<FormState>` validates the raw form data with a zod 4
  schema from `lib/validation.ts` (`z.email()`, not `.string().email()`), returns `fieldErrors` together with
  the typed `values` on a miss — React 19 resets uncontrolled inputs after the action, so each input renders
  `defaultValue` from `{ ...saved, ...state?.values }` — calls `revalidatePath` on success and never
  `redirect`s: the client form toasts (sonner, `Toaster` in the root layout) and navigates. Field errors are
  the only validation surface: `<p id="<name>-error">` linked by `aria-describedby`, `aria-invalid`, focus on
  the first invalid field in reading order, no toast. Forms carry `noValidate` so zod owns every message.
  Microcopy is sentence case with a full stop ("Settings saved.").
- **Dates**: `lib/format.ts` is the only place a date is formatted or turned into a `datetime-local` value;
  the server parses `startsAt` only through zod coercion.
- **UI kit**: shadcn components in `components/ui/` are used as shipped and never edited; add one with
  `npx shadcn@4.21.0 add <name>`. A disabled button always carries a `title`. Never pass `disabled` to
  `SubmitButton` — the spread after `disabled={pending || …}` would override its pending guard.
- **Publish seam** (Epic 3): `lib/clash-agent.ts` is the only importer of `@anthropic-ai/claude-agent-sdk`
  and the only reader of `CLASH_DIR`; `publishTalkToClash` never throws and returns `published` or `failed`.
  The agent is fully isolated, and the course teaches exactly this option set: `tools: []`,
  `settingSources: []`, `strictMcpConfig: true`, `allowedTools` = `mcp__clash__find_venue` +
  `mcp__clash__create_clash`, `permissionMode: "dontAsk"`, `maxTurns: 8`. The route stores what the agent
  answers and decides nothing itself; its guards run 400 body → 404 talk → 400 settings → 409 already
  published → agent, then one conditional `updateMany`. Any change here needs the same change in task 19.
  `serverExternalPackages` in `next.config.ts` keeps the SDK out of the bundle. Credentials come from the
  shell that starts `npm run dev`, never from a file. No Playwright spec may need credentials or a live CLASH.
- **CLASH** (`../clash`, `CLASH_DIR` in `.env`): `mcp/server.ts` offers `list_upcoming_clashes(area?)`,
  `find_venue(query)` and `create_clash(title, description, dateTime ISO, venueId, hostEmail)`. Refusals come
  back as text with `isError: true` and fixed wording ("No CLASH user with email …", "Unknown venue …",
  "dateTime must be an ISO date-time in the future.", "Duplicate: … already exists at …"); "No venue
  matches …" is a normal answer, not an error. The server resolves its `dev.db` relative to its own file,
  so a publish started from here writes CLASH's database: the settings venue name must equal a CLASH venue
  title and the host email a CLASH user (seeded: "Holzmarkt 25", `anna.schmidt@example.com`; seeded users
  log in with password `test`). Never change files in `../clash`; a live publish creates a clash in
  `../clash/dev.db` — delete it afterwards the way `../clash/mcp/smoke.ts` cleans up.

## Conventions

- Commits are small and local, one or a few per story, `<type>(story-N.M): <what>` (`feat`, `fix`, `test`,
  `chore`). Nothing is pushed from an agent session — the repository is published only when Adam says so.
  Every story ships its own spec under `tests/` and leaves the seeded state behind.
- `next dev` rewrites the managed block in `AGENTS.md` (this file's first line keeps pointing at it); commit
  whatever it writes instead of reverting it.
- The `19-start` branch is `main` without `app/api/publish/route.ts` and `lib/clash-agent.ts`, with
  `components/talks/publish-button.tsx` rendering disabled (`title="publish route missing"`, no fetch); the
  SDK dependency and `serverExternalPackages` stay so participants install nothing.
