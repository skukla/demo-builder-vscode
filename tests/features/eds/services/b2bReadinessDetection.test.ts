/**
 * B2B readiness detection — tests.
 *
 * The builder cannot enable B2B (no public API; it's a backend prerequisite),
 * but it can read-only DETECT it via the Commerce GraphQL `storeConfig` query
 * and warn when a B2B-code package is pointed at a non-B2B backend. Detection is
 * true-negative-only: it warns only on a definitive `is_requisition_list_active:
 * false`; anything uncertain (missing field, error, older/SaaS schema) is
 * `unknown` and stays silent — it can never false-alarm.
 */

import { detectB2bReadiness } from '@/features/eds/services/b2bReadinessDetection';

describe('detectB2bReadiness', () => {
    const endpoint = 'https://commerce.example.com/graphql';

    function gql(body: unknown, ok = true, status = 200) {
        return {
            ok,
            status,
            json: async () => body,
        } as unknown as Response;
    }

    it('returns "enabled" when storeConfig.is_requisition_list_active is true', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(gql({ data: { storeConfig: { is_requisition_list_active: true } } }));
        await expect(detectB2bReadiness(endpoint, fetchImpl as unknown as typeof fetch)).resolves.toBe('enabled');
    });

    it('returns "disabled" when the flag is explicitly false', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(gql({ data: { storeConfig: { is_requisition_list_active: false } } }));
        await expect(detectB2bReadiness(endpoint, fetchImpl as unknown as typeof fetch)).resolves.toBe('disabled');
    });

    it('returns "unknown" when the field is absent (older / SaaS schema)', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(gql({ data: { storeConfig: {} } }));
        await expect(detectB2bReadiness(endpoint, fetchImpl as unknown as typeof fetch)).resolves.toBe('unknown');
    });

    it('returns "unknown" when the response carries GraphQL errors', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(gql({ errors: [{ message: 'Cannot query field is_requisition_list_active' }] }));
        await expect(detectB2bReadiness(endpoint, fetchImpl as unknown as typeof fetch)).resolves.toBe('unknown');
    });

    it('returns "unknown" on a non-OK HTTP response', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(gql({}, false, 500));
        await expect(detectB2bReadiness(endpoint, fetchImpl as unknown as typeof fetch)).resolves.toBe('unknown');
    });

    it('returns "unknown" (never throws) when the network fails', async () => {
        const fetchImpl = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
        await expect(detectB2bReadiness(endpoint, fetchImpl as unknown as typeof fetch)).resolves.toBe('unknown');
    });

    it('queries storeConfig.is_requisition_list_active via POST (no auth required)', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(gql({ data: { storeConfig: { is_requisition_list_active: true } } }));
        await detectB2bReadiness(endpoint, fetchImpl as unknown as typeof fetch);
        const [calledUrl, init] = fetchImpl.mock.calls[0];
        expect(calledUrl).toBe(endpoint);
        expect((init as RequestInit).method).toBe('POST');
        expect(String((init as RequestInit).body)).toContain('is_requisition_list_active');
        // No Authorization header — storefront-scoped, anonymous query.
        const headers = (init as RequestInit).headers as Record<string, string>;
        expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('authorization');
    });
});
