/**
 * Every tool has words, and they were written rather than derived.
 *
 * WHY THIS EXISTS. Narration used to be built from the tool's name, so the chat
 * announced "Deploy mesh…" (a button label) above "Deploying…" (a status line),
 * and about ten tools got phrases that were not English: "Set project pinned…",
 * "Set console APIs…", "Republish…" — republish what?
 *
 * The fix is an authored phrase per tool with NO fallback, which moves the
 * failure from "ships wrong wording" to "ships no wording". This suite is what
 * makes that second failure loud.
 *
 * The name-vs-description trap is worth naming, because the first draft of the
 * table fell into it: phrases written from tool NAMES are the same derivation
 * being removed, just performed by hand. Reading all 103 descriptions changed
 * several phrases and caught two tools the name-derived list had missed
 * entirely.
 */

import { readdirSync, readFileSync } from 'fs';
import { TOOL_NARRATION, narrationFor } from '@/features/ai/server/toolNarration';
import { ACTION_DESCRIPTORS } from '@/features/ai/server/actionDescriptors';
import { READ_DESCRIPTORS } from '@/features/ai/server/readDescriptors';
import { STATUS_DESCRIPTORS } from '@/features/ai/server/statusDescriptors';
import { DATA_INSTALLER_DESCRIPTORS } from '@/features/ai/server/dataInstallerDescriptors';

const SERVER_DIR = 'src/features/ai/server';
const EXTRA_REGISTRAR_FILES = ['src/mcp-server.ts'];

/** Every tool name registered anywhere, from BOTH registration paths. */
function allRegisteredToolNames(): string[] {
    const fromDescriptors = [
        ...ACTION_DESCRIPTORS,
        ...READ_DESCRIPTORS,
        ...STATUS_DESCRIPTORS,
        ...DATA_INSTALLER_DESCRIPTORS,
    ].map((d) => d.tool);

    const fromDirect: string[] = [];
    for (const file of [
        ...readdirSync(SERVER_DIR).map((f) => `${SERVER_DIR}/${f}`),
        ...EXTRA_REGISTRAR_FILES,
    ].filter((f) => f.endsWith('.ts'))) {
        const source = readFileSync(file, 'utf8');
        // Anchored: `src/mcp-server.ts` names `server.registerTool(...)` in its
        // opening docstring, and an unanchored match counts that prose.
        for (const m of source.matchAll(/^\s*server\.registerTool\(\s*\n?\s*'([a-z_]+)'/gm)) {
            fromDirect.push(m[1]);
        }
    }
    return [...new Set([...fromDescriptors, ...fromDirect])];
}

describe('every tool has an authored phrase', () => {
    const names = allRegisteredToolNames();

    it('finds the whole tool surface', () => {
        // Vacuous-pass guard: a broken scan would make the next test trivially
        // true. The count is deliberately a floor, not an equality — pinning the
        // exact number turns every new tool into a two-line change here.
        expect(names.length).toBeGreaterThan(95);
    });

    it('leaves no tool wordless', () => {
        const wordless = names.filter((n) => !narrationFor(n));

        expect(wordless).toEqual([]);
    });

    it('carries no phrase for a tool that no longer exists', () => {
        // The other direction. A phrase left behind after a tool is deleted is
        // dead text that reads as coverage.
        const orphans = Object.keys(TOOL_NARRATION).filter((n) => !names.includes(n));

        expect(orphans).toEqual([]);
    });
});

describe('the phrases read as English, not as schema', () => {
    const phrases = Object.entries(TOOL_NARRATION);

    it('completes the sentence "Demo Builder is …"', () => {
        // Every phrase is progressive, because that is the frame it appears in.
        // This catches the imperative form the derivation used to produce
        // ("Deploy mesh", "Set setting") without anyone having to re-read 103
        // strings.
        const notProgressive = phrases
            .filter(([, phrase]) => !/^[A-Z][a-z]+ing\b/.test(phrase))
            .map(([tool, phrase]) => `${tool}: ${phrase}`);

        expect(notProgressive).toEqual([]);
    });

    it('never leaks a schema word into prose', () => {
        // "Set project pinned" was a field name wearing a space. A phrase that
        // still contains its tool's snake_case id, or reads like one, is the
        // derivation coming back.
        const leaks = phrases
            .filter(([tool, phrase]) => phrase.includes('_') || phrase.includes(tool))
            .map(([tool, phrase]) => `${tool}: ${phrase}`);

        expect(leaks).toEqual([]);
    });

    it('names an object rather than trailing off', () => {
        // "Republishing…" alone was the worst line in the audit. A one-word
        // phrase cannot say what it acts on.
        const tooShort = phrases
            .filter(([, phrase]) => phrase.trim().split(/\s+/).length < 2)
            .map(([tool, phrase]) => `${tool}: ${phrase}`);

        expect(tooShort).toEqual([]);
    });

    it('checks a non-empty table', () => {
        expect(phrases.length).toBeGreaterThan(95);
    });
});
