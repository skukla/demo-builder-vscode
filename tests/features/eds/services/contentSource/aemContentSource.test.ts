/**
 * AemContentSource Tests (Slice 2, Step 04)
 *
 * The AEM-Sites implementation of the `ContentSource` seam: point-at, no copy.
 * It produces the registration `source` block from the author URL + content
 * path, and carries NO read token (AEM authorizes the read server-side).
 *
 * NOTE: the exact registration `content.source` URL shape for an AEM-author
 * markup source is a live-test item (overview R1). These tests pin the
 * author-URL + content-path composition the plan specifies; the F5 confirms.
 */

import { AemContentSource } from '@/features/eds/services/contentSource/aemContentSource';

const AUTHOR_URL = 'https://author-p57319-e1619941.adobeaemcloud.com';

describe('AemContentSource', () => {
    describe('type', () => {
        it('identifies as the aem-sites content source', () => {
            expect(new AemContentSource(AUTHOR_URL).type).toBe('aem-sites');
        });
    });

    describe('buildRegistrationSource', () => {
        it('composes the registration source from author URL + content path (markup type)', () => {
            const source = new AemContentSource(AUTHOR_URL);

            expect(
                source.buildRegistrationSource({
                    org: 'joiner', site: 'citisignal', contentPath: '/content/citisignal',
                }),
            ).toEqual({
                url: 'https://author-p57319-e1619941.adobeaemcloud.com/content/citisignal',
                type: 'markup',
            });
        });

        it('normalizes a trailing slash on the author URL and a missing leading slash on the path', () => {
            const source = new AemContentSource('https://author-x.adobeaemcloud.com/');

            expect(
                source.buildRegistrationSource({ org: 'o', site: 's', contentPath: 'content/s' }).url,
            ).toBe('https://author-x.adobeaemcloud.com/content/s');
        });

        it('rejects a content path containing whitespace or a newline (URL-injection guard)', () => {
            const source = new AemContentSource(AUTHOR_URL);

            expect(() =>
                source.buildRegistrationSource({ org: 'o', site: 's', contentPath: '/content/a b' }),
            ).toThrow(/content path/i);
            expect(() =>
                source.buildRegistrationSource({ org: 'o', site: 's', contentPath: '/content/a\nb' }),
            ).toThrow(/content path/i);
        });

        it('requires a content path for the AEM point-at source', () => {
            const source = new AemContentSource(AUTHOR_URL);

            expect(() => source.buildRegistrationSource({ org: 'o', site: 's' })).toThrow(/content path/i);
        });
    });

    describe('construction', () => {
        it('rejects a non-https author URL', () => {
            expect(() => new AemContentSource('http://author-x.adobeaemcloud.com')).toThrow(/https/i);
        });

        it('rejects a malformed author URL', () => {
            expect(() => new AemContentSource('not-a-url')).toThrow(/author url/i);
        });
    });

    describe('getContentSourceAuthorization', () => {
        it('returns null — AEM authorizes the content read server-side (no token sent)', async () => {
            await expect(
                new AemContentSource(AUTHOR_URL).getContentSourceAuthorization(),
            ).resolves.toBeNull();
        });
    });
});
