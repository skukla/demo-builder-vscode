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

        it('should throw if AuthenticationService registered twice', () => {
            const mockAuthService = {
                getTokenStatus: jest.fn(),
                login: jest.fn(),
            } as any;

            ServiceLocator.setAuthenticationService(mockAuthService);

            expect(() => ServiceLocator.setAuthenticationService(mockAuthService)).toThrow(
                'already registered'
            );
        });
    });

    describe('ServiceLocator - SidebarProvider Singleton', () => {
        it('should return same SidebarProvider instance on multiple calls', () => {
            const mockSidebarProvider = {
                resolveWebviewView: jest.fn(),
                setContext: jest.fn(),
            } as any;

            ServiceLocator.setSidebarProvider(mockSidebarProvider);

            const first = ServiceLocator.getSidebarProvider();
            const second = ServiceLocator.getSidebarProvider();

            expect(first).toBe(second);
            expect(first).toBe(mockSidebarProvider);
        });

        it('should throw if SidebarProvider not initialized', () => {
            expect(() => ServiceLocator.getSidebarProvider()).toThrow(
                'SidebarProvider not initialized'
            );
        });

        it('should throw if SidebarProvider registered twice', () => {
            const mockSidebarProvider = {
                resolveWebviewView: jest.fn(),
                setContext: jest.fn(),
            } as any;

            ServiceLocator.setSidebarProvider(mockSidebarProvider);

            expect(() => ServiceLocator.setSidebarProvider(mockSidebarProvider)).toThrow(
                'already registered'
            );
        });

        it('should report isSidebarInitialized correctly', () => {
            expect(ServiceLocator.isSidebarInitialized()).toBe(false);

            const mockSidebarProvider = {
                resolveWebviewView: jest.fn(),
                setContext: jest.fn(),
            } as any;

            ServiceLocator.setSidebarProvider(mockSidebarProvider);

            expect(ServiceLocator.isSidebarInitialized()).toBe(true);
        });
    });

    describe('ServiceLocator - Reset Behavior', () => {
        it('should clear all services on reset', () => {
            // Given: All services registered
            const { CommandExecutor } = require('@/core/shell');
            ServiceLocator.setCommandExecutor(new CommandExecutor());
            ServiceLocator.setAuthenticationService({ getTokenStatus: jest.fn() } as any);
            ServiceLocator.setSidebarProvider({ resolveWebviewView: jest.fn() } as any);

            expect(ServiceLocator.isInitialized()).toBe(true);
            expect(ServiceLocator.isSidebarInitialized()).toBe(true);

            // When: Reset is called
            ServiceLocator.reset();

            // Then: All services are cleared
            expect(ServiceLocator.isInitialized()).toBe(false);
            expect(ServiceLocator.isSidebarInitialized()).toBe(false);
            expect(() => ServiceLocator.getCommandExecutor()).toThrow('not initialized');
            expect(() => ServiceLocator.getAuthenticationService()).toThrow('not initialized');
            expect(() => ServiceLocator.getSidebarProvider()).toThrow('not initialized');
        });

        it('should allow re-registration after reset', () => {
            // Given: A service was registered and then reset
            const { CommandExecutor } = require('@/core/shell');
            const executor1 = new CommandExecutor();
            ServiceLocator.setCommandExecutor(executor1);
            ServiceLocator.reset();

            // When: Register a new instance
            const executor2 = new CommandExecutor();
            ServiceLocator.setCommandExecutor(executor2);

            // Then: New instance is returned
            expect(ServiceLocator.getCommandExecutor()).toBe(executor2);
            expect(ServiceLocator.getCommandExecutor()).not.toBe(executor1);
        });
    });
});
