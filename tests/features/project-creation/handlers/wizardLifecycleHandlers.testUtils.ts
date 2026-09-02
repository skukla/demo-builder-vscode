/**
 * Shared Test Utilities for Lifecycle Handlers
 *
 * Common mocks, factories, and utilities used across lifecycle handler tests.
 */

import { HandlerContext } from '@/types/handlers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../helpers/loggerFake';

/**
 * Creates a mock HandlerContext for testing
 *
 * CRITICAL: Returns a FUNCTION that creates fresh mocks, not a shared object.
 * This prevents test pollution from shared references.
 */
export function createWizardLifecycleContext() {
    // Mock webview panel
    const mockPanel = {
        dispose: jest.fn()
    };

    // Mock state manager - with proper jest mock types
    const mockStateManager = createMockStateManager({
        getCurrentProject: jest.fn() as jest.MockedFunction<() => Promise<any>>
    });

    // Mock communication manager
    const mockCommunicationManager = {
        sendMessage: jest.fn().mockResolvedValue(undefined)
    };

    // Create mock context
    const context = {
        panel: mockPanel,
        stateManager: mockStateManager,
        communicationManager: mockCommunicationManager,
        extensionPath: '/mock/extension/path',
        logger: createMockLogger(),
        debugLogger: {
            debug: jest.fn()
        } as any,
        sendMessage: jest.fn().mockResolvedValue(undefined),
        sharedState: {
            isAuthenticating: false,
            projectCreationAbortController: undefined
        }
    } as any;

    return context as jest.Mocked<HandlerContext>;
}

