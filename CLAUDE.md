@AGENTS.md

# CLAUDE.md

clash-conference is the programme workspace of one event: one Settings record and a list of talks in a
local SQLite file. Next 16, Prisma 7, zod 4, shadcn, Playwright. It runs alone on localhost:3001, no login.

## Commands
- `npm run dev` starts it on port 3001. `npm run setup` prepares .env, migrations, seed and the test browser.
- `npm test` runs Playwright with one worker. It reseeds dev.db first and wipes every talk entered by hand.
- `npm run lint` (zero warnings) and `npm run build` (it type-checks too) before you finish.
- Never run `npm run setup`, `npm run db:seed` or `npm run db:reset` yourself. They delete every talk in
  dev.db. Ask the user.

## Rules for code
- Every validation message lives in lib/validation.ts: sentence case, ends with a full stop.
- A form posts to a Server Action. It validates with zod, returns fieldErrors and never redirects.
- app/actions/talks.ts is the only writer of title, description, startsAt and room.
- Reads go through lib/data/*, never inside a page.
- A talk has no duration and no end time.

## Tests
- A behaviour change ships a spec in tests/.
- Never edit a file in tests/ to make a failing test pass. A failing test is information: stop and ask the
  user which side is wrong.
