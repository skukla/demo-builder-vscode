/**
 * The org an agent's Adobe tool acts in.
 *
 * The agent's own selection (`select_org`, held in `adobeTargetStore`) wins.
 * With none, and a sign-in that reaches exactly ONE org, that org is the only
 * possible answer — IMS tokens are org-bound — so it is used and remembered
 * rather than refused. On 2026-09-19 a project delete answered "No org selected"
 * to an agent whose sign-in reached one org, costing a call to learn nothing.
 *
 * With several orgs it still refuses. Falling back to the extension UI's
 * selection is the wrong-org defect `adobeResourceTools.ts` documents: a tool
 * that succeeds in an org the agent never chose.
 *
 * @module features/ai/server/agentOrg
 */

import { getAdobeTarget, setAdobeTarget } from './adobeTargetStore';

/** What this needs of the auth service: the orgs the sign-in reaches. */
interface OrgLister {
    getOrganizations(): Promise<Array<{ id: string; code?: string; name?: string }>>;
}

/**
 * Resolve the org, or say why it cannot be.
 *
 * @param mgr - a signed-in auth service
 * @returns the org id, or the refusal to hand the agent
 */
export async function resolveAgentOrg(mgr: OrgLister): Promise<{ orgId: string } | { error: string }> {
    const stored = getAdobeTarget();
    if (stored?.orgId) {
        return { orgId: stored.orgId };
    }
    const orgs = await mgr.getOrganizations();
    if (orgs.length === 1) {
        const [org] = orgs;
        setAdobeTarget({ orgId: org.id, orgCode: org.code, orgName: org.name });
        return { orgId: org.id };
    }
    return {
        error: `No org selected, and this sign-in reaches ${orgs.length} orgs. Call list_orgs, then select_org(orgId) first.`,
    };
}
