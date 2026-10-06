/**
 * What is typed into the chat terminal, per engine (AI-12 step 08).
 *
 * The launch path owns the terminal; this owns the spelling. Copilot resumes by
 * session ID rather than `--continue`, because its `--continue` is not scoped to
 * the directory and must never land in another folder's conversation.
 */

import { describeEngine, type TerminalLaunch } from '@/features/ai/engine/agentEngine';
import {
    buildChatCommand,
    buildPastChatPickerCommand,
    quoteForShell,
    type ConversationProbes,
} from '@/features/ai/engine/chatLaunch';

function terminalLaunch(engine: 'claude-code' | 'copilot-cli'): TerminalLaunch {
    const { launch } = describeEngine(engine);
    if (launch.kind !== 'terminal') throw new Error(`${engine} is not a terminal engine`);
    return launch;
}

const CLAUDE = terminalLaunch('claude-code');
const COPILOT = terminalLaunch('copilot-cli');
const CWD = '/home/sc/.demo-builder/projects';
const rehome = (text: string): string => `[re-home] ${text}`;

function probes(over: Partial<ConversationProbes> = {}): ConversationProbes {
    return {
        claudeHasConversation: jest.fn(() => false),
        copilotLatestSession: jest.fn(() => undefined),
        ...over,
    };
}

describe('buildChatCommand — Claude Code', () => {
    it('starts fresh with the prompt after `--` when there is nothing to continue', () => {
        expect(
            buildChatCommand(CLAUDE, CWD, { prompt: 'hi', fresh: false, rehome, permissions: 'ask' }, probes()),
        ).toEqual({ line: "claude -- 'hi'", resumed: false });
    });

    it('continues, re-homed, when this directory has a conversation', () => {
        const p = probes({ claudeHasConversation: jest.fn(() => true) });

        expect(buildChatCommand(CLAUDE, CWD, { prompt: 'hi', fresh: false, rehome, permissions: 'ask' }, p)).toEqual({
            line: "claude --continue -- '[re-home] hi'",
            resumed: true,
        });
        expect(p.claudeHasConversation).toHaveBeenCalledWith(CWD);
    });

    it('never continues a New Chat', () => {
        const p = probes({ claudeHasConversation: jest.fn(() => true) });

        expect(buildChatCommand(CLAUDE, CWD, { fresh: true, rehome, permissions: 'ask' }, p)).toEqual({
            line: 'claude',
            resumed: false,
        });
    });
});

describe('buildChatCommand — Copilot CLI', () => {
    it('starts an interactive chat that runs the prompt (`-i`, not `-p`, which exits)', () => {
        expect(
            buildChatCommand(COPILOT, CWD, { prompt: 'hi', fresh: false, rehome, permissions: 'ask' }, probes()),
        ).toEqual({ line: "copilot -i 'hi'", resumed: false });
    });

    it("resumes THIS directory's newest session by ID, re-homed", () => {
        const p = probes({ copilotLatestSession: jest.fn(() => 'abc-123') });

        expect(buildChatCommand(COPILOT, CWD, { prompt: 'hi', fresh: false, rehome, permissions: 'ask' }, p)).toEqual({
            line: "copilot --resume 'abc-123' -i '[re-home] hi'",
            resumed: true,
        });
        expect(p.copilotLatestSession).toHaveBeenCalledWith(CWD);
    });

    it('resumes with no prompt as a bare resume', () => {
        const p = probes({ copilotLatestSession: jest.fn(() => 'abc-123') });

        expect(buildChatCommand(COPILOT, CWD, { fresh: false, rehome, permissions: 'ask' }, p).line).toBe(
            "copilot --resume 'abc-123'",
        );
    });

    it('never resumes a New Chat', () => {
        const p = probes({ copilotLatestSession: jest.fn(() => 'abc-123') });

        expect(buildChatCommand(COPILOT, CWD, { prompt: 'hi', fresh: true, rehome, permissions: 'ask' }, p)).toEqual({
            line: "copilot -i 'hi'",
            resumed: false,
        });
    });
});

describe('buildPastChatPickerCommand', () => {
    it("opens each agent's own list when this directory has a conversation", () => {
        expect(
            buildPastChatPickerCommand(
                CLAUDE,
                CWD,
                'ask',
                probes({ claudeHasConversation: jest.fn(() => true) }),
            ),
        ).toBe('claude --resume');
        expect(
            buildPastChatPickerCommand(
                COPILOT,
                CWD,
                'ask',
                probes({ copilotLatestSession: jest.fn(() => 'abc') }),
            ),
        ).toBe('copilot --resume');
    });

    it('answers nothing when there is nothing to pick', () => {
        expect(buildPastChatPickerCommand(CLAUDE, CWD, 'ask', probes())).toBeUndefined();
        expect(buildPastChatPickerCommand(COPILOT, CWD, 'ask', probes())).toBeUndefined();
    });
});

describe('permissions', () => {
    it.each([
        [CLAUDE, 'auto', "claude --permission-mode auto -- 'hi'"],
        [CLAUDE, 'full', "claude --dangerously-skip-permissions -- 'hi'"],
        [COPILOT, 'auto', "copilot --allow-all-tools -i 'hi'"],
        [COPILOT, 'full', "copilot --allow-all -i 'hi'"],
    ] as const)('%#: puts the level before the prompt', (launch, permissions, line) => {
        expect(
            buildChatCommand(launch, CWD, { prompt: 'hi', fresh: true, rehome, permissions }, probes())
                .line,
        ).toBe(line);
    });

    it('carries the level into a resume and into the earlier-chat list', () => {
        const p = probes({ copilotLatestSession: jest.fn(() => 'abc') });
        expect(
            buildChatCommand(COPILOT, CWD, { fresh: false, rehome, permissions: 'full' }, p).line,
        ).toBe("copilot --allow-all --resume 'abc'");
        expect(buildPastChatPickerCommand(COPILOT, CWD, 'full', p)).toBe(
            'copilot --allow-all --resume',
        );
    });
});

describe('quoteForShell', () => {
    it('keeps an embedded single quote inside one argument', () => {
        expect(quoteForShell("it's")).toBe("'it'\\''s'");
    });
});
