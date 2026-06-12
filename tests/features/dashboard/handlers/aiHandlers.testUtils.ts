/**
 * aiHandlers test utilities
 *
 * Shared jest.mock setup, module re-exports, and context fixtures for the
 * aiHandlers suite, which is split into per-area files:
 *   - aiHandlers-setup.test.ts    (registration, verify, inspect, regenerate)
 *   - aiHandlers-launch.test.ts   (handleOpenInClaude, handleSaveAiPrompt)
 *   - aiHandlers-prompts.test.ts  (delete/list/pin-aware/scope flow)
 *   - aiHandlers-misc.test.ts     (copy, sessions, module-level prompt helpers)
 *
 * The jest.mock calls live here (hoisted above the re-exports) so every sibling
 * shares one mocked environment; the handlers + mocked collaborators are
 * re-exported so tests import them through this module after the mocks register.
 */

// Mock timeoutConfig before imports (transitive dependency)
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000,
        PREREQUISITE_CHECK: 10000,
        QUICK: 5000,
        UI: { MIN_LOADING: 800 },
        WEBVIEW_INIT_DELAY: 500,
        AUTH: { BROWSER: 60000 },
        WEBVIEW_TRANSITION: 3000,
    },
}));

// Mock BaseWebviewCommand to avoid pulling the whole webview infrastructure
jest.mock('@/core/base', () => ({
    BaseCommand: class {},
    BaseWebviewCommand: {
        startWebviewTransition: jest.fn().mockResolvedValue(undefined),
    },
}));

// Mock validateURL (transitive dependency)
jest.mock('@/core/validation', () => ({
    validateURL: jest.fn(),
}));

// Mock AI feature barrel
jest.mock('@/features/ai', () => ({
    verifyAiSetup: jest.fn(),
    inspectAllServers: jest.fn().mockResolvedValue([]),
    clearMcpCache: jest.fn(),
}));

// Mock AI context file generator
jest.mock('@/features/project-creation/services', () => ({
    generateAIContextFiles: jest.fn(),
    // Default: success — tests can override per-case via mockResolvedValueOnce.
    installAiDefaultsMcpTools: jest.fn().mockResolvedValue({ success: true }),
}));

// Mock vscode
jest.mock('vscode', () => ({
    env: {
        openExternal: jest.fn().mockResolvedValue(undefined),
        clipboard: {
            writeText: jest.fn().mockResolvedValue(undefined),
        },
    },
    Uri: {
        parse: jest.fn((url: string) => ({ toString: () => url })),
        file: jest.fn((p: string) => ({ fsPath: p, scheme: 'file' })),
    },
    commands: {
        executeCommand: jest.fn().mockResolvedValue(undefined),
    },
    extensions: {
        getExtension: jest.fn(),
    },
    window: {
        showInformationMessage: jest.fn().mockResolvedValue(undefined),
    },
    workspace: {
        workspaceFolders: undefined as { uri: { fsPath: string } }[] | undefined,
        getConfiguration: jest.fn(() => ({
            get: jest.fn((_key: string, fallback: unknown) => fallback),
        })),
    },
}));

// Re-export the module-under-test + mocked collaborators so siblings import
// them through this module (after the mocks above are registered).
export {
    aiHandlers,
    handleVerifyAiSetup,
    handleInspectMcp,
    handleRegenerateAiFiles,
    handleOpenInClaude,
    handleSaveAiPrompt,
    handleDeleteAiPrompt,
    handleListAiPrompts,
    handleCopyAiPrompt,
    GLOBAL_AI_PROMPTS_KEY,
    mergePromptsForRead,
    deleteAiPromptById,
    readMergedAiPrompts,
} from '@/features/dashboard/handlers/aiHandlers';
export { hasHandler, getRegisteredTypes } from '@/core/handlers/dispatchHandler';
export { clearMcpCache, inspectAllServers, verifyAiSetup } from '@/features/ai';
export { generateAIContextFiles, installAiDefaultsMcpTools } from '@/features/project-creation/services';
export type { HandlerContext } from '@/types/handlers';

import type { HandlerContext } from '@/types/handlers';

// ==========================================================
// Test Helpers
// ==========================================================

export function createMockContext(overrides?: Partial<HandlerContext>): HandlerContext {
    // Honor the (key, defaultValue) overload — matches the real VS Code Memento.
    // Bare jest.fn() returns undefined for ALL args, which breaks code that
    // relies on the default; this mock falls back to the supplied default when
    // the second arg is present.
    const memento = {
        get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue),
        update: jest.fn(),
        keys: jest.fn().mockReturnValue([]),
    };
    return {
        context: {
            extensionPath: '/mock/extension/path',
            secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn(), onDidChange: jest.fn() },
            globalState: memento,
            subscriptions: [],
        },
        logger: {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        },
        debugLogger: {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        },
        stateManager: {
            getCurrentProject: jest.fn().mockResolvedValue({
                name: 'Test Project',
                path: '/projects/test',
                stack: 'paas',
            }),
        },
        sendMessage: jest.fn().mockResolvedValue(undefined),
        panel: {
            dispose: jest.fn(),
        },
        sharedState: {},
        ...overrides,
    } as unknown as HandlerContext;
}

/**
 * Stateful Memento mock used by the global-pin-store tests. Behaves like the
 * real VS Code Memento: `update(key, val)` persists, subsequent `get(key)`
 * returns the persisted value. The bare `createMockContext` memento only
 * echoes the default — fine for handlers that don't touch globalState, but
 * useless for handlers that read what they just wrote.
 */
function makeStatefulMemento(initial: Record<string, unknown> = {}) {
    const store = new Map<string, unknown>(Object.entries(initial));
    return {
        get: jest.fn((key: string, defaultValue?: unknown) =>
            store.has(key) ? store.get(key) : defaultValue,
        ),
        update: jest.fn((key: string, value: unknown) => {
            if (value === undefined) {
                store.delete(key);
            } else {
                store.set(key, value);
            }
            return Promise.resolve();
        }),
        keys: jest.fn(() => Array.from(store.keys())),
        _store: store,
    };
}

/**
 * Build a context for handleSave/Delete/List with stateful globalState +
 * stateful saveProject. The returned `project` ref mutates in place so the
 * handler can observe its own prior writes within a single test (mirrors the
 * real StateManager behavior).
 */
export function makeScopedContext(opts: {
    projectPrompts?: unknown[];
    globalPrompts?: unknown[];
} = {}) {
    const project = {
        name: 'p',
        path: '/projects/p',
        aiPrompts: [...(opts.projectPrompts ?? [])] as unknown[],
    };
    const saveProject = jest.fn(async (next: { aiPrompts?: unknown[] }) => {
        project.aiPrompts = next.aiPrompts ?? [];
    });
    const memento = makeStatefulMemento({
        'demoBuilder.ai.globalPrompts': [...(opts.globalPrompts ?? [])],
    });
    const context = createMockContext({
        context: {
            extensionPath: '/mock/extension/path',
            secrets: {
                get: jest.fn(),
                store: jest.fn(),
                delete: jest.fn(),
                onDidChange: jest.fn(),
            },
            globalState: memento,
            subscriptions: [],
        } as unknown as HandlerContext['context'],
        stateManager: {
            getCurrentProject: jest.fn(async () => project),
            saveProject,
        } as unknown as HandlerContext['stateManager'],
    });
    return { context, project, saveProject, memento };
}
