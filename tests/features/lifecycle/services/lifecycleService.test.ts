/**
 * Lifecycle Service Tests
 *
 * Tests for the extracted lifecycle service functions.
 * These functions handle logs panel toggling and external URL opening.
 */

import * as vscode from 'vscode';
import { toggleLogsPanel, resetLogsViewState } from '@/features/lifecycle/services/lifecycleService';

// Mock VS Code
jest.mock('vscode', () => ({
    commands: {
        executeCommand: jest.fn().mockResolvedValue(undefined),
    },
}));

// Mock sessionUIState
jest.mock('@/core/state/sessionUIState', () => ({
    sessionUIState: {
        isLogsViewShown: false,
    },
}));

describe('lifecycleService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset the state before each test
        const { sessionUIState } = require('@/core/state/sessionUIState');
        sessionUIState.isLogsViewShown = false;
    });

    describe('toggleLogsPanel', () => {
        it('should open logs panel when currently closed', async () => {
            // Given: Logs panel is closed
            const { sessionUIState } = require('@/core/state/sessionUIState');
            sessionUIState.isLogsViewShown = false;

            // When: Toggling logs panel
            const result = await toggleLogsPanel();

            // Then: Should execute showLogs command and return true
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.showLogs');
            expect(result).toBe(true);
            expect(sessionUIState.isLogsViewShown).toBe(true);
        });

        it('should close logs panel when currently open', async () => {
            // Given: Logs panel is open
            const { sessionUIState } = require('@/core/state/sessionUIState');
            sessionUIState.isLogsViewShown = true;

            // When: Toggling logs panel
            const result = await toggleLogsPanel();

            // Then: Should execute closePanel command and return false
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.closePanel');
            expect(result).toBe(false);
            expect(sessionUIState.isLogsViewShown).toBe(false);
        });

        it('should correctly toggle state on multiple calls', async () => {
            // Given: Logs panel is closed
            const { sessionUIState } = require('@/core/state/sessionUIState');
            sessionUIState.isLogsViewShown = false;

            // When: Toggling multiple times
            await toggleLogsPanel(); // Open
            const afterFirst = sessionUIState.isLogsViewShown;
            await toggleLogsPanel(); // Close
            const afterSecond = sessionUIState.isLogsViewShown;
            await toggleLogsPanel(); // Open again
            const afterThird = sessionUIState.isLogsViewShown;

            // Then: Should alternate correctly
            expect(afterFirst).toBe(true);
            expect(afterSecond).toBe(false);
            expect(afterThird).toBe(true);
        });
    });

    describe('resetLogsViewState', () => {
        it('should reset logs view state to false', () => {
            // Given: Logs panel is open
            const { sessionUIState } = require('@/core/state/sessionUIState');
            sessionUIState.isLogsViewShown = true;

            // When: Resetting state
            resetLogsViewState();

            // Then: State should be false
            expect(sessionUIState.isLogsViewShown).toBe(false);
        });

        it('should have no effect when already false', () => {
            // Given: Logs panel is already closed
            const { sessionUIState } = require('@/core/state/sessionUIState');
            sessionUIState.isLogsViewShown = false;

            // When: Resetting state
            resetLogsViewState();

            // Then: State should still be false
            expect(sessionUIState.isLogsViewShown).toBe(false);
        });
    });
});
