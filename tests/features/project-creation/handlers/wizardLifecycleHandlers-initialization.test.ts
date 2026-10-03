/**
 * Lifecycle Handlers Tests - Initialization
 *
 * `ready` is the wizard webview announcing it has loaded. The handler
 * acknowledges and nothing more: the `init` message is sent by
 * BaseWebviewCommand, and the wizard asks for the component registry itself
 * with a `get-components-data` request.
 *
 * Until 2026-10-03 `ready` also read the whole registry and pushed it as
 * `componentsLoaded` — a message no webview listened for.
 */

import { createWizardLifecycleContext } from './wizardLifecycleHandlers.testUtils';
import { handleReady } from '@/features/project-creation/handlers/wizardLifecycleHandlers';

jest.mock('@/core/validation/URLValidator');

describe('lifecycleHandlers - Initialization', () => {
    let mockContext: ReturnType<typeof createWizardLifecycleContext>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createWizardLifecycleContext();
    });

    describe('handleReady', () => {
        it('should handle wizard ready event', async () => {
            const result = await handleReady(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.logger.debug).toHaveBeenCalledWith('Wizard webview ready');
        });

        it('pushes nothing to the webview', async () => {
            await handleReady(mockContext);

            expect(mockContext.communicationManager?.sendMessage).not.toHaveBeenCalled();
            expect(mockContext.sendMessage).not.toHaveBeenCalled();
        });

        it('reads no registry, so it has nothing to fail on', async () => {
            // The old registry read ran against this bare context and logged
            // "Failed to load components". Nothing is read now.
            await handleReady(mockContext);

            expect(mockContext.logger.error).not.toHaveBeenCalled();
        });
    });
});
