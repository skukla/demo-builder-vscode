/**
 * Tests for dashboardCheckRouting — the on-open `checkResult` routing switch
 * extracted from useDashboardStatus. The hook-level behavior stays pinned by
 * the useDashboardStatus* suites; these tests pin the per-checkId routing in
 * isolation against a plain actions stub.
 */

import { asDisplayName } from '@/core/utils/projectDisplayName';
import type { OrgMismatchInfo } from '@/features/authentication/services/detectProjectOrgMismatch';
import type { OrgContextCheckData } from '@/features/dashboard/services/onOpenChecks/orgContextCheck';
import type { CheckOutcome } from '@/features/dashboard/services/onOpenChecks/types';
import {
    routeCheckOutcome,
    type CheckRoutingActions,
} from '@/features/dashboard/ui/hooks/dashboardCheckRouting';
import type { DashboardStatusUpdatePayload } from '@/features/dashboard/ui/hooks/dashboardStatusTypes';
import { CHECK_IDS } from '@/types/messages';

function createActions(): jest.Mocked<CheckRoutingActions> {
    return {
        setOrgChecked: jest.fn(),
        setOrgStatus: jest.fn(),
        setOrgMismatch: jest.fn(),
        setOrgCurrentName: jest.fn(),
        setMcpHealing: jest.fn(),
        setAiToolingMissing: jest.fn(),
        setProjectStatus: jest.fn(),
        setVerifyResult: jest.fn(),
        setVerifyFailed: jest.fn(),
        setAiBusy: jest.fn(),
    };
}

describe('routeCheckOutcome', () => {
    describe('org-context', () => {
        it('should reset org state when the check goes pending', () => {
            const actions = createActions();
            routeCheckOutcome({ checkId: CHECK_IDS.ORG_CONTEXT, status: 'pending' }, actions);

            expect(actions.setOrgChecked).toHaveBeenCalledWith(false);
            expect(actions.setOrgStatus).toHaveBeenCalledWith('pending');
            expect(actions.setOrgMismatch).toHaveBeenCalledWith(undefined);
            expect(actions.setOrgCurrentName).toHaveBeenCalledWith(undefined);
        });

        it('should record the resolved outcome with mismatch and org name', () => {
            const actions = createActions();
            const orgMismatch: OrgMismatchInfo = { expectedOrg: 'org-a', currentOrg: 'Org B' };
            const outcome: CheckOutcome<OrgContextCheckData> = {
                checkId: CHECK_IDS.ORG_CONTEXT,
                status: 'warning',
                data: { orgMismatch, currentOrg: 'Org B' },
            };
            routeCheckOutcome(outcome, actions);

            expect(actions.setOrgChecked).toHaveBeenCalledWith(true);
            expect(actions.setOrgStatus).toHaveBeenCalledWith('warning');
            expect(actions.setOrgMismatch).toHaveBeenCalledWith(orgMismatch);
            expect(actions.setOrgCurrentName).toHaveBeenCalledWith('Org B');
        });
    });

    describe('mcp-health', () => {
        it.each([
            ['warning', true],
            ['ok', false],
            ['error', false],
        ] as const)('should map %s to healing=%s', (status, healing) => {
            const actions = createActions();
            routeCheckOutcome({ checkId: CHECK_IDS.MCP_HEALTH, status }, actions);
            expect(actions.setMcpHealing).toHaveBeenCalledWith(healing);
        });
    });

    describe('ai-context-freshness', () => {
        it.each([
            ['warning', true],
            ['ok', false],
        ] as const)('should map %s to toolingMissing=%s', (status, missing) => {
            const actions = createActions();
            routeCheckOutcome({ checkId: CHECK_IDS.AI_CONTEXT_FRESHNESS, status }, actions);
            expect(actions.setAiToolingMissing).toHaveBeenCalledWith(missing);
        });
    });

    describe('mesh-verify', () => {
        it('should flip the mesh to not-deployed on warning, keeping the endpoint', () => {
            const actions = createActions();
            routeCheckOutcome(
                {
                    checkId: CHECK_IDS.MESH_VERIFY,
                    status: 'warning',
                    message: 'API Mesh is no longer deployed',
                },
                actions
            );

            expect(actions.setProjectStatus).toHaveBeenCalledTimes(1);
            const updater = actions.setProjectStatus.mock.calls[0][0] as (
                prev: DashboardStatusUpdatePayload | null
            ) => DashboardStatusUpdatePayload | null;

            const prev: DashboardStatusUpdatePayload = {
                name: asDisplayName('demo'),
                path: '/p',
                status: 'running',
                frontendConfigChanged: false,
                mesh: { status: 'deployed', endpoint: 'https://mesh.example' },
            };
            expect(updater(prev)).toEqual({
                ...prev,
                mesh: {
                    status: 'not-deployed',
                    message: 'API Mesh is no longer deployed',
                    endpoint: 'https://mesh.example',
                },
            });
            expect(updater(null)).toBeNull();
        });

        it('should leave the persisted badge alone on unknown', () => {
            const actions = createActions();
            routeCheckOutcome({ checkId: CHECK_IDS.MESH_VERIFY, status: 'unknown' }, actions);
            expect(actions.setProjectStatus).not.toHaveBeenCalled();
        });
    });

    describe('ai-verify', () => {
        it('should store the verify data and end the busy state', () => {
            const actions = createActions();
            const data = { checks: [], inventory: {} };
            // The hook delivers the raw ai-verify payload under the org-typed
            // signature (same cast the SUT's caller performs).
            const outcome = { checkId: CHECK_IDS.AI_VERIFY, status: 'ok', data };
            routeCheckOutcome(outcome as unknown as CheckOutcome<OrgContextCheckData>, actions);

            expect(actions.setVerifyResult).toHaveBeenCalledWith(data);
            expect(actions.setVerifyFailed).toHaveBeenCalledWith(false);
            expect(actions.setAiBusy).toHaveBeenCalledWith(false);
        });

        it('should mark the verify failed when the outcome carries no data', () => {
            const actions = createActions();
            routeCheckOutcome({ checkId: CHECK_IDS.AI_VERIFY, status: 'error' }, actions);

            expect(actions.setVerifyResult).not.toHaveBeenCalled();
            expect(actions.setVerifyFailed).toHaveBeenCalledWith(true);
            expect(actions.setAiBusy).toHaveBeenCalledWith(false);
        });
    });

    it('should ignore unknown checkIds entirely', () => {
        const actions = createActions();
        routeCheckOutcome({ checkId: 'someday-check', status: 'warning' }, actions);
        for (const setter of Object.values(actions)) {
            expect(setter).not.toHaveBeenCalled();
        }
    });
});
