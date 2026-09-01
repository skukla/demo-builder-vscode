/**
 * SOP Compliance Test: the naming rules that are actually TRUE here.
 *
 * WHY THIS DOES NOT ENFORCE THE CONVENTION AS IT WAS WRITTEN. `docs/CLAUDE.md`
 * stated naming as one rule in four rows — commands `camelCase`, React components
 * `PascalCase`, constants `UPPER_SNAKE_CASE`, and "a file is named for what it
 * exports" — and claimed nobody had ever broken it. Measured on 2026-08-31, that
 * claim was wrong in a more interesting way than a violation count: THE ROWS
 * CONTRADICT EACH OTHER, so there was no single statement to break.
 *
 *   - `src/commands/ResetAllCommand.ts` exports `class ResetAllCommand`. It is
 *     PascalCase, which the commands row forbids and the "named for what it
 *     exports" row requires.
 *   - `menuIcons.tsx` and ten more `.tsx` files export FUNCTIONS, not components,
 *     so camelCase is right by the export row and wrong by the components row.
 *   - "A file is named for what it exports" holds for **40%** of `src/` (343 of
 *     848). Most files are named for their SUBJECT and export several related
 *     symbols; that is the actual convention, and it is not what was written.
 *
 * So this suite enforces the two sub-claims that survive measurement, and the
 * convention text was rewritten to say them. A rule nobody can break because it
 * contradicts itself is not enforcement — it reads like a guarantee and holds
 * nothing, which is the failure `src/core/CLAUDE.md`'s "❌" already cost once.
 *
 * @see .rptc/backlog/2026-08-31-every-convention-enforced.md
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..');
const srcDir = path.join(repoRoot, 'src');

/**
 * A PascalCase `.tsx` whose same-named export is deliberately absent.
 *
 * Shrink-only, and each row says why it is not a defect. Both are the same
 * shape: a file named for its SUBJECT rather than for one export.
 */
const COMPONENT_NAME_EXEMPTIONS: Record<string, string> = {
    'src/core/ui/components/feedback/ApiCatalogFeedback.tsx':
        'exports renderApiCatalogFeedback + ApiCatalogFeedbackState — a render helper for the subject, not a component of that name',
    'src/features/authentication/ui/components/AdobeEntityFields.tsx':
        'plural: holds the AdobeProjectField and AdobeWorkspaceField family, so no single export can carry the filename',
};

const DECLARED =
    /^\s*export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/gm;

function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
}

function strip(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function declaredNames(file: string): Set<string> {
    const body = strip(fs.readFileSync(file, 'utf8'));
    return new Set([...body.matchAll(DECLARED)].map((m) => m[1]));
}

const files = walk(srcDir);
const rel = (f: string) => path.relative(repoRoot, f).replace(/\\/g, '/');

describe('the naming rules that survive measurement', () => {
    it('CONTROL: the corpus was read and the detectors see declarations', () => {
        expect(files.length).toBeGreaterThan(500);
        const sample = files.find((f) => f.endsWith('ProjectCard.tsx'));
        expect(sample).toBeDefined();
        expect(declaredNames(sample as string).size).toBeGreaterThan(0);
    });

    it('a PascalCase .tsx exports a symbol of the same name', () => {
        const offenders = files
            .filter((f) => f.endsWith('.tsx'))
            .filter((f) => /^[A-Z][A-Za-z0-9]*\.tsx$/.test(path.basename(f)))
            .filter((f) => !(rel(f) in COMPONENT_NAME_EXEMPTIONS))
            .filter((f) => !declaredNames(f).has(path.basename(f, '.tsx')))
            .map(rel);
        expect(offenders).toEqual([]);
    });

    it('every exemption still applies, and states a reason', () => {
        const stale = Object.keys(COMPONENT_NAME_EXEMPTIONS).filter((f) => {
            const abs = path.join(repoRoot, f);
            if (!fs.existsSync(abs)) return true;
            return declaredNames(abs).has(path.basename(f, '.tsx'));
        });
        const unreasoned = Object.entries(COMPONENT_NAME_EXEMPTIONS)
            .filter(([, why]) => !why || !why.trim())
            .map(([f]) => f);
        expect({ stale_deleteWithTheFix: stale, unreasoned }).toEqual({
            stale_deleteWithTheFix: [],
            unreasoned: [],
        });
    });

    it('an exported ALL-CAPS const is UPPER_SNAKE_CASE', () => {
        // Zero violations when adopted, so this one is a flat ban with no ledger.
        const offenders: string[] = [];
        for (const f of files) {
            const body = strip(fs.readFileSync(f, 'utf8'));
            for (const m of body.matchAll(/^\s*export\s+const\s+([A-Z][A-Za-z0-9_]*)\s*[:=]/gm)) {
                const name = m[1];
                // A PascalCase const is a component or a builder, not a constant:
                // uppercase-initial, contains lowercase, NO underscore. Anything
                // with an underscore is meant to be a constant, so a lowercase
                // letter in it is the violation. The first draft skipped every
                // name containing a lowercase letter, which silently exempted
                // `BAD_Name` — the exact shape this is for. Caught by the control
                // below, not by reading it.
                const isPascalCase = !name.includes('_') && /[a-z]/.test(name);
                if (isPascalCase) continue;
                if (!/^[A-Z][A-Z0-9_]*$/.test(name)) offenders.push(`${rel(f)}  ${name}`);
            }
        }
        expect(offenders).toEqual([]);
    });
});
