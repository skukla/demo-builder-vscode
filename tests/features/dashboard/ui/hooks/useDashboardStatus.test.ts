/**
 * useDashboardStatus Hook Tests
 *
 * Tests for the extracted dashboard status hook.
 * Verifies state management, subscriptions, and computed status displays.
 *
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';

// Mock the WebviewClient - must be before import
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn(),
        request: jest.fn(),
    },
}));

import { useDashboardStatus } from '@/features/dashboard/ui/hooks/useDashboardStatus';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

describe('useDashboardStatus', () => {
    let statusHandler: ((data: unknown) => void) | null = null;
    let meshStatusHandler: ((data: unknown) => void) | null = null;
    const mockUnsubscribeStatus = jest.fn();
    const mockUnsubscribeMesh = jest.fn();
    const mockPostMessage = webviewClient.postMessage as jest.Mock;
    const mockOnMessage = webviewClient.onMessage as jest.Mock;
    const mockRequest = webviewClient.request as jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        statusHandler = null;
        meshStatusHandler = null;

        // Setup message handler capture
        mockOnMessage.mockImplementation((type: string, handler: (data: unknown) => void) => {
            if (type === 'statusUpdate') {
                statusHandler = handler;
                return mockUnsubscribeStatus;
            }
            if (type === 'meshStatusUpdate') {
                meshStatusHandler = handler;
                return mockUnsubscribeMesh;
            }
            return jest.fn();
        });

        // Default: request never resolves so aiReady stays in 'Verifying'
        mockRequest.mockImplementation(() => new Promise(() => {}));
    });

    describe('Initial State', () => {
        it('should return initial state values', () => {
            const { result } = renderHook(() => useDashboardStatus());

            expect(result.current.projectStatus).toBeNull();
            expect(result.current.isRunning).toBe(false);
            expect(result.current.isTransitioning).toBe(false);
        });

        it('should request status on mount', () => {
            renderHook(() => useDashboardStatus());

            expect(mockPostMessage).toHaveBeenCalledWith('requestStatus');
        });

        it('should subscribe to status and mesh updates', () => {
            renderHook(() => useDashboardStatus());

            expect(mockOnMessage).toHaveBeenCalledWith('statusUpdate', expect.any(Function));
            expect(mockOnMessage).toHaveBeenCalledWith('meshStatusUpdate', expect.any(Function));
        });
    });

    describe('Status Updates', () => {
        it('should update projectStatus on statusUpdate message', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'ready',
                });
            });

            expect(result.current.projectStatus).toEqual({
                name: 'Test Project',
                path: '/test/path',
                status: 'ready',
            });
        });

        it('should set isRunning true when status is running', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'running',
                });
            });

            expect(result.current.isRunning).toBe(true);
        });

        it('should set isRunning false when status is not running', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'stopped',
                });
            });

            expect(result.current.isRunning).toBe(false);
        });

        it('should clear transitioning state on definitive status', () => {
            const { result } = renderHook(() => useDashboardStatus());

            // Set transitioning
            act(() => {
                result.current.setIsTransitioning(true);
            });

            expect(result.current.isTransitioning).toBe(true);

            // Receive definitive status
            act(() => {
                statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'running',
                });
            });

            expect(result.current.isTransitioning).toBe(false);
        });
    });

    describe('Mesh Status Updates', () => {
        it('should update mesh status on meshStatusUpdate message', () => {
            const { result } = renderHook(() => useDashboardStatus());

            // First set project status
            act(() => {
                statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'ready',
                });
            });

            // Then update mesh status
            act(() => {
                meshStatusHandler?.({
                    status: 'deployed',
                    endpoint: 'https://example.com/mesh',
                });
            });

            expect(result.current.meshStatus).toBe('deployed');
        });

        it('should preserve mesh status during deployment when checking', () => {
            const { result } = renderHook(() => useDashboardStatus());

            // Set initial status with deploying mesh
            act(() => {
                statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'ready',
                    mesh: { status: 'deploying', message: 'Deploying...' },
                });
            });

            expect(result.current.meshStatus).toBe('deploying');

            // Simulate update check trying to set checking status
            act(() => {
                statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'ready',
                    mesh: { status: 'checking' },
                });
            });

            // Should preserve deploying status
            expect(result.current.meshStatus).toBe('deploying');
        });

        it('should clear transitioning when mesh operation completes', () => {
            const { result } = renderHook(() => useDashboardStatus());

            // Set transitioning
            act(() => {
                result.current.setIsTransitioning(true);
            });

            // Mesh deployment completes
            act(() => {
                meshStatusHandler?.({
                    status: 'deployed',
                });
            });

            expect(result.current.isTransitioning).toBe(false);
        });
    });

    describe('Demo Status Display', () => {
        it('should return Stopped for ready status', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'ready',
                });
            });

            expect(result.current.demoStatusDisplay.text).toBe('Stopped');
            expect(result.current.demoStatusDisplay.color).toBe('gray');
        });

        it('should return Starting... for starting status', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'starting',
                });
            });

            expect(result.current.demoStatusDisplay.text).toBe('Starting...');
            expect(result.current.demoStatusDisplay.color).toBe('blue');
        });

        it('should return Running on port X for running status', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'running',
                    port: 3000,
                });
            });

            expect(result.current.demoStatusDisplay.text).toBe('Running on port 3000');
            expect(result.current.demoStatusDisplay.color).toBe('green');
        });

        it('should return Restart needed when running with config changes', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'running',
                    port: 3000,
                    frontendConfigChanged: true,
                });
            });

            expect(result.current.demoStatusDisplay.text).toBe('Restart needed');
            expect(result.current.demoStatusDisplay.color).toBe('yellow');
        });

        it('should return Stopping... for stopping status', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'stopping',
                });
            });

            expect(result.current.demoStatusDisplay.text).toBe('Stopping...');
            expect(result.current.demoStatusDisplay.color).toBe('yellow');
        });

        it('should return Error for error status', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'error',
                });
            });

            expect(result.current.demoStatusDisplay.text).toBe('Error');
            expect(result.current.demoStatusDisplay.color).toBe('red');
        });

        it('should return Configuring... for configuring status', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'configuring',
                });
            });

            expect(result.current.demoStatusDisplay.text).toBe('Configuring...');
            expect(result.current.demoStatusDisplay.color).toBe('blue');
        });
    });

    describe('Mesh Status Display', () => {
        it('should return Loading status... initially when hasMesh is true', () => {
            const { result } = renderHook(() => useDashboardStatus({ hasMesh: true }));

            expect(result.current.meshStatusDisplay).toEqual({
                color: 'blue',
                text: 'Loading status...',
            });
        });

        it('should return null when no mesh and status loaded', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'ready',
                    // No mesh property
                });
            });

            expect(result.current.meshStatusDisplay).toBeNull();
        });

        it('should return Deployed for deployed mesh', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'ready',
                    mesh: { status: 'deployed' },
                });
            });

            expect(result.current.meshStatusDisplay).toEqual({
                color: 'green',
                text: 'Mesh Deployed',
            });
        });

        it('should return Session expired for needs-auth', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'ready',
                    mesh: { status: 'needs-auth' },
                });
            });

            expect(result.current.meshStatusDisplay).toEqual({
                color: 'yellow',
                text: 'Session expired',
            });
        });

        it('should return Redeploy Mesh for config-changed', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'ready',
                    mesh: { status: 'config-changed' },
                });
            });

            expect(result.current.meshStatusDisplay).toEqual({
                color: 'yellow',
                text: 'Redeploy Mesh',
            });
        });

        it('should return Deploying... with message for deploying', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'ready',
                    mesh: { status: 'deploying', message: 'Uploading config...' },
                });
            });

            expect(result.current.meshStatusDisplay).toEqual({
                color: 'blue',
                text: 'Uploading config...',
            });
        });

        it('should return Mesh Error for error', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'ready',
                    mesh: { status: 'error' },
                });
            });

            expect(result.current.meshStatusDisplay).toEqual({
                color: 'red',
                text: 'Mesh Error',
            });
        });
    });

    describe('Derived Values', () => {
        it('should return displayName from projectStatus', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                statusHandler?.({
                    name: 'My Demo Project',
                    path: '/test/path',
                    status: 'ready',
                });
            });

            expect(result.current.displayName).toBe('My Demo Project');
        });

        it('should return default displayName when no projectStatus', () => {
            const { result } = renderHook(() => useDashboardStatus());

            expect(result.current.displayName).toBe('');
        });

        it('should return status from projectStatus', () => {
            const { result } = renderHook(() => useDashboardStatus());

            act(() => {
                statusHandler?.({
                    name: 'Test Project',
                    path: '/test/path',
                    status: 'running',
                    port: 3000,
                });
            });

            expect(result.current.status).toBe('running');
        });

        it('should return undefined status when no projectStatus', () => {
            const { result } = renderHook(() => useDashboardStatus());

            expect(result.current.status).toBeUndefined();
        });
    });

    describe('Cleanup', () => {
        it('should unsubscribe on unmount', () => {
            const { unmount } = renderHook(() => useDashboardStatus());

            unmount();

            expect(mockUnsubscribeStatus).toHaveBeenCalled();
            expect(mockUnsubscribeMesh).toHaveBeenCalled();
        });
    });

    describe('StrictMode Compatibility', () => {
        it('should only request status once in StrictMode', () => {
            const { rerender } = renderHook(() => useDashboardStatus());

            // Simulate StrictMode double-mount
            rerender();

            // Should only be called once
            expect(mockPostMessage).toHaveBeenCalledTimes(1);
            expect(mockPostMessage).toHaveBeenCalledWith('requestStatus');
        });
    });

    describe('AI Ready Badge State', () => {
        const okCheck = (name: string) => ({ name, status: 'ok' as const });
        const failCheck = (name: string) => ({ name, status: 'warning' as const, message: 'Missing' });

        const buildVerifyResponse = (overrides: {
            checks?: Array<{ name: string; status: 'ok' | 'warning' | 'error'; message?: string }>;
            inventory?: {
                skills?: unknown[];
                mcps?: unknown[];
                sessionMcps?: unknown[];
                skillsError?: string;
                mcpsError?: string;
            };
        } = {}) => ({
            success: true,
            status: 'ok',
            checks: overrides.checks ?? [
                okCheck('AGENTS.md'),
                okCheck('.claude/mcp.json'),
                okCheck('mcp-binary'),
                okCheck('skill-files'),
            ],
            inventory: {
                skills: overrides.inventory?.skills ?? [],
                mcps: overrides.inventory?.mcps ?? [],
                sessionMcps: overrides.inventory?.sessionMcps ?? [],
                ...(overrides.inventory?.skillsError !== undefined
                    ? { skillsError: overrides.inventory.skillsError }
                    : {}),
                ...(overrides.inventory?.mcpsError !== undefined
                    ? { mcpsError: overrides.inventory.mcpsError }
                    : {}),
            },
        });

        const flushVerify = async () => {
            await act(async () => {
                await Promise.resolve();
                await Promise.resolve();
                await Promise.resolve();
            });
        };

        it('returns gray Verifying state before verify-ai-setup resolves', () => {
            // Default mock: request never resolves
            const { result } = renderHook(() => useDashboardStatus());
            expect(result.current.aiReady).toEqual({
                label: 'AI Ready',
                color: 'gray',
                text: 'Verifying',
            });
        });

        it('issues a verify-ai-setup request on mount', () => {
            renderHook(() => useDashboardStatus());
            expect(mockRequest).toHaveBeenCalledWith('verify-ai-setup', expect.any(Object));
        });

        it('returns green Ready when all 7 signals pass', async () => {
            mockRequest.mockResolvedValue(buildVerifyResponse());
            const { result } = renderHook(() => useDashboardStatus());
            await flushVerify();
            expect(result.current.aiReady).toEqual({
                label: 'AI Ready',
                color: 'green',
                text: 'Ready',
            });
        });

        it('returns yellow Setup incomplete when inventory mcpsError is set (files OK)', async () => {
            mockRequest.mockResolvedValue(
                buildVerifyResponse({
                    inventory: { mcpsError: 'mcp inspector failed' },
                }),
            );
            const { result } = renderHook(() => useDashboardStatus());
            await flushVerify();
            expect(result.current.aiReady.color).toBe('yellow');
            expect(result.current.aiReady.text).toBe('Setup incomplete');
        });

        it('returns yellow Setup incomplete when inventory skillsError is set (files OK, registered)', async () => {
            mockRequest.mockResolvedValue(
                buildVerifyResponse({
                    inventory: { skillsError: 'skill inspector failed' },
                }),
            );
            const { result } = renderHook(() => useDashboardStatus());
            await flushVerify();
            expect(result.current.aiReady.color).toBe('yellow');
            expect(result.current.aiReady.text).toBe('Setup incomplete');
        });

        it('returns red Broken when AGENTS.md check fails', async () => {
            mockRequest.mockResolvedValue(
                buildVerifyResponse({
                    checks: [
                        failCheck('AGENTS.md'),
                        okCheck('.claude/mcp.json'),
                        okCheck('mcp-binary'),
                        okCheck('skill-files'),
                    ],
                }),
            );
            const { result } = renderHook(() => useDashboardStatus());
            await flushVerify();
            expect(result.current.aiReady).toEqual({
                label: 'AI Ready',
                color: 'red',
                text: 'Broken',
            });
        });

        it('returns red Broken when mcp.json check has error status', async () => {
            mockRequest.mockResolvedValue(
                buildVerifyResponse({
                    checks: [
                        okCheck('AGENTS.md'),
                        { name: '.claude/mcp.json', status: 'error', message: 'Invalid JSON' },
                        okCheck('mcp-binary'),
                        okCheck('skill-files'),
                    ],
                }),
            );
            const { result } = renderHook(() => useDashboardStatus());
            await flushVerify();
            expect(result.current.aiReady.color).toBe('red');
            expect(result.current.aiReady.text).toBe('Broken');
        });

        it('returns red Broken when mcp-binary check fails', async () => {
            mockRequest.mockResolvedValue(
                buildVerifyResponse({
                    checks: [
                        okCheck('AGENTS.md'),
                        okCheck('.claude/mcp.json'),
                        failCheck('mcp-binary'),
                        okCheck('skill-files'),
                    ],
                }),
            );
            const { result } = renderHook(() => useDashboardStatus());
            await flushVerify();
            expect(result.current.aiReady.color).toBe('red');
        });

        it('returns red Broken when skill-files check fails', async () => {
            mockRequest.mockResolvedValue(
                buildVerifyResponse({
                    checks: [
                        okCheck('AGENTS.md'),
                        okCheck('.claude/mcp.json'),
                        okCheck('mcp-binary'),
                        failCheck('skill-files'),
                    ],
                }),
            );
            const { result } = renderHook(() => useDashboardStatus());
            await flushVerify();
            expect(result.current.aiReady.color).toBe('red');
        });

        it('returns yellow Setup incomplete when verify rejects (Verifying transitions to a defined state)', async () => {
            mockRequest.mockRejectedValue(new Error('verification failed'));
            const { result } = renderHook(() => useDashboardStatus());
            await flushVerify();
            // When verify call rejects we cannot conclude files are broken; default to
            // yellow (setup incomplete) so the badge does not get stuck on gray.
            expect(result.current.aiReady.color).toBe('yellow');
        });

        it('exposes the skills inventory via aiSkills', async () => {
            const skills = [
                { name: 'Add a component', description: 'Adds a component', path: '/p/add.md', source: 'demo-builder' },
            ];
            mockRequest.mockResolvedValue(buildVerifyResponse({ inventory: { skills } }));
            const { result } = renderHook(() => useDashboardStatus());
            await flushVerify();
            expect(result.current.aiSkills).toHaveLength(1);
            expect(result.current.aiSkills[0].name).toBe('Add a component');
            expect(result.current.aiSkillsError).toBe(false);
        });

        it('flags aiSkillsError when the skill inspector errored', async () => {
            mockRequest.mockResolvedValue(buildVerifyResponse({ inventory: { skillsError: 'skill inspector failed' } }));
            const { result } = renderHook(() => useDashboardStatus());
            await flushVerify();
            expect(result.current.aiSkillsError).toBe(true);
        });

        it('exposes the MCP inventory via aiMcps', async () => {
            const mcps = [
                {
                    id: 'playwright',
                    status: 'ok' as const,
                    tools: [
                        { name: 'browser_navigate', description: 'Navigate to a URL' },
                        { name: 'browser_snapshot', description: 'Capture accessibility tree' },
                    ],
                },
            ];
            mockRequest.mockResolvedValue(buildVerifyResponse({ inventory: { mcps } }));
            const { result } = renderHook(() => useDashboardStatus());
            await flushVerify();
            expect(result.current.aiMcps).toHaveLength(1);
            expect(result.current.aiMcps[0].id).toBe('playwright');
            expect(result.current.aiMcps[0].tools).toHaveLength(2);
            expect(result.current.aiMcpsError).toBe(false);
        });

        it('flags aiMcpsError when the MCP inspector errored', async () => {
            mockRequest.mockResolvedValue(buildVerifyResponse({ inventory: { mcpsError: 'mcp inspector failed' } }));
            const { result } = renderHook(() => useDashboardStatus());
            await flushVerify();
            expect(result.current.aiMcpsError).toBe(true);
        });

        it('returns a stable empty MCPs reference before verify resolves', () => {
            // Default mock: request never resolves
            const { result } = renderHook(() => useDashboardStatus());
            expect(result.current.aiMcps).toEqual([]);
            expect(result.current.aiMcpsError).toBe(false);
        });

        it('clears aiBusy after the initial verify resolves', async () => {
            mockRequest.mockResolvedValue(buildVerifyResponse());
            const { result } = renderHook(() => useDashboardStatus());
            await flushVerify();
            expect(result.current.aiBusy).toBe(false);
        });

        it('regenerateAiFiles dispatches regenerate-ai-files then re-verifies', async () => {
            mockRequest.mockImplementation((type: string) =>
                type === 'regenerate-ai-files'
                    ? Promise.resolve({ success: true })
                    : Promise.resolve(buildVerifyResponse()),
            );
            const { result } = renderHook(() => useDashboardStatus());
            await flushVerify();
            mockRequest.mockClear();

            await act(async () => {
                await result.current.regenerateAiFiles();
            });

            const types = mockRequest.mock.calls.map(c => c[0]);
            expect(types).toContain('regenerate-ai-files');
            expect(types).toContain('verify-ai-setup');
        });
    });
});
