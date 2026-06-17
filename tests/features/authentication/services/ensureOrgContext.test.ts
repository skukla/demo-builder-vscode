/**
 * Tests for ensureOrgContext — the canonical org-targeting helper.
 *
 * Contract (Phase 1):
 * - Resolve the token's reachable org list.
 * - If the target org is absent from that list → needs_relogin
 *   (the account must change; force-login is the account-switch lever).
 * - Otherwise establish env targeting for the target and return ok, so callers
 *   can run their dependent op under that targeting (via withOrgContext).
 * - If a probe still 403s with targeting set → access_revoked.
 * - It MUST NEVER call the store-mutating `aio console * select`.
 */
import { ensureOrgContext } from '@/features/authentication/services/ensureOrgContext';

const enterpriseOrg = { id: 'org-entp', code: 'ENTP@AdobeOrg', name: 'Enterprise Org', type: 'entp' };
const developerRuntimeOrg = {
    id: 'org-dev',
    code: 'DEV@AdobeOrg',
    name: 'Dev Org',
    type: 'developer',
    runtime: true,
};

describe('ensureOrgContext', () => {
    let listSelectableOrgs: jest.Mock;
    let runSelect: jest.Mock;

    beforeEach(() => {
        listSelectableOrgs = jest.fn().mockResolvedValue([enterpriseOrg, developerRuntimeOrg]);
        // Sentinel: ensureOrgContext must NEVER invoke a store-mutating org select.
        runSelect = jest.fn();
    });

    it('returns ok when the target org is selectable (and never selects)', async () => {
        const result = await ensureOrgContext('org-entp', { listSelectableOrgs, runSelect });

        expect(result).toEqual({
            status: 'ok',
            targetOrg: enterpriseOrg,
        });
        expect(runSelect).not.toHaveBeenCalled();
    });

    it('returns needs_relogin when the target org is absent from the selectable list', async () => {
        const result = await ensureOrgContext('org-missing', { listSelectableOrgs, runSelect });

        expect(result.status).toBe('needs_relogin');
        expect(result.targetOrg).toEqual({ id: 'org-missing' });
        expect(runSelect).not.toHaveBeenCalled();
    });

    it('matches a legacy org stored by NAME (not id), resolving the canonical org', async () => {
        // Legacy projects persisted the org name in place of the id.
        const result = await ensureOrgContext('Enterprise Org', { listSelectableOrgs, runSelect });

        expect(result.status).toBe('ok');
        expect(result.targetOrg).toEqual(enterpriseOrg);
        expect(runSelect).not.toHaveBeenCalled();
    });

    it('matches a legacy org stored by CODE (not id)', async () => {
        const result = await ensureOrgContext('ENTP@AdobeOrg', { listSelectableOrgs, runSelect });

        expect(result.status).toBe('ok');
        expect(result.targetOrg).toEqual(enterpriseOrg);
    });

    it('returns access_revoked when a probe still 403s with targeting set', async () => {
        const probe = jest.fn().mockResolvedValue({ forbidden: true });

        const result = await ensureOrgContext('org-entp', { listSelectableOrgs, runSelect, probe });

        expect(result.status).toBe('access_revoked');
        expect(result.targetOrg).toEqual(enterpriseOrg);
        expect(runSelect).not.toHaveBeenCalled();
    });

    it('returns ok when the probe succeeds under targeting', async () => {
        const probe = jest.fn().mockResolvedValue({ forbidden: false });

        const result = await ensureOrgContext('org-entp', { listSelectableOrgs, runSelect, probe });

        expect(result.status).toBe('ok');
        expect(probe).toHaveBeenCalledTimes(1);
    });

    it('runs the probe under org-context targeting (probe sees the active target)', async () => {
        const probe = jest.fn().mockImplementation(async (seenTarget: { orgId: string }) => {
            expect(seenTarget.orgId).toBe('org-entp');
            return { forbidden: false };
        });

        await ensureOrgContext('org-entp', { listSelectableOrgs, runSelect, probe });

        expect(probe).toHaveBeenCalled();
    });

    it('treats a non-selectable target as needs_relogin even when other orgs exist', async () => {
        listSelectableOrgs.mockResolvedValue([developerRuntimeOrg]);

        const result = await ensureOrgContext('org-entp', { listSelectableOrgs, runSelect });

        expect(result.status).toBe('needs_relogin');
    });
});
