/**
 * useDashboardStatus Hook Tests — AI Ready Badge State
 *
 * Covers the verify-ai-setup integration that drives the AI Ready badge:
 * blue Verifying → green Ready → yellow Setup incomplete → red Broken,
 * plus skills/MCPs inventory exposure and the regenerate-ai-files flow.
 *
 * Core hook behavior is in `useDashboardStatus.test.ts`; display string
 * computations are in `useDashboardStatus-statusDisplay.test.ts`.
 *
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn(),
        request: jest.fn(),
    },
}));

import { useDashboardStatus } from '@/features/dashboard/ui/hooks/useDashboardStatus';
import {
    setupMocks,
    buildVerifyResponse,
    flushVerify,
    okCheck,
    failCheck,
    type TestMocks,
} from './useDashboardStatus.testUtils';

describe('useDashboardStatus — AI Ready Badge State', () => {
    let mocks: TestMocks;

    beforeEach(() => {
        mocks = setupMocks();
    });

    it('returns blue Verifying state before verify-ai-setup resolves', () => {
        // Default mock: request never resolves
        const { result } = renderHook(() => useDashboardStatus());
        expect(result.current.aiReady).toEqual({
            label: 'AI',
            color: 'blue',
            text: 'Verifying',
        });
    });

    it('issues a verify-ai-setup request on mount', () => {
        renderHook(() => useDashboardStatus());
        expect(mocks.mockRequest).toHaveBeenCalledWith('verify-ai-setup', expect.any(Object));
    });

    it('telegraphs the mcp-health self-heal on the AI badge (warning → ok)', () => {
        const { result } = renderHook(() => useDashboardStatus());

        // mcp-health drift → visible "Updating AI configuration…" (overrides verify).
        act(() => {
            mocks.state.orgHandler?.({ checkId: 'mcp-health', status: 'warning', message: 'Updating AI configuration…' });
        });
        expect(result.current.aiReady).toEqual({
            label: 'AI',
            color: 'blue',
            text: 'Updating AI configuration…',
        });

        // Heal resolved → badge falls back to the verify-driven state.
        act(() => {
            mocks.state.orgHandler?.({ checkId: 'mcp-health', status: 'ok' });
        });
        expect(result.current.aiReady.text).not.toBe('Updating AI configuration…');
    });

    it('returns green Ready when all 7 signals pass', async () => {
        mocks.mockRequest.mockResolvedValue(buildVerifyResponse());
        const { result } = renderHook(() => useDashboardStatus());
        await flushVerify();
        expect(result.current.aiReady).toEqual({
            label: 'AI',
            color: 'green',
            text: 'Ready',
        });
    });

    it('returns yellow Setup incomplete when inventory mcpsError is set (files OK)', async () => {
        mocks.mockRequest.mockResolvedValue(
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
        mocks.mockRequest.mockResolvedValue(
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
        mocks.mockRequest.mockResolvedValue(
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
            label: 'AI',
            color: 'red',
            text: 'Broken',
        });
    });

    it('returns red Broken when mcp.json check has error status', async () => {
        mocks.mockRequest.mockResolvedValue(
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
        mocks.mockRequest.mockResolvedValue(
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
        mocks.mockRequest.mockResolvedValue(
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
        mocks.mockRequest.mockRejectedValue(new Error('verification failed'));
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
        mocks.mockRequest.mockResolvedValue(buildVerifyResponse({ inventory: { skills } }));
        const { result } = renderHook(() => useDashboardStatus());
        await flushVerify();
        expect(result.current.aiSkills).toHaveLength(1);
        expect(result.current.aiSkills[0].name).toBe('Add a component');
        expect(result.current.aiSkillsError).toBe(false);
    });

    it('flags aiSkillsError when the skill inspector errored', async () => {
        mocks.mockRequest.mockResolvedValue(buildVerifyResponse({ inventory: { skillsError: 'skill inspector failed' } }));
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
        mocks.mockRequest.mockResolvedValue(buildVerifyResponse({ inventory: { mcps } }));
        const { result } = renderHook(() => useDashboardStatus());
        await flushVerify();
        expect(result.current.aiMcps).toHaveLength(1);
        expect(result.current.aiMcps[0].id).toBe('playwright');
        expect(result.current.aiMcps[0].tools).toHaveLength(2);
        expect(result.current.aiMcpsError).toBe(false);
    });

    it('flags aiMcpsError when the MCP inspector errored', async () => {
        mocks.mockRequest.mockResolvedValue(buildVerifyResponse({ inventory: { mcpsError: 'mcp inspector failed' } }));
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
        mocks.mockRequest.mockResolvedValue(buildVerifyResponse());
        const { result } = renderHook(() => useDashboardStatus());
        await flushVerify();
        expect(result.current.aiBusy).toBe(false);
    });

    it('regenerateAiFiles dispatches regenerate-ai-files then re-verifies', async () => {
        mocks.mockRequest.mockImplementation((type: string) =>
            type === 'regenerate-ai-files'
                ? Promise.resolve({ success: true })
                : Promise.resolve(buildVerifyResponse()),
        );
        const { result } = renderHook(() => useDashboardStatus());
        await flushVerify();
        mocks.mockRequest.mockClear();

        await act(async () => {
            await result.current.regenerateAiFiles();
        });

        const types = mocks.mockRequest.mock.calls.map(c => c[0]);
        expect(types).toContain('regenerate-ai-files');
        expect(types).toContain('verify-ai-setup');
    });
});
