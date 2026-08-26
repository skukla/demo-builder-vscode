#!/usr/bin/env node
/**
 * Ask the project's MCP servers what tools they have, RIGHT NOW.
 *
 *   node enumerate-tools.mjs <path-to-.mcp.json>
 *
 * Prints one fully-qualified `mcp__<server>__<tool>` per line.
 *
 * ## Why this is generated and not a file
 *
 * A hand-maintained allowlist drifts, and it drifts SILENTLY: a blocked tool and
 * a missing tool produce the same route, so the battery reports "the agent went
 * around us" when the truth is "we refused it". That happened twice on
 * 2026-08-26 — `get_commerce_endpoints` and `run_commerce_query` both shipped and
 * were blocked from the battery, and the second produced a NOT-FINDABLE result
 * for a tool the agent had found on first exposure.
 *
 * Asking the servers at run time removes the failure mode rather than managing
 * it. A tool that shipped an hour ago is included; a tool that was deleted is
 * not.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const HANDSHAKE_TIMEOUT_MS = 30_000;

/** One server's tool names, over stdio MCP. */
function toolsFor(name, spec) {
    return new Promise((resolve) => {
        let child;
        try {
            child = spawn(spec.command, spec.args ?? [], {
                env: { ...process.env, ...(spec.env ?? {}) },
                stdio: ['pipe', 'pipe', 'ignore'],
            });
        } catch (err) {
            resolve({ name, tools: [], error: String(err) });
            return;
        }
        let buf = '';
        const send = (o) => child.stdin.write(JSON.stringify(o) + '\n');
        const done = (out) => { try { child.kill(); } catch { /* already gone */ } resolve(out); };

        child.on('error', (err) => done({ name, tools: [], error: String(err) }));
        child.stdout.on('data', (d) => {
            buf += d;
            let i;
            while ((i = buf.indexOf('\n')) >= 0) {
                const line = buf.slice(0, i); buf = buf.slice(i + 1);
                if (!line.trim()) continue;
                let msg;
                try { msg = JSON.parse(line); } catch { continue; }
                if (msg.id === 1) send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
                if (msg.id === 2) {
                    done({ name, tools: (msg.result?.tools ?? []).map((t) => t.name) });
                }
            }
        });
        send({
            jsonrpc: '2.0', id: 1, method: 'initialize',
            params: {
                protocolVersion: '2024-11-05', capabilities: {},
                clientInfo: { name: 'battery-enumerate', version: '1' },
            },
        });
        // A server that never answers is a BROKEN ENUMERATION, not an empty one.
        setTimeout(() => done({ name, tools: [], error: 'timeout' }), HANDSHAKE_TIMEOUT_MS);
    });
}

const cfgPath = process.argv[2];
if (!cfgPath) { console.error('usage: enumerate-tools.mjs <.mcp.json>'); process.exit(2); }

const servers = JSON.parse(readFileSync(cfgPath, 'utf8')).mcpServers ?? {};
const results = await Promise.all(Object.entries(servers).map(([n, s]) => toolsFor(n, s)));

// A server that failed to answer must ABORT, never silently contribute nothing —
// that is precisely how an allowlist ends up missing tools and the battery ends
// up reporting refusals as gaps.
const broken = results.filter((r) => r.error || r.tools.length === 0);
if (broken.length) {
    console.error('ABORT: could not enumerate ' +
        broken.map((b) => `${b.name} (${b.error ?? 'no tools'})`).join(', '));
    process.exit(1);
}

for (const { name, tools } of results) {
    for (const t of tools) console.log(`mcp__${name}__${t}`);
}
console.error(`enumerated ${results.reduce((n, r) => n + r.tools.length, 0)} tools ` +
    `across ${results.length} server(s): ` +
    results.map((r) => `${r.name}=${r.tools.length}`).join(' '));
