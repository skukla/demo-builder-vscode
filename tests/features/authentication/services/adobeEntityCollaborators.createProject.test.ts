/**
 * AdobeEntityFetcher.createProject Unit Tests
 *
 * In-app Adobe I/O App Builder project creation. Mirrors the createWorkspaceCredential
 * pattern: SDK-only (no CLI fallback), needs org id, validates input, never throws.
 */

import {
    createEntityCollaborators,
    type EntityCollaborators,
} from '@/features/authentication/services/adobeEntityService';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { StepLogger } from '@/core/logging/stepLogger';
import type { Logger } from '@/types/logger';
jest.mock('@/types/typeGuards');

import { getLogger } from '@/core/logging/debugLogger';
import { parseJSON } from '@/types/typeGuards';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

describe('entity collaborators.createProject()', () => {
    let entities: EntityCollaborators;
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
        (getLogger as jest.Mock).mockReturnValue(createMockLogger());
        (parseJSON as jest.Mock).mockImplementation((str) => {
            try {
                return JSON.parse(str);
            } catch {
                return null;
            }
        });

        mockCommandExecutor = createMockCommandExecutor({ execute: jest.fn() });

        createFireflyProject = jest.fn();
        createWorkspace = jest.fn().mockResolvedValue({ body: { workspaceId: 'ws-new' } });
        // Runtime-namespace provisioning: after create, every workspace is listed and
        // each gets a namespace. A created project has exactly ONE workspace, Adobe's —
        // creation stopped adding a second on 2026-09-20 (AB-24).
        getWorkspacesForProject = jest.fn().mockResolvedValue({
            body: [{ id: 'ws-prod', name: 'Production' }],
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

        mockLogger = createMockLogger() as unknown as jest.Mocked<Logger>;
        mockStepLogger = { logTemplate: jest.fn() } as unknown as jest.Mocked<StepLogger>;

        entities = createEntityCollaborators(
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

        const result = await entities.projectOps.createProject('My Demo', 'A demo project');

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
        await entities.projectOps.createProject('My Demo', 'A demo project');

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

    it('adds NO workspace of its own — the project keeps the one Adobe made', async () => {
        // Creation used to add a second workspace called "Stage" and then use that one,
        // leaving Adobe's empty. Removed 2026-09-20 (AB-24): a workspace for its own
        // sake, whose best-effort create gave "which workspace is this project's?" two
        // possible answers depending on whether one call succeeded.
        createFireflyProject.mockResolvedValue({ body: { projectId: 'proj-new' } });

        await entities.projectOps.createProject('My Demo', '');

        expect(createWorkspace).not.toHaveBeenCalled();
    });

    it('provisions a Runtime namespace for every workspace after create', async () => {
        // Adobe provisions one for NO workspace, its own Production included — measured
        // 2026-09-20 on a fresh project: zero namespaces at 0s, 15s, 30s and 60s, and
        // createRuntimeNamespace fills it immediately. So this sweep is the only thing
        // that provisions Runtime at all, and a project created without it cannot deploy
        // an App Builder app anywhere.
        createFireflyProject.mockResolvedValue({ body: { projectId: 'proj-new' } });

        await entities.projectOps.createProject('My Demo', '');

        expect(createRuntimeNamespace).toHaveBeenCalledWith('org-123', 'proj-new', 'ws-prod');
    });

    it('tolerates a 409 (namespace already present) and still returns the project', async () => {
        createFireflyProject.mockResolvedValue({ body: { projectId: 'proj-new' } });
        createRuntimeNamespace.mockRejectedValue(new Error('409 Conflict'));

        const result = await entities.projectOps.createProject('My Demo', '');

        expect(result).toEqual(expect.objectContaining({ id: 'proj-new' }));
    });

    it('returns the project even when Runtime provisioning errors (best-effort)', async () => {
        createFireflyProject.mockResolvedValue({ body: { projectId: 'proj-new' } });
        createRuntimeNamespace.mockRejectedValue(new Error('500 Internal Error'));

        const result = await entities.projectOps.createProject('My Demo', '');

        expect(result).toEqual(expect.objectContaining({ id: 'proj-new' }));
    });

    it('names the failure for an empty name (no SDK call)', async () => {
        const result = await entities.projectOps.createProject('', 'desc');
        expect(result).toEqual({ error: expect.stringContaining('1–200 characters') });
        expect(createFireflyProject).not.toHaveBeenCalled();
    });

    it('names the failure for a name longer than 200 chars (no SDK call)', async () => {
        const result = await entities.projectOps.createProject('x'.repeat(201), 'desc');
        expect(result).toEqual({ error: expect.stringContaining('1–200 characters') });
        expect(createFireflyProject).not.toHaveBeenCalled();
    });

    it('names the failure for a description longer than 500 chars (no SDK call)', async () => {
        const result = await entities.projectOps.createProject('My Demo', 'd'.repeat(501));
        expect(result).toEqual({ error: expect.stringContaining('500 characters') });
        expect(createFireflyProject).not.toHaveBeenCalled();
    });

    it('names the failure when no organization is selected', async () => {
        mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
        const result = await entities.projectOps.createProject('My Demo', 'desc');
        expect(result).toEqual({ error: expect.stringContaining('No organization') });
        expect(createFireflyProject).not.toHaveBeenCalled();
    });

    it('names the failure when the SDK is not initialized', async () => {
        mockSDKClient.isInitialized.mockReturnValue(false);
        mockSDKClient.ensureInitialized.mockResolvedValue(false);
        const result = await entities.projectOps.createProject('My Demo', 'desc');
        expect(result).toEqual({ error: expect.stringContaining('sign in to Adobe') });
        expect(createFireflyProject).not.toHaveBeenCalled();
    });

    it('carries the SDK error TEXT when the SDK throws — the whole point (2026-08-27)', async () => {
        createFireflyProject.mockRejectedValue(
            new Error('400 - Bad Request ("Project name length must be less than 20")'),
        );
        const result = await entities.projectOps.createProject('My Demo', 'desc');
        expect(result).toEqual({ error: expect.stringContaining('less than 20') });
    });

    it('translates a 409 Conflict into the name-taken reason', async () => {
        createFireflyProject.mockRejectedValue(new Error('409 Conflict'));
        const result = await entities.projectOps.createProject('My Demo', 'desc');
        expect(result).toEqual({ error: expect.stringContaining('already exists') });
    });

    it('names the failure when the response has no project body', async () => {
        createFireflyProject.mockResolvedValue({ body: undefined });
        const result = await entities.projectOps.createProject('My Demo', 'desc');
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

            await entities.projectOps.createProject('My Demo', '', { orgId: 'org-FROM-AGENT' });

            expect(createFireflyProject).toHaveBeenCalledWith(
                'org-FROM-AGENT',
                expect.anything(),
            );
        });

        // The control: same call without a target must still use the cache, or
        // the assertion above proves nothing about the override specifically.
        it('control: falls back to the cached org when no target is passed', async () => {
            createFireflyProject.mockResolvedValue({ body: { projectId: 'proj-9' } });

            await entities.projectOps.createProject('My Demo', '');

            expect(createFireflyProject).toHaveBeenCalledWith('org-123', expect.anything());
        });

        it('still requires an org from somewhere', async () => {
            (mockCacheManager.getCachedOrganization as jest.Mock).mockReturnValue(undefined);

            expect(await entities.projectOps.createProject('My Demo', '')).toEqual({
                error: expect.stringContaining('No organization'),
            });
            expect(createFireflyProject).not.toHaveBeenCalled();
        });
    });
});
