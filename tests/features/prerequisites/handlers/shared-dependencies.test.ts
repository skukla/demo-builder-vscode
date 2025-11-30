import { areDependenciesInstalled } from '@/features/prerequisites/handlers/shared';
import { createMockContext } from './testHelpers';
import type { PrerequisiteDefinition, PrerequisiteStatus } from '@/features/prerequisites/services/PrerequisitesManager';

/**
 * Prerequisites Handlers - Dependencies Validation Test Suite
 *
 * Tests the areDependenciesInstalled utility function.
 * This function validates that all required dependencies for a prerequisite are installed.
 *
 * Total tests: 7
 */

describe('Prerequisites Handlers - areDependenciesInstalled', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return true when no dependencies', () => {
        const prereq: PrerequisiteDefinition = {
            id: 'test',
            name: 'Test',
            check: { command: 'test --version' },
        } as PrerequisiteDefinition;

        const context = createMockContext();

        const result = areDependenciesInstalled(prereq, context);

        expect(result).toBe(true);
    });

    it('should return true when all dependencies installed', () => {
        const prereq: PrerequisiteDefinition = {
            id: 'adobe-cli',
            name: 'Adobe I/O CLI',
            depends: ['node', 'npm'],
            check: { command: 'aio --version' },
        } as PrerequisiteDefinition;

        const states = new Map();
        states.set(0, {
            prereq: { id: 'node', name: 'Node.js' },
            result: { installed: true } as PrerequisiteStatus,
        });
        states.set(1, {
            prereq: { id: 'npm', name: 'npm' },
            result: { installed: true } as PrerequisiteStatus,
        });

        const context = createMockContext({
            sharedState: {
                isAuthenticating: false,
                currentPrerequisiteStates: states,
            },
        });

        const result = areDependenciesInstalled(prereq, context);

        expect(result).toBe(true);
    });

    it('should return false when any dependency not installed', () => {
        const prereq: PrerequisiteDefinition = {
            id: 'adobe-cli',
            name: 'Adobe I/O CLI',
            depends: ['node', 'npm'],
            check: { command: 'aio --version' },
        } as PrerequisiteDefinition;

        const states = new Map();
        states.set(0, {
            prereq: { id: 'node', name: 'Node.js' },
            result: { installed: true } as PrerequisiteStatus,
        });
        states.set(1, {
            prereq: { id: 'npm', name: 'npm' },
            result: { installed: false } as PrerequisiteStatus,
        });

        const context = createMockContext({
            sharedState: {
                isAuthenticating: false,
                currentPrerequisiteStates: states,
            },
        });

        const result = areDependenciesInstalled(prereq, context);

        expect(result).toBe(false);
    });

    it('should handle Node dependency with missing versions', () => {
        const prereq: PrerequisiteDefinition = {
            id: 'adobe-cli',
            name: 'Adobe I/O CLI',
            depends: ['node'],
            check: { command: 'aio --version' },
        } as PrerequisiteDefinition;

        const states = new Map();
        states.set(0, {
            prereq: { id: 'node', name: 'Node.js' },
            result: { installed: true } as PrerequisiteStatus,
            nodeVersionStatus: [
                { version: '18', component: 'v18.0.0', installed: true },
                { version: '20', component: 'v20.0.0', installed: false },
            ],
        });

        const context = createMockContext({
            sharedState: {
                isAuthenticating: false,
                currentPrerequisiteStates: states,
            },
        });

        const result = areDependenciesInstalled(prereq, context);

        expect(result).toBe(false);
    });

    it('should return false when dependency not found in states', () => {
        const prereq: PrerequisiteDefinition = {
            id: 'adobe-cli',
            name: 'Adobe I/O CLI',
            depends: ['node'],
            check: { command: 'aio --version' },
        } as PrerequisiteDefinition;

        const context = createMockContext({
            sharedState: {
                isAuthenticating: false,
                currentPrerequisiteStates: new Map(),
            },
        });

        const result = areDependenciesInstalled(prereq, context);

        expect(result).toBe(false);
    });

    it('should check all dependencies', () => {
        const prereq: PrerequisiteDefinition = {
            id: 'test-tool',
            name: 'Test Tool',
            depends: ['dep1', 'dep2', 'dep3'],
            check: { command: 'test --version' },
        } as PrerequisiteDefinition;

        const states = new Map();
        states.set(0, {
            prereq: { id: 'dep1', name: 'Dep1' },
            result: { installed: true } as PrerequisiteStatus,
        });
        states.set(1, {
            prereq: { id: 'dep2', name: 'Dep2' },
            result: { installed: true } as PrerequisiteStatus,
        });
        states.set(2, {
            prereq: { id: 'dep3', name: 'Dep3' },
            result: { installed: true } as PrerequisiteStatus,
        });

        const context = createMockContext({
            sharedState: {
                isAuthenticating: false,
                currentPrerequisiteStates: states,
            },
        });

        const result = areDependenciesInstalled(prereq, context);

        expect(result).toBe(true);
    });

    it('should return false when multiple dependencies missing', () => {
        const prereq: PrerequisiteDefinition = {
            id: 'test-tool',
            name: 'Test Tool',
            depends: ['dep1', 'dep2', 'dep3'],
            check: { command: 'test --version' },
        } as PrerequisiteDefinition;

        const states = new Map();
        states.set(0, {
            prereq: { id: 'dep1', name: 'Dep1' },
            result: { installed: true } as PrerequisiteStatus,
        });
        states.set(1, {
            prereq: { id: 'dep2', name: 'Dep2' },
            result: { installed: false } as PrerequisiteStatus,
        });
        states.set(2, {
            prereq: { id: 'dep3', name: 'Dep3' },
            result: { installed: false } as PrerequisiteStatus,
        });

        const context = createMockContext({
            sharedState: {
                isAuthenticating: false,
                currentPrerequisiteStates: states,
            },
        });

        const result = areDependenciesInstalled(prereq, context);

        expect(result).toBe(false);
    });
});
