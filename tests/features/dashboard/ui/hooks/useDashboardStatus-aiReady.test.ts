/**
 * useDashboardStatus Hook Tests — AI Ready Badge State
 *
 * Covers the AI verification that drives the AI Ready badge:
 * blue Verifying → green Ready → yellow Setup incomplete → red Broken,
 * plus skills/MCPs inventory exposure and the regenerate-ai-files flow.
 *
 * On open the verification is delivered by the orchestrator's `ai-verify` check
 * via `checkResult{ai-verify}` (see `deliverAiVerify`) — the hook no longer pulls
 * it on mount. The on-demand re-verify after Regenerate still uses the
 * `verify-ai-setup` request.
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
    deliverAiVerify,
    deliverAiVerifyFailure,
    okCheck,
    failCheck,
    type TestMocks,
} from './useDashboardStatus.testUtils';

describe('useDashboardStatus — AI Ready Badge State', () => {
    let mocks: TestMocks;

    beforeEach(() => {
        mocks = setupMocks();
    });

    it('returns blue Verifying before the ai-verify outcome arrives', () => {
        const { result } = renderHook(() => useDashboardStatus());
        expect(result.current.aiReady).toEqual({
            label: 'AI',
            color: 'blue',
            text: 'Verifying',
        });
    });

    it('does NOT pull verify-ai-setup on mount (the orchestrator pushes it)', () => {
        renderHook(() => useDashboardStatus());
        const requestedTypes = mocks.mockRequest.mock.calls.map(c => c[0]);
        expect(requestedTypes).not.toContain('verify-ai-setup');
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

    it('returns green Ready when all signals pass', () => {
        const { result } = renderHook(() => useDashboardStatus());
        deliverAiVerify(mocks, buildVerifyResponse());
        expect(result.current.aiReady).toEqual({
            label: 'AI',
            color: 'green',
            text: 'Ready',
        });
    });

    it('returns yellow Setup incomplete when inventory mcpsError is set (files OK)', () => {
        const { result } = renderHook(() => useDashboardStatus());
        deliverAiVerify(mocks, buildVerifyResponse({ inventory: { mcpsError: 'mcp inspector failed' } }));
        expect(result.current.aiReady.color).toBe('yellow');
        expect(result.current.aiReady.text).toBe('Setup incomplete');
    });

    it('returns yellow Setup incomplete when inventory skillsError is set (files OK)', () => {
        const { result } = renderHook(() => useDashboardStatus());
        deliverAiVerify(mocks, buildVerifyResponse({ inventory: { skillsError: 'skill inspector failed' } }));
        expect(result.current.aiReady.color).toBe('yellow');
        expect(result.current.aiReady.text).toBe('Setup incomplete');
    });

    it('returns red Broken when AGENTS.md check fails', () => {
        const { result } = renderHook(() => useDashboardStatus());
        deliverAiVerify(mocks, buildVerifyResponse({
            checks: [failCheck('AGENTS.md'), okCheck('.claude/mcp.json'), okCheck('mcp-binary'), okCheck('skill-files')],
        }));
        expect(result.current.aiReady).toEqual({
            label: 'AI',
            color: 'red',
            text: 'Broken',
        });
    });

    it('returns red Broken when mcp.json check has error status', () => {
        const { result } = renderHook(() => useDashboardStatus());
        deliverAiVerify(mocks, buildVerifyResponse({
            checks: [
                okCheck('AGENTS.md'),
                { name: '.claude/mcp.json', status: 'error', message: 'Invalid JSON' },
                okCheck('mcp-binary'),
                okCheck('skill-files'),
            ],
        }));
        expect(result.current.aiReady.color).toBe('red');
        expect(result.current.aiReady.text).toBe('Broken');
    });

    it('returns red Broken when mcp-binary check fails', () => {
        const { result } = renderHook(() => useDashboardStatus());
        deliverAiVerify(mocks, buildVerifyResponse({
            checks: [okCheck('AGENTS.md'), okCheck('.claude/mcp.json'), failCheck('mcp-binary'), okCheck('skill-files')],
        }));
        expect(result.current.aiReady.color).toBe('red');
    });

    it('returns red Broken when skill-files check fails', () => {
        const { result } = renderHook(() => useDashboardStatus());
        deliverAiVerify(mocks, buildVerifyResponse({
            checks: [okCheck('AGENTS.md'), okCheck('.claude/mcp.json'), okCheck('mcp-binary'), failCheck('skill-files')],
        }));
        expect(result.current.aiReady.color).toBe('red');
    });

    it('returns yellow Setup incomplete when the ai-verify outcome has no data (verify threw)', () => {
        const { result } = renderHook(() => useDashboardStatus());
        // The verify threw → orchestrator posts an error outcome with no data; the
        // badge must leave 'Verifying' for a defined (yellow) state, not stay stuck.
        deliverAiVerifyFailure(mocks);
        expect(result.current.aiReady.color).toBe('yellow');
    });

    it('exposes the skills inventory via aiSkills', () => {
        const skills = [
            { name: 'Add a component', description: 'Adds a component', path: '/p/add.md', source: 'demo-builder' },
        ];
        const { result } = renderHook(() => useDashboardStatus());
        deliverAiVerify(mocks, buildVerifyResponse({ inventory: { skills } }));
        expect(result.current.aiSkills).toHaveLength(1);
        expect(result.current.aiSkills[0].name).toBe('Add a component');
        expect(result.current.aiSkillsError).toBe(false);
    });

    it('flags aiSkillsError when the skill inspector errored', () => {
        const { result } = renderHook(() => useDashboardStatus());
        deliverAiVerify(mocks, buildVerifyResponse({ inventory: { skillsError: 'skill inspector failed' } }));
        expect(result.current.aiSkillsError).toBe(true);
    });

    it('exposes the MCP inventory via aiMcps', () => {
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
        const { result } = renderHook(() => useDashboardStatus());
        deliverAiVerify(mocks, buildVerifyResponse({ inventory: { mcps } }));
        expect(result.current.aiMcps).toHaveLength(1);
        expect(result.current.aiMcps[0].id).toBe('playwright');
        expect(result.current.aiMcps[0].tools).toHaveLength(2);
        expect(result.current.aiMcpsError).toBe(false);
    });

    it('flags aiMcpsError when the MCP inspector errored', () => {
        const { result } = renderHook(() => useDashboardStatus());
        deliverAiVerify(mocks, buildVerifyResponse({ inventory: { mcpsError: 'mcp inspector failed' } }));
        expect(result.current.aiMcpsError).toBe(true);
    });

    it('returns a stable empty MCPs reference before the ai-verify outcome arrives', () => {
        const { result } = renderHook(() => useDashboardStatus());
        expect(result.current.aiMcps).toEqual([]);
        expect(result.current.aiMcpsError).toBe(false);
    });

    it('regenerateAiFiles dispatches regenerate-ai-files then re-verifies (on demand)', async () => {
        mocks.mockRequest.mockImplementation((type: string) =>
            type === 'regenerate-ai-files'
                ? Promise.resolve({ success: true })
                : Promise.resolve(buildVerifyResponse()),
        );
        const { result } = renderHook(() => useDashboardStatus());

        await act(async () => {
            await result.current.regenerateAiFiles();
        });

        const types = mocks.mockRequest.mock.calls.map(c => c[0]);
        expect(types).toContain('regenerate-ai-files');
        expect(types).toContain('verify-ai-setup');
    });
});
