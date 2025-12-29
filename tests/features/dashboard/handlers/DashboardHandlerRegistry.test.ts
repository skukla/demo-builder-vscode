/**
 * DashboardHandlerRegistry Tests
 *
 * Tests for naming convention compliance and handler registration
 * for the dashboard feature's handler registry.
 *
 * Step 8 of SOP Violation Remediation Plan:
 * - Verifies registry follows [Feature]HandlerRegistry naming pattern
 * - Verifies registry extends BaseHandlerRegistry
 * - Verifies file naming matches class naming
 */

import { BaseHandlerRegistry } from '@/core/base';
import { DashboardHandlerRegistry } from '@/features/dashboard/handlers/DashboardHandlerRegistry';

describe('DashboardHandlerRegistry', () => {
    describe('Naming Convention Compliance', () => {
        it('should be exported as DashboardHandlerRegistry', () => {
            // The class should be named following [Feature]HandlerRegistry pattern
            expect(DashboardHandlerRegistry).toBeDefined();
            expect(DashboardHandlerRegistry.name).toBe('DashboardHandlerRegistry');
        });

        it('should extend BaseHandlerRegistry', () => {
            // Verify inheritance chain
            const registry = new DashboardHandlerRegistry();
            expect(registry).toBeInstanceOf(BaseHandlerRegistry);
        });
    });

    describe('Handler Registration', () => {
        let registry: DashboardHandlerRegistry;

        beforeEach(() => {
            registry = new DashboardHandlerRegistry();
        });

        it('should have handlers registered after construction', () => {
            const registeredTypes = registry.getRegisteredTypes();
            expect(registeredTypes.length).toBeGreaterThan(0);
        });

        it('should register initialization handlers', () => {
            expect(registry.hasHandler('ready')).toBe(true);
            expect(registry.hasHandler('requestStatus')).toBe(true);
        });

        it('should register demo lifecycle handlers', () => {
            expect(registry.hasHandler('startDemo')).toBe(true);
            expect(registry.hasHandler('stopDemo')).toBe(true);
        });

        it('should register navigation handlers', () => {
            expect(registry.hasHandler('openBrowser')).toBe(true);
            expect(registry.hasHandler('viewLogs')).toBe(true);
            expect(registry.hasHandler('configure')).toBe(true);
        });

        it('should register mesh handlers', () => {
            expect(registry.hasHandler('deployMesh')).toBe(true);
        });

        it('should register project management handlers', () => {
            expect(registry.hasHandler('deleteProject')).toBe(true);
        });
    });
});
