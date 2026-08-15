import { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { CommandExecutor } from '@/core/shell';
import type { StepLogger } from '@/core/logging';
import type { Logger } from '@/types/logger';
import {
    createMockCommandExecutor,
    createMockLogger,
    createMockStepLogger,
} from './authenticationService.testUtils';

/**
 * AuthenticationService — ApiSubscriberClient passthroughs (D2 Track A, Step 01)
 *
 * The 5 subscriber methods (4 existing fetcher wrappers + the new
 * ensureOAuthCredentialId) are exposed on the service as thin passthroughs that
 * call ensureEntities() then forward to the same-named fetcher method one-to-one.
 *
 * Also covers the delete-aio-project teardown passthroughs: 3 fetcher forwards
 * (getWorkspaceS2SCredential, createWorkspaceS2SCredentialFor,
 * deleteConsoleProject) plus clearConsoleContext, which forwards to the
 * SELECTOR (not the fetcher).
 */

jest.mock('@/core/logging');
jest.mock('@/features/authentication/services/adobeSDKClient');
jest.mock('@/features/authentication/services/adobeEntityService');

import { getLogger } from '@/core/logging';
import { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import { createEntityServices } from '@/features/authentication/services/adobeEntityService';

describe('AuthenticationService - ApiSubscriberClient passthroughs', () => {
    let authService: AuthenticationService;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockLogger: jest.Mocked<Logger>;
    let mockStepLogger: jest.Mocked<StepLogger>;
    let mockFetcher: any;
    let mockSelector: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockCommandExecutor = createMockCommandExecutor();
        mockLogger = createMockLogger();
        mockStepLogger = createMockStepLogger();

        (getLogger as jest.Mock).mockReturnValue(mockLogger);
        const StepLoggerMock = require('@/core/logging').StepLogger;
        StepLoggerMock.create = jest.fn().mockResolvedValue(mockStepLogger);

        (AdobeSDKClient as jest.MockedClass<typeof AdobeSDKClient>).mockImplementation(() => ({
            initialize: jest.fn().mockResolvedValue(undefined),
            ensureInitialized: jest.fn().mockResolvedValue(true),
            clear: jest.fn(),
        }) as any);

        mockFetcher = {
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

        (createEntityServices as jest.Mock).mockReturnValue({
            fetcher: mockFetcher,
            resolver: {},
            selector: mockSelector,
        });

        authService = new AuthenticationService('/mock/extension/path', mockLogger, mockCommandExecutor);
    });

    it('should forward getServicesForOrg', async () => {
        const result = await authService.getServicesForOrg('org1');
        expect(mockFetcher.getServicesForOrg).toHaveBeenCalledWith('org1');
        expect(result).toEqual([{ code: 'X' }]);
    });

    it('should forward createAdobeIdCredential', async () => {
        const input = { name: 'n', description: 'd', platform: 'apiKey' as const, domain: 'localhost:3000' };
        const result = await authService.createAdobeIdCredential('o', 'p', 'w', input);
        expect(mockFetcher.createAdobeIdCredential).toHaveBeenCalledWith('o', 'p', 'w', input);
        expect(result).toBe('int-apikey');
    });

    it('should forward subscribeAdobeIdIntegrationToServices', async () => {
        const services = [{ sdkCode: 'X', licenseConfigs: null, roles: null }];
        await authService.subscribeAdobeIdIntegrationToServices('o', 'int-1', services);
        expect(mockFetcher.subscribeAdobeIdIntegrationToServices).toHaveBeenCalledWith('o', 'int-1', services);
    });

    it('should forward subscribeOAuthServerToServerIntegrationToServices', async () => {
        const services = [{ sdkCode: 'Y', licenseConfigs: null, roles: null }];
        await authService.subscribeOAuthServerToServerIntegrationToServices('o', 'int-2', services);
        expect(mockFetcher.subscribeOAuthServerToServerIntegrationToServices).toHaveBeenCalledWith('o', 'int-2', services);
    });

    it('should forward ensureOAuthCredentialId', async () => {
        const result = await authService.ensureOAuthCredentialId('o', 'p', 'w');
        expect(mockFetcher.ensureOAuthCredentialId).toHaveBeenCalledWith('o', 'p', 'w');
        expect(result).toBe('int-oauth');
    });

    it('should forward getWorkspaceS2SCredential', async () => {
        const result = await authService.getWorkspaceS2SCredential('o', 'p', 'w');
        expect(mockFetcher.getWorkspaceS2SCredential).toHaveBeenCalledWith('o', 'p', 'w');
        expect(result).toEqual({ clientId: 'cid-s2s', idIntegration: 'int-s2s' });
    });

    it('should forward createWorkspaceS2SCredentialFor', async () => {
        const result = await authService.createWorkspaceS2SCredentialFor('o', 'p', 'w');
        expect(mockFetcher.createWorkspaceS2SCredentialFor).toHaveBeenCalledWith('o', 'p', 'w');
        expect(result).toEqual({ clientId: 'cid-new', idIntegration: 'int-new' });
    });

    it('should forward deleteConsoleProject', async () => {
        await authService.deleteConsoleProject('o', 'p');
        expect(mockFetcher.deleteConsoleProject).toHaveBeenCalledWith('o', 'p');
    });

    it('should forward clearConsoleContext to the selector', async () => {
        await authService.clearConsoleContext();
        expect(mockSelector.clearConsoleContext).toHaveBeenCalledTimes(1);
    });
});
