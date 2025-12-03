/**
 * Dashboard Handlers - Lifecycle Tests
 *
 * Tests for demo lifecycle handlers:
 * - handleStartDemo: starts the demo server
 * - handleStopDemo: stops the demo server
 */

import * as vscode from 'vscode';
import {
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
        jest.clearAllMocks();
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
});
