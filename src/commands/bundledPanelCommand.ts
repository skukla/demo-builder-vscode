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
import { getBundleUri } from '@/core/utils/bundleUri';
import { getWebviewHTML } from '@/core/utils/getWebviewHTMLWithBundles';
import type { HandlerContext, SharedState } from '@/types/handlers';

export abstract class BundledPanelCommand<TInitialData> extends BaseWebviewCommand<TInitialData> {
    /** The `WEBVIEW_ENTRIES` key in `esbuild.config.js`. */
    protected abstract readonly bundleName: string;

    /**
     * True when the page loads local media from `dist/`, which needs a base URI.
     * Remote images load without one: getWebviewHTML already allows
     * [cspSource, https:, data:] in img-src.
     */
    protected readonly servesLocalMedia: boolean = false;

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
