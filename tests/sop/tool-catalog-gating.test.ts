/**
 * The generated tool catalog must not UNDERSTATE which tools are destructive.
 *
 * `docs/systems/mcp-tools.md` is what an agent reads to decide whether a call is safe,
 * and on 2026-08-30 it was publishing 24 confirm-gated tools when 28 were gated. The
 * generator read a fixed 600-character window after each tool's name, so a tool with a
 * long `description` pushed its `confirm: true` out of range: `set_console_apis`,
 * `promote_block_to_library`, `install_prerequisite` and `repair_site_configuration`
 * were all published as needing no confirmation.
 *
 * `set_console_apis` is why this file exists rather than a note in the generator. It
 * says "set" and it REMOVES — its own source comment calls it "a delete wearing a
 * setter's name" — and the catalog told agents it was ungated. A doc that overstates a
 * safeguard is worse than one that omits it.
 *
 * WHY AN INDEPENDENT DERIVATION: asserting the catalog against the generator's own
 * regex would pass whatever the generator believes, which is exactly the failure. This
 * brace-matches each declaration instead, so the two methods have to agree.
 */
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');

/** Tool names whose declaring literal contains `confirm: true`, by brace matching. */
const gatedInSource = (): Set<string> => {
    const files = execSync(
        "git ls-files 'src/features/ai/server/*.ts' 'src/mcp-server.ts' 'src/mcp/*.ts'",
        { encoding: 'utf8', cwd: ROOT }
    )
        .split('\n')
        .filter(Boolean);

    const gated = new Set<string>();
    for (const file of files) {
        const src = readFileSync(join(ROOT, file), 'utf8');
        const decls = [
            ...[...src.matchAll(/tool:\s*'([a-z0-9_]+)'/g)].map((m) => ({
                name: m[1],
                at: m.index as number,
            })),
            ...[...src.matchAll(/registerTool\(\s*'([a-z0-9_]+)'/g)].map((m) => ({
                name: m[1],
                at: m.index as number,
            })),
        ].sort((a, b) => a.at - b.at);

        decls.forEach(({ name, at }, i) => {
            const end = decls[i + 1]?.at ?? src.length;
            if (/confirm:\s*true/.test(src.slice(at, end))) gated.add(name);
        });
    }
    return gated;
};

/** Tool names the generated catalog marks with the confirm flag. */
const gatedInCatalog = (): Set<string> => {
    const cat = readFileSync(join(ROOT, 'docs/systems/mcp-tools.md'), 'utf8');
    const rows = [...cat.matchAll(/^\|\s*`([a-z0-9_]+)`\s*\|([^|]*)\|/gm)];
    return new Set(rows.filter(([, , flags]) => flags.includes('confirm')).map(([, n]) => n));
};

describe('the generated tool catalog states every confirm gate', () => {
    it('CONTROL: both derivations find gates, and the catalog has rows', () => {
        expect(gatedInSource().size).toBeGreaterThan(5);
        expect(gatedInCatalog().size).toBeGreaterThan(5);
    });

    it('CONTROL: a tool known to be a read is gated in neither', () => {
        // If this ever fails, a derivation has started matching a neighbour's gate —
        // which is precisely the bug a widened window introduced before this landed.
        expect(gatedInSource().has('list_projects')).toBe(false);
        expect(gatedInCatalog().has('list_projects')).toBe(false);
    });

    it('publishes no tool as ungated while its source gates it', () => {
        const missing = [...gatedInSource()].filter((t) => !gatedInCatalog().has(t)).sort();
        expect(missing).toEqual([]);
    });

    it('publishes no tool as gated while its source does not', () => {
        const phantom = [...gatedInCatalog()].filter((t) => !gatedInSource().has(t)).sort();
        expect(phantom).toEqual([]);
    });
});
