/**
 * What is typed into the chat terminal — Claude Code (AI-12 step 08).
 *
 * The launch path owns the terminal; this owns the spelling.
 */

import { describeEngine, type TerminalLaunch } from '@/features/ai/engine/agentEngine';
import {
    buildChatCommand,
    buildPastChatPickerCommand,
    quoteForShell,
    type ConversationProbes,
} from '@/features/ai/engine/chatLaunch';

function claudeLaunch(): TerminalLaunch {
    const { launch } = describeEngine('claude-code');
    if (launch.kind !== 'terminal') throw new Error('claude-code is not a terminal engine');
    return launch;
}

const CLAUDE = claudeLaunch();
const CWD = '/home/sc/.demo-builder/projects';
const rehome = (text: string): string => `[re-home] ${text}`;

function probes(hasConversation = false): ConversationProbes {
    return { claudeHasConversation: jest.fn(() => hasConversation) };
}

describe('buildChatCommand', () => {
    it('starts fresh with the prompt after `--` when there is nothing to continue', () => {
        expect(
            buildChatCommand(CLAUDE, CWD, { prompt: 'hi', fresh: false, rehome, permissions: 'ask' }, probes()),
        ).toEqual({ line: "claude -- 'hi'", resumed: false });
    });

    it('continues, re-homed, when this directory has a conversation', () => {
        const p = probes(true);

        expect(buildChatCommand(CLAUDE, CWD, { prompt: 'hi', fresh: false, rehome, permissions: 'ask' }, p)).toEqual({
            line: "claude --continue -- '[re-home] hi'",
            resumed: true,
        });
        expect(p.claudeHasConversation).toHaveBeenCalledWith(CWD);
    });

    it('continues with no prompt as a bare continue', () => {
        expect(buildChatCommand(CLAUDE, CWD, { fresh: false, rehome, permissions: 'ask' }, probes(true))).toEqual({
            line: 'claude --continue',
            resumed: true,
        });
    });

    it('never continues a New Chat', () => {
        expect(buildChatCommand(CLAUDE, CWD, { fresh: true, rehome, permissions: 'ask' }, probes(true))).toEqual({
            line: 'claude',
            resumed: false,
        });
    });
});

describe('buildPastChatPickerCommand', () => {
    it("opens Claude Code's own list when this directory has a conversation", () => {
        expect(buildPastChatPickerCommand(CLAUDE, CWD, 'ask', probes(true))).toBe('claude --resume');
    });

    it('answers nothing when there is nothing to pick', () => {
        expect(buildPastChatPickerCommand(CLAUDE, CWD, 'ask', probes())).toBeUndefined();
    });
});

describe('permissions', () => {
    it.each([
        ['auto', "claude --permission-mode auto -- 'hi'"],
        ['full', "claude --dangerously-skip-permissions -- 'hi'"],
    ] as const)('%s: puts the level before the prompt', (permissions, line) => {
        expect(
            buildChatCommand(CLAUDE, CWD, { prompt: 'hi', fresh: true, rehome, permissions }, probes()).line,
        ).toBe(line);
    });

    it('carries the level into a continue and into the earlier-chat list', () => {
        expect(
            buildChatCommand(CLAUDE, CWD, { fresh: false, rehome, permissions: 'full' }, probes(true)).line,
        ).toBe('claude --dangerously-skip-permissions --continue');
        expect(buildPastChatPickerCommand(CLAUDE, CWD, 'full', probes(true))).toBe(
            'claude --dangerously-skip-permissions --resume',
        );
    });
});

describe('quoteForShell', () => {
    it('keeps an embedded single quote inside one argument', () => {
        expect(quoteForShell("it's")).toBe("'it'\\''s'");
    });
});
