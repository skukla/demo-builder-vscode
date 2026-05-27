/**
 * AiMenuCommand Tests
 *
 * Tests the chat-first, state-aware AI entry point:
 *
 *  - When no live Claude Code chat terminal is open, `execute()` opens the chat
 *    (`demoBuilder.openAiExperience`) and does NOT show the prompt QuickPick.
 *  - When a chat IS open, `execute()` shows the prompt QuickPick via the shared
 *    `showWebviewQuickPick` util. The picker has NO "Open Chat" item; it lists
 *    the merged prompts (pinned first) with inline edit/delete buttons, plus
 *    Manage / New rows, and a placeholder.
 *  - Selecting a prompt inserts it (`demoBuilder.openInClaude` `{ prompt }`);
 *    Manage / New route to the prompt manager (`demoBuilder.openAi`).
 *  - The per-item buttons route through `onItemButton`: edit opens the manager;
 *    delete confirms (modal) then delegates to `deleteAiPromptById` and rebuilds
 *    `quickPick.items`.
 */

import * as vscode from 'vscode';

// Mock the AI prompt helpers so the menu's prompt reads/deletes are observable
// without touching globalState / stateManager internals.
jest.mock('@/features/dashboard/handlers/aiHandlers', () => ({
    readMergedAiPrompts: jest.fn(),
    deleteAiPromptById: jest.fn(),
}));

// Mock the chat-open detector so each test controls the branch.
jest.mock('@/commands/openInClaude', () => ({
    isClaudeChatOpen: jest.fn(),
}));

// Mock the shared picker so we can capture items + options (including
// onItemButton) and control the resolved selection.
jest.mock('@/core/utils/quickPickUtils', () => ({
    showWebviewQuickPick: jest.fn(),
}));

import { AiMenuCommand } from '@/commands/aiMenu';
import { readMergedAiPrompts, deleteAiPromptById } from '@/features/dashboard/handlers/aiHandlers';
import { isClaudeChatOpen } from '@/commands/openInClaude';
import { showWebviewQuickPick } from '@/core/utils/quickPickUtils';
import type { StateManager } from '@/core/state';
import type { Logger } from '@/types/logger';
import type { AiPrompt, Project } from '@/types/base';

type AiMenuItem = vscode.QuickPickItem & {
    action?: 'insert' | 'manage' | 'new';
    promptId?: string;
    promptBody?: string;
};

interface PickerCall {
    items: AiMenuItem[];
    options: {
        title?: string;
        placeholder?: string;
        onItemButton?: (event: {
            item: AiMenuItem;
            button: vscode.QuickInputButton;
            quickPick: { items: AiMenuItem[]; hide: jest.Mock };
        }) => void | Promise<void>;
    };
}

/**
 * Capture the args passed to `showWebviewQuickPick` and control its resolution.
 * `resolveWith` picks which built item the picker "returns" (by predicate);
 * defaults to resolving undefined (user cancelled).
 */
function capturePicker(
    resolveWith?: (items: AiMenuItem[]) => AiMenuItem | undefined,
): () => PickerCall {
    (showWebviewQuickPick as jest.Mock).mockImplementation(
        async (items: AiMenuItem[], _options: PickerCall['options']) => {
            return resolveWith ? resolveWith(items) : undefined;
        },
    );
    return () => {
        const call = (showWebviewQuickPick as jest.Mock).mock.calls[0];
        return { items: call[0] as AiMenuItem[], options: call[1] as PickerCall['options'] };
    };
}

function makeContext(globalPrompts: AiPrompt[] = []): vscode.ExtensionContext {
    const store: Record<string, unknown> = {
        'demoBuilder.ai.globalPrompts': globalPrompts,
    };
    return {
        globalState: {
            get: jest.fn((key: string, dflt?: unknown) => (key in store ? store[key] : dflt)),
            update: jest.fn().mockResolvedValue(undefined),
        },
        subscriptions: [],
    } as unknown as vscode.ExtensionContext;
}

function makeStateManager(project: Project | null): StateManager {
    return {
        getCurrentProject: jest.fn().mockResolvedValue(project),
        saveProject: jest.fn().mockResolvedValue(undefined),
    } as unknown as StateManager;
}

function makeLogger(): Logger {
    return {
        info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(), trace: jest.fn(),
    } as unknown as Logger;
}

const PROJECT = { name: 'My Demo', path: '/projects/demo' } as unknown as Project;

describe('AiMenuCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (readMergedAiPrompts as jest.Mock).mockReturnValue([]);
        (deleteAiPromptById as jest.Mock).mockResolvedValue([]);
        // Default: a chat is open so the picker path runs.
        (isClaudeChatOpen as jest.Mock).mockReturnValue(true);
    });

    describe('state-aware entry (no chat open)', () => {
        it('opens the chat (openAiExperience) and does NOT show a QuickPick', async () => {
            (isClaudeChatOpen as jest.Mock).mockReturnValue(false);
            capturePicker();
            const cmd = new AiMenuCommand(makeContext(), makeStateManager(PROJECT), makeLogger());

            await cmd.execute();

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.openAiExperience');
            expect(showWebviewQuickPick).not.toHaveBeenCalled();
        });

        it('opens the chat even when no project is loaded', async () => {
            (isClaudeChatOpen as jest.Mock).mockReturnValue(false);
            capturePicker();
            const cmd = new AiMenuCommand(makeContext(), makeStateManager(null), makeLogger());

            await cmd.execute();

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.openAiExperience');
            expect(showWebviewQuickPick).not.toHaveBeenCalled();
        });
    });

    describe('menu construction (chat open)', () => {
        it('shows the picker titled with the current project name', async () => {
            const getCall = capturePicker();
            const cmd = new AiMenuCommand(makeContext(), makeStateManager(PROJECT), makeLogger());

            await cmd.execute();

            expect(getCall().options.title).toContain('My Demo');
        });

        it('titles with "No project" when no project is loaded', async () => {
            const getCall = capturePicker();
            const cmd = new AiMenuCommand(makeContext(), makeStateManager(null), makeLogger());

            await cmd.execute();

            expect(getCall().options.title).toContain('No project');
        });

        it('sets a placeholder on the picker', async () => {
            const getCall = capturePicker();
            const cmd = new AiMenuCommand(makeContext(), makeStateManager(PROJECT), makeLogger());

            await cmd.execute();

            expect(getCall().options.placeholder).toBeTruthy();
        });

        it('does NOT include an "Open Chat" item', async () => {
            const getCall = capturePicker();
            (readMergedAiPrompts as jest.Mock).mockReturnValue([
                { id: 'p', title: 'Local Prompt', prompt: 'local body' },
            ]);
            const cmd = new AiMenuCommand(makeContext(), makeStateManager(PROJECT), makeLogger());

            await cmd.execute();

            const labels = getCall().items.map((i) => i.label);
            expect(labels.some((l) => l.includes('Open Chat'))).toBe(false);
        });

        it('includes the merged prompts (pinned first), Manage, and New', async () => {
            const getCall = capturePicker();
            (readMergedAiPrompts as jest.Mock).mockReturnValue([
                { id: 'g', title: 'Pinned Prompt', prompt: 'pinned body', pinned: true },
                { id: 'p', title: 'Local Prompt', prompt: 'local body' },
            ]);
            const cmd = new AiMenuCommand(makeContext(), makeStateManager(PROJECT), makeLogger());

            await cmd.execute();

            const labels = getCall().items.map((i) => i.label);
            const promptLabels = labels.filter((l) => l === 'Pinned Prompt' || l === 'Local Prompt');
            expect(promptLabels).toEqual(['Pinned Prompt', 'Local Prompt']);
            expect(labels).toContain('$(gear) Manage prompts…');
            expect(labels).toContain('$(add) New prompt…');
        });

        it('gives each prompt item edit + delete buttons', async () => {
            const getCall = capturePicker();
            (readMergedAiPrompts as jest.Mock).mockReturnValue([
                { id: 'p', title: 'Local Prompt', prompt: 'local body' },
            ]);
            const cmd = new AiMenuCommand(makeContext(), makeStateManager(PROJECT), makeLogger());

            await cmd.execute();

            const promptItem = getCall().items.find((i) => i.promptId === 'p');
            expect(promptItem).toBeDefined();
            expect(promptItem?.buttons).toHaveLength(2);
        });

        it('shows the body preview inline as `description` (single-line rows center the buttons)', async () => {
            const getCall = capturePicker();
            (readMergedAiPrompts as jest.Mock).mockReturnValue([
                { id: 'p', title: 'Local Prompt', prompt: 'local body' },
            ]);
            const cmd = new AiMenuCommand(makeContext(), makeStateManager(PROJECT), makeLogger());

            await cmd.execute();

            const promptItem = getCall().items.find((i) => i.promptId === 'p');
            expect(promptItem?.description).toBe('local body');
            // No two-line `detail` — that would top-align the item buttons.
            expect(promptItem?.detail).toBeUndefined();
        });
    });

    describe('selection dispatch (chat open)', () => {
        it('insert executes demoBuilder.openInClaude with the prompt body', async () => {
            (readMergedAiPrompts as jest.Mock).mockReturnValue([
                { id: 'p', title: 'Local Prompt', prompt: 'local body' },
            ]);
            capturePicker((items) => items.find((i) => i.action === 'insert'));
            const cmd = new AiMenuCommand(makeContext(), makeStateManager(PROJECT), makeLogger());

            await cmd.execute();

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder.openInClaude',
                { prompt: 'local body' },
            );
        });

        it('manage executes demoBuilder.openAi', async () => {
            capturePicker((items) => items.find((i) => i.action === 'manage'));
            const cmd = new AiMenuCommand(makeContext(), makeStateManager(PROJECT), makeLogger());

            await cmd.execute();

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.openAi');
        });

        it('new executes demoBuilder.openAi', async () => {
            capturePicker((items) => items.find((i) => i.action === 'new'));
            const cmd = new AiMenuCommand(makeContext(), makeStateManager(PROJECT), makeLogger());

            await cmd.execute();

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.openAi');
        });

        it('does nothing when the picker is cancelled (returns undefined)', async () => {
            capturePicker(); // resolves undefined
            const cmd = new AiMenuCommand(makeContext(), makeStateManager(PROJECT), makeLogger());

            await cmd.execute();

            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
                'demoBuilder.openInClaude',
                expect.anything(),
            );
            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('demoBuilder.openAi');
        });
    });

    describe('item buttons (chat open)', () => {
        function makeQuickPickStub(items: AiMenuItem[]): { items: AiMenuItem[]; hide: jest.Mock } {
            return { items, hide: jest.fn() };
        }

        it('edit button deep-links the manager to that prompt (editPromptId) then hides', async () => {
            (readMergedAiPrompts as jest.Mock).mockReturnValue([
                { id: 'p', title: 'Local Prompt', prompt: 'local body' },
            ]);
            const getCall = capturePicker();
            const cmd = new AiMenuCommand(makeContext(), makeStateManager(PROJECT), makeLogger());
            await cmd.execute();

            const { items, options } = getCall();
            const promptItem = items.find((i) => i.promptId === 'p')!;
            const editButton = promptItem.buttons![0];
            const quickPick = makeQuickPickStub(items);

            await options.onItemButton!({ item: promptItem, button: editButton, quickPick });

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder.openAi',
                { editPromptId: 'p' },
            );
            expect(quickPick.hide).toHaveBeenCalled();
        });

        it('delete button (after confirm) calls deleteAiPromptById and refreshes items', async () => {
            (readMergedAiPrompts as jest.Mock).mockReturnValue([
                { id: 'p', title: 'Local Prompt', prompt: 'local body' },
            ]);
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Delete');
            (deleteAiPromptById as jest.Mock).mockResolvedValue([]);
            const getCall = capturePicker();
            const cmd = new AiMenuCommand(makeContext(), makeStateManager(PROJECT), makeLogger());
            await cmd.execute();

            const { items, options } = getCall();
            const promptItem = items.find((i) => i.promptId === 'p')!;
            const deleteButton = promptItem.buttons![1];
            const quickPick = makeQuickPickStub(items);

            // Refresh is driven by deleteAiPromptById's returned list ([] above),
            // not a re-read — so a stale captured project can't resurrect the prompt.
            await options.onItemButton!({ item: promptItem, button: deleteButton, quickPick });

            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining('Local Prompt'),
                { modal: true },
                'Delete',
            );
            expect(deleteAiPromptById).toHaveBeenCalledWith(
                expect.anything(),
                PROJECT,
                'p',
            );
            // Items rebuilt in place — the prompt is gone.
            expect(quickPick.items.some((i) => i.promptId === 'p')).toBe(false);
        });

        it('delete button does nothing when the confirm is dismissed', async () => {
            (readMergedAiPrompts as jest.Mock).mockReturnValue([
                { id: 'p', title: 'Local Prompt', prompt: 'local body' },
            ]);
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);
            const getCall = capturePicker();
            const cmd = new AiMenuCommand(makeContext(), makeStateManager(PROJECT), makeLogger());
            await cmd.execute();

            const { items, options } = getCall();
            const promptItem = items.find((i) => i.promptId === 'p')!;
            const deleteButton = promptItem.buttons![1];
            const quickPick = makeQuickPickStub(items);

            await options.onItemButton!({ item: promptItem, button: deleteButton, quickPick });

            expect(deleteAiPromptById).not.toHaveBeenCalled();
        });
    });
});
