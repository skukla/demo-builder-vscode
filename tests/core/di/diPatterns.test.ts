/**
 * DI Patterns Test Suite
 *
 * Tests dependency injection pattern standardization:
 * - Handlers use context-based injection (context.logger)
 * - Services use constructor injection for dependencies
 * - ServiceLocator provides singletons only
 *
 * Step 9: Standardize DI patterns across the codebase
 */

import { ServiceLocator } from '@/core/di';

// Mock dependencies
jest.mock('@/core/shell', () => ({
    CommandExecutor: jest.fn().mockImplementation(() => ({
        execute: jest.fn(),
    })),
}));

describe('DI Patterns', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset ServiceLocator for each test
        ServiceLocator.reset();
    });

    describe('ServiceLocator - Singleton Behavior', () => {
        it('should return same CommandExecutor instance on multiple calls', () => {
            const { CommandExecutor } = require('@/core/shell');
            const executor = new CommandExecutor();
            ServiceLocator.setCommandExecutor(executor);

            const first = ServiceLocator.getCommandExecutor();
            const second = ServiceLocator.getCommandExecutor();

            expect(first).toBe(second);
            expect(first).toBe(executor);
        });

        it('should throw if CommandExecutor not initialized', () => {
            expect(() => ServiceLocator.getCommandExecutor()).toThrow(
                'CommandExecutor not initialized'
            );
        });

        it('should throw if CommandExecutor registered twice', () => {
            const { CommandExecutor } = require('@/core/shell');
            const executor = new CommandExecutor();
            ServiceLocator.setCommandExecutor(executor);

            expect(() => ServiceLocator.setCommandExecutor(executor)).toThrow(
                'already registered'
            );
        });

        it('should report isInitialized correctly', () => {
            expect(ServiceLocator.isInitialized()).toBe(false);

            const { CommandExecutor } = require('@/core/shell');
            ServiceLocator.setCommandExecutor(new CommandExecutor());

            expect(ServiceLocator.isInitialized()).toBe(true);
        });
    });

    describe('ServiceLocator - AuthenticationService Singleton', () => {
        it('should return same AuthenticationService instance on multiple calls', () => {
            const mockAuthService = {
                getTokenStatus: jest.fn(),
                login: jest.fn(),
            } as any;

            ServiceLocator.setAuthenticationService(mockAuthService);

            const first = ServiceLocator.getAuthenticationService();
            const second = ServiceLocator.getAuthenticationService();

            expect(first).toBe(second);
            expect(first).toBe(mockAuthService);
        });

        it('should throw if AuthenticationService not initialized', () => {
            expect(() => ServiceLocator.getAuthenticationService()).toThrow(
                'AuthenticationService not initialized'
            );
        });
    });
});
