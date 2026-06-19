/**
 * Tests for detectProjectOrgMismatch — the canonical org-context reachability check.
 *
 * Contract:
 * - Compares the project's expected org (project.adobe.organization) against the
 *   org the current IMS token can reach (authManager.getOrganizations()).
 * - Returns undefined when the project has no Adobe org, or the check can't run
 *   (non-fatal — callers still proceed/render).
 * - Otherwise returns an OrgContextResult { reachable, expectedOrg, currentOrg }.
 *   currentOrg comes from getOrganizations()[0] (the token's reachable org) — NOT
 *   getCurrentOrganization(), which reads the stale CLI console selection.
 * - It relies on ensureOrgContext, so it MUST NOT mutate the global aio selection.
 */

import { detectProjectOrgMismatch } from '@/features/authentication/services/detectProjectOrgMismatch';
import type { Project } from '@/types';

const makeProject = (organization?: string): Project =>
    ({ name: 'p', path: '/p', adobe: organization ? { organization } : undefined } as unknown as Project);

const mockLogger = () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any);

describe('detectProjectOrgMismatch', () => {
    it('returns undefined when the project has no Adobe org (fresh/non-Adobe)', async () => {
        const authManager = { getOrganizations: jest.fn() } as any;

        const result = await detectProjectOrgMismatch(authManager, makeProject(undefined), mockLogger());

        expect(result).toBeUndefined();
        expect(authManager.getOrganizations).not.toHaveBeenCalled();
    });

    it('reports reachable with the current org id + name when the token reaches the project org', async () => {
        const authManager = {
            getOrganizations: jest.fn().mockResolvedValue([
                { id: 'org-A', code: 'A@AdobeOrg', name: 'Org A' },
            ]),
        } as any;

        const result = await detectProjectOrgMismatch(authManager, makeProject('org-A'), mockLogger());

        expect(result).toEqual({ reachable: true, expectedOrg: 'org-A', currentOrgId: 'org-A', currentOrg: 'Org A' });
    });

    it('reports reachable for a legacy project that stored the org NAME (matched by name)', async () => {
        const authManager = {
            getOrganizations: jest.fn().mockResolvedValue([
                { id: 'org-A', code: 'A@AdobeOrg', name: 'Acme Org' },
            ]),
        } as any;

        // Legacy project: organization holds the name, not the id.
        const result = await detectProjectOrgMismatch(authManager, makeProject('Acme Org'), mockLogger());

        expect(result).toEqual({ reachable: true, expectedOrg: 'Acme Org', currentOrgId: 'org-A', currentOrg: 'Acme Org' });
    });

    it('reports NOT reachable, naming the token org from getOrganizations (not the stale CLI org)', async () => {
        const authManager = {
            getOrganizations: jest.fn().mockResolvedValue([
                { id: 'org-B', code: 'B@AdobeOrg', name: 'Org B' },
            ]),
            // Stale CLI console selection — MUST be ignored.
            getCurrentOrganization: jest.fn().mockResolvedValue({ id: 'org-STALE', name: 'Stale Org' }),
        } as any;

        const result = await detectProjectOrgMismatch(authManager, makeProject('org-A'), mockLogger());

        expect(result).toEqual({ reachable: false, expectedOrg: 'org-A', currentOrgId: 'org-B', currentOrg: 'Org B' });
        // The stale CLI selection is never consulted.
        expect(authManager.getCurrentOrganization).not.toHaveBeenCalled();
    });

    it('returns undefined (non-fatal) when the org lookup throws', async () => {
        const logger = mockLogger();
        const authManager = {
            getOrganizations: jest.fn().mockRejectedValue(new Error('no token')),
        } as any;

        const result = await detectProjectOrgMismatch(authManager, makeProject('org-A'), logger);

        expect(result).toBeUndefined();
        expect(logger.debug).toHaveBeenCalled();
    });
});
