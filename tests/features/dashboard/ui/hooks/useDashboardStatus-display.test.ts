/**
 * useDashboardStatus Hook Tests — Display Derivation & AI Ready Badge
 *
 * Covers: Mesh Status Display, Derived Values, and AI Ready Badge State.
 * State management / subscription tests live in `useDashboardStatus.test.ts`.
 *
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';

// Mock the WebviewClient - must be before import (jest.mock is hoisted per-module).
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn(),
        request: jest.fn(),
    },
}));

import { useDashboardStatus } from '@/features/dashboard/ui/hooks/useDashboardStatus';
import {
    createDashboardStatusHarness,
    setupDashboardStatusMocks,
} from './useDashboardStatus.testUtils';

describe('useDashboardStatus (display & AI badge)', () => {
    const harness = createDashboardStatusHarness();
    const statusHandler = () => harness.getStatusHandler();
    const { mockRequest } = harness;

    beforeEach(() => {
        setupDashboardStatusMocks(harness);
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
                statusHandler()?.({
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
                statusHandler()?.({
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
                statusHandler()?.({
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
                statusHandler()?.({
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
                statusHandler()?.({
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
                statusHandler()?.({
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
                statusHandler()?.({
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
                statusHandler()?.({
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
            globalMcpRegistration?: 'registered' | 'declined' | 'unregistered';
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
            globalMcpRegistration: overrides.globalMcpRegistration ?? 'registered',
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

        it('returns yellow Setup incomplete when global MCP is unregistered', async () => {
            mockRequest.mockResolvedValue(buildVerifyResponse({ globalMcpRegistration: 'unregistered' }));
            const { result } = renderHook(() => useDashboardStatus());
            await flushVerify();
            expect(result.current.aiReady).toEqual({
                label: 'AI Ready',
                color: 'yellow',
                text: 'Setup incomplete',
            });
        });

        it('returns yellow Setup incomplete when global MCP is declined', async () => {
            mockRequest.mockResolvedValue(buildVerifyResponse({ globalMcpRegistration: 'declined' }));
            const { result } = renderHook(() => useDashboardStatus());
            await flushVerify();
            expect(result.current.aiReady.color).toBe('yellow');
            expect(result.current.aiReady.text).toBe('Setup incomplete');
        });

        it('returns yellow Setup incomplete when inventory mcpsError is set (files OK, registered)', async () => {
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
