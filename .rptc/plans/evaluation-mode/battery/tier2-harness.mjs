/**
 * Tier-2 harness — the scratch project and the scope check (AI-1q, tier2-design.md).
 *
 * A module, not a sibling runner: run.mjs stays the one runner (the design's
 * rejected-alternatives section says why), and activates this under `--tier2`.
 *
 * Tier-2 agents run INSIDE the scratch folder, and the extension scopes a
 * connection to the project folder its session started in (connectionScope.ts,
 * since 2026-10-19). Nothing global moves, so nothing has to be put back.
 * Until 2026-11-21 this flipped the dashboard's current-project pointer through
 * set_current_project and read it back; once that tool became per-connection,
 * the read-back (a second connection) always disagreed and setup refused.
 *
 *   setup:    reset the scratch project from the committed fixture (comparable
 *             runs), then PROVE the scope through the real proxy started in the
 *             scratch folder: get_current_project must answer battery-scratch,
 *             scoped to the session's directory. Anything else THROWS, because
 *             export_project_settings writes SECRETS from whatever project is
 *             current (tier2-design.md finding 1).
 *   restore:  reset the scratch content. Never throws; it reports.
 */

import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AB = dirname(fileURLToPath(import.meta.url));
const PROJECTS = join(homedir(), '.demo-builder', 'projects');
export const SCRATCH_NAME = 'battery-scratch';
export const SCRATCH_DIR = join(PROJECTS, SCRATCH_NAME);
/** The project config whose demo-builder entry starts the proxy, as run.mjs uses it. */
const PROJECT_MCP = join(PROJECTS, 'bodea', '.mcp.json');
const SCOPE_CHECK_TIMEOUT_MS = 60_000;

/** The hand-curated tier-2 write list, one per cleared handler (see tier2-writes.txt). */
export function tier2Writes() {
    return readFileSync(join(AB, 'tier2-writes.txt'), 'utf8')
        .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

/**
 * Reset the scratch project to the committed fixture (idempotent). A rename prompt moves the
 * folder to `battery-scratch-<suffix>`; those copies are the harness's own and go too.
 */
export function resetScratch() {
    for (const entry of readdirSync(PROJECTS)) {
        if (entry.startsWith(`${SCRATCH_NAME}-`)) rmSync(join(PROJECTS, entry), { recursive: true, force: true });
    }
    rmSync(SCRATCH_DIR, { recursive: true, force: true });
    mkdirSync(SCRATCH_DIR, { recursive: true });
    cpSync(join(AB, 'scratch-fixture.json'), join(SCRATCH_DIR, '.demo-builder.json'));
    // A .env for update_project_config to aim at — fake values by convention.
    writeFileSync(join(SCRATCH_DIR, '.env'), '# battery scratch\nFAKE_KEY=fake-test-pw-not-a-secret\n');
}

/**
 * What get_current_project answers for a session started in `cwd`, asked through the real
 * proxy (the route an agent's session takes, so the scope it reports is the one an agent
 * gets). Resolves the parsed tool answer; rejects on a timeout or a malformed reply.
 */
export function currentProjectSeenFrom(cwd) {
    const server = JSON.parse(readFileSync(PROJECT_MCP, 'utf8')).mcpServers['demo-builder'];
    return new Promise((resolve, reject) => {
        const child = spawn(server.command, server.args, { cwd, env: { ...process.env, ...server.env } });
        const timer = setTimeout(() => { child.kill(); reject(new Error('no answer from the proxy')); }, SCOPE_CHECK_TIMEOUT_MS);
        let buffered = '';
        child.stdout.on('data', (chunk) => {
            buffered += chunk;
            for (const line of buffered.split('\n').slice(0, -1)) {
                const message = JSON.parse(line);
                if (message.id !== 2) continue;
                clearTimeout(timer);
                child.kill();
                try { resolve(JSON.parse(message.result.content[0].text)); } catch (err) { reject(err); }
            }
            buffered = buffered.slice(buffered.lastIndexOf('\n') + 1);
        });
        const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
        send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
            protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'battery-tier2', version: '1' },
        } });
        send({ jsonrpc: '2.0', method: 'notifications/initialized' });
        send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_current_project', arguments: {} } });
    });
}

/**
 * Reset scratch and prove a session started in it works on it. A failed proof THROWS:
 * running tier-2 prompts against the owner's real project is the exact accident this
 * harness exists to prevent.
 */
export async function setup() {
    resetScratch();
    const seen = await currentProjectSeenFrom(SCRATCH_DIR);
    if (seen.currentProject?.path !== SCRATCH_DIR || seen.scope !== 'session-directory') {
        throw new Error(
            `tier2 setup: a session in the scratch folder works on ${seen.currentProject?.path ?? 'no project'} `
            + `(scope ${seen.scope}), not ${SCRATCH_DIR}`,
        );
    }
    console.log('tier2: scratch ready, and a session started in it is scoped to it');
    return { cwd: SCRATCH_DIR };
}

/**
 * Reset scratch. Never throws — it reports; the CALLER prints the returned lines at the
 * TOP of the results (design acceptance: a silent bad restore is worse than no harness).
 */
export function restore() {
    const notes = [];
    try {
        resetScratch();
        notes.push('tier2: scratch reset to fixture');
    } catch (err) {
        notes.push(`tier2 RED: scratch reset failed — ${err.message}`);
    }
    // The repo must not accumulate scratch state: verify nothing outside the
    // scratch dir changed is the RUN's job (git status is the caller's world).
    return notes;
}

/** True when the scratch project exists and matches the fixture name. */
export function scratchHealthy() {
    try {
        const m = JSON.parse(readFileSync(join(SCRATCH_DIR, '.demo-builder.json'), 'utf8'));
        return m.name === SCRATCH_NAME;
    } catch {
        return false;
    }
}

// Self-test: `node tier2-harness.mjs --self-test` exercises reset + health
// WITHOUT touching the pointer (no live host required).
if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--self-test')) {
    resetScratch();
    if (!scratchHealthy()) { console.error('self-test FAIL: scratch not healthy after reset'); process.exit(1); }
    if (!existsSync(join(SCRATCH_DIR, '.env'))) { console.error('self-test FAIL: no .env'); process.exit(1); }
    const writes = tier2Writes();
    if (!writes.length || writes.some((w) => /deploy|publish|sync|delete|sign|create_github|create_adobe/.test(w))) {
        console.error(`self-test FAIL: tier2-writes.txt empty or contains a cloud-shaped name: ${writes}`);
        process.exit(1);
    }
    console.log(`self-test ok: scratch healthy, ${writes.length} tier-2 writes, none cloud-shaped`);
}
