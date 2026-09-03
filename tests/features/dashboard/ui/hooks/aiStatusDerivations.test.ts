/**
 * Tests for aiStatusDerivations — the pure AI badge + inventory-view
 * derivations extracted from useDashboardStatus. The hook-level behavior
 * stays pinned by the useDashboardStatus* suites; these tests pin the
 * extracted units in isolation (precedence order, degradation rules,
 * stable empty-list identity).
 */

import {
    deriveAiInventoryView,
    deriveAiReadyState,
    type AiBadgeInputs,
} from '@/features/dashboard/ui/hooks/aiStatusDerivations';
import type { McpInventoryEntry, SkillInventoryEntry } from '@/types/ai';

const idleInputs: AiBadgeInputs = {
    verifyResult: null,
    verifyFailed: false,
    mcpHealing: false,
    aiToolingMissing: false,
    aiRegenerating: false,
};

const healthyVerify = {
    checks: [{ name: 'claude-md', status: 'ok' as const }],
    inventory: { skills: [], mcps: [] },
};

describe('deriveAiReadyState', () => {
    it('should show Verifying when no verify result has arrived', () => {
        expect(deriveAiReadyState(idleInputs)).toEqual({
            label: 'AI',
            color: 'blue',
            text: 'Verifying',
        });
    });

    it('should show Setup incomplete when the verify itself failed', () => {
        expect(deriveAiReadyState({ ...idleInputs, verifyFailed: true })).toEqual({
            label: 'AI',
            color: 'yellow',
            text: 'Setup incomplete',
        });
    });

    it('should show Ready when checks and inventory are healthy', () => {
        expect(deriveAiReadyState({ ...idleInputs, verifyResult: healthyVerify })).toEqual({
            label: 'AI',
            color: 'green',
            text: 'Ready',
        });
    });

    it('should show Broken when any file check failed', () => {
        const verifyResult = {
            checks: [{ name: 'claude-md', status: 'error' as const }],
        };
        expect(deriveAiReadyState({ ...idleInputs, verifyResult })).toEqual({
            label: 'AI',
            color: 'red',
            text: 'Broken',
        });
    });

    it('should show Setup incomplete when an inventory inspector errored', () => {
        const verifyResult = {
            checks: [{ name: 'claude-md', status: 'ok' as const }],
            inventory: { skillsError: 'boom' },
        };
        expect(deriveAiReadyState({ ...idleInputs, verifyResult })).toEqual({
            label: 'AI',
            color: 'yellow',
            text: 'Setup incomplete',
        });
    });

    it('should show AI tooling missing when files are healthy but tooling is missing', () => {
        expect(
            deriveAiReadyState({
                ...idleInputs,
                verifyResult: healthyVerify,
                aiToolingMissing: true,
            })
        ).toEqual({ label: 'AI', color: 'yellow', text: 'AI tooling missing' });
    });

    it('should let regenerating take precedence over every other state', () => {
        expect(
            deriveAiReadyState({
                ...idleInputs,
                verifyFailed: true,
                mcpHealing: true,
                aiRegenerating: true,
            })
        ).toEqual({ label: 'AI', color: 'blue', text: 'Regenerating AI files…' });
    });

    it('should let mcp healing override the verify-driven badge', () => {
        expect(
            deriveAiReadyState({
                ...idleInputs,
                verifyResult: healthyVerify,
                mcpHealing: true,
            })
        ).toEqual({ label: 'AI', color: 'blue', text: 'Updating AI configuration…' });
    });
});

describe('deriveAiInventoryView', () => {
    it('should report loading when no result and no failure yet', () => {
        const view = deriveAiInventoryView(null, false);
        expect(view.aiInventoryLoading).toBe(true);
        expect(view.aiSkills).toEqual([]);
        expect(view.aiMcps).toEqual([]);
        expect(view.aiSkillsError).toBe(false);
        expect(view.aiMcpsError).toBe(false);
    });

    it('should flag both lists as errored when the verify failed', () => {
        const view = deriveAiInventoryView(null, true);
        expect(view.aiInventoryLoading).toBe(false);
        expect(view.aiSkillsError).toBe(true);
        expect(view.aiMcpsError).toBe(true);
    });

    it('should pass through inventory lists and edited files', () => {
        const skills: SkillInventoryEntry[] = [
            {
                name: 'demo',
                description: null,
                path: '/p/.claude/skills/demo/SKILL.md',
                source: 'demo-builder',
            },
        ];
        const mcps: McpInventoryEntry[] = [{ id: 'demo-builder', status: 'ok' }];
        const view = deriveAiInventoryView(
            { inventory: { skills, mcps, editedFiles: ['AGENTS.md'] } },
            false
        );
        expect(view.aiSkills).toBe(skills);
        expect(view.aiMcps).toBe(mcps);
        expect(view.aiEditedFiles).toEqual(['AGENTS.md']);
        expect(view.aiInventoryLoading).toBe(false);
    });

    it('should surface per-inspector errors from the inventory', () => {
        const view = deriveAiInventoryView(
            { inventory: { skillsError: 'no dir', mcps: [] } },
            false
        );
        expect(view.aiSkillsError).toBe(true);
        expect(view.aiMcpsError).toBe(false);
    });

    it('should return identity-stable empty lists across calls', () => {
        const first = deriveAiInventoryView({ inventory: {} }, false);
        const second = deriveAiInventoryView({}, false);
        expect(first.aiSkills).toBe(second.aiSkills);
        expect(first.aiMcps).toBe(second.aiMcps);
        expect(first.aiEditedFiles).toBe(second.aiEditedFiles);
    });
});
