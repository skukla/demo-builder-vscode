/**
 * Tests for buildAioConsoleEnv — the pure env-targeting builder.
 *
 * Setting AIO_CONSOLE_* env vars on an `aio` child drives the API to that
 * org/project/workspace WITHOUT mutating the shared global store (verified by
 * a live spike). This builder emits exactly those vars for whichever target
 * fields are present.
 */
import {
    buildAioConsoleEnv,
    buildOrgTargetFromProjectAdobe,
    getActiveOrgContext,
    withOrgContext,
} from '@/features/authentication/services/orgContextEnv';

describe('buildAioConsoleEnv', () => {
    it('emits full org subkeys when id, code, and name are present', () => {
        const env = buildAioConsoleEnv({
            orgId: '285361@AdobeOrg',
            orgCode: '285361',
            orgName: 'Adobe Demo System',
        });

        expect(env).toEqual({
            AIO_CONSOLE_ORG_ID: '285361@AdobeOrg',
            AIO_CONSOLE_ORG_CODE: '285361',
            AIO_CONSOLE_ORG_NAME: 'Adobe Demo System',
        });
    });

    it('falls back to ID-only org targeting without throwing when code/name missing', () => {
        // ID-only is a leaky fallback (stale code/name could survive a deep-merge
        // in some consumers) but must not throw — callers may only have the id.
        const env = buildAioConsoleEnv({ orgId: '285361@AdobeOrg' });

        expect(env).toEqual({ AIO_CONSOLE_ORG_ID: '285361@AdobeOrg' });
        expect(env.AIO_CONSOLE_ORG_CODE).toBeUndefined();
        expect(env.AIO_CONSOLE_ORG_NAME).toBeUndefined();
    });

    it('emits project subkeys when project id and name are present', () => {
        const env = buildAioConsoleEnv({
            orgId: 'org-1',
            projectId: 'proj-1',
            projectName: 'My Project',
        });

        expect(env.AIO_CONSOLE_PROJECT_ID).toBe('proj-1');
        expect(env.AIO_CONSOLE_PROJECT_NAME).toBe('My Project');
    });

    it('emits project id alone when project name is missing', () => {
        const env = buildAioConsoleEnv({ orgId: 'org-1', projectId: 'proj-1' });

        expect(env.AIO_CONSOLE_PROJECT_ID).toBe('proj-1');
        expect(env.AIO_CONSOLE_PROJECT_NAME).toBeUndefined();
    });

    it('emits workspace subkeys when workspace id and name are present', () => {
        const env = buildAioConsoleEnv({
            orgId: 'org-1',
            projectId: 'proj-1',
            workspaceId: 'ws-1',
            workspaceName: 'Production',
        });

        expect(env.AIO_CONSOLE_WORKSPACE_ID).toBe('ws-1');
        expect(env.AIO_CONSOLE_WORKSPACE_NAME).toBe('Production');
    });

    it('does not emit project or workspace vars when those fields are absent', () => {
        const env = buildAioConsoleEnv({ orgId: 'org-1' });

        expect(env.AIO_CONSOLE_PROJECT_ID).toBeUndefined();
        expect(env.AIO_CONSOLE_PROJECT_NAME).toBeUndefined();
        expect(env.AIO_CONSOLE_WORKSPACE_ID).toBeUndefined();
        expect(env.AIO_CONSOLE_WORKSPACE_NAME).toBeUndefined();
    });

    it('returns an empty object when orgId is empty', () => {
        // No org target → nothing to inject (safe no-op).
        expect(buildAioConsoleEnv({ orgId: '' })).toEqual({});
    });

    it('ignores empty-string optional fields rather than emitting blank vars', () => {
        const env = buildAioConsoleEnv({
            orgId: 'org-1',
            orgCode: '',
            orgName: '',
            projectId: '',
            workspaceName: '',
        });

        expect(env).toEqual({ AIO_CONSOLE_ORG_ID: 'org-1' });
    });
});

describe('withOrgContext / getActiveOrgContext', () => {
    it('exposes the active target inside the wrapped callback', async () => {
        const target = { orgId: 'org-1', orgCode: 'CODE', orgName: 'Org One' };

        const seen = await withOrgContext(target, async () => getActiveOrgContext());

        expect(seen).toEqual(target);
    });

    it('returns undefined outside any wrapper', () => {
        expect(getActiveOrgContext()).toBeUndefined();
    });

    it('isolates concurrent flows (no cross-talk between targets)', async () => {
        const a = withOrgContext({ orgId: 'org-A' }, async () => {
            await new Promise(resolve => setTimeout(resolve, 5));
            return getActiveOrgContext()?.orgId;
        });
        const b = withOrgContext({ orgId: 'org-B' }, async () => getActiveOrgContext()?.orgId);

        const [resA, resB] = await Promise.all([a, b]);

        expect(resA).toBe('org-A');
        expect(resB).toBe('org-B');
    });

    it('clears the context after the callback resolves', async () => {
        await withOrgContext({ orgId: 'org-1' }, async () => undefined);
        expect(getActiveOrgContext()).toBeUndefined();
    });
});

describe('buildOrgTargetFromProjectAdobe', () => {
    const adobe = { organization: 'org-123', projectId: 'proj-456', workspace: 'ws-789' };

    it('maps project.adobe fields onto the OrgContextTarget shape', () => {
        const target = buildOrgTargetFromProjectAdobe(adobe);

        expect(target).toMatchObject({
            orgId: 'org-123',
            projectId: 'proj-456',
            workspaceId: 'ws-789',
        });
    });

    it('enriches org code/name from the cached org when its id matches', () => {
        const target = buildOrgTargetFromProjectAdobe(adobe, {
            id: 'org-123',
            code: 'CODE@AdobeOrg',
            name: 'Acme Inc',
        });

        expect(target).toMatchObject({
            orgId: 'org-123',
            orgCode: 'CODE@AdobeOrg',
            orgName: 'Acme Inc',
        });
    });

    it('does NOT borrow code/name when the cached org id differs (never a stale mismatch)', () => {
        const target = buildOrgTargetFromProjectAdobe(adobe, {
            id: 'org-OTHER',
            code: 'OTHER@AdobeOrg',
            name: 'Other Org',
        });

        expect(target.orgId).toBe('org-123');
        expect(target.orgCode).toBeUndefined();
        expect(target.orgName).toBeUndefined();
    });

    it('falls back to ID-only when no cached org is supplied', () => {
        const target = buildOrgTargetFromProjectAdobe(adobe);

        expect(target.orgCode).toBeUndefined();
        expect(target.orgName).toBeUndefined();
    });

    it('tolerates a missing adobe config (empty orgId, no subkeys)', () => {
        const target = buildOrgTargetFromProjectAdobe(undefined);

        expect(target).toEqual({
            orgId: '',
            orgCode: undefined,
            orgName: undefined,
            projectId: undefined,
            workspaceId: undefined,
        });
    });

    it('tolerates a partial adobe config (org only)', () => {
        const target = buildOrgTargetFromProjectAdobe({ organization: 'org-1' });

        expect(target.orgId).toBe('org-1');
        expect(target.projectId).toBeUndefined();
        expect(target.workspaceId).toBeUndefined();
    });
});
