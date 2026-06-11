/**
 * contentSourceFactory Tests (Slice 2, Step 03)
 *
 * Selects the ContentSource implementation from the persisted
 * `contentSourceType`, defaulting to DA.live so existing projects are
 * unaffected. An unknown value is a hard error — never a silent DA.live
 * fallback (that would mask a corrupt manifest).
 */

import { createContentSource } from '@/features/eds/services/contentSource/contentSourceFactory';
import { DaLiveContentSource } from '@/features/eds/services/contentSource/daLiveContentSource';
import { AemContentSource } from '@/features/eds/services/contentSource/aemContentSource';

const aemConfig = { authorUrl: 'https://author-x.adobeaemcloud.com', contentPath: '/content/s' };

describe('createContentSource', () => {
    it('defaults to DA.live when no type is specified', () => {
        expect(createContentSource({})).toBeInstanceOf(DaLiveContentSource);
    });

    it('returns DaLiveContentSource for "da-live"', () => {
        expect(createContentSource({ contentSourceType: 'da-live' })).toBeInstanceOf(DaLiveContentSource);
    });

    it('returns AemContentSource for "aem-sites"', () => {
        expect(
            createContentSource({ contentSourceType: 'aem-sites', aemContentSource: aemConfig }),
        ).toBeInstanceOf(AemContentSource);
    });

    it('throws when "aem-sites" is selected without aemContentSource config', () => {
        expect(() => createContentSource({ contentSourceType: 'aem-sites' })).toThrow(/aemContentSource/i);
    });

    it('throws a clear error for an unknown content source type (no silent DA.live fallback)', () => {
        expect(() => createContentSource({ contentSourceType: 'sharepoint' as never })).toThrow(
            /unknown content source/i,
        );
    });

    it('passes the token provider to the DA.live source so the Helix auth header resolves', async () => {
        const tokenProvider = { getAccessToken: jest.fn().mockResolvedValue('tok') };

        const source = createContentSource({ contentSourceType: 'da-live', tokenProvider });

        await expect(source.getContentSourceAuthorization()).resolves.toBe('Bearer tok');
    });
});
