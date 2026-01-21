/**
 * StateManager Dirty Tracking Tests
 *
 * Tests for the dirty tracking system that allows background operations
 * to mark fields as changed without triggering immediate saves.
 */

import * as fs from 'fs/promises';
import { setupMocks, createMockProject, type TestMocks } from './stateManager.testUtils';

// Re-declare mocks to ensure proper typing and hoisting
jest.mock('vscode');
jest.mock('fs/promises');
jest.mock('os');

describe('StateManager - Dirty Tracking', () => {
    let testMocks: TestMocks;

    beforeEach(() => {
        testMocks = setupMocks();
    });

    describe('markDirty', () => {
        it('should mark a field as dirty', () => {
            const { stateManager } = testMocks;

            stateManager.markDirty('meshState');

            expect(stateManager.isDirty()).toBe(true);
            expect(stateManager.getDirtyFields().has('meshState')).toBe(true);
        });

        it('should mark multiple fields as dirty', () => {
            const { stateManager } = testMocks;

            stateManager.markDirty('meshState');
            stateManager.markDirty('selectedPackage');
            stateManager.markDirty('selectedStack');

            expect(stateManager.isDirty()).toBe(true);
            expect(stateManager.getDirtyFields().size).toBe(3);
            expect(stateManager.getDirtyFields().has('meshState')).toBe(true);
            expect(stateManager.getDirtyFields().has('selectedPackage')).toBe(true);
            expect(stateManager.getDirtyFields().has('selectedStack')).toBe(true);
        });

        it('should not duplicate dirty fields when marked multiple times', () => {
            const { stateManager } = testMocks;

            stateManager.markDirty('meshState');
            stateManager.markDirty('meshState');
            stateManager.markDirty('meshState');

            expect(stateManager.getDirtyFields().size).toBe(1);
        });
    });

    describe('isDirty', () => {
        it('should return false when no fields are dirty', () => {
            const { stateManager } = testMocks;

            expect(stateManager.isDirty()).toBe(false);
        });

        it('should return true when at least one field is dirty', () => {
            const { stateManager } = testMocks;

            stateManager.markDirty('meshState');

            expect(stateManager.isDirty()).toBe(true);
        });
    });

    describe('getDirtyFields', () => {
        it('should return empty set when no fields are dirty', () => {
            const { stateManager } = testMocks;

            expect(stateManager.getDirtyFields().size).toBe(0);
        });

        it('should return readonly set of dirty fields', () => {
            const { stateManager } = testMocks;

            stateManager.markDirty('meshState');
            const dirtyFields = stateManager.getDirtyFields();

            // ReadonlySet should not have add/delete/clear methods exposed at type level
            expect(dirtyFields.has('meshState')).toBe(true);
            expect(dirtyFields.size).toBe(1);
        });
    });

    describe('clearDirty', () => {
        it('should clear all dirty fields', () => {
            const { stateManager } = testMocks;

            stateManager.markDirty('meshState');
            stateManager.markDirty('selectedPackage');
            expect(stateManager.isDirty()).toBe(true);

            stateManager.clearDirty();

            expect(stateManager.isDirty()).toBe(false);
            expect(stateManager.getDirtyFields().size).toBe(0);
        });

        it('should be safe to call when no fields are dirty', () => {
            const { stateManager } = testMocks;

            expect(() => stateManager.clearDirty()).not.toThrow();
            expect(stateManager.isDirty()).toBe(false);
        });
    });

    describe('saveProject clears dirty state', () => {
        it('should clear dirty fields after successful save', async () => {
            const { stateManager } = testMocks;
            const project = createMockProject() as any;

            // Setup mocks for save
            (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
            (fs.access as jest.Mock).mockResolvedValue(undefined);

            // Mark fields dirty
            stateManager.markDirty('meshState');
            stateManager.markDirty('selectedPackage');
            expect(stateManager.isDirty()).toBe(true);

            // Save project
            await stateManager.saveProject(project);

            // Dirty state should be cleared
            expect(stateManager.isDirty()).toBe(false);
            expect(stateManager.getDirtyFields().size).toBe(0);
        });

        it('should not clear dirty fields if save fails', async () => {
            const { stateManager } = testMocks;
            const project = createMockProject() as any;

            // Setup mocks for failed save
            (fs.access as jest.Mock).mockResolvedValue(undefined);
            (fs.writeFile as jest.Mock).mockRejectedValue(new Error('Write failed'));

            // Mark fields dirty
            stateManager.markDirty('meshState');
            expect(stateManager.isDirty()).toBe(true);

            // Attempt save (should fail)
            await expect(stateManager.saveProject(project)).rejects.toThrow('Write failed');

            // Dirty state should NOT be cleared on failure
            expect(stateManager.isDirty()).toBe(true);
            expect(stateManager.getDirtyFields().has('meshState')).toBe(true);
        });
    });

    describe('typical usage pattern', () => {
        it('should support background operations marking dirty without save', () => {
            const { stateManager } = testMocks;

            // Simulate background mesh status update
            // (Background operations call markDirty instead of saveProject)
            stateManager.markDirty('meshState');

            // Dirty state is tracked
            expect(stateManager.isDirty()).toBe(true);
            expect(stateManager.getDirtyFields().has('meshState')).toBe(true);

            // No save was triggered (saveProject was not called)
            expect(fs.writeFile).not.toHaveBeenCalled();
        });

        it('should accumulate dirty fields from multiple background operations', () => {
            const { stateManager } = testMocks;

            // Multiple background operations mark different fields
            stateManager.markDirty('meshState');
            stateManager.markDirty('selectedAddons');

            // All fields tracked
            expect(stateManager.getDirtyFields().size).toBe(2);
            expect(stateManager.getDirtyFields().has('meshState')).toBe(true);
            expect(stateManager.getDirtyFields().has('selectedAddons')).toBe(true);
        });
    });

    describe('clearProject clears dirty state', () => {
        it('should clear dirty fields when project is cleared', async () => {
            const { stateManager } = testMocks;

            // Setup mocks
            (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

            // Mark fields dirty
            stateManager.markDirty('meshState');
            stateManager.markDirty('selectedPackage');
            expect(stateManager.isDirty()).toBe(true);

            // Clear project
            await stateManager.clearProject();

            // Dirty state should be cleared
            expect(stateManager.isDirty()).toBe(false);
            expect(stateManager.getDirtyFields().size).toBe(0);
        });
    });

    describe('clearAll clears dirty state', () => {
        it('should clear dirty fields when all state is cleared', async () => {
            const { stateManager } = testMocks;

            // Setup mocks
            (fs.unlink as jest.Mock).mockResolvedValue(undefined);

            // Mark fields dirty
            stateManager.markDirty('meshState');
            stateManager.markDirty('selectedStack');
            expect(stateManager.isDirty()).toBe(true);

            // Clear all state
            await stateManager.clearAll();

            // Dirty state should be cleared
            expect(stateManager.isDirty()).toBe(false);
            expect(stateManager.getDirtyFields().size).toBe(0);
        });
    });
});
