/**
 * Dashboard Handlers - Toggle Tests
 *
 * Tests for toggle handlers that manage UI state:
 * - handleViewComponents: toggles sidebar components view
 * - handleViewLogs: toggles logs output panel
 * - handleViewDebugLogs: toggles debug output panel
 */

import * as vscode from 'vscode';
import {
    handleViewComponents,
    handleViewLogs,
    handleViewDebugLogs,
    resetToggleStates,
} from '@/features/dashboard/handlers/dashboardHandlers';

// Mock vscode
jest.mock('vscode', () => ({
    commands: {
        executeCommand: jest.fn().mockResolvedValue(undefined),
    },
}), { virtual: true });

describe('Dashboard Toggle Handlers', () => {
    const mockExecuteCommand = vscode.commands.executeCommand as jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset internal toggle states before each test
        resetToggleStates();
    });

    describe('handleViewComponents', () => {
        it('should set showComponents context to true on first call', async () => {
            const result = await handleViewComponents({} as any);

            expect(result).toEqual({ success: true });
            expect(mockExecuteCommand).toHaveBeenCalledWith(
                'setContext',
                'demoBuilder.showComponents',
                true
            );
        });

        it('should toggle showComponents context to false on second call', async () => {
            // First call - show components
            await handleViewComponents({} as any);
            mockExecuteCommand.mockClear();

            // Second call - hide components
            const result = await handleViewComponents({} as any);

            expect(result).toEqual({ success: true });
            expect(mockExecuteCommand).toHaveBeenCalledWith(
                'setContext',
                'demoBuilder.showComponents',
                false
            );
        });

        it('should toggle back to true on third call', async () => {
            // First call - show
            await handleViewComponents({} as any);
            // Second call - hide
            await handleViewComponents({} as any);
            mockExecuteCommand.mockClear();

            // Third call - show again
            const result = await handleViewComponents({} as any);

            expect(result).toEqual({ success: true });
            expect(mockExecuteCommand).toHaveBeenCalledWith(
                'setContext',
                'demoBuilder.showComponents',
                true
            );
        });
    });

    describe('handleViewLogs', () => {
        it('should show logs output channel on first call', async () => {
            const result = await handleViewLogs({} as any);

            expect(result).toEqual({ success: true });
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.showLogs');
        });

        it('should close panel on second call', async () => {
            // First call - show logs
            await handleViewLogs({} as any);
            mockExecuteCommand.mockClear();

            // Second call - close panel
            const result = await handleViewLogs({} as any);

            expect(result).toEqual({ success: true });
            expect(mockExecuteCommand).toHaveBeenCalledWith('workbench.action.closePanel');
        });

        it('should show logs again on third call', async () => {
            // First call - show
            await handleViewLogs({} as any);
            // Second call - hide
            await handleViewLogs({} as any);
            mockExecuteCommand.mockClear();

            // Third call - show again
            const result = await handleViewLogs({} as any);

            expect(result).toEqual({ success: true });
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.showLogs');
        });
    });

    describe('handleViewDebugLogs', () => {
        it('should show debug output channel', async () => {
            const result = await handleViewDebugLogs({} as any);

            expect(result).toEqual({ success: true });
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.showDebugLogs');
        });

        it('should show debug logs on every call (no toggle)', async () => {
            // First call
            await handleViewDebugLogs({} as any);
            mockExecuteCommand.mockClear();

            // Second call - still shows debug logs (not a toggle)
            const result = await handleViewDebugLogs({} as any);

            expect(result).toEqual({ success: true });
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.showDebugLogs');
        });
    });

    describe('resetToggleStates', () => {
        it('should reset all toggle states and hide components', async () => {
            // Set some toggle states
            await handleViewComponents({} as any);
            await handleViewLogs({} as any);
            mockExecuteCommand.mockClear();

            // Reset states
            resetToggleStates();

            // Verify setContext was called to hide components
            expect(mockExecuteCommand).toHaveBeenCalledWith(
                'setContext',
                'demoBuilder.showComponents',
                false
            );

            // After reset, first call should show (not hide)
            mockExecuteCommand.mockClear();
            await handleViewComponents({} as any);
            expect(mockExecuteCommand).toHaveBeenCalledWith(
                'setContext',
                'demoBuilder.showComponents',
                true
            );
        });
    });
});
