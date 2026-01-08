/**
 * StateManager Project Management Tests
 *
 * Tests for StateManager project management operations.
 * Covers saveProject, clearProject, clearAll functionality.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { setupMocks, mockStateFile, createMockProject, type TestMocks } from './stateManager.testUtils';
import type { Project } from '@/types';

// Re-declare mocks to ensure proper typing and hoisting
jest.mock('vscode');
jest.mock('fs/promises');
jest.mock('os');

describe('StateManager - Project Management', () => {
    let testMocks: TestMocks;

    beforeEach(() => {
        testMocks = setupMocks();
    });

    describe('saveProject', () => {
        it('should save project and write to file', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const project = createMockProject('new-project');
            project.componentSelections = {
                frontend: 'headless',
                backend: 'adobe-commerce-paas'
            };

            await stateManager.saveProject(project as Project);

            // Verify state file was written
            expect(fs.writeFile).toHaveBeenCalled();
            const writeCall = (fs.writeFile as jest.Mock).mock.calls.find(
                call => call[0] === mockStateFile
            );
            expect(writeCall).toBeDefined();

            // Verify project was saved
            const savedProject = await stateManager.getCurrentProject();
            expect(savedProject?.name).toBe('Test Project');
        });

        it('should create project directory if missing', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const project = createMockProject();
            await stateManager.saveProject(project as Project);

            expect(fs.mkdir).toHaveBeenCalledWith(project.path, { recursive: true });
        });

        it('should create .demo-builder.json manifest', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const project = createMockProject();
            project.adobe = {
                projectId: 'proj123',
                projectName: 'Test Project',
                organization: 'Org Name',
                workspace: 'workspace123',
                authenticated: true
            };

            await stateManager.saveProject(project as Project);

            // Check if any writeFile call includes .demo-builder.json
            const manifestCall = (fs.writeFile as jest.Mock).mock.calls.find(
                call => typeof call[0] === 'string' && call[0].endsWith('.demo-builder.json')
            );
            expect(manifestCall).toBeDefined();

            // Verify the manifest content includes expected fields
            if (manifestCall) {
                const manifestContent = JSON.parse(manifestCall[1]);
                expect(manifestContent.name).toBe('Test Project');
                expect(manifestContent.adobe).toEqual(project.adobe);
            }
        });

        it('should create .env file with project configuration', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const project = createMockProject();
            project.commerce = {
                type: 'platform-as-a-service',
                instance: {
                    url: 'https://example.com',
                    environmentId: 'env123',
                    storeView: 'default',
                    websiteCode: 'base',
                    storeCode: 'default'
                },
                services: {
                    catalog: {
                        enabled: true,
                        endpoint: 'https://catalog.api',
                        apiKey: 'catalog-key'
                    }
                }
            };

            await stateManager.saveProject(project as Project);

            const envPath = path.join(project.path!, '.env');
            const envCall = (fs.writeFile as jest.Mock).mock.calls.find(
                call => call[0] === envPath
            );
            expect(envCall).toBeDefined();
            expect(envCall[1]).toContain('PROJECT_NAME=Test Project');
            expect(envCall[1]).toContain('COMMERCE_URL=https://example.com');
        });

        it('should fire project changed event', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const eventHandler = jest.fn();
            stateManager.onProjectChanged(eventHandler);

            const project = createMockProject();
            await stateManager.saveProject(project as Project);

            expect(eventHandler).toHaveBeenCalledWith(project);
        });

        it('should handle manifest write failure gracefully', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            (fs.writeFile as jest.Mock).mockImplementation((filepath: string) => {
                if (filepath.includes('.demo-builder.json')) {
                    return Promise.reject(new Error('Permission denied'));
                }
                return Promise.resolve();
            });

            const project = createMockProject();

            // FIXED: Errors should now be propagated (not swallowed)
            await expect(stateManager.saveProject(project as Project)).rejects.toThrow('Permission denied');
        });

        it('should update lastModified timestamp in manifest', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const project = createMockProject();

            // Capture time before save
            const timeBefore = new Date().toISOString();

            // Ensure async operation completes
            await new Promise(resolve => process.nextTick(resolve));

            await stateManager.saveProject(project as Project);

            // Capture time after save
            const timeAfter = new Date().toISOString();

            // Verify manifest was written with updated lastModified
            const manifestCall = (fs.writeFile as jest.Mock).mock.calls.find(
                call => typeof call[0] === 'string' && call[0].endsWith('.demo-builder.json')
            );

            expect(manifestCall).toBeDefined();

            if (manifestCall) {
                const manifestContent = JSON.parse(manifestCall[1]);
                const manifestLastModified = manifestContent.lastModified;

                // Verify the manifest's lastModified is between timeBefore and timeAfter
                expect(manifestLastModified >= timeBefore).toBe(true);
                expect(manifestLastModified <= timeAfter).toBe(true);
            }
        });
    });

    describe('clearProject', () => {
        it('should clear current project', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const project = createMockProject();
            await stateManager.saveProject(project as Project);
            expect(await stateManager.getCurrentProject()).toBeDefined();

            await stateManager.clearProject();

            expect(await stateManager.getCurrentProject()).toBeUndefined();
        });

        it('should clear all processes', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            await stateManager.addProcess('test-process', {
                pid: 12345,
                port: 3000,
                startTime: new Date(),
                command: 'npm start',
                status: 'running'
            });

            await stateManager.clearProject();

            const process = await stateManager.getProcess('test-process');
            expect(process).toBeUndefined();
        });

        it('should fire project changed event with undefined', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const eventHandler = jest.fn();
            stateManager.onProjectChanged(eventHandler);

            await stateManager.clearProject();

            expect(eventHandler).toHaveBeenCalledWith(undefined);
        });

        it('should persist cleared state to file', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            await stateManager.clearProject();

            expect(fs.writeFile).toHaveBeenCalled();
            const writeCall = (fs.writeFile as jest.Mock).mock.calls.find(
                call => call[0] === mockStateFile
            );
            expect(writeCall).toBeDefined();
        });
    });

    describe('clearAll', () => {
        it('should clear all state including workspace state', async () => {
            const { stateManager, mockWorkspaceState } = testMocks;
            await stateManager.initialize();

            const project = createMockProject();
            await stateManager.saveProject(project as Project);
            await stateManager.clearAll();

            expect(mockWorkspaceState.update).toHaveBeenCalledWith('demoBuilder.state', undefined);
        });

        it('should delete state file', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            await stateManager.clearAll();

            expect(fs.unlink).toHaveBeenCalledWith(mockStateFile);
        });

        it('should handle missing state file gracefully', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            (fs.unlink as jest.Mock).mockRejectedValue(new Error('File not found'));

            await expect(stateManager.clearAll()).resolves.not.toThrow();
        });

        it('should fire project changed event with undefined', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const eventHandler = jest.fn();
            stateManager.onProjectChanged(eventHandler);

            await stateManager.clearAll();

            expect(eventHandler).toHaveBeenCalledWith(undefined);
        });
    });
});