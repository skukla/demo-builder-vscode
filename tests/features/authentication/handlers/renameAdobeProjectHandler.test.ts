/**
 * rename-adobe-project — the picker's rename action and the `rename_adobe_project`
 * tool: the title only, the org gate, Adobe's refusal in plain words, and the open
 * demo's stored title kept in step.
 */
import { createMockContext } from './projectHandlers.testUtils';
import { handleRenameAdobeProject } from '@/features/authentication/handlers/renameAdobeProjectHandler';
import { ErrorCode } from '@/types/errorCodes';
import { createMockProject } from '../../../helpers/projectFake';

jest.mock('@/core/di/serviceLocator');
jest.mock('@/core/validation/validators/AdobeResourceValidator');

const PAYLOAD = { orgId: 'org-123', projectId: 'proj-1', title: '  Kukla Bodea  ' };

function renameContext() {
    const context = createMockContext();
    context.authManager.getOrganizations.mockResolvedValue([
        { id: 'org-123', code: 'C', name: 'Test Org' },
    ]);
    context.authManager.getProjects.mockResolvedValue([]);
    context.authManager.renameRemoteProject.mockResolvedValue({ ok: true });
    return context;
}

describe('handleRenameAdobeProject', () => {
    it('renames the title only, trimmed, in the given org and project', async () => {
        const context = renameContext();

        const result = await handleRenameAdobeProject(context, PAYLOAD);

        expect(result).toStrictEqual({ success: true, data: { projectId: 'proj-1', title: 'Kukla Bodea' } });
        expect(context.authManager.renameRemoteProject).toHaveBeenCalledWith(
            'org-123',
            'proj-1',
            'Kukla Bodea',
        );
    });

    it('refreshes the project list so the picker shows the new title', async () => {
        const context = renameContext();

        await handleRenameAdobeProject(context, PAYLOAD);

        expect(context.authManager.getProjects).toHaveBeenCalledWith({ orgId: 'org-123' });
        expect(context.sendMessage).toHaveBeenCalledWith('get-projects', expect.any(Array));
    });

    it('keeps the open demo in step when it deploys to the renamed project', async () => {
        const context = renameContext();
        const demo = createMockProject({
            adobe: { organization: 'org-123', projectId: 'proj-1', projectTitle: 'Kukla Test', workspaceTitle: 'Stage' },
        });
        (context.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(demo);

        await handleRenameAdobeProject(context, PAYLOAD);

        expect(context.stateManager.saveProjectConfigOnly).toHaveBeenCalledWith(
            expect.objectContaining({ adobe: expect.objectContaining({ projectTitle: 'Kukla Bodea' }) }),
        );
    });

    it('leaves a demo that deploys elsewhere alone', async () => {
        const context = renameContext();
        const demo = createMockProject({
            adobe: { organization: 'org-123', projectId: 'other', projectTitle: 'Other' },
        });
        (context.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(demo);

        await handleRenameAdobeProject(context, PAYLOAD);

        expect(context.stateManager.saveProjectConfigOnly).not.toHaveBeenCalled();
    });

    it("says Adobe's read-only refusal in plain words", async () => {
        const context = renameContext();
        context.authManager.renameRemoteProject.mockResolvedValue({
            ok: false,
            error: "403 ERR_MSG_OPERATION_NOT_ALLOWED doesn't have the matching licenses",
        });

        const result = await handleRenameAdobeProject(context, PAYLOAD);

        expect(result.success).toBe(false);
        expect(result.error).toContain('not a developer on every product profile');
    });

    it('never passes on a refusal it cannot read', async () => {
        const context = renameContext();
        context.authManager.renameRemoteProject.mockResolvedValue({ ok: false, error: 'socket hang up' });

        const result = await handleRenameAdobeProject(context, PAYLOAD);

        expect(result).toStrictEqual({
            success: false,
            error: 'Adobe did not rename the project. Details are in Debug Logs.',
        });
    });

    it('refuses an empty name without calling Adobe', async () => {
        const context = renameContext();

        const result = await handleRenameAdobeProject(context, { ...PAYLOAD, title: '   ' });

        expect(result).toStrictEqual({
            success: false,
            error: 'Enter a name.',
            code: ErrorCode.PROJECT_INVALID,
        });
        expect(context.authManager.renameRemoteProject).not.toHaveBeenCalled();
    });

    it('refuses a name over 100 characters', async () => {
        const context = renameContext();

        const result = await handleRenameAdobeProject(context, { ...PAYLOAD, title: 'x'.repeat(101) });

        expect(result.error).toBe('Use 100 characters or fewer.');
        expect(context.authManager.renameRemoteProject).not.toHaveBeenCalled();
    });

    it('refuses under a different org, without calling Adobe', async () => {
        const context = renameContext();
        context.authManager.getOrganizations.mockResolvedValue([
            { id: 'other-org', code: 'O', name: 'Other' },
        ]);

        const result = await handleRenameAdobeProject(context, PAYLOAD);

        expect(result.code).toBe(ErrorCode.ORG_MISMATCH);
        expect(context.authManager.renameRemoteProject).not.toHaveBeenCalled();
    });
});
