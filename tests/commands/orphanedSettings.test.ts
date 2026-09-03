/**
 * Orphaned settings — a value the user set that the extension no longer reads.
 *
 * The failure this exists for (2026-08-18): `demoBuilder.daLive.AEMRepositoryId`
 * was renamed to `demoBuilder.daLive.aemAuthorUrl` in Feb 2026 (commit 062f09f7).
 * Renaming a contributed setting does NOT migrate the user's value — VS Code
 * simply stops reading the old key. Because the new key ships with a non-empty
 * default, the code's `if (aemAuthorUrl)` guard stayed true and every site was
 * silently bound to the DEFAULT AEM instead of the configured one, logging
 * "Applied" each time. Six months passed before anyone noticed, and it took a
 * colleague's bug report plus a manual diff of settings.json to find.
 *
 * A rename is cheap to make and expensive to detect. This makes it detectable.
 */

import {
    collectUserSetKeys,
    contributedKeysFrom,
    orphanedKeys,
} from '@/commands/orphanedSettings';

describe('orphanedKeys', () => {
    it('names a key the user set that nothing contributes', () => {
        expect(
            orphanedKeys(['demoBuilder.daLive.aemAuthorUrl'], ['demoBuilder.daLive.AEMRepositoryId']),
        ).toEqual(['demoBuilder.daLive.AEMRepositoryId']);
    });

    it('says nothing about a key that is still contributed', () => {
        expect(
            orphanedKeys(['demoBuilder.daLive.aemAuthorUrl'], ['demoBuilder.daLive.aemAuthorUrl']),
        ).toEqual([]);
    });

    it('sorts, so two runs of the report diff cleanly', () => {
        expect(orphanedKeys([], ['demoBuilder.z', 'demoBuilder.a'])).toEqual([
            'demoBuilder.a',
            'demoBuilder.z',
        ]);
    });

    it('reports nothing when the user has set nothing', () => {
        expect(orphanedKeys(['demoBuilder.daLive.aemAuthorUrl'], [])).toEqual([]);
    });
});

describe('contributedKeysFrom', () => {
    it('reads every property across all configuration sections', () => {
        const packageJSON = {
            contributes: {
                configuration: [
                    { properties: { 'demoBuilder.a': {}, 'demoBuilder.b': {} } },
                    { properties: { 'demoBuilder.c': {} } },
                ],
            },
        };

        expect(contributedKeysFrom(packageJSON).sort()).toEqual([
            'demoBuilder.a',
            'demoBuilder.b',
            'demoBuilder.c',
        ]);
    });

    it('accepts a single configuration object as well as an array', () => {
        const packageJSON = {
            contributes: { configuration: { properties: { 'demoBuilder.a': {} } } },
        };

        expect(contributedKeysFrom(packageJSON)).toEqual(['demoBuilder.a']);
    });

    /** A diagnostic must never become the failure it was called to explain. */
    it('returns nothing rather than throwing on a shape it does not recognise', () => {
        expect(contributedKeysFrom(undefined)).toEqual([]);
        expect(contributedKeysFrom({ contributes: {} })).toEqual([]);
        expect(contributedKeysFrom('nonsense')).toEqual([]);
    });
});

describe('collectUserSetKeys', () => {
    /** `inspect` as VS Code answers it: a user value lives in globalValue. */
    function inspector(userSet: Record<string, unknown>, contributed: string[] = []) {
        return (key: string) => {
            const isSetting = key in userSet || contributed.includes(key);
            if (!isSetting) return undefined;
            return {
                ...(contributed.includes(key) ? { defaultValue: 'x' } : {}),
                ...(key in userSet ? { globalValue: userSet[key] } : {}),
            };
        };
    }

    it('finds a user-set leaf nested under a section', () => {
        const tree = { daLive: { AEMRepositoryId: 'https://author-p1.example' } };

        const keys = collectUserSetKeys(
            tree,
            'demoBuilder',
            inspector({ 'demoBuilder.daLive.AEMRepositoryId': 'https://author-p1.example' }),
        );

        expect(keys).toEqual(['demoBuilder.daLive.AEMRepositoryId']);
    });

    it('ignores a key the user never set, even though it appears in the tree', () => {
        // Contributed defaults materialise in the tree too; only a user value counts.
        const tree = { daLive: { aemAuthorUrl: 'author-default.example' } };

        const keys = collectUserSetKeys(
            tree,
            'demoBuilder',
            inspector({}, ['demoBuilder.daLive.aemAuthorUrl']),
        );

        expect(keys).toEqual([]);
    });

    it('does not descend INTO an object-valued setting the user set', () => {
        // `blockLibraries.defaults` is itself a setting whose value is an object.
        // Recursing would invent keys like `demoBuilder.blockLibraries.defaults.foo`.
        const tree = { blockLibraries: { defaults: { foo: true, bar: false } } };

        const keys = collectUserSetKeys(
            tree,
            'demoBuilder',
            inspector({ 'demoBuilder.blockLibraries.defaults': { foo: true } }),
        );

        expect(keys).toEqual(['demoBuilder.blockLibraries.defaults']);
    });

    it('walks more than one level down', () => {
        const tree = { a: { b: { c: 1 } } };

        const keys = collectUserSetKeys(tree, 'demoBuilder', inspector({ 'demoBuilder.a.b.c': 1 }));

        expect(keys).toEqual(['demoBuilder.a.b.c']);
    });

    it('survives a null or non-object tree', () => {
        expect(collectUserSetKeys(null as unknown as Record<string, unknown>, 'demoBuilder', () => undefined)).toEqual([]);
    });
});
