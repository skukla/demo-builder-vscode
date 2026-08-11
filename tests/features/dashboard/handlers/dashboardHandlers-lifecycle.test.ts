/**
 * Dashboard Handlers - Lifecycle Tests
 *
 * Tests for demo lifecycle handlers:
 * - handleStartDemo: starts the demo server
 * - handleStopDemo: stops the demo server
 * - handleRestartDemo: stop + start, for a config change that needs a reload
 */

import * as vscode from 'vscode';
import {
    handleRestartDemo,
    handleStartDemo,
    handleStopDemo,
} from '@/features/dashboard/handlers/dashboardHandlers';
import { setupMocks } from './dashboardHandlers.testUtils';

// Mock vscode
jest.mock('vscode', () => ({
    commands: {
        executeCommand: jest.fn().mockResolvedValue(undefined),
    },
    window: {
        activeColorTheme: { kind: 1 },
    },
    ColorThemeKind: { Dark: 2, Light: 1 },
    env: {
        openExternal: jest.fn(),
    },
    Uri: {
        parse: jest.fn((url: string) => ({ toString: () => url })),
    },
}), { virtual: true });

// Mock stalenessDetector
jest.mock('@/features/mesh/services/stalenessDetector');

// Mock authentication
jest.mock('@/features/authentication');

// Mock ServiceLocator
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(),
    },
}));

// Mock validation
jest.mock('@/core/validation', () => ({
    validateOrgId: jest.fn(),
    validateProjectId: jest.fn(),
    validateWorkspaceId: jest.fn(),
    validateURL: jest.fn(),
}));

describe('Dashboard Lifecycle Handlers', () => {
    const mockExecuteCommand = vscode.commands.executeCommand as jest.Mock;

    beforeEach(() => {
        // Fake timers: both handlers schedule a deferred sendDemoStatusUpdate via
        // setTimeout (DEMO_STATUS_UPDATE_DELAY). A real pending timer outlives the
        // suite and keeps the Jest worker alive past its exit grace period
        // ("worker process has failed to exit gracefully").
        jest.useFakeTimers();
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    describe('handleStartDemo', () => {
        it('should execute startDemo command', async () => {
            const { mockContext } = setupMocks();

            const result = await handleStartDemo(mockContext);

            expect(result).toEqual({ success: true });
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.startDemo');
        });

        it('should return success even with stopped project', async () => {
            const { mockContext } = setupMocks({ status: 'stopped' });

            const result = await handleStartDemo(mockContext);

            expect(result).toEqual({ success: true });
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.startDemo');
        });
    });

    describe('handleStopDemo', () => {
        it('should execute stopDemo command', async () => {
            const { mockContext } = setupMocks();

            const result = await handleStopDemo(mockContext);

            expect(result).toEqual({ success: true });
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.stopDemo');
        });

        it('should return success even with running project', async () => {
            const { mockContext } = setupMocks({ status: 'running' });

            const result = await handleStopDemo(mockContext);

            expect(result).toEqual({ success: true });
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.stopDemo');
        });
    });

    /**
     * Restart exists because the dashboard could SAY "Restart needed" and offer
     * nothing: the status came from `frontendConfigChanged`, and the only way to
     * act on it was to press Stop and then Start.
     *
     * It delegates to `demoBuilder.restartDemo`, which already sequences the two
     * with a settle delay between them. Doing that sequencing in the webview
     * instead would race the stop.
     */
    describe('handleRestartDemo', () => {
        it('delegates to the restart command rather than sequencing stop/start itself', async () => {
            const { mockContext } = setupMocks({ status: 'running' });

            const result = await handleRestartDemo(mockContext);

            expect(result).toEqual({ success: true });
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.restartDemo');
            expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
        });

        it('does NOT issue a bare stop or start', async () => {
            // The sequencing (and its settle delay) belongs to the command. A
            // handler that issued both would drop the delay and race the stop.
            const { mockContext } = setupMocks({ status: 'running' });

            await handleRestartDemo(mockContext);

            expect(mockExecuteCommand).not.toHaveBeenCalledWith('demoBuilder.stopDemo');
            expect(mockExecuteCommand).not.toHaveBeenCalledWith('demoBuilder.startDemo');
        });
    });
});
