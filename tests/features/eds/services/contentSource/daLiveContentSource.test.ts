/**
 * DaLiveContentSource Tests (Slice 2, Step 01)
 *
 * The DA.live implementation of the `ContentSource` seam. These tests pin the
 * exact registration `source` block + Helix auth value the existing DA.live
 * path produces today, so the refactor-in-place stays byte-identical.
 */

import { DaLiveContentSource } from '@/features/eds/services/contentSource/daLiveContentSource';

const mockTokenProvider = {
    getAccessToken: jest.fn(),
};

const MOCK_IMS_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.mock-da-live-ims-token';

describe('DaLiveContentSource', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockTokenProvider.getAccessToken.mockResolvedValue(MOCK_IMS_TOKEN);
    });

    describe('type', () => {
        it('identifies as the da-live content source', () => {
            const source = new DaLiveContentSource(mockTokenProvider as any);
            expect(source.type).toBe('da-live');
        });
    });

    describe('buildRegistrationSource', () => {
        it('produces the DA.live content.source block (exact parity with buildContentSourceUrl)', () => {
            const source = new DaLiveContentSource(mockTokenProvider as any);

            expect(source.buildRegistrationSource({ org: 'test-user', site: 'my-site' })).toEqual({
                url: 'https://content.da.live/test-user/my-site/',
                type: 'markup',
            });
        });

        it('uses the DA.live org/site (not the GitHub repo) in the URL', () => {
            const source = new DaLiveContentSource(mockTokenProvider as any);

            const block = source.buildRegistrationSource({
                org: 'skukla',
                site: 'b2b-boilerplate-content',
            });

            expect(block.url).toBe('https://content.da.live/skukla/b2b-boilerplate-content/');
        });

        it('ignores contentPath (DA.live mounts at the org/site root, not a subtree)', () => {
            const source = new DaLiveContentSource(mockTokenProvider as any);

            const block = source.buildRegistrationSource({
                org: 'o',
                site: 's',
                contentPath: '/content/ignored',
            });

            expect(block.url).toBe('https://content.da.live/o/s/');
        });
    });

    describe('getContentSourceAuthorization', () => {
        it('returns the Bearer value for the Helix x-content-source-authorization header', async () => {
            const source = new DaLiveContentSource(mockTokenProvider as any);

            await expect(source.getContentSourceAuthorization()).resolves.toBe(
                `Bearer ${MOCK_IMS_TOKEN}`,
            );
        });

        it('returns null when the token provider yields no token (header omitted, no empty Bearer)', async () => {
            mockTokenProvider.getAccessToken.mockResolvedValueOnce(null);
            const source = new DaLiveContentSource(mockTokenProvider as any);

            await expect(source.getContentSourceAuthorization()).resolves.toBeNull();
        });
    });
});
