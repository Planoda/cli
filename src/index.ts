#!/usr/bin/env node
/**
 * @planoda/cli — a zero-dependency terminal client for Planoda.
 *
 * Two audiences, one binary:
 *   • `planoda triage` needs NO account — it hits the public AI-triage wedge
 *     (`POST /api/public/ai/triage`) so any developer can feel the product in
 *     one command. This is the top-of-funnel hook.
 *   • the authenticated commands (`issue create|list`, `whoami`) use an API
 *     key (Settings → API keys) against the public REST API (`/api/v1/**`).
 *
 * No runtime dependencies: Node 20+ `fetch`, `process`, and a tiny hand-rolled
 * flag parser. Bundled to a single file so `npx @planoda/cli` is instant.
 */

import { fileURLToPath } from "node:url";

const VERSION = "0.1.0";
const DEFAULT_ORIGIN = "https://planoda.com";

export interface Ctx {
  origin: string;
  apiKey: string | undefined;
  json: boolean;
}

type Flags = Record<string, string | boolean>;

/** Parse `[positionals...] --flag value --bool` into positionals + flags. */
function parseArgs(argv: string[]): { positionals: string[]; flags: Flags } {
  const positionals: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, flags };
}

function str(flags: Flags, key: string): string | undefined {
  const v = flags[key];
  return typeof v === "string" ? v : undefined;
}

export class CliError extends Error {}

function fail(message: string): never {
  process.stderr.write(`planoda: ${message}\n`);
  process.exit(1);
}

/**
 * Parse the `Retry-After` response header into whole seconds. Accepts both
 * delta-seconds (`"31"`) and HTTP-date forms. Mirrors
 * `packages/sdk/src/client.ts`'s `parseRetryAfter` (which returns
 * milliseconds for its own retry loop); this returns seconds since it only
 * feeds a human-readable CLI message. Returns `undefined` if the header is
 * missing or unparseable — callers must omit the retry clause rather than
 * print `undefined`/`NaN`.
 */
function parseRetryAfterSeconds(raw: string | null): number | undefined {
  if (!raw) {
    return;
  }
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.round(seconds));
  }
  const date = Date.parse(raw);
  if (Number.isFinite(date)) {
    return Math.max(0, Math.round((date - Date.now()) / 1000));
  }
  return;
}

/** Parse `x-ratelimit-limit` into a display string, or `undefined` if absent/garbage. */
function parseRateLimitHeader(raw: string | null): string | undefined {
  if (!raw) {
    return;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return;
  }
  return String(n);
}

/**
 * Build the human, actionable message for a 429 from the free demo endpoint.
 * The server-side limit is deliberately NOT hard-coded here (it changes —
 * see `src/lib/rate-limit.ts`); both the limit and retry-after clauses are
 * read from response headers and gracefully omitted when absent.
 */
function buildRateLimitMessage(res: Response): string {
  const limit = parseRateLimitHeader(res.headers.get("x-ratelimit-limit"));
  const retryAfterSeconds = parseRetryAfterSeconds(
    res.headers.get("retry-after")
  );
  const limitClause = limit
    ? `the free demo endpoint allows ${limit} requests/min.`
    : "too many requests to the free demo endpoint.";
  const retryClause =
    retryAfterSeconds !== undefined
      ? `Retry in ${retryAfterSeconds}s,`
      : "Retry shortly,";
  return `rate limited — ${limitClause} ${retryClause} or set PLANODA_API_KEY for higher limits.`;
}

export async function api(
  ctx: Ctx,
  method: string,
  path: string,
  body?: unknown,
  opts: { auth?: boolean } = { auth: true }
): Promise<unknown> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (opts.auth) {
    if (!ctx.apiKey) {
      throw new CliError(
        "no API key — pass --api-key or set PLANODA_API_KEY (create one in Settings → API keys)."
      );
    }
    // The Planoda API authenticates an API key as a bearer token
    // (`Authorization: Bearer ttm_..._...`); it does NOT read `x-api-key`.
    headers.authorization = `Bearer ${ctx.apiKey}`;
  }
  headers["user-agent"] = `@planoda/cli/${VERSION}`;

  let res: Response;
  try {
    res = await fetch(`${ctx.origin}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw new CliError(
      `network error reaching ${ctx.origin} (${(err as Error).message})`
    );
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    if (res.status === 429) {
      throw new CliError(buildRateLimitMessage(res));
    }
    const errMsg =
      (parsed &&
        typeof parsed === "object" &&
        (parsed as Record<string, unknown>).error) ||
      res.statusText;
    throw new CliError(`${res.status} ${String(errMsg)}`);
  }
  return parsed;
}

/** Unwrap the `{ data }` envelope the REST API wraps single resources in. */
function unwrapData(body: unknown): unknown {
  if (body && typeof body === "object" && "data" in body) {
    return (body as Record<string, unknown>).data;
  }
  return body;
}

// ── Commands ───────────────────────────────────────────────────────────────

async function cmdWhoami(ctx: Ctx): Promise<void> {
  const user = unwrapData(await api(ctx, "GET", "/api/v1/users/me")) as Record<
    string,
    unknown
  >;
  if (ctx.json) {
    process.stdout.write(`${JSON.stringify(user, null, 2)}\n`);
    return;
  }
  const name = user.displayName ?? user.email ?? user.id;
  process.stdout.write(`Signed in as ${String(name)} (${String(user.id)})\n`);
}

async function cmdIssueCreate(ctx: Ctx, flags: Flags): Promise<void> {
  const teamId = str(flags, "team");
  const title = str(flags, "title");
  if (!teamId) {
    throw new CliError("issue create: --team <teamId> is required.");
  }
  if (!title) {
    throw new CliError("issue create: --title <title> is required.");
  }
  const body: Record<string, unknown> = { teamId, title };
  const description = str(flags, "description");
  if (description) {
    body.descriptionMd = description;
  }
  const priority = str(flags, "priority");
  if (priority !== undefined) {
    const p = Number(priority);
    if (!Number.isInteger(p) || p < 0 || p > 4) {
      throw new CliError("issue create: --priority must be 0–4.");
    }
    body.priority = p;
  }
  const project = str(flags, "project");
  if (project) {
    body.projectId = project;
  }

  const issue = unwrapData(
    await api(ctx, "POST", "/api/v1/issues", body)
  ) as Record<string, unknown>;
  if (ctx.json) {
    process.stdout.write(`${JSON.stringify(issue, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    `Created issue #${String(issue.number)} — ${String(issue.title)}\n${String(
      issue.id
    )}\n`
  );
}

async function cmdIssueList(ctx: Ctx, flags: Flags): Promise<void> {
  const params = new URLSearchParams();
  const team = str(flags, "team");
  if (team) {
    params.set("teamId", team);
  }
  const limit = str(flags, "limit");
  params.set("limit", limit ?? "25");
  const raw = unwrapData(
    await api(ctx, "GET", `/api/v1/issues?${params.toString()}`)
  );
  const items = Array.isArray(raw)
    ? raw
    : ((raw as Record<string, unknown>)?.items as unknown[]) ?? [];
  if (ctx.json) {
    process.stdout.write(`${JSON.stringify(items, null, 2)}\n`);
    return;
  }
  if (items.length === 0) {
    process.stdout.write("No issues.\n");
    return;
  }
  for (const it of items as Record<string, unknown>[]) {
    process.stdout.write(`#${String(it.number).padEnd(5)} ${String(it.title)}\n`);
  }
}

async function cmdTriage(ctx: Ctx, positionals: string[]): Promise<void> {
  // Tasks come from positionals, or stdin when the first positional is "-".
  let tasks: string;
  if (positionals.length > 0 && positionals[0] !== "-") {
    tasks = positionals.join("\n");
  } else {
    tasks = await readStdin();
  }
  const lines = tasks
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    throw new CliError(
      'triage: pass tasks as arguments or via stdin, e.g. `planoda triage "Fix login bug" "Add dark mode"`.'
    );
  }
  const result = (await api(
    ctx,
    "POST",
    "/api/public/ai/triage",
    { tasks: lines.join("\n") },
    { auth: false }
  )) as { items?: Record<string, unknown>[]; mode?: string };

  if (ctx.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  const items = result.items ?? [];
  for (const it of items) {
    const pri = String(it.priority ?? "").padEnd(8);
    const label = String(it.label ?? "").padEnd(9);
    const pts = it.estimatePoints ? `${it.estimatePoints}pt ` : "";
    process.stdout.write(`${pri} ${label} ${pts}${String(it.text ?? "")}\n`);
  }
  if (result.mode === "heuristic") {
    process.stderr.write(
      "\n(demo AI budget reached — served the offline heuristic. Sign up at https://planoda.com for full AI triage.)\n"
    );
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
  });
}

const HELP = `planoda — CLI for Planoda (https://planoda.com)

USAGE
  planoda <command> [options]

COMMANDS
  triage [tasks...]        AI-triage a backlog (no account needed; reads stdin if piped)
  issue create             Create an issue        (--team, --title, [--description], [--priority 0-4], [--project])
  issue list               List issues            ([--team], [--limit])
  whoami                   Show the authenticated user
  help                     Show this help
  version                  Print the version

GLOBAL OPTIONS
  --api-key <key>          API key (or env PLANODA_API_KEY). Create one in Settings → API keys.
  --base-url <origin>      API origin (or env PLANODA_BASE_URL). Default https://planoda.com
  --json                   Emit raw JSON (scripting / CI)

EXAMPLES
  npx @planoda/cli triage "Fix the flaky login test" "Add dark mode" "Typo in footer"
  cat backlog.txt | planoda triage -
  planoda issue create --team <teamId> --title "Ship the CLI" --priority 2
  PLANODA_API_KEY=pk_... planoda issue list --limit 10 --json
`;

async function main(): Promise<void> {
  const { positionals, flags } = parseArgs(process.argv.slice(2));

  if (flags.version || positionals[0] === "version") {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (
    flags.help ||
    positionals.length === 0 ||
    positionals[0] === "help"
  ) {
    process.stdout.write(HELP);
    return;
  }

  const ctx: Ctx = {
    origin: (
      str(flags, "base-url") ??
      process.env.PLANODA_BASE_URL ??
      DEFAULT_ORIGIN
    ).replace(/\/+$/, ""),
    apiKey: str(flags, "api-key") ?? process.env.PLANODA_API_KEY,
    json: flags.json === true,
  };

  const [command, sub, ...rest] = positionals;

  try {
    if (command === "triage") {
      await cmdTriage(ctx, positionals.slice(1));
    } else if (command === "whoami") {
      await cmdWhoami(ctx);
    } else if (command === "issue" && sub === "create") {
      await cmdIssueCreate(ctx, flags);
    } else if (command === "issue" && sub === "list") {
      await cmdIssueList(ctx, flags);
    } else if (command === "issue") {
      throw new CliError(`unknown issue subcommand "${sub ?? ""}" (try: create, list).`);
    } else {
      throw new CliError(`unknown command "${command}" — run \`planoda help\`.`);
    }
  } catch (err) {
    if (err instanceof CliError) {
      fail(err.message);
    }
    throw err;
  }
  void rest;
}

// Only run when invoked directly (`node dist/index.js`, `npx @planoda/cli`) —
// not when imported, e.g. by the unit tests in `index.test.ts`.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(
      `planoda: unexpected error: ${(err as Error).message}\n`
    );
    process.exit(1);
  });
}
