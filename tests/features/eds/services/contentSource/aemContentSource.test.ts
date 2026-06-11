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
const CONTENT_PATH = '/content/citisignal';

describe('AemContentSource', () => {
    describe('type', () => {
        it('identifies as the aem-sites content source', () => {
            expect(new AemContentSource(AUTHOR_URL, CONTENT_PATH).type).toBe('aem-sites');
        });
    });

    describe('buildRegistrationSource', () => {
        it('composes the registration source from author URL + content path (markup type)', () => {
            const source = new AemContentSource(AUTHOR_URL, CONTENT_PATH);

            // Coords (the satellite org/site) are intentionally ignored — AEM is point-at.
            expect(source.buildRegistrationSource({ org: 'joiner', site: 'citisignal' })).toEqual({
                url: 'https://author-p57319-e1619941.adobeaemcloud.com/content/citisignal',
                type: 'markup',
            });
        });

        it('normalizes a trailing slash on the author URL and a missing leading slash on the path', () => {
            const source = new AemContentSource('https://author-x.adobeaemcloud.com/', 'content/s');

            expect(source.buildRegistrationSource({ org: 'o', site: 's' }).url).toBe(
                'https://author-x.adobeaemcloud.com/content/s',
            );
        });
    });

    describe('construction', () => {
        it('rejects a non-https author URL', () => {
            expect(() => new AemContentSource('http://author-x.adobeaemcloud.com', CONTENT_PATH)).toThrow(/https/i);
        });

        it('rejects a malformed author URL', () => {
            expect(() => new AemContentSource('not-a-url', CONTENT_PATH)).toThrow(/author url/i);
        });

        it('requires a content path for the AEM point-at source', () => {
            expect(() => new AemContentSource(AUTHOR_URL, '')).toThrow(/content path/i);
        });

        it('rejects a content path containing whitespace or a newline (URL-injection guard)', () => {
            expect(() => new AemContentSource(AUTHOR_URL, '/content/a b')).toThrow(/content path/i);
            expect(() => new AemContentSource(AUTHOR_URL, '/content/a\nb')).toThrow(/content path/i);
        });
    });

    describe('getContentSourceAuthorization', () => {
        it('returns null — AEM authorizes the content read server-side (no token sent)', async () => {
            await expect(
                new AemContentSource(AUTHOR_URL, CONTENT_PATH).getContentSourceAuthorization(),
            ).resolves.toBeNull();
        });
    });
});
