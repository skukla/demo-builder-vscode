/**
 * SOP: prose attributes facts to a ROLE, never to a named person.
 *
 * `.rptc/CLAUDE.md` states the rule: *"Never name a colleague — least of all beside
 * a defect in their service. Write the role ('the service owner')."* It was recorded
 * on 2026-08-11, after a probe writeup reached the public remote carrying a
 * colleague's name. **This repository is public and `.rptc/` is tracked**, so a name
 * written into a doc is a name published.
 *
 * That rule had no enforcement. Between being written and 2026-08-23 it was broken
 * across roughly ninety sites and fifty-nine files — three people, in docs, plans,
 * skills, shipped CHANGELOG entries, source comments and test fixtures. All were
 * rewritten to roles on 2026-08-23. This is the enforcement that keeps it that way.
 *
 * NOT in scope, deliberately: `package.json`'s `author` and `publisher`, and the
 * `skukla/*` repository URLs the code actually resolves. That is the project's own
 * published address, not an attribution — redacting it would break the product and
 * protect nobody.
 *
 * WHY A HEURISTIC RATHER THAN A DENYLIST. The obvious check is a list of names to
 * refuse. It cannot exist here: a denylist of real colleagues committed to a public
 * repo publishes exactly the names it protects. So this matches the CONSTRUCTION
 * instead — an attribution verb or a dated citation followed by a capitalised
 * first-name-shaped token — and ships no names at all.
 *
 * ALLOWLIST POLICY. `NOT_A_PERSON` may only ever contain words that are not people:
 * products, tools, orgs, and sentence-leading words. **Never add a person's name to
 * silence a failure** — that reintroduces the leak in the one file guaranteed to be
 * read. Fix the prose instead.
 *
 * A false positive means rephrasing to a role, which is what the rule wants anyway.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..');

/** Trees whose prose is published: tracked docs, RPTC artifacts, and code comments. */
const SCANNED: ReadonlyArray<{ dir: string; exts: readonly string[] }> = [
    { dir: '.rptc', exts: ['.md'] },
    { dir: 'docs', exts: ['.md'] },
    { dir: 'src', exts: ['.ts', '.tsx'] },
    { dir: 'tests', exts: ['.ts', '.tsx'] },
];

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'out', 'coverage']);

/** This file's positive control carries a deliberate fixture name; it must not scan itself. */
const SELF = path.basename(__filename).replace(/\.js$/, '.ts');

/**
 * Attribution shapes. Each captures the token that would be the person.
 *
 * Kept narrow on purpose: a bare capitalised word is far too common to flag, so
 * every pattern requires an attribution verb, a possessive claim, or a citation date.
 */
const ATTRIBUTION_PATTERNS: readonly RegExp[] = [
    /\b(?:confirmed|verified|reported|answered|asked|told|explained)\s+by\s+([A-Z][a-z]{2,})\b/g,
    /\baccording\s+to\s+([A-Z][a-z]{2,})\b/g,
    /\b([A-Z][a-z]{2,})\s+(?:said|noted|confirmed|replied|answered|explained|clarified)\b/g,
    /\b([A-Z][a-z]{2,})'s\s+(?:answer|reply|flow|call|view|opinion|account)\b/g,
    /\b([A-Z][a-z]{2,}),\s+\d{4}-\d{2}-\d{2}\b/g,
    /\(([A-Z][a-z]{2,}),\s+(?:the\s+)?(?:service\s+)?author\b/g,
];

/**
 * Capitalised words that are legitimately not people.
 *
 * Products, orgs, tools and sentence-leading words only — see ALLOWLIST POLICY above.
 */
const NOT_A_PERSON = new Set([
    'Adobe', 'Commerce', 'Console', 'Runtime', 'Helix', 'Mongo', 'MongoDB', 'Atlas',
    'GitHub', 'Postman', 'Claude', 'Jest', 'React', 'Spectrum', 'Node', 'Playwright',
    'Chromium', 'TypeScript', 'JavaScript', 'Docker', 'Slack', 'Confluence',
    'Data', 'Demo', 'Builder', 'Installer', 'Stage', 'Service', 'Team', 'Support',
    'The', 'This', 'That', 'These', 'Those', 'Their', 'They', 'When', 'Then', 'Than',
    'What', 'Which', 'While', 'Where', 'Here', 'There', 'Both', 'Each', 'Every',
    'Anyone', 'Someone', 'Nobody', 'Everyone', 'Asked', 'Confirmed', 'Measured',
    'Note', 'Also', 'Only', 'Still', 'Already', 'Never', 'Always', 'Because',
    // Sentence subjects that are things, not speakers — every one of these was a
    // false positive on the first run over this repo.
    'Steps', 'Step', 'User', 'Users', 'Research', 'Redeploy', 'Update', 'Scan',
    'Diagnostics', 'Diagnostic', 'Deliverable', 'Delete', 'Access', 'Auth', 'Audit',
    'Code', 'Direction', 'Full', 'Microsoft', 'Two', 'One', 'All', 'Not', 'For',
    'Plan', 'Test', 'Tests', 'Reset', 'Import', 'Export', 'Wizard', 'Dashboard',
]);

function walk(dir: string, exts: readonly string[], out: string[] = []): string[] {
    if (!fs.existsSync(dir)) {
        return out;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) {
                walk(path.join(dir, entry.name), exts, out);
            }
        } else if (exts.some((e) => entry.name.endsWith(e)) && entry.name !== SELF) {
            out.push(path.join(dir, entry.name));
        }
    }
    return out;
}

interface Hit {
    file: string;
    line: number;
    name: string;
    text: string;
}

function findHits(): Hit[] {
    const hits: Hit[] = [];
    for (const { dir, exts } of SCANNED) {
        for (const file of walk(path.join(ROOT, dir), exts)) {
            const lines = fs.readFileSync(file, 'utf8').split('\n');
            lines.forEach((text, i) => {
                for (const pattern of ATTRIBUTION_PATTERNS) {
                    pattern.lastIndex = 0;
                    let match: RegExpExecArray | null;
                    while ((match = pattern.exec(text)) !== null) {
                        const name = match[1];
                        if (!NOT_A_PERSON.has(name)) {
                            hits.push({
                                file: path.relative(ROOT, file),
                                line: i + 1,
                                name,
                                text: text.trim().slice(0, 100),
                            });
                        }
                    }
                }
            });
        }
    }
    return hits;
}

describe('SOP: prose names roles, not people', () => {
    it('attributes no fact to a named person', () => {
        const hits = findHits();
        const report = hits
            .map((h) => `  ${h.file}:${h.line} — attributed to "${h.name}"\n      ${h.text}`)
            .join('\n');
        expect(
            hits.length === 0
                ? ''
                : `Prose attributes a fact to a named person. This repo is PUBLIC.\n` +
                  `Rewrite to the role ("the service author", "the operator").\n` +
                  `If the token is not a person, add it to NOT_A_PERSON — never a real name.\n\n` +
                  report,
        ).toBe('');
    });

    // A scan that silently reads nothing passes forever. This proves it reads.
    it('actually scans a non-trivial corpus', () => {
        const files = SCANNED.flatMap(({ dir, exts }) => walk(path.join(ROOT, dir), exts));
        expect(files.length).toBeGreaterThan(100);
    });

    // Positive control: the detector must fire on a known-bad construction.
    it('detects an attribution when one is present', () => {
        const sample = 'The intended workflow, confirmed by Alexis (the service author), 2026-08-14:';
        const fired = ATTRIBUTION_PATTERNS.some((p) => {
            p.lastIndex = 0;
            const m = p.exec(sample);
            return m !== null && !NOT_A_PERSON.has(m[1]);
        });
        expect(fired).toBe(true);
    });
});
