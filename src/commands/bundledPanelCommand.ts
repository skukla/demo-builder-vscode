/**
 * A panel whose page is one esbuild bundle — every webview command but the sidebar.
 *
 * Owns the two things each panel command used to paste for itself: the page HTML
 * around its bundle, and the handler context its messages are dispatched with.
 * Six panels carried a byte-identical `createHandlerContext` and eight a
 * near-identical `getWebviewContent` until PL-69 (2026-10-09).
 *
 * Lives in `commands/`, not on `BaseWebviewCommand` in `core/`: the context comes
 * from `createPanelHandlerContext`, which builds feature managers, and core must
 * not import features or commands.
 *
 * @module commands/bundledPanelCommand
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { createPanelHandlerContext } from '@/commands/handlerContextFactory';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { createWorkingProjectStateManager } from '@/core/state/workingProjectStateManager';
import { getBundleUri } from '@/core/utils/bundleUri';
import { getWebviewHTML } from '@/core/utils/getWebviewHTMLWithBundles';
import type { Project } from '@/types/base';
import type { HandlerContext, SharedState } from '@/types/handlers';
import type { StateManager } from '@/types/state';

export abstract class BundledPanelCommand<TInitialData> extends BaseWebviewCommand<TInitialData> {
    /** The `WEBVIEW_ENTRIES` key in `esbuild.config.js`. */
    protected abstract readonly bundleName: string;

    /**
     * True when the page loads local media from `dist/`, which needs a base URI.
     * Remote images load without one: getWebviewHTML already allows
     * [cspSource, https:, data:] in img-src.
     */
    protected readonly servesLocalMedia: boolean = false;

    /** The real manager, once `openForCurrentProject` has put the screen's view in its place. */
    private projectStateReal?: StateManager;
    /** The project this screen was last opened for. */
    private ownProjectPath?: string;

    /**
     * For a screen shown FOR one project: it acts on the project current NOW, and keeps
     * acting on it after the current project moves (AI-15). Call it first in `execute`:
     * from then on `this.stateManager`, and every handler context built from it, answers
     * for this project. On 2026-10-09 the Integrations screen showed JustRite while an
     * agent's create made a scratch project current, and its next add ran on the scratch.
     *
     * @param projectPath - the project to open for, when a screen named one (another
     *   screen's "Configure" button); anything else means the current project
     * @returns the project the screen is now for, or undefined when none is open
     */
    protected async openForCurrentProject(projectPath?: unknown): Promise<Project | undefined> {
        if (!this.projectStateReal) {
            this.projectStateReal = this.stateManager;
            this.stateManager = createWorkingProjectStateManager(this.projectStateReal, () => this.ownProjectPath);
        }
        const project = typeof projectPath === 'string' && projectPath
            ? ((await this.projectStateReal.loadProjectFromPath(projectPath, undefined, { persistAfterLoad: false })) ?? undefined)
            : await this.projectStateReal.getCurrentProject();
        this.ownProjectPath = project?.path;
        return project;
    }

    /** The screen's project moved folder (a rename): keep acting on it at its new path. */
    protected followOwnProject(newPath: string): void {
        if (this.projectStateReal) this.ownProjectPath = newPath;
    }

    /** The HTML `<title>`. The tab title is `getWebviewTitle()`; the wizard differs. */
    protected documentTitle(): string {
        return this.getWebviewTitle();
    }

    protected async getWebviewContent(): Promise<string> {
        if (!this.panel) {
            throw new Error('Panel must be created before getting webview content');
        }
        const scriptUri = getBundleUri({
            webview: this.panel.webview,
            extensionPath: this.context.extensionPath,
            featureBundleName: this.bundleName,
        });
        const nonce = this.getNonce();
        const baseUri = this.servesLocalMedia
            ? this.panel.webview.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, 'dist')))
            : undefined;

        return getWebviewHTML({
            scriptUri,
            nonce,
            cspSource: this.panel.webview.cspSource,
            title: this.documentTitle(),
            ...(baseUri ? { baseUri } : {}),
        });
    }

    /**
     * ONE complete context from the shared factory — no per-panel guessing about
     * which managers its (possibly reused) handlers will reach for.
     *
     * @param sharedState - by reference, so handler changes persist; the factory's
     *   fresh one when omitted
     */
    protected createHandlerContext(sharedState?: SharedState): HandlerContext {
        return createPanelHandlerContext({
            context: this.context,
            panel: this.panel,
            stateManager: this.stateManager,
            communicationManager: this.communicationManager,
            sendMessage: (type: string, data?: unknown) => this.sendMessage(type, data),
            ...(sharedState ? { sharedState } : {}),
        });
    }
}
