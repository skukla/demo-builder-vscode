/**
 * Tests for ensure-mesh-api-subscribed handler
 *
 * Verifies the handler mirrors checkHandler ordering:
 * validateWorkspaceId -> ensureAuthenticated -> ensureMeshApiSubscribed,
 * building the MeshSubscribeTarget from the PAYLOAD (org from payload.orgId,
 * NOT getCurrentProject — the wizard has no current project).
 */

import { handleEnsureMeshApiSubscribed } from '@/features/mesh/handlers/subscribeHandler';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { ServiceLocator } from '@/core/di';
import { validateOrgId, validateProjectId, validateWorkspaceId } from '@/core/validation';
import { ensureAuthenticated } from '@/features/mesh/handlers/shared';
import { ensureMeshApiSubscribed } from '@/features/app-builder/services/ensureMeshApiSubscribed';
import { ErrorCode } from '@/types/errorCodes';

jest.mock('@/core/di');
jest.mock('@/core/validation', () => ({
    validateOrgId: jest.fn(),
    validateProjectId: jest.fn(),
    validateWorkspaceId: jest.fn(),
}));
jest.mock('@/features/mesh/handlers/shared', () => ({
    ensureAuthenticated: jest.fn(),
}));
jest.mock('@/features/app-builder/services/ensureMeshApiSubscribed', () => ({
    ensureMeshApiSubscribed: jest.fn(),
}));

const mockValidateOrgId = validateOrgId as jest.Mock;
const mockValidateProjectId = validateProjectId as jest.Mock;
const mockValidateWorkspaceId = validateWorkspaceId as jest.Mock;
const mockEnsureAuthenticated = ensureAuthenticated as jest.Mock;
const mockEnsureMeshApiSubscribed = ensureMeshApiSubscribed as jest.Mock;

describe('handleEnsureMeshApiSubscribed', () => {
    let mockContext: HandlerContext;
    let mockAuthService: unknown;

    const validPayload = {
        orgId: 'org-1',
        projectId: 'proj-1',
        workspaceId: 'ws-1',
        backendId: 'accs',
        frontendId: 'eds',
    };

    const subscribedApis = [
        { code: 'GraphQLServiceSDK', name: 'API Mesh' },
        { code: 'AdobeIOManagementAPISDK', name: 'I/O Management API' },
    ];

    beforeEach(() => {
        jest.clearAllMocks();

        mockValidateOrgId.mockReturnValue(undefined);
        mockValidateProjectId.mockReturnValue(undefined);
        mockValidateWorkspaceId.mockReturnValue(undefined);
        mockEnsureAuthenticated.mockResolvedValue({ authenticated: true });
        mockEnsureMeshApiSubscribed.mockResolvedValue(subscribedApis);

        mockAuthService = { getCachedOrganization: jest.fn() };
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthService);

        mockContext = {
            logger: {
                info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
            },
        } as unknown as HandlerContext;
    });

    it('should return MESH_CONFIG_INVALID when workspaceId is invalid', async () => {
        mockValidateWorkspaceId.mockImplementation(() => {
            throw new Error('bad id');
        });

        const result = await handleEnsureMeshApiSubscribed(mockContext, validPayload);

        expect(result.success).toBe(false);
        expect(result.code).toBe(ErrorCode.MESH_CONFIG_INVALID);
        expect(mockEnsureMeshApiSubscribed).not.toHaveBeenCalled();
    });

    it('should return MESH_CONFIG_INVALID when orgId is invalid and NOT call the service', async () => {
        mockValidateOrgId.mockImplementation(() => {
            throw new Error('bad org');
        });

        const result = await handleEnsureMeshApiSubscribed(mockContext, validPayload);

        expect(result.success).toBe(false);
        expect(result.code).toBe(ErrorCode.MESH_CONFIG_INVALID);
        expect(mockEnsureMeshApiSubscribed).not.toHaveBeenCalled();
    });

    it('should return MESH_CONFIG_INVALID when projectId is invalid and NOT call the service', async () => {
        mockValidateProjectId.mockImplementation(() => {
            throw new Error('bad project');
        });

        const result = await handleEnsureMeshApiSubscribed(mockContext, validPayload);

        expect(result.success).toBe(false);
        expect(result.code).toBe(ErrorCode.MESH_CONFIG_INVALID);
        expect(mockEnsureMeshApiSubscribed).not.toHaveBeenCalled();
    });

    it('should return a shaped error and NOT call the service when not authenticated', async () => {
        mockEnsureAuthenticated.mockResolvedValue({
            authenticated: false,
            error: 'Adobe authentication required',
            code: ErrorCode.AUTH_REQUIRED,
        });

        const result = await handleEnsureMeshApiSubscribed(mockContext, validPayload);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Adobe authentication required');
        expect(result.code).toBe(ErrorCode.AUTH_REQUIRED);
        expect(mockEnsureMeshApiSubscribed).not.toHaveBeenCalled();
    });

    it('should call the service once with a target built from the payload and return success', async () => {
        const result = await handleEnsureMeshApiSubscribed(mockContext, validPayload);

        expect(result).toEqual({ success: true, data: { apis: subscribedApis } });
        expect(mockEnsureMeshApiSubscribed).toHaveBeenCalledTimes(1);
        expect(mockEnsureMeshApiSubscribed).toHaveBeenCalledWith(
            expect.objectContaining({
                project: {
                    adobe: { organization: 'org-1', projectId: 'proj-1', workspace: 'ws-1' },
                    componentSelections: { backend: 'accs', frontend: 'eds' },
                },
                authService: mockAuthService,
                logger: mockContext.logger,
            }),
        );
    });

    it('should return a shaped error when the service throws', async () => {
        mockEnsureMeshApiSubscribed.mockRejectedValue(new Error('subscribe boom'));

        const result = await handleEnsureMeshApiSubscribed(mockContext, validPayload);

        expect(result.success).toBe(false);
        expect(result.error).toBe('subscribe boom');
        expect(result.code).toBe(ErrorCode.UNKNOWN);
        expect(result.data).toBeUndefined();
    });

    it('condenses a verbose SDK error into a short, readable message', async () => {
        const rawSdk = '[CoreConsoleAPISDK:ERROR_GET_SERVICES_FOR_ORG] 500 - Internal Server Error '
            + '({"id":"abc","messages":[{"template":"ERR_MSG_RETRY_ON_INTERNAL_ERROR",'
            + '"message":"a very long nested json blob"}]})';
        mockEnsureMeshApiSubscribed.mockRejectedValue(new Error(rawSdk));

        const result = await handleEnsureMeshApiSubscribed(mockContext, validPayload);

        expect(result.success).toBe(false);
        expect(result.code).toBe(ErrorCode.UNKNOWN);
        expect(result.error).toContain('500');
        expect(result.error?.toLowerCase()).toContain('retry');
        expect(result.error).not.toContain('CoreConsoleAPISDK');
        expect((result.error ?? '').length).toBeLessThan(120);
    });

    it('should still call the service and succeed when backendId/frontendId are missing', async () => {
        const result = await handleEnsureMeshApiSubscribed(mockContext, {
            orgId: 'org-1',
            projectId: 'proj-1',
            workspaceId: 'ws-1',
        });

        expect(result).toEqual({ success: true, data: { apis: subscribedApis } });
        expect(mockEnsureMeshApiSubscribed).toHaveBeenCalledTimes(1);
        expect(mockEnsureMeshApiSubscribed).toHaveBeenCalledWith(
            expect.objectContaining({
                project: {
                    adobe: { organization: 'org-1', projectId: 'proj-1', workspace: 'ws-1' },
                    componentSelections: { backend: undefined, frontend: undefined },
                },
            }),
        );
    });
});
