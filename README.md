# @planoda/cli

[![npm version](https://img.shields.io/npm/v/@planoda/cli.svg)](https://www.npmjs.com/package/@planoda/cli)
[![npm downloads](https://img.shields.io/npm/dm/@planoda/cli.svg)](https://www.npmjs.com/package/@planoda/cli)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/@planoda/cli.svg)](https://www.npmjs.com/package/@planoda/cli)

> Command-line client for [Planoda](https://planoda.com) — the AI-native work
> platform that replaces Linear, ClickUp, Monday & Trello.

AI-triage a backlog, create and list issues from your terminal or CI. Zero
runtime dependencies; runs on Node 20+.

## Try it in one command (no account needed)

The `triage` command hits Planoda's public AI backlog-triage endpoint — no
signup, no API key, no config file:

```bash
npx @planoda/cli triage "Fix the flaky login test" "Add dark mode" "Typo in footer"
```

```
urgent   Bug       3pt Fix the flaky login test
medium   Feature   5pt Add dark mode
low      Chore     1pt Typo in footer
```

Pipe a file in too:

```bash
cat backlog.txt | npx @planoda/cli triage -
```

That's the whole demo. No `npx @planoda/cli init`, no OAuth flow, no
credit card — the point is you can feel the AI triage in the time it takes to
run one command.

## Install

```bash
npm i -g @planoda/cli
# or run ad-hoc with npx @planoda/cli <command>
```

## Authenticated commands

Create an API key in Planoda under **Settings → API keys**, then:

```bash
export PLANODA_API_KEY=ttm_...

planoda whoami
planoda issue create --team <teamId> --title "Ship the CLI" --priority 2
planoda issue list --limit 10 --json
```

## Commands

| Command | Description |
| --- | --- |
| `triage [tasks...]` | AI-triage a backlog (no account; reads stdin when piped with `-`) |
| `issue create` | `--team <id>` `--title <t>` `[--description <md>]` `[--priority 0-4]` `[--project <id>]` |
| `issue list` | `[--team <id>]` `[--limit <n>]` |
| `whoami` | Show the authenticated user |
| `help` · `version` | Help / version |

## Global options

| Option | Description |
| --- | --- |
| `--api-key <key>` | API key (or env `PLANODA_API_KEY`) |
| `--base-url <origin>` | API origin (or env `PLANODA_BASE_URL`, default `https://planoda.com`) |
| `--json` | Emit raw JSON for scripting / CI |

## Programmatic access

For anything beyond the CLI, use [`@planoda/sdk`](https://www.npmjs.com/package/@planoda/sdk)
— the type-safe TypeScript client this CLI is built on top of.

## What is Planoda?

[Planoda](https://planoda.com/gh?utm_source=github&utm_medium=readme&utm_campaign=oss)
is an AI-native work platform — issues, projects, cycles, docs, dashboards, and
automations on one schema, with AI agents as first-class operators (not a
chatbot bolted onto the side). Every destructive agent action goes through a
propose/approve broker and lands in an immutable audit trail; AI usage spends
from a transparent per-workspace credit ledger instead of a per-action credit
roulette. This CLI and [`@planoda/sdk`](https://www.npmjs.com/package/@planoda/sdk)
are the open-source developer surface of the product; the hosted app itself is
**pre-launch** — there's a free tier (10 members, 1,000 issues, 3 projects, AI
triage included, no credit card) and no fabricated user counts here, just an
honest invite to try it:
[**planoda.com/gh**](https://planoda.com/gh?utm_source=github&utm_medium=readme&utm_campaign=oss).

## License

MIT © [Planoda](https://planoda.com)
