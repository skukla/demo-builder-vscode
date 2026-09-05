/**
 * The module wall and the fake `WebviewView` a SidebarProvider suite needs.
 *
 * IMPORTING THIS FILE REGISTERS THE MOCKS. `jest.mock` hoists to the top of the
 * module it appears in, so these run when a suite imports this helper — but
 * only before the suite's own imports if this import comes FIRST.
 *
 * `BaseWebviewCommand` is mocked down to the one static the provider asks:
 * "is a webview panel already open?" decides whether resolving the sidebar
 * also opens the dashboard, and a real panel registry would make that answer
 * depend on whatever another suite left behind.
 */

jest.mock('@/features/lifecycle/services/lifecycleService', () => ({
    toggleLogsPanel: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/core/base/baseWebviewCommand', () => ({
    BaseWebviewCommand: { getActivePanelCount: jest.fn().mockReturnValue(0) },
}));

jest.mock('vscode', () => ({
    Uri: {
        file: jest.fn((p: string) => ({ fsPath: p, path: p, toString: () => p })),
        parse: jest.fn((s: string) => ({ fsPath: s, path: s, toString: () => s })),
        joinPath: jest.fn((base: { path: string }, ...paths: string[]) => {
            const joined = [base.path, ...paths].join('/');
            return { fsPath: joined, path: joined, toString: () => joined };
        }),
    },
    window: { registerWebviewViewProvider: jest.fn() },
    commands: { executeCommand: jest.fn().mockResolvedValue(undefined) },
    env: { openExternal: jest.fn().mockResolvedValue(true) },
    workspace: {
        getConfiguration: jest.fn().mockReturnValue({ get: jest.fn().mockReturnValue(true) }),
    },
    ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3 },
}));

import * as vscode from 'vscode';
import { SidebarProvider } from '@/features/sidebar/providers/sidebarProvider';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import {
    createMockExtensionContext,
    createStatefulGlobalState,
} from '../../../helpers/extensionContextFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

/** The fake `WebviewView` VS Code hands `resolveWebviewView`. */
export interface MockWebviewView {
    webview: {
        options: Record<string, unknown>;
        html: string;
        onDidReceiveMessage: jest.Mock;
        postMessage: jest.Mock;
        asWebviewUri: jest.Mock;
        cspSource: string;
    };
    onDidDispose: jest.Mock;
    onDidChangeVisibility: jest.Mock;
    visible: boolean;
    /** Set by `onDidReceiveMessage`; call it to deliver a webview message. */
    deliver?: (message: unknown) => Promise<void>;
    /** Set by `onDidDispose`. */
    fireDisposal?: () => void;
    /** Set by `onDidChangeVisibility`. */
    fireVisibilityChange?: () => void;
    /** The disposable the message listener handed back. */
    listenerDisposal: jest.Mock;
}

/**
 * A fresh view per call — each spec mutates `visible` and `html`, so a shared
 * one would leak state between them.
 */
export function createMockWebviewView(): MockWebviewView {
    const listenerDisposal = jest.fn();
    const view: MockWebviewView = {
        webview: {
            options: {},
            html: '',
            onDidReceiveMessage: jest.fn((handler: (m: unknown) => Promise<void>) => {
                view.deliver = handler;
                return { dispose: listenerDisposal };
            }),
            postMessage: jest.fn().mockResolvedValue(true),
            asWebviewUri: jest.fn((uri: unknown) => uri),
            cspSource: 'vscode-webview://sidebar',
        },
        onDidDispose: jest.fn((cb: () => void) => {
            view.fireDisposal = cb;
            return { dispose: jest.fn() };
        }),
        onDidChangeVisibility: jest.fn((cb: () => void) => {
            view.fireVisibilityChange = cb;
            return { dispose: jest.fn() };
        }),
        visible: true,
        listenerDisposal,
    };
    return view;
}

/** A provider wired to fakes, plus the fakes themselves. */
export function makeProvider(project: unknown = undefined) {
    const stateful = createStatefulGlobalState();
    const context = createMockExtensionContext(
        { globalState: stateful.globalState },
        '/mock/extension/path',
    );
    const stateManager = createMockStateManager({
        getCurrentProject: jest.fn().mockResolvedValue(project),
    });
    const logger = createMockLogger();
    return {
        provider: new SidebarProvider(context, stateManager, logger),
        context,
        stateManager,
        logger,
        globalStateStore: stateful.store,
    };
}

/** Resolve the view, as VS Code does when the sidebar is first shown. */
export function resolve(
    provider: SidebarProvider,
    view: MockWebviewView = createMockWebviewView(),
): MockWebviewView {
    provider.resolveWebviewView(
        view as unknown as vscode.WebviewView,
        {} as vscode.WebviewViewResolveContext,
        { isCancellationRequested: false } as vscode.CancellationToken,
    );
    return view;
}

/** Say whether a webview panel is already open, which gates the auto-open. */
export function setOpenPanelCount(count: number): void {
    (BaseWebviewCommand.getActivePanelCount as jest.Mock).mockReturnValue(count);
}

/** Every command the provider asked VS Code to run. */
export function executedCommands(): unknown[][] {
    return (vscode.commands.executeCommand as jest.Mock).mock.calls;
}
