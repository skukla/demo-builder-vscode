/**
 * integrationSeed — the integrations an added demo's row names, as the wizard's
 * selection ids and (for custom apps) the by-link source records (D29).
 *
 * Pure, so it is called directly. Every result is read with `toStrictEqual`: the
 * decisions here are which KEYS exist — no `sources` for a demo that names only
 * catalog entries, no `branch` on a source that never had one — and `toEqual`
 * cannot tell an absent key from an undefined one.
 */

import { integrationSeed } from '@/features/project-creation/ui/steps/useProjectBuilder';
import { makeAddedDemo } from '../../../../helpers/demoPackageFixtures';

describe('integrationSeed', () => {
    it('answers nothing for a demo that names no integrations', () => {
        expect(integrationSeed(undefined, undefined)).toBeUndefined();
        expect(integrationSeed(makeAddedDemo(), { kept: { owner: 'a', repo: 'b' } })).toBeUndefined();
    });

    it('answers nothing for an integrations block that lists none', () => {
        expect(integrationSeed(makeAddedDemo({ integrations: {} }), undefined)).toBeUndefined();
        expect(integrationSeed(makeAddedDemo({ integrations: { catalog: [], custom: {} } }), undefined)).toBeUndefined();
    });

    it('seeds catalog ids as they are, with no sources record at all', () => {
        const seed = integrationSeed(
            makeAddedDemo({ integrations: { catalog: ['erp-integration'] } }),
            { kept: { owner: 'a', repo: 'b' } }
        );

        expect(seed).toStrictEqual({ ids: ['erp-integration'] });
    });

    it('seeds a custom app alone, under its key, with its branch and name', () => {
        const seed = integrationSeed(
            makeAddedDemo({
                integrations: {
                    custom: { 'loyalty-app': { owner: 'kai', repo: 'loyalty', branch: 'demo', name: 'Loyalty' } },
                },
            }),
            undefined
        );

        expect(seed).toStrictEqual({
            ids: ['loyalty-app'],
            sources: { 'loyalty-app': { owner: 'kai', repo: 'loyalty', branch: 'demo', name: 'Loyalty' } },
        });
    });

    it('mints owner-repo for a custom app with a blank key, and writes no branch or name it was not given', () => {
        const seed = integrationSeed(
            makeAddedDemo({ integrations: { catalog: ['erp-integration'], custom: { '': { owner: 'kai', repo: 'loyalty' } } } }),
            undefined
        );

        expect(seed).toStrictEqual({
            ids: ['erp-integration', 'kai-loyalty'],
            sources: { 'kai-loyalty': { owner: 'kai', repo: 'loyalty' } },
        });
    });

    it('keeps the sources the wizard already holds beside the ones it adds', () => {
        const seed = integrationSeed(
            makeAddedDemo({ integrations: { custom: { 'loyalty-app': { owner: 'kai', repo: 'loyalty' } } } }),
            { kept: { owner: 'a', repo: 'b' } }
        );

        expect(seed?.sources).toStrictEqual({
            kept: { owner: 'a', repo: 'b' },
            'loyalty-app': { owner: 'kai', repo: 'loyalty' },
        });
    });
});
