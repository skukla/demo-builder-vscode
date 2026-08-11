/**
 * ACCS GraphQL endpoint validation (components.json).
 *
 * The Business Structure store-code cascade only appears once store detection
 * fires, and for ACCS detection keys on the endpoint's path containing
 * `graphql` (`useAutoStoreDetect`). An endpoint WITHOUT `/graphql` (e.g. the bare
 * instance URL) silently disables detection → a blank Business Structure tab.
 *
 * This pins the config-driven validation that stops that at the source: the
 * `ACCS_GRAPHQL_ENDPOINT` field must end in `/graphql`, with a guiding message,
 * so the Connection step blocks + explains instead of letting the user through
 * to a blank tab.
 */

import componentsData from '@/features/components/config/components.json';

interface EnvVarDef {
    validation?: { pattern?: string; message?: string };
}

const endpointDef = (componentsData as { envVars: Record<string, EnvVarDef> }).envVars
    .ACCS_GRAPHQL_ENDPOINT;

describe('ACCS_GRAPHQL_ENDPOINT validation', () => {
    it('declares a validation pattern and a graphql-guiding message', () => {
        expect(endpointDef.validation?.pattern).toBeTruthy();
        expect(endpointDef.validation?.message).toMatch(/graphql/i);
    });

    it('rejects the bare instance URL with no /graphql path (the detection trap)', () => {
        const re = new RegExp(endpointDef.validation!.pattern!);
        // The exact value that produced a blank Business Structure tab.
        expect(re.test('https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi')).toBe(
            false
        );
    });

    it('accepts the canonical /graphql endpoint, with or without a trailing slash', () => {
        const re = new RegExp(endpointDef.validation!.pattern!);
        expect(re.test('https://na1-sandbox.api.commerce.adobe.com/env-id/graphql')).toBe(true);
        expect(re.test('https://na1-sandbox.api.commerce.adobe.com/env-id/graphql/')).toBe(true);
    });

    it('rejects a lookalike path that is not the graphql endpoint', () => {
        const re = new RegExp(endpointDef.validation!.pattern!);
        expect(re.test('https://na1-sandbox.api.commerce.adobe.com/env-id/graphql-console')).toBe(
            false
        );
    });
});
