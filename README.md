# clash-conference

The programme workspace of one event: settings and a list of talks, stored in a local SQLite file.
This repository belongs to the course Mastering Claude Code.

## You need

- Node.js 20.19+, 22.12+ or 24+ (not 21 or 23), npm and Git.
- For the tasks: a coding agent such as Claude Code.

## Start

```bash
git clone https://github.com/agilino/clash-conference.git
cd clash-conference
git checkout webinar-start
npm install
npm run setup
npm run dev
```

Open http://localhost:3001: three draft talks of "CLASH Community Day".

## Careful

- `npm test` and `npm run setup` reseed `dev.db`. Every talk you entered by hand is gone.

## Branches

- `webinar-start`: the app as the webinar task starts. `webinar-solution`: the task solved.
- `webinar-demo-law`: the webinar demo of advice versus law. The rules are built and `tests/` is locked, but the new
  specs are missing, so one old spec fails on purpose.
- `19-start`, `19-solution`: Task 19 of the course, publishing talks to CLASH through an MCP server.
