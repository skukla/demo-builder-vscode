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
/**
 * Sites allowed to NAME additionalConsoleApis in write-shaped syntax: the
 * legacy READ paths (migration, loader intake, type declarations). Everything
 * else writing the flat field is a regression against step 07's retirement.
 */
const LEGACY_READ_SITES = new Set([
    'core/state/componentApiPicks.ts', // the migration itself — reads flat, writes keyed
    'core/state/projectFileLoader.ts', // manifest intake of legacy files
    'types/base.ts', // the field's own declaration + its supersession note
    'types/webview.ts', // wizard draft docs
    'types/settingsFile.ts', // legacy settings-file shape (old exports still import)
    'types/webviewRequests.ts', // legacy wire shape
    'core/state/projectConfigWriter.ts', // the retirement comment names the field
]);

function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return walk(full);
        return /\.tsx?$/.test(e.name) ? [full] : [];
    });
}

describe('SOP: step 07 retired the flat write — componentApiPicks is the one written form', () => {
    // Until 2026-08-23 this test enforced dual-writes (both forms everywhere).
    // The keyed reader shipped in beta.127; after twelve releases of
    // propagation the flat write path was deleted, and this now pins the
    // ABSENCE: no production surface may write additionalConsoleApis at all.
    // Legacy READS stay forever (migrateApiPicks, edit-mode fallback).
    it('no production surface writes the flat field', () => {
        const offenders: string[] = [];

        for (const file of walk(SRC)) {
            const rel = path.relative(SRC, file);
            if (LEGACY_READ_SITES.has(rel)) continue;

            const body = fs.readFileSync(file, 'utf-8');
            // Only assignments/object-literal keys count — a bare mention in prose
            // or a type import is not a write.
            if (/additionalConsoleApis\s*[:=]/.test(body)) {
                offenders.push(rel);
            }
        }

        expect(offenders).toEqual([]);
    });

    it('still recognises the shape it is meant to catch', () => {
        // Without this the check above passes vacuously if the regex rots.
        const flatWrite = 'const x = { additionalConsoleApis: project.additionalConsoleApis };';
        expect(/additionalConsoleApis\s*[:=]/.test(flatWrite)).toBe(true);
    });

    it('does not flag a file that merely NAMES the field in prose', () => {
        const proseOnly = '// Supersedes the flat additionalConsoleApis above.';
        expect(/additionalConsoleApis\s*[:=]/.test(proseOnly)).toBe(false);
    });
});
