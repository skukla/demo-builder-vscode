/**
 * StateManager Process Management Tests
 *
 * Tests for StateManager process tracking operations.
 * Covers addProcess, removeProcess, getProcess functionality.
 */

import * as fs from 'fs/promises';
import { setupMocks, type TestMocks } from './stateManager.testUtils';
import type { ProcessInfo } from '@/types';

// Re-declare mocks to ensure proper typing
jest.mock('fs/promises');

describe('StateManager - Process Management', () => {
    let testMocks: TestMocks;

    beforeEach(() => {
        testMocks = setupMocks();
    });

    describe('addProcess', () => {
        it('should add process to state', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const processInfo: ProcessInfo = {
                pid: 12345,
                port: 3000,
                startTime: new Date(),
                command: 'npm start',
                status: 'running'
            };

            await stateManager.addProcess('test-process', processInfo);

            const retrieved = await stateManager.getProcess('test-process');
            expect(retrieved).toEqual(processInfo);
        });

        it('should persist process to file', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const processInfo: ProcessInfo = {
                pid: 12345,
                port: 3000,
                startTime: new Date(),
                command: 'npm start',
                status: 'running'
            };

            await stateManager.addProcess('test-process', processInfo);

            expect(fs.writeFile).toHaveBeenCalled();
        });

        it('should update existing process', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const processInfo1: ProcessInfo = {
                pid: 12345,
                port: 3000,
                startTime: new Date(),
                command: 'npm start',
                status: 'running'
            };

            const processInfo2: ProcessInfo = {
                pid: 54321,
                port: 3000,
                startTime: new Date(),
                command: 'npm start',
                status: 'stopped'
            };

            await stateManager.addProcess('test-process', processInfo1);
            await stateManager.addProcess('test-process', processInfo2);

            const retrieved = await stateManager.getProcess('test-process');
            expect(retrieved?.pid).toBe(54321);
            expect(retrieved?.status).toBe('stopped');
        });

        it('should handle multiple processes', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const process1: ProcessInfo = {
                pid: 12345,
                port: 3000,
                startTime: new Date(),
                command: 'npm start',
                status: 'running'
            };

            const process2: ProcessInfo = {
                pid: 54321,
                port: 3001,
                startTime: new Date(),
                command: 'npm run backend',
                status: 'running'
            };

            await stateManager.addProcess('frontend', process1);
            await stateManager.addProcess('backend', process2);

            expect(await stateManager.getProcess('frontend')).toEqual(process1);
            expect(await stateManager.getProcess('backend')).toEqual(process2);
        });
    });

    describe('removeProcess', () => {
        it('should remove process from state', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const processInfo: ProcessInfo = {
                pid: 12345,
                port: 3000,
                startTime: new Date(),
                command: 'npm start',
                status: 'running'
            };

            await stateManager.addProcess('test-process', processInfo);
            expect(await stateManager.getProcess('test-process')).toBeDefined();

            await stateManager.removeProcess('test-process');

            expect(await stateManager.getProcess('test-process')).toBeUndefined();
        });

        it('should persist removal to file', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const processInfo: ProcessInfo = {
                pid: 12345,
                port: 3000,
                startTime: new Date(),
                command: 'npm start',
                status: 'running'
            };

            await stateManager.addProcess('test-process', processInfo);
            (fs.writeFile as jest.Mock).mockClear();

            await stateManager.removeProcess('test-process');

            expect(fs.writeFile).toHaveBeenCalled();
        });

        it('should handle removing non-existent process gracefully', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            await expect(stateManager.removeProcess('nonexistent')).resolves.not.toThrow();
        });

        it('should only remove specified process', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const process1: ProcessInfo = {
                pid: 12345,
                port: 3000,
                startTime: new Date(),
                command: 'npm start',
                status: 'running'
            };

            const process2: ProcessInfo = {
                pid: 54321,
                port: 3001,
                startTime: new Date(),
                command: 'npm run backend',
                status: 'running'
            };

            await stateManager.addProcess('frontend', process1);
            await stateManager.addProcess('backend', process2);

            await stateManager.removeProcess('frontend');

            expect(await stateManager.getProcess('frontend')).toBeUndefined();
            expect(await stateManager.getProcess('backend')).toEqual(process2);
        });
    });

    describe('getProcess', () => {
        it('should return undefined for non-existent process', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const result = await stateManager.getProcess('nonexistent');

            expect(result).toBeUndefined();
        });

        it('should return correct process info when exists', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const processInfo: ProcessInfo = {
                pid: 12345,
                port: 3000,
                startTime: new Date(),
                command: 'npm start',
                status: 'running'
            };

            await stateManager.addProcess('test-process', processInfo);

            const retrieved = await stateManager.getProcess('test-process');
            expect(retrieved).toEqual(processInfo);
        });

        it('should return process with all properties intact', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const startTime = new Date();
            const processInfo: ProcessInfo = {
                pid: 12345,
                port: 3000,
                startTime,
                command: 'npm start',
                status: 'running'
            };

            await stateManager.addProcess('test-process', processInfo);

            const retrieved = await stateManager.getProcess('test-process');
            expect(retrieved?.pid).toBe(12345);
            expect(retrieved?.port).toBe(3000);
            expect(retrieved?.startTime).toEqual(startTime);
            expect(retrieved?.command).toBe('npm start');
            expect(retrieved?.status).toBe('running');
        });
    });
});