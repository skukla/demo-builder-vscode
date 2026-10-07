/**
 * Which Node Demo Builder runs on, from what each component declares (PR-1a).
 * The source list is read against the REAL bundled catalogs, so adding a component
 * moves these pins on purpose; the rule is driven with fixed release lists.
 */

import {
    chooseNode,
    engineRangeOf,
    excludedNodeSources,
    listNodeSources,
    nodeForRepoRange,
    parseFnmReleases,
    type NodeRelease,
} from '@/features/components/services/nodeResolution';

/** A slice of nodejs.org's index: LTS 18, 20, 22, 24 and a current 25/26 that are not LTS. */
const RELEASES: NodeRelease[] = [
    { version: 'v26.0.0', lts: false },
    { version: 'v25.9.0', lts: false },
    { version: 'v24.21.0', lts: 'Krypton' },
    { version: 'v24.12.0', lts: 'Krypton' },
    { version: 'v22.23.3', lts: 'Jod' },
    { version: 'v20.20.2', lts: 'Iron' },
    { version: 'v18.20.8', lts: 'Hydrogen' },
];

describe('listNodeSources: where the ranges are read', () => {
    let refs: () => string[];

    beforeAll(async () => {
        const listed = (await listNodeSources()).map((s) => s.ref);
        refs = () => listed;
    });

    it('reads each mesh at the tag Demo Builder installs, not the default branch', () => {
        expect(refs()).toEqual(expect.arrayContaining([
            'skukla/commerce-eds-mesh@stable',
            'skukla/eds-accs-mesh@stable',
            'skukla/headless-commerce-mesh@stable',
        ]));
    });

    it('reads every App Builder catalog entry at its branch', () => {
        expect(refs()).toEqual(expect.arrayContaining([
            'skukla/demo-erp@main',
            'skukla/commerce-erp-integration@main',
            'adobe/commerce-integration-starter-kit@main',
            'skukla/app-builder-shell@main',
        ]));
    });

    it('reads a storefront Demo Builder runs locally, and none it does not', () => {
        expect(refs()).toContain('skukla/citisignal-nextjs@main');
        // EDS storefronts install nothing locally (skipNpmInstall), so their repos decide nothing.
        expect(refs().filter((r) => r.startsWith('adobe-commerce/boilerplate-b2b-template'))).toStrictEqual([]);
    });

    it('reads the npm packages the prerequisites and the AI tools install', () => {
        expect(refs()).toEqual(expect.arrayContaining([
            '@adobe/aio-cli@latest',
            '@adobe/aio-cli-plugin-api-mesh@latest',
            '@dropins/ai-tools@^1.0.0',
        ]));
    });

    it('leaves the unreadable ingestion tool out, and says why', () => {
        expect(refs().some((r) => r.includes('commerce-demo-ingestion'))).toBe(false);
        expect(excludedNodeSources().map((e) => e.id)).toStrictEqual(['commerce-demo-ingestion']);
    });

    it('lists each ref once', () => {
        expect(new Set(refs()).size).toBe(refs().length);
    });
});

describe('engineRangeOf', () => {
    it('reads engines.node, and nothing when a package declares none or is not JSON', () => {
        expect(engineRangeOf('{"engines":{"node":">=20"}}')).toBe('>=20');
        expect(engineRangeOf('{"name":"x"}')).toBeUndefined();
        expect(engineRangeOf('not json')).toBeUndefined();
    });
});

describe('chooseNode: the lowest long-term release every range accepts', () => {
    it('picks the lowest LTS that fits, not the newest', () => {
        expect(chooseNode([{ id: 'a', range: '>=20' }, { id: 'b', range: '>=18' }], RELEASES))
            .toStrictEqual({ ok: true, major: '20' });
    });

    it('rises only when a floor or a ceiling demands it (the shipped set today: 24)', () => {
        const ranges = [
            { id: 'erp', range: '^24.0.0' },
            { id: 'tools', range: '>=22.0.0' },
            { id: 'cli', range: '>=20' },
        ];
        expect(chooseNode(ranges, RELEASES)).toStrictEqual({ ok: true, major: '24' });
    });

    it('lets a source with no range accept anything', () => {
        expect(chooseNode([{ id: 'storefront' }, { id: 'cli', range: '>=20' }], RELEASES))
            .toStrictEqual({ ok: true, major: '20' });
    });

    it('falls back to a regular release when no LTS fits (a repo that needs 26 before it is LTS)', () => {
        expect(chooseNode([{ id: 'outside', range: '>=26' }], RELEASES)).toStrictEqual({ ok: true, major: '26' });
    });

    it('names the ranges that block when nothing fits', () => {
        const result = chooseNode(
            [
                { id: 'erp', range: '^24.0.0' },
                { id: 'cli', range: '>=20' },
                { id: 'old-mesh', range: '^14 || ^16 || ^18' },
            ],
            RELEASES,
        );
        expect(result).toStrictEqual({ ok: false, blocking: ['old-mesh (^14 || ^16 || ^18)'] });
    });
});

describe('parseFnmReleases', () => {
    it('reads versions and marks a codename as LTS', () => {
        expect(parseFnmReleases('v22.23.3 (Jod)\nv25.9.0\nnot a line\n')).toStrictEqual([
            { version: 'v22.23.3', lts: 'Jod' },
            { version: 'v25.9.0', lts: false },
        ]);
    });
});

describe('nodeForRepoRange: an integration from an SC\'s own repo', () => {
    it('takes Demo Builder\'s Node when the range accepts it (>=18 with a shared 24)', () => {
        expect(nodeForRepoRange('>=18', '24', [], RELEASES)).toStrictEqual({ ok: true, major: '24' });
    });

    it('takes Demo Builder\'s Node when the repo declares no range', () => {
        expect(nodeForRepoRange(undefined, '24', [], RELEASES)).toStrictEqual({ ok: true, major: '24' });
    });

    it('reuses a Node already in the folder before installing one (^22 with 22 in the folder)', () => {
        expect(nodeForRepoRange('^22', '24', ['22', '24'], RELEASES)).toStrictEqual({ ok: true, major: '22' });
    });

    it('installs the lowest release the range accepts when nothing in the folder fits', () => {
        expect(nodeForRepoRange('^22', '24', ['24'], RELEASES)).toStrictEqual({ ok: true, major: '22' });
        expect(nodeForRepoRange('>=26', '24', ['24'], RELEASES)).toStrictEqual({ ok: true, major: '26' });
    });

    it('refuses a range no release satisfies, naming it', () => {
        expect(nodeForRepoRange('>=99', '24', ['24'], RELEASES)).toStrictEqual({ ok: false, range: '>=99' });
    });

    it('still answers offline, from the range alone', () => {
        expect(nodeForRepoRange('>=20', '24', [], [])).toStrictEqual({ ok: true, major: '24' });
    });
});

