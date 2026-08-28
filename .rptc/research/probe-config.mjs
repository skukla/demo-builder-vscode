#!/usr/bin/env node
/**
 * Write a runnable MCP config for a probe, with ABSOLUTE paths, to a temp file.
 *
 * WHY THIS EXISTS. Probe configs in `.rptc/research/` use RELATIVE paths on
 * purpose — this repo is public and tracked, and an absolute home path in a
 * committed file is the standing rule against identifiers in anything committed.
 *
 * The cost of that is real: a relative config only works when `claude` is run
 * from the repo root, and a probe is most useful run from a DEMO PROJECT. Twice
 * on 2026-08-25 a probe command was handed over that failed with "config file
 * doesn't exist" because the producer was in `~/.demo-builder/projects`, which
 * is exactly where they should have been.
 *
 * So: keep the tracked configs relative, and generate the runnable one here.
 * Nothing with a home path is ever written inside the repo.
 *
 * Usage:
 *   node .rptc/research/probe-config.mjs <probe-dir>/<server>.mjs [serverName]
 *
 * Prints the path of the generated config. Feed it straight to --mcp-config.
 */
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, resolve } from 'path';

const script = process.argv[2];
if (!script) {
    console.error('usage: node .rptc/research/probe-config.mjs <script.mjs> [serverName]');
    process.exit(2);
}
const abs = resolve(script);
const name = process.argv[3] ?? basename(abs, '.mjs');
const out = resolve(tmpdir(), `${name}-mcp.json`);

writeFileSync(out, JSON.stringify({ mcpServers: { [name]: { command: 'node', args: [abs] } } }, null, 2));
console.log(out);
