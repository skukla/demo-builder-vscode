/**
 * Tests for detectProjectOrgMismatch — the canonical org-context reachability check.
 *
 * Contract:
 * - Compares the project's expected org (project.adobe.organization) against the
 *   org the current IMS token can actually reach (authManager.getOrganizations()).
 * - Returns undefined (no mismatch) when the project has no Adobe org, when the
 *   token reaches the expected org, or when the check can't run (treated as
 *   non-fatal — callers still proceed/render).
 * - Returns an OrgMismatchInfo naming the expected org (id) and the current
 *   token org (name) when they differ — so callers can name both.
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

    it('returns undefined when the token reaches the project org (match)', async () => {
        const authManager = {
            getOrganizations: jest.fn().mockResolvedValue([
                { id: 'org-A', code: 'A@AdobeOrg', name: 'Org A' },
            ]),
            getCurrentOrganization: jest.fn().mockResolvedValue({ id: 'org-A', name: 'Org A' }),
        } as any;

        const result = await detectProjectOrgMismatch(authManager, makeProject('org-A'), mockLogger());

        expect(result).toBeUndefined();
    });

    it('returns mismatch info naming both orgs when the token is in a different org', async () => {
        const authManager = {
            getOrganizations: jest.fn().mockResolvedValue([
                { id: 'org-B', code: 'B@AdobeOrg', name: 'Org B' },
            ]),
            getCurrentOrganization: jest.fn().mockResolvedValue({ id: 'org-B', name: 'Org B' }),
        } as any;

        const result = await detectProjectOrgMismatch(authManager, makeProject('org-A'), mockLogger());

        expect(result).toEqual({ expectedOrg: 'org-A', currentOrg: 'Org B' });
    });

    it('falls back to the reachable org name when getCurrentOrganization is unavailable', async () => {
        const authManager = {
            getOrganizations: jest.fn().mockResolvedValue([
                { id: 'org-B', code: 'B@AdobeOrg', name: 'Org B' },
            ]),
        } as any;

        const result = await detectProjectOrgMismatch(authManager, makeProject('org-A'), mockLogger());

        expect(result).toEqual({ expectedOrg: 'org-A', currentOrg: 'Org B' });
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
