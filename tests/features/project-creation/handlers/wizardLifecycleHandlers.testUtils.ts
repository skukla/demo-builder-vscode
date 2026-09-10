/**
 * Shared Test Utilities for Lifecycle Handlers
 *
 * Common mocks, factories, and utilities used across lifecycle handler tests.
 */

import { HandlerContext } from '@/types/handlers';
import type { WebviewCommunicationManager } from '@/core/communication/webviewCommunicationManager';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockWebviewPanel } from '../../../helpers/webviewPanelFake';

/**
 * Creates a mock HandlerContext for testing
 *
 * CRITICAL: Returns a FUNCTION that creates fresh mocks, not a shared object.
 * This prevents test pollution from shared references.
 */
export function createWizardLifecycleContext(): jest.Mocked<HandlerContext> {
    // Mock state manager - with proper jest mock types
    const mockStateManager = createMockStateManager({
        getCurrentProject: jest.fn() as jest.MockedFunction<() => Promise<any>>,
    });

    // Mock communication manager. The real one is a class with private state;
    // the handlers only ever call `sendMessage` on it.
    const mockCommunicationManager = {
        sendMessage: jest.fn().mockResolvedValue(undefined),
    };

    return createMockHandlerContext({
        panel: createMockWebviewPanel(),
        stateManager: mockStateManager,
        communicationManager:
            mockCommunicationManager as unknown as jest.Mocked<WebviewCommunicationManager>,
        logger: createMockLogger(),
        debugLogger: createMockLogger(),
        sendMessage: jest.fn().mockResolvedValue(undefined),
        sharedState: {
            isAuthenticating: false,
            projectCreationAbortController: undefined,
        },
    });
}
