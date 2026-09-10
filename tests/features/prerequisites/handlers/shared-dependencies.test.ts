import { areDependenciesInstalled } from '@/features/prerequisites/handlers/shared';
import { createPrereqHandlerContext } from './testHelpers';
import type {
    PrerequisiteDefinition,
    PrerequisiteStatus,
} from '@/features/prerequisites/services/PrerequisitesManager';

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

        const context = createPrereqHandlerContext();

        const result = areDependenciesInstalled(prereq, context);

        expect(result).toBe(true);
    });

    it('an empty depends list is satisfied before any prerequisite has been checked', () => {
        const prereq: PrerequisiteDefinition = {
            id: 'test',
            name: 'Test',
            depends: [],
            check: { command: 'test --version' },
        } as unknown as PrerequisiteDefinition;

        // No states recorded yet — the run has not started. An empty list must be
        // satisfied by the list itself, before the code that needs states to answer.
        const context = createPrereqHandlerContext({
            sharedState: {
                isAuthenticating: false,
                currentComponentSelection: undefined,
                currentPrerequisiteStates: undefined,
            },
        });

        expect(areDependenciesInstalled(prereq, context)).toBe(true);
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

        const context = createPrereqHandlerContext({
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

        const context = createPrereqHandlerContext({
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

        const context = createPrereqHandlerContext({
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

        const context = createPrereqHandlerContext({
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

        const context = createPrereqHandlerContext({
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

        const context = createPrereqHandlerContext({
            sharedState: {
                isAuthenticating: false,
                currentPrerequisiteStates: states,
            },
        });

        const result = areDependenciesInstalled(prereq, context);

        expect(result).toBe(false);
    });

    describe('the decisions (PL-22)', () => {
        const dependsOnNode = {
            id: 'adobe-cli',
            name: 'Adobe I/O CLI',
            depends: ['node'],
            check: { command: 'aio --version' },
        } as PrerequisiteDefinition;

        function contextWith(entries: Array<Record<string, unknown>>) {
            const states = new Map();
            entries.forEach((entry, i) => states.set(i, entry));
            return createPrereqHandlerContext({
                sharedState: { isAuthenticating: false, currentPrerequisiteStates: states },
            });
        }

        it('a prerequisite whose depends is absent (not just empty) needs nothing', () => {
            const prereq = {
                id: 'git',
                name: 'Git',
                check: { command: 'git --version' },
            } as PrerequisiteDefinition;
            const context = createPrereqHandlerContext({
                sharedState: { isAuthenticating: false, currentPrerequisiteStates: undefined },
            });

            expect(areDependenciesInstalled(prereq, context)).toBe(true);
        });

        it('with dependencies but no recorded states, nothing counts as installed', () => {
            const context = createPrereqHandlerContext({
                sharedState: { isAuthenticating: false, currentPrerequisiteStates: undefined },
            });

            expect(areDependenciesInstalled(dependsOnNode, context)).toBe(false);
        });

        it('an installed entry for a DIFFERENT prerequisite does not satisfy the dependency', () => {
            const context = contextWith([
                {
                    prereq: { id: 'npm', name: 'npm' },
                    result: { installed: true } as PrerequisiteStatus,
                },
            ]);

            expect(areDependenciesInstalled(dependsOnNode, context)).toBe(false);
        });

        it('Node with every required major installed satisfies the dependency', () => {
            const context = contextWith([
                {
                    prereq: { id: 'node', name: 'Node.js' },
                    result: { installed: true } as PrerequisiteStatus,
                    nodeVersionStatus: [
                        { version: 'Node 20', component: 'mesh', installed: true },
                        { version: 'Node 24', component: 'headless', installed: true },
                    ],
                },
            ]);

            expect(areDependenciesInstalled(dependsOnNode, context)).toBe(true);
        });

        it('Node with an empty per-version list is judged by its own result', () => {
            const context = contextWith([
                {
                    prereq: { id: 'node', name: 'Node.js' },
                    result: { installed: true } as PrerequisiteStatus,
                    nodeVersionStatus: [],
                },
            ]);

            expect(areDependenciesInstalled(dependsOnNode, context)).toBe(true);
        });

        it('the per-version check applies to Node only; another tool with a missing entry still counts', () => {
            const dependsOnGit = { ...dependsOnNode, depends: ['git'] };
            const context = contextWith([
                {
                    prereq: { id: 'git', name: 'Git' },
                    result: { installed: true } as PrerequisiteStatus,
                    nodeVersionStatus: [
                        { version: 'Node 20', component: 'mesh', installed: false },
                    ],
                },
            ]);

            expect(areDependenciesInstalled(dependsOnGit, context)).toBe(true);
        });

        it('an entry that has not been checked yet (no result) is not installed', () => {
            const context = contextWith([
                { prereq: { id: 'node', name: 'Node.js' }, result: undefined },
            ]);

            expect(areDependenciesInstalled(dependsOnNode, context)).toBe(false);
        });
    });
});
