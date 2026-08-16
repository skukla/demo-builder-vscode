#!/usr/bin/env node
/**
 * mcp-live-probe — talk to the RUNNING in-extension MCP server over its Unix
 * domain socket, the same JSON-RPC the real client speaks.
 *
 * Exists because tool behaviour cannot be trusted from tests alone. Three real
 * bugs in one session passed every offline check and were caught only here: a
 * path prefix built from an invented fixture, a `bytes` field counting UTF-16
 * code units, and a tool list measured against a host serving a different build.
 *
 * Usage:
 *   node probe.mjs info                     serverInfo (which BUILD is serving) + counts
 *   node probe.mjs list [pattern]           tool names, optionally filtered
 *   node probe.mjs schema <tool>            a tool's inputSchema
 *   node probe.mjs call <tool> ['<json>']   call it and print the raw text result
 *
 * Flags:
 *   --socket <path>   explicit socket (default: auto-discover, error if ambiguous)
 *   --full            do not truncate call output
 *   --force <tool>    permit that ONE non-read-only tool (never blanket)
 */

import net from 'net';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ── which tools are safe to call unprompted ──────────────────────────────────
// An ALLOWLIST, not a denylist. The first version matched destructive-sounding
// NAMES and let `sync_content` and `republish` straight through — both take zero
// arguments and both push to the live public CDN, which is exactly the
// enumerate-and-call accident the guard exists to stop. A name-denylist has to
// enumerate every dangerous tool correctly forever; an allowlist fails closed
// when a new tool appears.
//
// Read-only verbs, matched case-insensitively and anchored.
const READ_ONLY = /^(list|get|read|check|find|verify|inspect|show|describe)[_-]/i;
const READ_ONLY_EXACT = /^(list_projects|get_current_project|verify_ai_setup)$/i;

/** A tool is safe without --force only if its name reads as a query. */
function isReadOnly(name) {
    return READ_ONLY.test(name) || READ_ONLY_EXACT.test(name);
}

const argv = process.argv.slice(2);
/** Boolean flag: present or absent, never consumes the following token. */
const boolFlag = (name) => {
    const i = argv.indexOf(name);
    if (i < 0) return false;
    argv.splice(i, 1);
    return true;
};
/** Value flag: requires a following token that is not itself a flag. */
const valueFlag = (name) => {
    const i = argv.indexOf(name);
    if (i < 0) return undefined;
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) die(`${name} requires a value`);
    argv.splice(i, 2);
    return v;
};
// Booleans first: otherwise `--socket --full` would take "--full" as the path.
const full = boolFlag('--full');
// `--force` NAMES the tool it unlocks. It used to be a bare boolean, and on
// 2026-08-16 a script looped over 17 tools passing it blanket — two of them
// turned out not to be gated at all (a classifier bug), and `republish` ran
// against a live storefront, pushing a commit and publishing to the CDN.
// A blanket override is exactly the shape that accident needs; naming the tool
// makes each unlock a deliberate, single-target decision.
const forceTool = valueFlag('--force');
const socketFlag = valueFlag('--socket');
const [cmd, ...rest] = argv;

// ── socket discovery ─────────────────────────────────────────────────────────
// Mirrors mcpSocketDir(): $TMPDIR/demo-builder-mcp, overridable by the same env
// var the extension and proxy both read.
function socketDir() {
    return (
        process.env.DEMO_BUILDER_MCP_SOCKET_DIR ||
        path.join(process.env.TMPDIR || os.tmpdir(), 'demo-builder-mcp')
    );
}

function resolveSocket() {
    if (socketFlag && socketFlag !== true) return socketFlag;
    const dir = socketDir();
    let socks = [];
    try {
        socks = fs.readdirSync(dir).filter((f) => f.endsWith('.sock'));
    } catch {
        die(`No socket directory at ${dir}. Is an Extension Dev Host running?`);
    }
    if (socks.length === 0) die(`No sockets in ${dir}. Is an Extension Dev Host running?`);
    if (socks.length > 1) {
        die(
            `Ambiguous: ${socks.length} sockets in ${dir}\n  ${socks.join('\n  ')}\n` +
                `Pass --socket <path>. The socket name is sha256(projects-root), so two ` +
                `windows on the same projects dir share one — see the last-writer-wins note in SKILL.md.`,
        );
    }
    return path.join(dir, socks[0]);
}

function die(msg) {
    console.error(`mcp-live-probe: ${msg}`);
    process.exit(1);
}

// ── JSON-RPC over the socket ─────────────────────────────────────────────────
/** Open one connection, initialize, run `steps`, close. All requests share it. */
function session(steps) {
    return new Promise((resolve, reject) => {
        const sock = resolveSocket();
        const c = net.createConnection(sock);
        const pending = new Map();
        let buf = '';
        let id = 1;
        const rpc = (method, params) =>
            new Promise((res) => {
                const myId = ++id;
                pending.set(myId, res);
                c.write(JSON.stringify({ jsonrpc: '2.0', id: myId, method, params }) + '\n');
            });

        const timer = setTimeout(() => {
            c.destroy();
            reject(new Error('timed out after 60s — is the host still running?'));
        }, 60_000);

        c.on('connect', () => {
            c.write(
                JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'initialize',
                    params: {
                        protocolVersion: '2024-11-05',
                        capabilities: {},
                        clientInfo: { name: 'mcp-live-probe', version: '1' },
                    },
                }) + '\n',
            );
        });

        c.on('data', async (d) => {
            buf += d.toString();
            let i;
            while ((i = buf.indexOf('\n')) >= 0) {
                const line = buf.slice(0, i);
                buf = buf.slice(i + 1);
                if (!line.trim()) continue;
                let m;
                try {
                    m = JSON.parse(line);
                } catch {
                    continue;
                }
                if (m.id === 1) {
                    c.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
                    try {
                        const out = await steps(rpc, m.result);
                        clearTimeout(timer);
                        c.end();
                        resolve(out);
                    } catch (e) {
                        clearTimeout(timer);
                        c.destroy();
                        reject(e);
                    }
                } else if (pending.has(m.id)) {
                    const res = pending.get(m.id);
                    pending.delete(m.id);
                    res(m);
                }
            }
        });

        c.on('error', (e) => {
            clearTimeout(timer);
            reject(new Error(`${e.message} (socket: ${sock})`));
        });
    });
}

const toolsOf = (m) => m.result?.tools ?? [];

// ── commands ─────────────────────────────────────────────────────────────────
const commands = {
    async info() {
        await session(async (rpc, init) => {
            const tools = toolsOf(await rpc('tools/list', {}));
            const names = tools.map((t) => t.name);
            // serverInfo.version names branch@commit + build time + worktree
            // (feat 06ffe079). This is the ONLY reliable way to know which build
            // is answering — the socket is shared and last-writer-wins.
            console.log('serving:', init?.serverInfo?.version ?? '(unknown — build predates serverInfo naming)');
            console.log('tools:  ', names.length);
            // Tree provenance MUST be read from this same connection, never a
            // separate one: a different host can rebind the socket between two.
            const datapack = names.filter((n) => /datapack/.test(n));
            console.log(
                'tree:   ',
                datapack.length > 0
                    ? `data-installer merged (${datapack.length} datapack tools)`
                    : 'no datapack tools — develop baseline',
            );
            const gated = names.filter((n) => !isReadOnly(n));
            console.log(`callable without --force: ${names.length - gated.length} of ${names.length}`);
            console.log('need --force:', gated.join(', ') || '(none)');
        });
    },

    async list([pattern]) {
        await session(async (rpc) => {
            let tools = toolsOf(await rpc('tools/list', {}));
            if (pattern) {
                const re = new RegExp(pattern, 'i');
                tools = tools.filter((t) => re.test(t.name) || re.test(t.description ?? ''));
            }
            tools.sort((a, b) => a.name.localeCompare(b.name));
            for (const t of tools) {
                const mark = isReadOnly(t.name) ? '' : ' [needs --force]';
                console.log(`${t.name}${mark}\n    ${t.description ?? ''}`);
            }
            console.log(`\n${tools.length} tool(s)${pattern ? ` matching /${pattern}/i` : ''}`);
        });
    },

    async schema([tool]) {
        if (!tool) die('usage: probe.mjs schema <tool>');
        await session(async (rpc) => {
            const t = toolsOf(await rpc('tools/list', {})).find((x) => x.name === tool);
            if (!t) die(`no such tool: ${tool} (try: probe.mjs list)`);
            console.log(JSON.stringify(t.inputSchema ?? {}, null, 2));
        });
    },

    async call([tool, argsJson]) {
        if (!tool) die("usage: probe.mjs call <tool> ['<json args>']");
        if (!isReadOnly(tool) && forceTool !== tool) {
            die(
                `"${tool}" is not a read-only tool and was NOT called.\n` +
                    `  To run it anyway: --force ${tool}\n` +
                    `  --force NAMES its tool on purpose. A bare --force once let a loop over 17\n` +
                    `  "gated" tools run republish against a live storefront — two of the 17 had no\n` +
                    `  gate, and a blanket override could not tell.\n` +
                    `  Standing rule: never call a state-changing tool merely to measure it.`,
            );
        }
        let args = {};
        if (argsJson) {
            try {
                args = JSON.parse(argsJson);
            } catch (e) {
                die(`args must be valid JSON: ${e.message}`);
            }
        }
        await session(async (rpc) => {
            const m = await rpc('tools/call', { name: tool, arguments: args });
            if (m.error) {
                console.log('RPC ERROR:', JSON.stringify(m.error));
                process.exitCode = 1;
                return;
            }
            const text = m.result?.content?.[0]?.text ?? '';
            // Byte size, not string length: a JS string's .length is UTF-16 code
            // units and under-reports any multi-byte content. This field being
            // wrong inside a tool is one of the bugs that motivated this script.
            const bytes = Buffer.byteLength(text, 'utf8');
            console.log(`── ${tool} → ${bytes} bytes (~${Math.ceil(bytes / 4)} tokens) ──`);
            console.log(!full && text.length > 2000 ? text.slice(0, 2000) + '\n…[truncated, use --full]' : text);
        });
    },
};

const run = commands[cmd];
if (!run) {
    console.error(
        'usage: probe.mjs <info|list|schema|call> [args] [--socket <path>] [--full] [--force]',
    );
    process.exit(1);
}
run(rest).catch((e) => die(e.message));
