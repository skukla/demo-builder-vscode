import { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { StepLogger } from '@/core/logging/stepLogger';
import type { Logger } from '@/types/logger';
import {
    createMockCommandExecutor,
    createMockLogger,
    createMockSDKClient,
    createMockStepLogger,
} from './authenticationService.testUtils';

/**
 * AuthenticationService — ApiSubscriberClient passthroughs (D2 Track A, Step 01)
 *
 * The subscriber methods are exposed on the service as thin passthroughs that call
 * ensureEntities() then forward to the same-named method on the collaborator that
 * owns it — reads, credentials, orgServices or projectOps. (There was a facade,
 * AdobeEntityFetcher, between them until 2026-09-21.)
 *
 * Also covers the delete-aio-project teardown passthroughs plus
 * clearConsoleContext, which forwards to the SELECTOR.
 */
jest.mock('@/features/authentication/services/adobeSDKClient');
jest.mock('@/features/authentication/services/adobeEntityService');

import { getLogger } from '@/core/logging/debugLogger';
import { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import { createEntityServices } from '@/features/authentication/services/adobeEntityService';

describe('AuthenticationService - ApiSubscriberClient passthroughs', () => {
    let authService: AuthenticationService;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockLogger: jest.Mocked<Logger>;
    let mockStepLogger: jest.Mocked<StepLogger>;
    let mockEntities: any;
    let mockSelector: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockCommandExecutor = createMockCommandExecutor();
        mockLogger = createMockLogger();
        mockStepLogger = createMockStepLogger();

        (getLogger as jest.Mock).mockReturnValue(mockLogger);
        const StepLoggerMock = require('@/core/logging/stepLogger').StepLogger;
        StepLoggerMock.create = jest.fn().mockResolvedValue(mockStepLogger);

        (AdobeSDKClient as jest.MockedClass<typeof AdobeSDKClient>).mockImplementation(
            () => createMockSDKClient()
        );

        mockEntities = {
            getServicesForOrg: jest.fn().mockResolvedValue([{ code: 'X' }]),
            createAdobeIdCredential: jest.fn().mockResolvedValue('int-apikey'),
            subscribeAdobeIdIntegrationToServices: jest.fn().mockResolvedValue(undefined),
            subscribeOAuthServerToServerIntegrationToServices: jest.fn().mockResolvedValue(undefined),
            ensureOAuthCredentialId: jest.fn().mockResolvedValue('int-oauth'),
            getWorkspaceS2SCredential: jest.fn().mockResolvedValue({ clientId: 'cid-s2s', idIntegration: 'int-s2s' }),
            createWorkspaceS2SCredentialFor: jest.fn().mockResolvedValue({ clientId: 'cid-new', idIntegration: 'int-new' }),
            deleteConsoleProject: jest.fn().mockResolvedValue(undefined),
        };

        mockSelector = {
            clearConsoleContext: jest.fn().mockResolvedValue(undefined),
        };

        // One pool behind all four collaborator slots. Routing a call to the right
        // collaborator is the COMPILER's to check — `credentials.getServicesForOrg`
        // is a type error — so this fake only has to answer, and a method a test
        // adds later is reachable whichever collaborator owns it.
        (createEntityServices as jest.Mock).mockReturnValue({
            reads: mockEntities,
            credentials: mockEntities,
            orgServices: mockEntities,
            projectOps: mockEntities,
            resolver: {},
            selector: mockSelector,
        });

        authService = new AuthenticationService('/mock/extension/path', mockLogger, mockCommandExecutor);
    });

    it('should forward getServicesForOrg', async () => {
        const result = await authService.getServicesForOrg('org1');
        expect(mockEntities.getServicesForOrg).toHaveBeenCalledWith('org1', undefined);
        expect(result).toEqual([{ code: 'X' }]);
    });

    it('should forward createAdobeIdCredential', async () => {
        const input = { name: 'n', description: 'd', platform: 'apiKey' as const, domain: 'localhost:3000' };
        const result = await authService.createAdobeIdCredential('o', 'p', 'w', input);
        expect(mockEntities.createAdobeIdCredential).toHaveBeenCalledWith('o', 'p', 'w', input);
        expect(result).toBe('int-apikey');
    });

    it('should forward subscribeAdobeIdIntegrationToServices', async () => {
        const services = [{ sdkCode: 'X', licenseConfigs: null, roles: null }];
        await authService.subscribeAdobeIdIntegrationToServices('o', 'int-1', services);
        expect(mockEntities.subscribeAdobeIdIntegrationToServices).toHaveBeenCalledWith('o', 'int-1', services);
    });

    it('should forward subscribeOAuthServerToServerIntegrationToServices', async () => {
        const services = [{ sdkCode: 'Y', licenseConfigs: null, roles: null }];
        await authService.subscribeOAuthServerToServerIntegrationToServices('o', 'int-2', services);
        expect(mockEntities.subscribeOAuthServerToServerIntegrationToServices).toHaveBeenCalledWith('o', 'int-2', services);
    });

    it('should forward ensureOAuthCredentialId', async () => {
        const result = await authService.ensureOAuthCredentialId('o', 'p', 'w');
        expect(mockEntities.ensureOAuthCredentialId).toHaveBeenCalledWith('o', 'p', 'w');
        expect(result).toBe('int-oauth');
    });

    it('should forward getWorkspaceS2SCredential', async () => {
        const result = await authService.getWorkspaceS2SCredential('o', 'p', 'w');
        expect(mockEntities.getWorkspaceS2SCredential).toHaveBeenCalledWith('o', 'p', 'w');
        expect(result).toEqual({ clientId: 'cid-s2s', idIntegration: 'int-s2s' });
    });

    it('should forward createWorkspaceS2SCredentialFor', async () => {
        const result = await authService.createWorkspaceS2SCredentialFor('o', 'p', 'w');
        expect(mockEntities.createWorkspaceS2SCredentialFor).toHaveBeenCalledWith('o', 'p', 'w');
        expect(result).toEqual({ clientId: 'cid-new', idIntegration: 'int-new' });
    });

    it('should forward deleteConsoleProject', async () => {
        await authService.deleteConsoleProject('o', 'p');
        expect(mockEntities.deleteConsoleProject).toHaveBeenCalledWith('o', 'p');
    });

    it('should forward clearConsoleContext to the selector', async () => {
        await authService.clearConsoleContext();
        expect(mockSelector.clearConsoleContext).toHaveBeenCalledTimes(1);
    });

    it('should forward getSubscribedServiceCodes', async () => {
        mockEntities.getSubscribedServiceCodes = jest.fn().mockResolvedValue(['A']);
        await expect(authService.getSubscribedServiceCodes('org', 'int')).resolves.toEqual(['A']);
        expect(mockEntities.getSubscribedServiceCodes).toHaveBeenCalledWith('org', 'int');
    });

    it('should forward getProjectsSdkOnly with its org target', async () => {
        mockEntities.getProjectsSdkOnly = jest.fn().mockResolvedValue([{ id: 'p1' }]);
        await expect(authService.getProjectsSdkOnly({ orgId: 'org' })).resolves.toEqual([
            { id: 'p1' },
        ]);
        expect(mockEntities.getProjectsSdkOnly).toHaveBeenCalledWith({ orgId: 'org' });
    });

    it('should forward getWorkspacesSdkOnly with its target', async () => {
        mockEntities.getWorkspacesSdkOnly = jest.fn().mockResolvedValue([{ id: 'w1' }]);
        const target = { orgId: 'org', projectId: 'proj' };
        await expect(authService.getWorkspacesSdkOnly(target)).resolves.toEqual([{ id: 'w1' }]);
        expect(mockEntities.getWorkspacesSdkOnly).toHaveBeenCalledWith(target);
    });

    it('should forward getWorkspaceCredential', async () => {
        mockEntities.getWorkspaceCredential = jest.fn().mockResolvedValue({ clientId: 'cid' });
        await expect(authService.getWorkspaceCredential()).resolves.toEqual({ clientId: 'cid' });
        expect(mockEntities.getWorkspaceCredential).toHaveBeenCalledTimes(1);
    });

    it('should forward renameRemoteProject', async () => {
        mockEntities.renameRemoteProject = jest.fn().mockResolvedValue({ ok: true });
        await expect(authService.renameRemoteProject('org', 'proj', 'New title')).resolves.toStrictEqual({
            ok: true,
        });
        expect(mockEntities.renameRemoteProject).toHaveBeenCalledWith('org', 'proj', 'New title');
    });

    it('should forward createWorkspaceCredential', async () => {
        mockEntities.createWorkspaceCredential = jest.fn().mockResolvedValue({ clientId: 'new' });
        await expect(authService.createWorkspaceCredential('name', 'desc')).resolves.toEqual({
            clientId: 'new',
        });
        expect(mockEntities.createWorkspaceCredential).toHaveBeenCalledWith('name', 'desc');
    });

    it('should forward getS2SDeployCredentials', async () => {
        mockEntities.getS2SDeployCredentials = jest.fn().mockResolvedValue({ clientId: 's2s' });
        await expect(authService.getS2SDeployCredentials('org', 'proj', 'ws')).resolves.toEqual({
            clientId: 's2s',
        });
        expect(mockEntities.getS2SDeployCredentials).toHaveBeenCalledWith('org', 'proj', 'ws');
    });
});
