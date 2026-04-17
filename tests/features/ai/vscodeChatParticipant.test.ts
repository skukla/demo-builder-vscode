/**
 * vscodeChatParticipant Tests
 *
 * Tests the VS Code chat participant registration and request handler:
 * - Registers participant with id 'demo-builder'
 * - Handler reads CLAUDE.md and includes project context in response
 * - Handler is silent when no project found in workspace
 */

import * as fsPromises from 'fs/promises';
import * as vscode from 'vscode';
import { registerChatParticipant } from '@/features/ai/vscodeChatParticipant';
import type { Project } from '@/types/base';

jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMockChatParticipant(): { handler: vscode.ChatRequestHandler; dispose: jest.Mock } {
    const handle = { handler: null as unknown as vscode.ChatRequestHandler, dispose: jest.fn() };
    (vscode.chat.createChatParticipant as jest.Mock).mockImplementation(
        (_id: string, h: vscode.ChatRequestHandler) => {
            handle.handler = h;
            return { dispose: handle.dispose };
        },
    );
    return handle;
}

function makeExtensionContext(): vscode.ExtensionContext {
    return {
        subscriptions: [],
        extensionPath: '/ext/path',
    } as unknown as vscode.ExtensionContext;
}

function makeRequest(prompt = 'How do I add a block?'): vscode.ChatRequest {
    return { prompt, command: undefined, references: [], toolReferences: [] } as unknown as vscode.ChatRequest;
}

function makeResponse(): { markdown: jest.Mock } {
    return { markdown: jest.fn() };
}

function makeChatContext(): vscode.ChatContext {
    return { history: [] } as unknown as vscode.ChatContext;
}

function makeProject(): Project {
    return {
        name: 'test-project',
        created: new Date(),
        lastModified: new Date(),
        path: '/projects/test-project',
        status: 'ready',
        selectedStack: 'eds-paas',
        componentInstances: {},
    };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('vscodeChatParticipant', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('registerChatParticipant', () => {
        it('registers a chat participant with id demo-builder', () => {
            makeMockChatParticipant();
            const projectResolver = jest.fn().mockResolvedValue(null);
            registerChatParticipant(makeExtensionContext(), projectResolver);

            expect(vscode.chat.createChatParticipant).toHaveBeenCalledWith(
                'demo-builder',
                expect.any(Function),
            );
        });

        it('returns a Disposable', () => {
            const { dispose } = makeMockChatParticipant();
            const projectResolver = jest.fn().mockResolvedValue(null);
            const disposable = registerChatParticipant(makeExtensionContext(), projectResolver);

            expect(disposable).toHaveProperty('dispose');
            disposable.dispose();
            expect(dispose).toHaveBeenCalled();
        });

        it('adds the participant to context.subscriptions', () => {
            makeMockChatParticipant();
            const ctx = makeExtensionContext();
            const projectResolver = jest.fn().mockResolvedValue(null);
            registerChatParticipant(ctx, projectResolver);

            expect(ctx.subscriptions.length).toBe(1);
        });
    });

    describe('chat request handler', () => {
        it('writes project context to response when project is found', async () => {
            const handle = makeMockChatParticipant();
            const project = makeProject();
            const projectResolver = jest.fn().mockResolvedValue(project);
            const claudeMdContent = '# Demo Builder Project\n\nProject: test-project\nStack: eds-paas\n';
            (fsPromises.readFile as jest.Mock).mockResolvedValue(claudeMdContent);

            registerChatParticipant(makeExtensionContext(), projectResolver);

            const response = makeResponse();
            await handle.handler(
                makeRequest(),
                makeChatContext(),
                response as unknown as vscode.ChatResponseStream,
                new vscode.CancellationTokenSource().token,
            );

            expect(response.markdown).toHaveBeenCalled();
            const written: string = response.markdown.mock.calls.map((c: unknown[]) => c[0]).join('');
            expect(written).toContain('test-project');
        });

        it('reads CLAUDE.md from the project path', async () => {
            const handle = makeMockChatParticipant();
            const project = makeProject();
            const projectResolver = jest.fn().mockResolvedValue(project);
            (fsPromises.readFile as jest.Mock).mockResolvedValue('# context');

            registerChatParticipant(makeExtensionContext(), projectResolver);

            await handle.handler(
                makeRequest(),
                makeChatContext(),
                makeResponse() as unknown as vscode.ChatResponseStream,
                new vscode.CancellationTokenSource().token,
            );

            expect(fsPromises.readFile).toHaveBeenCalledWith(
                expect.stringContaining('CLAUDE.md'),
                'utf-8',
            );
            const readPath = (fsPromises.readFile as jest.Mock).mock.calls[0][0] as string;
            expect(readPath).toContain(project.path);
        });

        it('writes a no-project message when project resolver returns null', async () => {
            const handle = makeMockChatParticipant();
            const projectResolver = jest.fn().mockResolvedValue(null);

            registerChatParticipant(makeExtensionContext(), projectResolver);

            const response = makeResponse();
            await handle.handler(
                makeRequest(),
                makeChatContext(),
                response as unknown as vscode.ChatResponseStream,
                new vscode.CancellationTokenSource().token,
            );

            expect(response.markdown).toHaveBeenCalled();
            const written: string = response.markdown.mock.calls.map((c: unknown[]) => c[0]).join('');
            expect(written).toMatch(/no demo builder project|no project/i);
        });

        it('writes a fallback message when CLAUDE.md cannot be read', async () => {
            const handle = makeMockChatParticipant();
            const project = makeProject();
            const projectResolver = jest.fn().mockResolvedValue(project);
            (fsPromises.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));

            registerChatParticipant(makeExtensionContext(), projectResolver);

            const response = makeResponse();
            await handle.handler(
                makeRequest(),
                makeChatContext(),
                response as unknown as vscode.ChatResponseStream,
                new vscode.CancellationTokenSource().token,
            );

            expect(response.markdown).toHaveBeenCalled();
            const written: string = response.markdown.mock.calls.map((c: unknown[]) => c[0]).join('');
            expect(written).toMatch(/regenerate ai files|project context|claude\.md/i);
        });
    });
});
