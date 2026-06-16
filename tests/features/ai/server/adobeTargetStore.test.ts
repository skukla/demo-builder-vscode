/**
 * adobeTargetStore tests — the per-server (per-VS-Code-window) session target
 * holder the MCP Adobe tools read/write so selection persists across separate
 * tool invocations WITHOUT mutating the shared `aio` global.
 */

import {
    clearAdobeTarget,
    getAdobeTarget,
    runWithAdobeTarget,
    setAdobeTarget,
} from '@/features/ai/server/adobeTargetStore';
import { getActiveOrgContext } from '@/core/shell/orgContextEnv';

describe('adobeTargetStore', () => {
    beforeEach(() => {
        clearAdobeTarget();
    });

    it('returns undefined before anything is stored', () => {
        expect(getAdobeTarget()).toBeUndefined();
    });

    it('stores and returns the org target', () => {
        setAdobeTarget({ orgId: 'org-1', orgCode: 'CODE@AdobeOrg', orgName: 'Org One' });
        expect(getAdobeTarget()).toEqual({ orgId: 'org-1', orgCode: 'CODE@AdobeOrg', orgName: 'Org One' });
    });

    it('persists the stored target across reads (shared across sequential tool calls)', () => {
        setAdobeTarget({ orgId: 'org-2' });
        expect(getAdobeTarget()).toEqual({ orgId: 'org-2' });
        // second read (a separate later tool invocation) sees the same target
        expect(getAdobeTarget()).toEqual({ orgId: 'org-2' });
    });

    it('overwrites the whole target on a new set', () => {
        setAdobeTarget({ orgId: 'org-1', projectId: 'proj-1', workspaceId: 'ws-1' });
        setAdobeTarget({ orgId: 'org-2' });
        expect(getAdobeTarget()).toEqual({ orgId: 'org-2' });
    });

    it('clears the stored target', () => {
        setAdobeTarget({ orgId: 'org-1' });
        clearAdobeTarget();
        expect(getAdobeTarget()).toBeUndefined();
    });

    it('returns a copy so callers cannot mutate the stored target in place', () => {
        setAdobeTarget({ orgId: 'org-1', projectId: 'proj-1' });
        const first = getAdobeTarget()!;
        first.projectId = 'tampered';
        expect(getAdobeTarget()).toEqual({ orgId: 'org-1', projectId: 'proj-1' });
    });

    describe('runWithAdobeTarget', () => {
        it('runs fn under withOrgContext with the stored target', async () => {
            setAdobeTarget({ orgId: 'org-7', projectId: 'proj-7', workspaceId: 'ws-7' });
            const seen = await runWithAdobeTarget(async () => getActiveOrgContext());
            expect(seen).toMatchObject({ orgId: 'org-7', projectId: 'proj-7', workspaceId: 'ws-7' });
        });

        it('runs fn with no active org context when nothing is stored', async () => {
            const seen = await runWithAdobeTarget(async () => getActiveOrgContext());
            expect(seen).toBeUndefined();
        });

        it('returns the fn result', async () => {
            setAdobeTarget({ orgId: 'org-1' });
            await expect(runWithAdobeTarget(async () => 42)).resolves.toBe(42);
        });

        it('propagates errors thrown by fn', async () => {
            setAdobeTarget({ orgId: 'org-1' });
            await expect(
                runWithAdobeTarget(async () => {
                    throw new Error('boom');
                }),
            ).rejects.toThrow('boom');
        });
    });
});
