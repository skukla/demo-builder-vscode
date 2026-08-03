/**
 * The integrations panel's handler context must carry the dependencies the REUSED
 * wizard handlers actually call.
 *
 * `authManager` shipped as `undefined`, and `resolveOrgContext` did
 * `context.authManager?.getOrganizations() ?? []` — so the org list came back EMPTY
 * and ensureOrgContext reported "this organization is not available on your current
 * Adobe account" for a perfectly reachable org, while the project dashboard's own
 * IMS-org badge was green (2026-07-31).
 *
 * A wiring hole that presents as a confident, wrong diagnosis is worth pinning.
 */

import * as fs from 'fs';
import * as path from 'path';

const SOURCE = path.join(
    __dirname,
    '../../../../src/features/dashboard/commands/showIntegrations.ts',
);

describe('ShowIntegrationsCommand handler context', () => {
    it('supplies a real authManager, not undefined', () => {
        const source = fs.readFileSync(SOURCE, 'utf8');
        const line = source
            .split('\n')
            .find((l) => l.trim().startsWith('authManager:'));

        expect(line).toBeDefined();
        expect(line).not.toMatch(/undefined/);
        expect(line).toMatch(/getAuthenticationService/);
    });
});
