/**
 * Which org an agent's Adobe tool acts in when the agent chose none.
 *
 * An IMS sign-in is bound to its orgs. When it reaches exactly ONE, there is
 * nothing to choose, and refusing only cost a round-trip: on 2026-09-19 a
 * project delete answered "No org selected" to an agent whose sign-in could
 * reach one org. With several, choosing is still the agent's job — falling back
 * to the extension UI's selection is the wrong-org bug these tools exist to
 * prevent.
 */

import { resolveAgentOrg } from '@/features/ai/server/agentOrg';
import { clearAdobeTarget, getAdobeTarget, setAdobeTarget } from '@/features/ai/server/adobeTargetStore';

const ONE = { id: 'org-1', code: 'C1@AdobeOrg', name: 'Org One' };
const TWO = { id: 'org-2', code: 'C2@AdobeOrg', name: 'Org Two' };

function manager(orgs: Array<typeof ONE>) {
    return { getOrganizations: jest.fn(async () => orgs) };
}

beforeEach(() => clearAdobeTarget());

describe('resolveAgentOrg', () => {
    it('answers the org the agent selected, without asking Adobe', async () => {
        setAdobeTarget({ orgId: 'org-2' });
        const mgr = manager([ONE, TWO]);

        expect(await resolveAgentOrg(mgr)).toEqual({ orgId: 'org-2' });
        expect(mgr.getOrganizations).not.toHaveBeenCalled();
    });

    it('uses the only org the sign-in reaches, and remembers it', async () => {
        expect(await resolveAgentOrg(manager([ONE]))).toEqual({ orgId: 'org-1' });
        expect(getAdobeTarget()).toEqual({ orgId: 'org-1', orgCode: 'C1@AdobeOrg', orgName: 'Org One' });
    });

    it('refuses rather than guess when the sign-in reaches several orgs', async () => {
        const out = await resolveAgentOrg(manager([ONE, TWO]));

        expect(out).toEqual({ error: expect.stringMatching(/reaches 2 orgs.*select_org/) });
        expect(getAdobeTarget()).toBeUndefined();
    });

    it('refuses when the sign-in reaches no org at all', async () => {
        expect(await resolveAgentOrg(manager([]))).toEqual({ error: expect.stringMatching(/select_org/) });
    });
});
