/**
 * npmRegistry.getLatestNpmVersion — the version npm's `latest` tag points at (PL-80).
 *
 * The URL shape was read from the live registry on 2026-10-20: the scoped Adobe MCP
 * package answered `{"version":"3.6.0",...}` at `/@adobe-commerce%2Fcommerce-extensibility-tools/latest`,
 * and a made-up package under the same scope answered 404.
 */

import { getLatestNpmVersion } from '@/features/updates/services/npmRegistry';

global.fetch = jest.fn();
const mockFetch = global.fetch as jest.Mock;

const answer = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

beforeEach(() => mockFetch.mockReset());

describe('getLatestNpmVersion', () => {
    it("asks the registry for a scoped package's latest tag, its slash encoded", async () => {
        mockFetch.mockResolvedValue(answer(200, { name: '@adobe-commerce/commerce-extensibility-tools', version: '3.6.0' }));

        const version = await getLatestNpmVersion('@adobe-commerce/commerce-extensibility-tools');

        expect(version).toBe('3.6.0');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://registry.npmjs.org/@adobe-commerce%2Fcommerce-extensibility-tools/latest',
            expect.objectContaining({ headers: { Accept: 'application/json' } }),
        );
    });

    it.each([
        ['the package does not exist', answer(404, { error: 'Not found' })],
        ['the answer carries no version', answer(200, { name: 'x' })],
    ])('answers null when %s', async (_label, response) => {
        mockFetch.mockResolvedValue(response);

        expect(await getLatestNpmVersion('@adobe-commerce/x')).toBeNull();
    });

    it('answers null when the registry cannot be reached', async () => {
        mockFetch.mockRejectedValue(new Error('offline'));

        expect(await getLatestNpmVersion('@adobe-commerce/x')).toBeNull();
    });
});
