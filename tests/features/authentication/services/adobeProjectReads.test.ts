/**
 * Project reads: SDK-first with the CLI fallback, and the SDK-only variant.
 *
 * Split 2026-10-08 from adobeEntityCollaborators.test.ts (EDS-8).
 */

import {
    setupEntityCollaborators,
    type EntityCollaborators,
} from './adobeEntityCollaborators.testUtils';

import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { StepLogger } from '@/core/logging/stepLogger';

describe('project reads', () => {
    let entities: EntityCollaborators;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockSDKClient: jest.Mocked<AdobeSDKClient>;
    let mockCacheManager: jest.Mocked<AuthCacheManager>;
    let mockStepLogger: jest.Mocked<StepLogger>;

    beforeEach(() => {
        ({
            entities,
            mockCommandExecutor,
            mockSDKClient,
            mockCacheManager,
            mockStepLogger,
        } = setupEntityCollaborators());
    });

    // P1 siblings for the entity reads a BACKGROUND caller makes. `getProjects`
    // and `getWorkspaces` fall back to `aio console …` when the SDK returns
    // nothing, and that CLI call triggers interactive browser auth on a stale
    // token — fine for a read the user asked for (the destination pickers guard
    // it and prompt), wrong for one they did not, such as hydrating a project's
    // display title. These variants degrade to [] instead, exactly as
    // getOrganizationsSdkOnly does.
    describe('SDK-only entity reads (P1)', () => {
        it('getProjectsSdkOnly returns SDK results without touching the CLI', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue({
                id: '123456',
                code: 'ORG@AdobeOrg',
                name: 'Test Org',
            });
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getProjectsForOrg: jest.fn().mockResolvedValue({
                    body: [{ id: 'proj1', name: 'Project 1', title: 'Project 1 Title' }],
                }),
            } as ReturnType<typeof mockSDKClient.getClient>);

            const result = await entities.projectReads.getProjectsSdkOnly();

            expect(result).toHaveLength(1);
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });

        // THE regression this exists to prevent: an empty SDK read is exactly when
        // the normal path shells out and opens a browser.
        it('getProjectsSdkOnly returns [] WITHOUT the CLI fallback on an empty SDK read', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue({
                id: '123456',
                code: 'ORG@AdobeOrg',
                name: 'Test Org',
            });
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getProjectsForOrg: jest.fn().mockRejectedValue(new Error('SDK error')),
            } as ReturnType<typeof mockSDKClient.getClient>);

            const result = await entities.projectReads.getProjectsSdkOnly();

            expect(result).toStrictEqual([]);
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });

        // Control: the ordinary reads keep their fallback. Without this, deleting
        // the fallback entirely would satisfy every assertion above.
        it('the ordinary getProjects DOES still fall back to the CLI', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue({
                id: '123456',
                code: 'ORG@AdobeOrg',
                name: 'Test Org',
            });
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getProjectsForOrg: jest.fn().mockRejectedValue(new Error('SDK error')),
            } as ReturnType<typeof mockSDKClient.getClient>);
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '[]',
                stderr: '',
                code: 0,
                duration: 0,
            });

            await entities.projectReads.getProjects();

            expect(mockCommandExecutor.execute).toHaveBeenCalled();
        });
    });

    /**
     * The delete gate's read (2026-10-28): ONE project by id, SDK only. The gate needs
     * that project's `who_created`, and downloading the org's whole list for it (780
     * projects, 1.2 s) held the delete question back; this read took 0.3 s live.
     */
    describe('getProject()', () => {
        it("asks Adobe for that one project and answers it, creator included", async () => {
            mockSDKClient.isInitialized.mockReturnValue(true);
            const getProject = jest.fn().mockResolvedValue({
                body: { id: 'proj1', name: 'Project 1', title: 'Project 1 Title', who_created: 'USER@x.e' },
            });
            mockSDKClient.getClient.mockReturnValue({ getProject } as ReturnType<typeof mockSDKClient.getClient>);

            const result = await entities.projectReads.getProject({ orgId: '123456', projectId: 'proj1' });

            expect(getProject).toHaveBeenCalledWith('123456', 'proj1');
            expect(result).toMatchObject({ id: 'proj1', who_created: 'USER@x.e' });
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });

        // An SDK hiccup must not read as "no such project": the delete gate would say
        // "not yours" and select_project "unknown id". It falls back to the list, as both
        // did before; the slow path runs only then.
        it('falls back to the org list when the single read gets no answer', async () => {
            mockSDKClient.isInitialized.mockReturnValue(true);
            const getProject = jest.fn().mockRejectedValue(new Error('SDK error'));
            const getProjectsForOrg = jest.fn().mockResolvedValue({
                body: [{ id: 'proj1', name: 'Project 1', title: 'Project 1 Title', who_created: 'USER@x.e' }],
            });
            mockSDKClient.getClient.mockReturnValue({ getProject, getProjectsForOrg } as ReturnType<
                typeof mockSDKClient.getClient
            >);

            const result = await entities.projectReads.getProject({ orgId: '123456', projectId: 'proj1' });

            expect(getProjectsForOrg).toHaveBeenCalledWith('123456');
            expect(result).toMatchObject({ id: 'proj1', who_created: 'USER@x.e' });
        });

        it('CONTROL: the list is not read when the single read answers', async () => {
            mockSDKClient.isInitialized.mockReturnValue(true);
            const getProjectsForOrg = jest.fn();
            mockSDKClient.getClient.mockReturnValue({
                getProject: jest.fn().mockResolvedValue({ body: { id: 'proj1', name: 'P', title: 'P' } }),
                getProjectsForOrg,
            } as ReturnType<typeof mockSDKClient.getClient>);

            await entities.projectReads.getProject({ orgId: '123456', projectId: 'proj1' });

            expect(getProjectsForOrg).not.toHaveBeenCalled();
        });
    });

    describe('getProjects()', () => {
        it('should fetch projects via SDK with valid org ID', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue({
                id: '123456',
                code: 'ORG@AdobeOrg',
                name: 'Test Org',
            });
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getProjectsForOrg: jest.fn().mockResolvedValue({
                    body: [{ id: 'proj1', name: 'Project 1', title: 'Project 1 Title' }],
                }),
            } as ReturnType<typeof mockSDKClient.getClient>);

            const result = await entities.projectReads.getProjects();

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Project 1');
        });

        it('should carry who_created through the SDK project mapping', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue({
                id: '123456',
                code: 'ORG@AdobeOrg',
                name: 'Test Org',
            });
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getProjectsForOrg: jest.fn().mockResolvedValue({
                    body: [
                        {
                            id: 'proj1',
                            name: 'Project 1',
                            title: 'Project 1 Title',
                            who_created: '5DA1B2C3D4E5F607080910A1@abcdef1234567890.e',
                        },
                        { id: 'proj2', name: 'Project 2', title: 'Project 2 Title' },
                    ],
                }),
            } as ReturnType<typeof mockSDKClient.getClient>);

            const result = await entities.projectReads.getProjects();

            expect(result[0].who_created).toBe('5DA1B2C3D4E5F607080910A1@abcdef1234567890.e');
            // Missing on the wire → stays absent (ownership gate fails closed later).
            expect(result[1].who_created).toBeUndefined();
        });

        it('should use CLI when org ID is missing (and no token org)', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(true);
            // No threaded/cached org AND the token org fallback yields nothing → CLI.
            jest.spyOn(entities.orgReads, 'getOrganizationsSdkOnly').mockResolvedValue([]);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify([
                    { id: 'proj1', name: 'CLI Project', title: 'CLI Project' },
                ]),
                stderr: '',
                code: 0,
                duration: 0,
            });

            const result = await entities.projectReads.getProjects();

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('CLI Project');
        });

        it('should suppress log messages in silent mode', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify([]),
                stderr: '',
                code: 0,
                duration: 0,
            });

            await entities.projectReads.getProjects({ silent: true });

            expect(mockStepLogger.logTemplate).not.toHaveBeenCalledWith(
                'adobe-auth',
                'operations.loading-projects',
                expect.anything()
            );
        });

        it('should return empty array when no projects exist', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '',
                stderr: 'does not have any projects',
                code: 1,
                duration: 0,
            });

            const result = await entities.projectReads.getProjects();

            expect(result).toHaveLength(0);
        });

        it('should parse JSON when CLI stdout contains warning lines with ›', async () => {
            mockCacheManager.getCachedOrganization.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);

            // Simulate aio CLI output with upgrade warnings before JSON
            const warningLines = [
                ' ›   Warning: @adobe/aio-cli update available from 10.3.4 to 11.0.2.',
                ' ›   Run npm install -g @adobe/aio-cli to update.',
                ' ›   Warning: @adobe/aio-cli-plugin-api-mesh update available from 5.5.0 to',
                ' ›  ',
            ].join('\n');
            const jsonData = JSON.stringify([
                { id: 'proj1', name: 'Project 1', title: 'Project 1 Title' },
            ]);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: warningLines + '\n' + jsonData,
                stderr: '',
                code: 2,
                duration: 0,
            });

            const result = await entities.projectReads.getProjects();

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Project 1');
        });
    });
});
