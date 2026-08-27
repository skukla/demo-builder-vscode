/**
 * AdobeEntityFetcher.createProject Unit Tests
 *
 * In-app Adobe I/O App Builder project creation. Mirrors the createWorkspaceCredential
 * pattern: SDK-only (no CLI fallback), needs org id, validates input, never throws.
 */

import { AdobeEntityFetcher } from '@/features/authentication/services/adobeEntityFetcher';
import type { CommandExecutor } from '@/core/shell';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { StepLogger } from '@/core/logging';
import type { Logger } from '@/types/logger';

jest.mock('@/core/logging');
jest.mock('@/types/typeGuards');

import { getLogger } from '@/core/logging';
import { parseJSON } from '@/types/typeGuards';

describe('AdobeEntityFetcher.createProject()', () => {
    let fetcher: AdobeEntityFetcher;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockSDKClient: jest.Mocked<AdobeSDKClient>;
    let mockCacheManager: jest.Mocked<AuthCacheManager>;
    let mockLogger: jest.Mocked<Logger>;
    let mockStepLogger: jest.Mocked<StepLogger>;
    let createFireflyProject: jest.Mock;
    let createWorkspace: jest.Mock;
    let getWorkspacesForProject: jest.Mock;
    let createRuntimeNamespace: jest.Mock;

    const ORG = { id: 'org-123', code: 'ORG@AdobeOrg', name: 'Test Org' };

    beforeEach(() => {
        (getLogger as jest.Mock).mockReturnValue({
            trace: jest.fn(),
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        });
        (parseJSON as jest.Mock).mockImplementation((str) => {
            try {
                return JSON.parse(str);
            } catch {
                return null;
            }
        });

        mockCommandExecutor = { execute: jest.fn() } as unknown as jest.Mocked<CommandExecutor>;

        createFireflyProject = jest.fn();
        // The default Stage-workspace create (App Builder template parity); resolves unless overridden.
        createWorkspace = jest.fn().mockResolvedValue({ body: { workspaceId: 'ws-stage' } });
        // Runtime-namespace provisioning: after create, every workspace is listed and
        // each gets a Runtime namespace (idempotent). Defaults cover Production + Stage.
        getWorkspacesForProject = jest.fn().mockResolvedValue({
            body: [
                { id: 'ws-prod', name: 'Production' },
                { id: 'ws-stage', name: 'Stage' },
            ],
        });
        createRuntimeNamespace = jest.fn().mockResolvedValue({ body: {} });
        mockSDKClient = {
            isInitialized: jest.fn().mockReturnValue(true),
            getClient: jest.fn().mockReturnValue({
                createFireflyProject,
                createWorkspace,
                getWorkspacesForProject,
                createRuntimeNamespace,
            }),
            ensureInitialized: jest.fn().mockResolvedValue(true),
        } as unknown as jest.Mocked<AdobeSDKClient>;

        mockCacheManager = {
            getCachedOrganization: jest.fn().mockReturnValue(ORG),
            getCachedProject: jest.fn().mockReturnValue(undefined),
        } as unknown as jest.Mocked<AuthCacheManager>;

        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as jest.Mocked<Logger>;
        mockStepLogger = { logTemplate: jest.fn() } as unknown as jest.Mocked<StepLogger>;

        fetcher = new AdobeEntityFetcher(
            mockCommandExecutor,
            mockSDKClient,
            mockCacheManager,
            mockLogger,
            mockStepLogger,
            {}
        );
    });

    it('constructs the AdobeProject from the returned projectId + the details we sent', async () => {
        // The create endpoint returns ONLY the new id ({ projectId }), not a full project.
        createFireflyProject.mockResolvedValue({ body: { projectId: 'proj-new' } });

        const result = await fetcher.createProject('My Demo', 'A demo project');

        expect(result).toEqual({
            id: 'proj-new',
            name: expect.stringMatching(/^MyDemo[A-Za-z0-9]+$/),
            title: 'My Demo',
            description: 'A demo project',
            org_id: 'org-123',
        });
    });

    it('passes the free-form title through and derives an alphanumeric name from it', async () => {
        createFireflyProject.mockResolvedValue({
            body: { id: 'p1', name: 'MyDemo', title: 'My Demo' },
        });

        // "My Demo" has a space — Adobe rejects a spaced `name`, so it must be stripped.
        await fetcher.createProject('My Demo', 'A demo project');

        expect(createFireflyProject).toHaveBeenCalledWith(
            'org-123',
            expect.objectContaining({
                title: 'My Demo',
                name: expect.stringMatching(/^MyDemo[A-Za-z0-9]+$/),
            })
        );
        // `who_created` must NOT be sent: Adobe stamps it with the caller's IMS user id,
        // and `verifyProjectOwnership` compares that field to the current user. A literal
        // would make every project we create fail its own delete gate.
        expect(createFireflyProject.mock.calls[0][1]).not.toHaveProperty('who_created');
    });

    it('creates a "Stage" workspace after the project (App Builder template parity)', async () => {
        // createFireflyProject provisions only Production; we add Stage to match the template.
        createFireflyProject.mockResolvedValue({ body: { projectId: 'proj-new' } });

        await fetcher.createProject('My Demo', '');

        expect(createWorkspace).toHaveBeenCalledWith(
            'org-123',
            'proj-new',
            // Named exactly "Stage" — NOT the suffix-derived name — to match the convention.
            expect.objectContaining({ name: 'Stage', title: 'Stage' })
        );
        expect(createWorkspace.mock.calls[0][2]).not.toHaveProperty('who_created');
    });

    it('returns the project even when the Stage workspace fails (best-effort)', async () => {
        createFireflyProject.mockResolvedValue({ body: { projectId: 'proj-new' } });
        createWorkspace.mockRejectedValue(new Error('workspace create failed'));

        const result = await fetcher.createProject('My Demo', '');

        // The project was created (Production exists); a Stage failure must not fail the create.
        expect(result).toEqual(expect.objectContaining({ id: 'proj-new', title: 'My Demo' }));
    });

    it('provisions a Runtime namespace for every workspace after create', async () => {
        // The added Stage workspace has no Runtime namespace by default — provision one
        // (and re-affirm Production's, idempotently) so App Builder apps can deploy.
        createFireflyProject.mockResolvedValue({ body: { projectId: 'proj-new' } });

        await fetcher.createProject('My Demo', '');

        expect(createRuntimeNamespace).toHaveBeenCalledWith('org-123', 'proj-new', 'ws-prod');
        expect(createRuntimeNamespace).toHaveBeenCalledWith('org-123', 'proj-new', 'ws-stage');
    });

    it('tolerates a 409 (namespace already present) and still returns the project', async () => {
        createFireflyProject.mockResolvedValue({ body: { projectId: 'proj-new' } });
        createRuntimeNamespace.mockRejectedValue(new Error('409 Conflict'));

        const result = await fetcher.createProject('My Demo', '');

        expect(result).toEqual(expect.objectContaining({ id: 'proj-new' }));
    });

    it('returns the project even when Runtime provisioning errors (best-effort)', async () => {
        createFireflyProject.mockResolvedValue({ body: { projectId: 'proj-new' } });
        createRuntimeNamespace.mockRejectedValue(new Error('500 Internal Error'));

        const result = await fetcher.createProject('My Demo', '');

        expect(result).toEqual(expect.objectContaining({ id: 'proj-new' }));
    });

    it('names the failure for an empty name (no SDK call)', async () => {
        const result = await fetcher.createProject('', 'desc');
        expect(result).toEqual({ error: expect.stringContaining('1–200 characters') });
        expect(createFireflyProject).not.toHaveBeenCalled();
    });

    it('names the failure for a name longer than 200 chars (no SDK call)', async () => {
        const result = await fetcher.createProject('x'.repeat(201), 'desc');
        expect(result).toEqual({ error: expect.stringContaining('1–200 characters') });
        expect(createFireflyProject).not.toHaveBeenCalled();
    });

    it('names the failure for a description longer than 500 chars (no SDK call)', async () => {
        const result = await fetcher.createProject('My Demo', 'd'.repeat(501));
        expect(result).toEqual({ error: expect.stringContaining('500 characters') });
        expect(createFireflyProject).not.toHaveBeenCalled();
    });

    it('names the failure when no organization is selected', async () => {
        mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
        const result = await fetcher.createProject('My Demo', 'desc');
        expect(result).toEqual({ error: expect.stringContaining('No organization') });
        expect(createFireflyProject).not.toHaveBeenCalled();
    });

    it('names the failure when the SDK is not initialized', async () => {
        mockSDKClient.isInitialized.mockReturnValue(false);
        mockSDKClient.ensureInitialized.mockResolvedValue(false);
        const result = await fetcher.createProject('My Demo', 'desc');
        expect(result).toEqual({ error: expect.stringContaining('sign in to Adobe') });
        expect(createFireflyProject).not.toHaveBeenCalled();
    });

    it('carries the SDK error TEXT when the SDK throws — the whole point (2026-08-27)', async () => {
        createFireflyProject.mockRejectedValue(
            new Error('400 - Bad Request ("Project name length must be less than 20")'),
        );
        const result = await fetcher.createProject('My Demo', 'desc');
        expect(result).toEqual({ error: expect.stringContaining('less than 20') });
    });

    it('translates a 409 Conflict into the name-taken reason', async () => {
        createFireflyProject.mockRejectedValue(new Error('409 Conflict'));
        const result = await fetcher.createProject('My Demo', 'desc');
        expect(result).toEqual({ error: expect.stringContaining('already exists') });
    });

    it('names the failure when the response has no project body', async () => {
        createFireflyProject.mockResolvedValue({ body: undefined });
        const result = await fetcher.createProject('My Demo', 'desc');
        expect(result).toEqual({ error: expect.stringContaining('no project id') });
    });

    // ── explicit target overrides the cache ─────────────────────────────────
    //
    // The cache is the EXTENSION UI's selection. The agent surface has its own
    // (`adobeTargetStore`), and `select_org` never writes this cache — so before
    // the override existed, an agent tool would create in whatever the UI had
    // selected, silently. Phase-4 defect 0a.
    describe('explicit target', () => {
        it('creates in the PASSED org, not the cached one', async () => {
            createFireflyProject.mockResolvedValue({ body: { projectId: 'proj-9' } });

            await fetcher.createProject('My Demo', '', { orgId: 'org-FROM-AGENT' });

            expect(createFireflyProject).toHaveBeenCalledWith(
                'org-FROM-AGENT',
                expect.anything(),
            );
        });

        // The control: same call without a target must still use the cache, or
        // the assertion above proves nothing about the override specifically.
        it('control: falls back to the cached org when no target is passed', async () => {
            createFireflyProject.mockResolvedValue({ body: { projectId: 'proj-9' } });

            await fetcher.createProject('My Demo', '');

            expect(createFireflyProject).toHaveBeenCalledWith('org-123', expect.anything());
        });

        it('still requires an org from somewhere', async () => {
            (mockCacheManager.getCachedOrganization as jest.Mock).mockReturnValue(undefined);

            expect(await fetcher.createProject('My Demo', '')).toEqual({
                error: expect.stringContaining('No organization'),
            });
            expect(createFireflyProject).not.toHaveBeenCalled();
        });
    });
});
