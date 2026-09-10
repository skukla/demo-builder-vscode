
import {
    ResetAllCommand,
    ServiceLocator,
    fs,
    vscode,
    setupResetAllSuite,
} from './ResetAllCommand.testUtils';

describe('ResetAllCommand - Adobe CLI cleanup', () => {
    let command: ResetAllCommand;
    let mockStateManager: any;
    let mockLogger: any;
    let mockAuthService: any;

    beforeEach(() => {
        jest.clearAllMocks();
        ({
            command,
            stateManager: mockStateManager,
            logger: mockLogger,
            authService: mockAuthService,
        } = setupResetAllSuite());
    });

    describe('Adobe CLI logout integration', () => {
        it('should call logout during reset', async () => {
            await command.execute();

            expect(ServiceLocator.getAuthenticationService).toHaveBeenCalledTimes(1);
            expect(mockAuthService.logout).toHaveBeenCalledTimes(1);
        });

        it('should continue reset when logout fails', async () => {
            mockAuthService.logout.mockRejectedValue(new Error('Adobe CLI error'));

            await command.execute();

            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Adobe CLI logout failed'),
                expect.any(Error)
            );
            expect(mockStateManager.clearAll).toHaveBeenCalled();
        });

        it('should log warning with manual command on logout failure', async () => {
            mockAuthService.logout.mockRejectedValue(new Error('Adobe CLI error'));

            await command.execute();

            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Adobe CLI logout failed'),
                expect.any(Error)
            );
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('aio auth logout')
            );
        });

        it('should call logout after webview cleanup', async () => {
            const callOrder: string[] = [];

            // Track call order
            jest.spyOn(vscode.commands, 'executeCommand').mockImplementation(async (cmd: string) => {
                if (cmd === 'demoBuilder.stopDemo') {
                    callOrder.push('stopDemo');
                }
                if (cmd === 'workbench.action.reloadWindow') {
                    callOrder.push('reloadWindow');
                }
            });

            mockAuthService.logout.mockImplementation(() => {
                callOrder.push('logout');
                return Promise.resolve();
            });

            mockStateManager.clearAll.mockImplementation(() => {
                callOrder.push('clearState');
                return Promise.resolve();
            });

            await command.execute();

            // Logout should happen after stopDemo (step 1) and after clearState (steps 4-5)
            const stopDemoIndex = callOrder.indexOf('stopDemo');
            const logoutIndex = callOrder.indexOf('logout');
            const clearStateIndex = callOrder.indexOf('clearState');

            expect(stopDemoIndex).toBeLessThan(logoutIndex);
            expect(clearStateIndex).toBeLessThan(logoutIndex);
        });

        it('should call logout before file deletion', async () => {
            const callOrder: string[] = [];

            mockAuthService.logout.mockImplementation(() => {
                callOrder.push('logout');
                return Promise.resolve();
            });

            // Use module-level fs import for consistent mock reference
            (fs.rm as jest.Mock).mockImplementation(() => {
                callOrder.push('fileDelete');
                return Promise.resolve();
            });

            await command.execute();

            const logoutIndex = callOrder.indexOf('logout');
            const fileDeleteIndex = callOrder.indexOf('fileDelete');

            // Logout (step 6) should happen before file deletion (step 8)
            expect(logoutIndex).toBeLessThan(fileDeleteIndex);
        });

        it('should handle ServiceLocator error gracefully', async () => {
            (ServiceLocator.getAuthenticationService as jest.Mock).mockImplementation(() => {
                throw new Error('ServiceLocator error');
            });

            await command.execute();

            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Adobe CLI logout failed'),
                expect.any(Error)
            );
            expect(mockStateManager.clearAll).toHaveBeenCalled();
        });
    });
});
