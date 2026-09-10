/**
 * Type Guards Tests - getEdsLiveUrl / getEdsPreviewUrl
 *
 * Both read the EDS storefront instance's metadata and, when the URL was never
 * stored, DERIVE it from `githubRepo` — the path existing projects take, since
 * they predate the stored URLs. So the fallback is not an edge case; it is how
 * most projects resolve, and each half is pinned separately here.
 *
 * The instance is keyed `eds-storefront` (COMPONENT_IDS.EDS_STOREFRONT). A
 * fixture under any other key exercises the "no storefront instance" path
 * instead, which is what several of these tests used to do by accident.
 */

import type { ComponentInstance, Project } from '@/types/base';
import { getEdsLiveUrl, getEdsPreviewUrl } from '@/types/typeGuards';
import { createMockProject } from '../helpers/projectFake';

function storefront(metadata: Record<string, unknown>): ComponentInstance {
    return {
        id: 'eds-storefront',
        name: 'Edge Delivery Services',
        status: 'deployed',
        metadata,
    };
}

function edsProject(metadata: Record<string, unknown>, stack = 'eds-dalive'): Project {
    return createMockProject({
        selectedStack: stack,
        componentInstances: { 'eds-storefront': storefront(metadata) },
    });
}

describe('getEdsLiveUrl', () => {
    it('returns the stored live URL', () => {
        expect(getEdsLiveUrl(edsProject({ liveUrl: 'https://main--my-site--owner.aem.live' }))).toBe(
            'https://main--my-site--owner.aem.live'
        );
    });

    it('derives the live URL from githubRepo when none was stored', () => {
        expect(getEdsLiveUrl(edsProject({ githubRepo: 'owner/my-site' }))).toBe(
            'https://main--my-site--owner.aem.live'
        );
    });

    it('prefers the stored URL over the derived one', () => {
        const both = edsProject({
            liveUrl: 'https://stored.example.com',
            githubRepo: 'owner/my-site',
        });
        expect(getEdsLiveUrl(both)).toBe('https://stored.example.com');
    });

    it('returns undefined for a non-EDS project even when EDS metadata lingers', () => {
        // A stack switch leaves the old storefront instance behind; reading it
        // would hand the caller another stack's URL.
        expect(getEdsLiveUrl(edsProject({ liveUrl: 'https://leaked.example.com' }, 'headless'))).toBeUndefined();
    });

    it('returns undefined when neither a stored URL nor a repo is recorded', () => {
        expect(getEdsLiveUrl(edsProject({ daLiveOrg: 'owner' }))).toBeUndefined();
    });

    it('returns undefined when the repo is malformed rather than deriving a broken host', () => {
        // A bare name yields `https://main--undefined--no-slash-here.aem.live`.
        expect(getEdsLiveUrl(edsProject({ githubRepo: 'no-slash-here' }))).toBeUndefined();
    });

    it('returns undefined when the storefront instance has no metadata', () => {
        const bare = createMockProject({
            selectedStack: 'eds-dalive',
            componentInstances: { 'eds-storefront': { id: 'eds-storefront', name: 'EDS', status: 'deployed' } },
        });
        expect(getEdsLiveUrl(bare)).toBeUndefined();
    });

    it('returns undefined when no storefront instance exists', () => {
        expect(
            getEdsLiveUrl(createMockProject({ selectedStack: 'eds-dalive', componentInstances: {} }))
        ).toBeUndefined();
    });

    it('returns undefined when the project holds no instances record at all', () => {
        expect(
            getEdsLiveUrl(createMockProject({ selectedStack: 'eds-dalive', componentInstances: undefined }))
        ).toBeUndefined();
    });

    it.each([
        ['undefined', undefined],
        ['null', null],
    ])('returns undefined for a %s project', (_label, value) => {
        expect(getEdsLiveUrl(value)).toBeUndefined();
    });
});

describe('getEdsPreviewUrl', () => {
    it('returns the stored preview URL', () => {
        expect(
            getEdsPreviewUrl(edsProject({ previewUrl: 'https://main--my-site--owner.aem.page' }))
        ).toBe('https://main--my-site--owner.aem.page');
    });

    it('derives the preview URL from githubRepo when none was stored', () => {
        expect(getEdsPreviewUrl(edsProject({ githubRepo: 'owner/my-site' }))).toBe(
            'https://main--my-site--owner.aem.page'
        );
    });

    it('prefers the stored URL over the derived one', () => {
        const both = edsProject({
            previewUrl: 'https://stored.example.com',
            githubRepo: 'owner/my-site',
        });
        expect(getEdsPreviewUrl(both)).toBe('https://stored.example.com');
    });

    it('ignores the live URL — the two are stored separately', () => {
        expect(
            getEdsPreviewUrl(edsProject({ liveUrl: 'https://main--my-site--owner.aem.live' }))
        ).toBeUndefined();
    });

    it('returns undefined for a non-EDS project even when EDS metadata lingers', () => {
        expect(
            getEdsPreviewUrl(edsProject({ previewUrl: 'https://leaked.example.com' }, 'headless'))
        ).toBeUndefined();
    });

    it('returns undefined when the repo is malformed rather than deriving a broken host', () => {
        expect(getEdsPreviewUrl(edsProject({ githubRepo: 'no-slash-here' }))).toBeUndefined();
    });

    it('returns undefined when the project holds no instances record at all', () => {
        expect(
            getEdsPreviewUrl(
                createMockProject({ selectedStack: 'eds-dalive', componentInstances: undefined })
            )
        ).toBeUndefined();
    });

    it.each([
        ['undefined', undefined],
        ['null', null],
    ])('returns undefined for a %s project', (_label, value) => {
        expect(getEdsPreviewUrl(value)).toBeUndefined();
    });
});
