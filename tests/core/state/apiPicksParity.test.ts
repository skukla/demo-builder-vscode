/**
 * Step 07's PRECONDITION: the two representations of a project's API picks agree
 * everywhere one of them is written.
 *
 * The plan retires the flat `additionalConsoleApis` write once "parity is proven".
 * This is that proof, mechanised — because the failure it guards against is silent
 * and expensive: a path that carries the flat field but not the keyed map keeps
 * working today (the flat field is still written) and starts losing data the moment
 * the flat write is deleted.
 *
 * That is not hypothetical. `settingsSerializer` was exactly this shape when the
 * guard was written: settings export carried `additionalConsoleApis` alone, so
 * retiring the flat write would have made every exported settings file silently
 * drop the user's API picks.
 *
 * The rule this pins: any surface that persists or transports picks must carry the
 * KEYED map, since that is the form that survives step 07. Carrying the flat field
 * too is fine while it exists — carrying ONLY the flat field is the bug.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../../../src');

/**
 * Files allowed to mention the flat field WITHOUT also mentioning the keyed map.
 *
 * Each is a legacy READ, which step 07 explicitly keeps: a manifest written by an
 * older build has only the flat field, and dropping the read would strand it.
 */
const READ_ONLY_SITES = new Set([
    'core/state/componentApiPicks.ts', // the migration itself — reads flat, writes keyed
    'types/base.ts', // the field's own declaration + its supersession note
    'types/webview.ts', // wizard draft docs
]);

function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return walk(full);
        return /\.tsx?$/.test(e.name) ? [full] : [];
    });
}

describe('SOP: API picks travel in BOTH forms until step 07 retires the flat one', () => {
    it('has no surface carrying the flat field alone', () => {
        const offenders: string[] = [];

        for (const file of walk(SRC)) {
            const rel = path.relative(SRC, file);
            if (READ_ONLY_SITES.has(rel)) continue;

            const body = fs.readFileSync(file, 'utf-8');
            // Only assignments/object-literal keys count — a bare mention in prose
            // or a type import is not a write.
            const writesFlat = /additionalConsoleApis\s*[:=]/.test(body);
            if (!writesFlat) continue;
            if (!body.includes('componentApiPicks')) {
                offenders.push(rel);
            }
        }

        expect(offenders).toEqual([]);
    });

    it('still recognises the shape it is meant to catch', () => {
        // Without this the check above passes vacuously if the regex rots.
        const flatOnly = 'const x = { additionalConsoleApis: project.additionalConsoleApis };';
        expect(/additionalConsoleApis\s*[:=]/.test(flatOnly)).toBe(true);
        expect(flatOnly.includes('componentApiPicks')).toBe(false);
    });

    it('does not flag a file that merely NAMES the field in prose', () => {
        const proseOnly = '// Supersedes the flat additionalConsoleApis above.';
        expect(/additionalConsoleApis\s*[:=]/.test(proseOnly)).toBe(false);
    });
});
