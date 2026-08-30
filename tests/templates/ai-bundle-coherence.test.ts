/**
 * AI-bundle coherence — the agreements between files that nothing else checks.
 *
 * Two defects shipped through a fully green suite in one week because every
 * test asserted the bundle against its own fixtures: six storefront skills
 * that never installed (the copy read a directory that never held them), and
 * the App Builder skill set on projects with no App Builder app. Neither was a
 * logic bug — both were two files DISAGREEING about one fact with no test
 * spanning them. This suite owns those spans.
 *
 * Static invariants only. The live half — do real projects on disk match their
 * shape — is `.claude/skills/ai-bundle-coherence/scan.mjs`, which needs a real
 * installed package and therefore cannot run here.
 *
 * Invariant 1 of the backlog item (skill set follows project shape) is pinned
 * where the gate lives: `skillsWriter.toolGating.test.ts` ("the App Builder
 * skill set follows the work, not the tooling"). Not restated here.
 */

import * as fs from 'fs';
import * as path from 'path';
import { BUNDLE_LABELS, SERVER_LABELS } from '@/features/dashboard/ui/components/aiSurfaceNames';
import { SKILL_MCP_TOOL_DEPENDENCIES, DEMO_BUILDER_ALWAYS_ON_SKILLS } from '@/types/ai';

// Read as a FILE, not a module import: the jest moduleNameMapper does not map
// JSON under @/, and this suite is about files agreeing anyway.
const aiDefaults = JSON.parse(
    fs.readFileSync(
        path.join(__dirname, '../../src/features/project-creation/config/ai-defaults.json'),
        'utf-8'
    )
) as { mcpServers: Array<{ id: string }> };
const AI_DEFAULT_IDS = new Set(aiDefaults.mcpServers.map((e) => e.id));

describe('skill→tool dependencies name real ai-defaults entries', () => {
    // The gating chain resolves these ids against what ai-defaults installed.
    // Rename an entry and every dependent skill silently changes delivery
    // behaviour — no compiler error, no test, until now.
    it('every declared dependency id exists in ai-defaults.json', () => {
        const unknown = Object.entries(SKILL_MCP_TOOL_DEPENDENCIES)
            .filter(([, id]) => !AI_DEFAULT_IDS.has(id))
            .map(([skill, id]) => `${skill} -> ${id}`);
        expect(unknown).toEqual([]);
    });

    it('every dependent skill is a declared always-on skill', () => {
        const names = new Set<string>(DEMO_BUILDER_ALWAYS_ON_SKILLS);
        const orphans = Object.keys(SKILL_MCP_TOOL_DEPENDENCIES).filter((f) => !names.has(f));
        expect(orphans).toEqual([]);
    });
});

describe('the writer and the modal agree on bundle prefixes', () => {
    // skillsWriter stamps `<prefix>-<skill>/` directories; AiSkillsList keys
    // its group labels on the same prefixes. They live three features apart
    // and nothing ties them: a writer prefix the modal does not know renders
    // an unlabeled "Adobe" group, and a modal key no writer produces is a
    // label for nothing.
    const writerSource = fs.readFileSync(
        path.join(
            __dirname,
            '../../src/features/project-creation/services/aiBundle/skillsWriter.ts'
        ),
        'utf-8'
    );
    // The prefix argument always sits on the line immediately before
    // `writer,` in a copyAdobeSkillBundle call — anchoring on that pair
    // survives the nested parens that killed a fancier extraction (the
    // control below is what caught it).
    const writerPrefixes = [...writerSource.matchAll(/'([a-z-]+)',\s*\n\s*writer,/g)].map(
        (m) => m[1]
    );

    it('the writer extraction still finds prefixes (control)', () => {
        expect(writerPrefixes.length).toBeGreaterThanOrEqual(2);
    });

    it('every writer prefix has a modal label, and vice versa', () => {
        const modalKeys = Object.keys(BUNDLE_LABELS).sort();
        expect([...new Set(writerPrefixes)].sort()).toEqual(modalKeys);
    });
});

describe('no bundle writer writes around the hash-and-skip seam', () => {
    // CLAUDE.md states as an invariant that a user's own edits are never
    // overwritten, and ADR-013's GeneratedFileWriter is what makes that true: a
    // file whose content no longer matches its recorded hash is skipped and
    // reported. A direct `fsPromises.writeFile` in one of these writers silently
    // returns THAT file to blind-overwrite behaviour, with nothing else failing.
    //
    // Until now the rule was a grep written down in the `ai-context-authoring`
    // skill — a check someone had to remember to run. This is the same check,
    // held by the build instead.
    const WRITERS = ['skillsWriter', 'aiContextWriter', 'mcpConfigWriter'];
    const BUNDLE_DIR = path.join(
        __dirname,
        '../../src/features/project-creation/services/aiBundle'
    );

    // Comments discuss the rule (aiContextWriter's header explains exactly why a
    // direct write would be wrong), so strip them or the doc defeats the test.
    const stripComments = (src: string): string =>
        src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    it('CONTROL: each writer exists and still has code after comments are stripped', () => {
        for (const w of WRITERS) {
            const src = fs.readFileSync(path.join(BUNDLE_DIR, `${w}.ts`), 'utf-8');
            expect(stripComments(src).trim().length).toBeGreaterThan(200);
        }
    });

    it('CONTROL: the matcher can see a write when one is present', () => {
        expect(/\bwriteFile\b/.test(stripComments('await fsPromises.writeFile(p, s);'))).toBe(true);
    });

    it.each(WRITERS)('%s goes through GeneratedFileWriter, never fs directly', (writer) => {
        const code = stripComments(fs.readFileSync(path.join(BUNDLE_DIR, `${writer}.ts`), 'utf-8'));
        const offenders = code
            .split('\n')
            .map((line, i) => ({ line: line.trim(), no: i + 1 }))
            .filter(({ line }) => /\bwriteFile\b/.test(line));
        expect(offenders).toEqual([]);
    });
});

describe('every user-facing name carries its provenance', () => {
    // On 2026-08-26 four of six user-facing names were wrong, and correcting
    // them took two rounds of research because nothing recorded where any name
    // came from. Provenance is structural now; an empty source is a name
    // someone made up.
    it.each(Object.entries(SERVER_LABELS))('server %s', (_id, entry) => {
        expect(entry.label.length).toBeGreaterThan(0);
        expect(entry.source.length).toBeGreaterThan(10);
    });

    it.each(Object.entries(BUNDLE_LABELS))('bundle %s', (_id, entry) => {
        expect(entry.label.length).toBeGreaterThan(0);
        expect(entry.source.length).toBeGreaterThan(10);
    });
});
