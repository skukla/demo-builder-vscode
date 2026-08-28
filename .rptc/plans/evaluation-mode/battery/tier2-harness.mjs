/**
 * Tier-2 harness — scratch project + pointer choreography (AI-1q, tier2-design.md).
 *
 * A module, not a sibling runner: run.mjs stays the one runner (the design's
 * rejected-alternatives section says why), and activates this under `--tier2`.
 *
 * Everything here is SAFETY choreography:
 *   setup:    ensure the scratch project exists (reset from the committed
 *             fixture — comparable runs), snapshot the current-project
 *             pointer, flip it to scratch VIA THE PROBE (never as an agent
 *             step — export_project_settings writes SECRETS from whatever
 *             project is current; tier2-design.md finding 1).
 *   restore:  flip the pointer back (skipped, and SAID, when no project was
 *             current before — a fresh isolated host has none), reset the
 *             scratch content, and VERIFY the restore by reading the pointer
 *             back. A harness that cannot verify restore reports RED — see
 *             the design's acceptance section.
 *
 * The probe is invoked as a child process (`probe.mjs call … --force <tool>`)
 * because set_current_project is a write and the probe's per-tool force flag
 * is the established consent shape for rig-driven writes.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AB = dirname(fileURLToPath(import.meta.url));
const REPO = join(AB, '..', '..', '..', '..');
const PROBE = join(REPO, '.claude', 'skills', 'mcp-live-probe', 'probe.mjs');
const PROJECTS = join(homedir(), '.demo-builder', 'projects');
export const SCRATCH_NAME = 'battery-scratch';
export const SCRATCH_DIR = join(PROJECTS, SCRATCH_NAME);

/** The hand-curated tier-2 write list, one per cleared handler (see tier2-writes.txt). */
export function tier2Writes() {
    return readFileSync(join(AB, 'tier2-writes.txt'), 'utf8')
        .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

function probe(args) {
    return execFileSync('node', [PROBE, ...args], { encoding: 'utf8', timeout: 90_000 });
}

/** Reset the scratch project to the committed fixture (idempotent). */
export function resetScratch() {
    rmSync(SCRATCH_DIR, { recursive: true, force: true });
    mkdirSync(SCRATCH_DIR, { recursive: true });
    cpSync(join(AB, 'scratch-fixture.json'), join(SCRATCH_DIR, '.demo-builder.json'));
    // A .env for update_project_config to aim at — fake values by convention.
    writeFileSync(join(SCRATCH_DIR, '.env'), '# battery scratch\nFAKE_KEY=fake-test-pw-not-a-secret\n');
}

/** The current project's path per the live server, or null. */
function currentProjectPath() {
    const out = probe(['call', 'get_current_project', '{}', '--full']);
    const m = /"path"\s*:\s*"([^"]+)"/.exec(out);
    return m ? m[1] : null;
}

/**
 * Snapshot the pointer and flip to scratch. Returns the restore token.
 * Flip failures THROW — running tier-2 prompts against the owner's real
 * project is the exact accident this harness exists to prevent.
 */
export function setup() {
    resetScratch();
    const prior = currentProjectPath();
    probe(['call', 'set_current_project', JSON.stringify({ projectPath: SCRATCH_DIR }),
        '--force', 'set_current_project']);
    const now = currentProjectPath();
    if (now !== SCRATCH_DIR) {
        throw new Error(`tier2 setup: pointer flip failed (current=${now ?? 'none'})`);
    }
    console.log(`tier2: scratch ready, pointer flipped (prior: ${prior ?? 'none'})`);
    return { prior };
}

/**
 * Restore the pointer and reset scratch. Never throws — it reports; the
 * CALLER prints the returned lines at the TOP of the results (design
 * acceptance: a silent bad restore is worse than no harness).
 */
export function restore(token) {
    const notes = [];
    try {
        if (token.prior) {
            probe(['call', 'set_current_project', JSON.stringify({ projectPath: token.prior }),
                '--force', 'set_current_project']);
            const now = currentProjectPath();
            notes.push(now === token.prior
                ? `tier2: pointer RESTORED to ${token.prior}`
                : `tier2 RED: pointer restore FAILED — current is ${now ?? 'none'}, wanted ${token.prior}`);
        } else {
            // No project was current before (fresh isolated host). There is no
            // "set to none" tool; scratch stays current, and that is SAID.
            notes.push('tier2: no prior project existed — pointer left on battery-scratch (restore-to-none is not expressible)');
        }
    } catch (err) {
        notes.push(`tier2 RED: restore threw — ${err.message}`);
    }
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
