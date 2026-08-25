/**
 * Every consent dialog names a target the tool can actually supply.
 *
 * WHY THIS EXISTS. The dialog answers one question — "am I allowed to do this?"
 * — with three lines: what happens, what it costs, and WHICH ONE. The third is
 * authored per tool in `AGENT_ALERT_COPY.target`, because it cannot be derived:
 * `delete_project` takes `name`, `delete_adobe_project` takes both `projectId`
 * and `projectName` and must show only the second, and `set_site_admin` needs
 * BOTH its `email` and its `admin` boolean because granting and revoking are
 * different decisions.
 *
 * Authoring by hand is exactly where a typo becomes a BLANK line rather than a
 * loud failure: a target naming an argument the schema does not declare renders
 * nothing, and the dialog quietly stops saying which thing it is about. Writing
 * these 15 entries, two were wrong that way on the first pass — `blockName` for
 * a schema that declares `blockId`, and the proof-of-intent echo instead of the
 * pack being exported. Both were found by reading the schemas; this is what
 * finds the next one.
 */

import { readdirSync, readFileSync } from 'fs';
import { AGENT_ALERT_COPY } from '@/features/ai/server/agentAlertCopy';

const SERVER_DIR = 'src/features/ai/server';
const EXTRA_REGISTRAR_FILES = ['src/mcp-server.ts'];

/**
 * Argument keys named anywhere in a tool's registration.
 *
 * Deliberately GENEROUS — it reads the whole registration window and collects
 * identifier-like keys, including ones arriving through a spread such as
 * `...DATAPACK_ID`. A false ACCEPT here is a missed typo; a false REJECT would
 * be a test nobody can keep green. So it errs toward accepting, and the two real
 * typos it must catch (`blockName`, absent from every schema) are still caught.
 */
function declaredArgumentKeys(): Map<string, Set<string>> {
    const files = [
        ...readdirSync(SERVER_DIR).map((f) => `${SERVER_DIR}/${f}`),
        ...EXTRA_REGISTRAR_FILES,
    ].filter((f) => f.endsWith('.ts'));

    const spreads = new Map<string, string[]>();
    const out = new Map<string, Set<string>>();

    for (const file of files) {
        const source = readFileSync(file, 'utf8');
        // Shared schema fragments, e.g. `const DATAPACK_ID = { datapackName: …`
        for (const m of source.matchAll(/const ([A-Z_]+) = \{([^}]*)\}/g)) {
            spreads.set(m[1], [...m[2].matchAll(/(\w+):/g)].map((x) => x[1]));
        }
    }

    for (const file of files) {
        const source = readFileSync(file, 'utf8');
        // Both registration shapes, matched EXPLICITLY. A single clever pattern
        // for both silently missed every descriptor row (it had no colon), and
        // the tools it skipped were then never checked at all — caught only by
        // the vacuous-pass guard above.
        const sites = [
            ...source.matchAll(/^\s*tool: '([a-z_]+)'/gm),
            ...source.matchAll(/^\s*server\.registerTool\(\s*\n?\s*'([a-z_]+)'/gm),
        ];
        for (const m of sites) {
            const name = m[1];
            if (!(name in AGENT_ALERT_COPY)) continue;
            const window = source.slice(m.index, m.index + 2600);
            const keys = new Set<string>();
            // `z\b`, not `z\.` — a multi-line field reads `blockId: z` then
            // `.string()` on the next line, and requiring the dot rejected it.
            for (const k of window.matchAll(/(\w+):\s*(?:z\b|projectNameSchema|pathField)/g)) {
                keys.add(k[1]);
            }
            for (const sp of window.matchAll(/\.\.\.([A-Z_]+)/g)) {
                for (const k of spreads.get(sp[1]) ?? []) keys.add(k);
            }
            const existing = out.get(name) ?? new Set<string>();
            for (const k of keys) existing.add(k);
            out.set(name, existing);
        }
    }
    return out;
}

describe('consent targets name real arguments', () => {
    const declared = declaredArgumentKeys();
    const entries = Object.entries(AGENT_ALERT_COPY);

    it('found the registrations for every tool that raises a dialog', () => {
        // Vacuous-pass guard. If the scan finds nothing, "no bad targets" is
        // trivially true and this suite would assert nothing at all.
        const found = entries.filter(([tool]) => (declared.get(tool)?.size ?? 0) > 0);

        expect(entries.length).toBeGreaterThan(10);
        // Tools whose target is [] act on the open project and may legitimately
        // declare no arguments, so they are not required to be found.
        const needArgs = entries.filter(([, copy]) => copy.target.length > 0);
        expect(found.length).toBeGreaterThanOrEqual(needArgs.length);
    });

    it('names no argument the tool does not declare', () => {
        const bogus: string[] = [];

        for (const [tool, copy] of entries) {
            const keys = declared.get(tool);
            if (!keys) continue;
            for (const key of copy.target) {
                if (!keys.has(key)) bogus.push(`${tool}: ${key}`);
            }
        }

        expect(bogus).toEqual([]);
    });

    it('never shows a credential-shaped key', () => {
        // The renderer masks these anyway, but a masked line is still a wasted
        // line in a dialog that should carry three. Authoring one in is a
        // mistake worth catching at the source.
        const secrets = entries
            .flatMap(([tool, copy]) => copy.target.map((k) => `${tool}: ${k}`))
            .filter((s) => /token|secret|password|credential|apikey|api_key/i.test(s));

        expect(secrets).toEqual([]);
    });

    it('gives every entry a target decision, even when that decision is "the open project"', () => {
        // `target` is required, so this cannot fail by omission — it fails if
        // someone types `undefined` past the type system, and it documents that
        // an empty array is a real answer rather than an unfinished one.
        const missing = entries.filter(([, copy]) => !Array.isArray(copy.target));

        expect(missing).toEqual([]);
    });
});
