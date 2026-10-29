/**
 * What a component update does to a user's `.env` — asserted, not described.
 *
 * REPLACES `componentUpdater-envMigration.test.ts`, which had six `it()` blocks
 * containing setup code and comments and NOT ONE assertion of any kind. It
 * passed forever, contributed six green tests to every run, and proved nothing.
 * Its prose was right about a real gap; the gap just was not pinned.
 *
 * The merge was unreachable without driving a download, an extraction, a
 * structure verification and a post-update build, so it was extracted to
 * `envMerge.ts` — same two lines, given a seam.
 *
 * THE GAP, in one sentence: the merge preserves the user's values by KEY, so a
 * component that RENAMES a variable gets the new key with an empty default while
 * the user's real value stays under the dead old name. The component reads the
 * new name, finds nothing, and fails at runtime.
 */

import {
    ENV_VAR_RENAMES,
    mergeEnvContent,
    parseEnvFile,
} from '@/features/updates/services/envMerge';

describe('parsing an env file', () => {
    it('ignores blank lines and # comments', () => {
        expect(parseEnvFile('\n# a note\nA=1\n\n')).toEqual(new Map([['A', '1']]));
    });

    it('keeps `=` inside a value — URLs and base64 survive', () => {
        // A regression worth pinning: splitting on every `=` would truncate a
        // GraphQL endpoint or an encoded secret at its first padding character.
        expect(parseEnvFile('URL=https://x.io/gql?a=1&b=2').get('URL')).toBe(
            'https://x.io/gql?a=1&b=2'
        );
    });
});

describe('malformed and whitespace-padded lines', () => {
    /**
     * Every test in this block was written on 2026-08-30 to kill a mutant that
     * SURVIVED the Stryker pilot. The suite above had high line coverage and still
     * did not notice when `trim()` was deleted, when the `if (key)` guard was
     * forced true, or when the trailing newline was dropped — five mutations, five
     * green runs. Coverage said 100%; the tests were checking less than that.
     *
     * These are not hypothetical inputs. A hand-edited `.env` is exactly where a
     * padded key or a stray `=` line comes from.
     */
    it('ignores a whitespace-only line rather than storing an empty key', () => {
        const vars = parseEnvFile('   \nA=1');

        expect(vars.has('')).toBe(false);
        expect(vars.size).toBe(1);
    });

    it('ignores a line with no key at all (`=orphan`)', () => {
        const vars = parseEnvFile('=orphan\nA=1');

        expect(vars.has('')).toBe(false);
        expect(vars.size).toBe(1);
    });

    it('trims padding around the KEY — ` A =1` is A', () => {
        expect(parseEnvFile(' A =1').get('A')).toBe('1');
    });

    it('trims padding around the VALUE — `A= 1 ` is 1', () => {
        expect(parseEnvFile('A= 1 ').get('A')).toBe('1');
    });

    it('terminates the merged file with a newline', () => {
        // A file that does not end in a newline concatenates with whatever is
        // appended next, silently corrupting the last variable.
        expect(mergeEnvContent('A=1', 'A=')).toMatch(/\n$/);
    });
});

describe('merging .env with a new .env.example', () => {
    it("keeps the user's value when the template ships a default", () => {
        const merged = mergeEnvContent('API_KEY=secret-123', 'API_KEY=');

        expect(parseEnvFile(merged).get('API_KEY')).toBe('secret-123');
    });

    it('adds a key the new template introduces', () => {
        const merged = mergeEnvContent('OLD=1', 'OLD=\nNEW=default-value');

        expect(parseEnvFile(merged).get('NEW')).toBe('default-value');
    });

    it('keeps a key the template dropped — customisation is never discarded', () => {
        const merged = mergeEnvContent('CUSTOM=mine', 'OTHER=');

        expect(parseEnvFile(merged).get('CUSTOM')).toBe('mine');
    });
});

describe('a renamed variable carries the user value across', () => {
    /**
     * PL-24. A component renames `CATALOG_SERVICE_ENDPOINT` to
     * `ADOBE_CATALOG_SERVICE_ENDPOINT` and ships a template carrying only the new
     * name. With the rename DECLARED, the existing project's value moves to the
     * new name — CLAUDE.md property 3: existing projects keep working.
     *
     * The rename here is synthetic. The real list (`ENV_VAR_RENAMES`) has no
     * entries yet, because no component has renamed a variable since this landed.
     */
    const RENAMES = { CATALOG_SERVICE_ENDPOINT: 'ADOBE_CATALOG_SERVICE_ENDPOINT' };
    const OLD_ENV = 'CATALOG_SERVICE_ENDPOINT=https://catalog.adobe.io/graphql\nAPI_KEY=k-1';
    const NEW_TEMPLATE = 'ADOBE_CATALOG_SERVICE_ENDPOINT=\nAPI_KEY=';

    it("puts the user's value under the new name", () => {
        const merged = parseEnvFile(mergeEnvContent(OLD_ENV, NEW_TEMPLATE, RENAMES));

        expect(merged.get('ADOBE_CATALOG_SERVICE_ENDPOINT')).toBe(
            'https://catalog.adobe.io/graphql',
        );
    });

    it('drops the old name, which nothing reads any more', () => {
        const merged = parseEnvFile(mergeEnvContent(OLD_ENV, NEW_TEMPLATE, RENAMES));

        expect(merged.has('CATALOG_SERVICE_ENDPOINT')).toBe(false);
    });

    it('leaves every other key alone', () => {
        const merged = parseEnvFile(mergeEnvContent(OLD_ENV, NEW_TEMPLATE, RENAMES));

        expect(merged.get('API_KEY')).toBe('k-1');
        expect(merged.size).toBe(2);
    });

    it('never overwrites a value the user already set under the new name', () => {
        const both = `${OLD_ENV}\nADOBE_CATALOG_SERVICE_ENDPOINT=https://mine.example/graphql`;

        const merged = parseEnvFile(mergeEnvContent(both, NEW_TEMPLATE, RENAMES));

        expect(merged.get('ADOBE_CATALOG_SERVICE_ENDPOINT')).toBe('https://mine.example/graphql');
        // Both names were the user's; neither is discarded.
        expect(merged.get('CATALOG_SERVICE_ENDPOINT')).toBe('https://catalog.adobe.io/graphql');
    });

    it('does nothing when the project never had the old name', () => {
        const merged = parseEnvFile(mergeEnvContent('API_KEY=k-1', NEW_TEMPLATE, RENAMES));

        expect(merged.get('ADOBE_CATALOG_SERVICE_ENDPOINT')).toBe('');
        expect(merged.has('CATALOG_SERVICE_ENDPOINT')).toBe(false);
    });

    it('keeps the old name when the new template still ships it', () => {
        // A template carrying both names means the component still reads the old
        // one, so it is not dead and must not be removed.
        const template = `${NEW_TEMPLATE}\nCATALOG_SERVICE_ENDPOINT=`;

        const merged = parseEnvFile(mergeEnvContent(OLD_ENV, template, RENAMES));

        expect(merged.get('ADOBE_CATALOG_SERVICE_ENDPOINT')).toBe(
            'https://catalog.adobe.io/graphql',
        );
        expect(merged.get('CATALOG_SERVICE_ENDPOINT')).toBe('https://catalog.adobe.io/graphql');
    });

    it('the shipped rename list maps old names to different new names', () => {
        // Zero entries today. When one is added, it must be a real rename.
        for (const [from, to] of Object.entries(ENV_VAR_RENAMES)) {
            expect(to).not.toBe(from);
            expect(to).toMatch(/^[A-Z][A-Z0-9_]*$/);
        }
    });
});

describe('THE GAP, with no rename declared: a renamed variable is not migrated', () => {
    /**
     * The scenario the deleted suite described in comments. A component renames
     * `CATALOG_SERVICE_ENDPOINT` to `ADOBE_CATALOG_SERVICE_ENDPOINT` and ships a
     * template carrying only the new name.
     */
    const OLD_ENV = 'CATALOG_SERVICE_ENDPOINT=https://catalog.adobe.io/graphql\nAPI_KEY=k-1';
    const NEW_TEMPLATE = 'ADOBE_CATALOG_SERVICE_ENDPOINT=\nAPI_KEY=';

    it('leaves the new name EMPTY — this is what breaks the deploy', () => {
        const merged = parseEnvFile(mergeEnvContent(OLD_ENV, NEW_TEMPLATE));

        expect(merged.get('ADOBE_CATALOG_SERVICE_ENDPOINT')).toBe('');
    });

    it("strands the user's real value under the dead old name", () => {
        const merged = parseEnvFile(mergeEnvContent(OLD_ENV, NEW_TEMPLATE));

        expect(merged.get('CATALOG_SERVICE_ENDPOINT')).toBe('https://catalog.adobe.io/graphql');
    });
});
