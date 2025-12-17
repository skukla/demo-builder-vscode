/**
 * WebviewPanelManager
 *
 * Centralized management of webview panels and their lifecycle.
 * Extracted from BaseWebviewCommand for SOP §10 compliance (god file reduction).
 *
 * Responsibilities:
 * - Track active webview panels (singleton pattern)
 * - Track active communication managers
 * - Manage webview transition state (prevents auto-welcome during transitions)
 * - Handle disposal callbacks
 */

import * as vscode from 'vscode';
import type { WebviewCommunicationManager } from '@/core/communication';
import { ExecutionLock, TIMEOUTS } from '@/core/utils';

/**
 * Singleton manager for webview panels
 */
export class WebviewPanelManager {
    // Track active webview panels and their communication managers by ID
    private static activePanels = new Map<string, vscode.WebviewPanel>();
    private static activeCommunicationManagers = new Map<string, WebviewCommunicationManager>();

    // Static callback for disposal notifications
    private static disposalCallback?: (webviewId: string) => Promise<void>;

    // Track when we're transitioning between webviews to prevent auto-welcome
    private static transitionLock = new ExecutionLock('WebviewTransition');
    private static transitionRelease: (() => void) | undefined;
    private static transitionTimeout?: NodeJS.Timeout;

    // ========================================================================
    // Disposal Callback
    // ========================================================================

    /**
     * Set callback to be invoked when any webview disposes
     * Used by extension.ts to handle auto-reopen logic centrally
     */
    public static setDisposalCallback(callback: (webviewId: string) => Promise<void>): void {
        WebviewPanelManager.disposalCallback = callback;
    }

    /**
     * Get the current disposal callback
     */
    public static getDisposalCallback(): ((webviewId: string) => Promise<void>) | undefined {
        return WebviewPanelManager.disposalCallback;
    }

    // ========================================================================
    // Webview Transition Management
    // ========================================================================

    /**
     * Start a webview transition (prevents auto-welcome during transition)
     */
    public static async startWebviewTransition(): Promise<void> {
        // Clear existing timeout if present (safety for double-start)
        if (WebviewPanelManager.transitionTimeout) {
            clearTimeout(WebviewPanelManager.transitionTimeout);
        }

        // Release existing lock if held
        if (WebviewPanelManager.transitionRelease) {
            WebviewPanelManager.transitionRelease();
            WebviewPanelManager.transitionRelease = undefined;
        }

        // Acquire lock
        WebviewPanelManager.transitionRelease = await WebviewPanelManager.transitionLock.acquire();

        // Auto-clear after 3 seconds (safety timeout)
        WebviewPanelManager.transitionTimeout = setTimeout(() => {
            WebviewPanelManager.endWebviewTransition();
        }, TIMEOUTS.WEBVIEW_TRANSITION);
    }

    /**
     * End a webview transition
     */
    public static endWebviewTransition(): void {
        // Clear timeout if present
        if (WebviewPanelManager.transitionTimeout) {
            clearTimeout(WebviewPanelManager.transitionTimeout);
            WebviewPanelManager.transitionTimeout = undefined;
        }

        // Release lock if held
        if (WebviewPanelManager.transitionRelease) {
            WebviewPanelManager.transitionRelease();
            WebviewPanelManager.transitionRelease = undefined;
        }
    }

    /**
     * Check if a webview transition is in progress
     */
    public static isWebviewTransitionInProgress(): boolean {
        return WebviewPanelManager.transitionLock.isLocked();
    }

    // ========================================================================
    // Panel Registry
    // ========================================================================

    /**
     * Get count of active webview panels
     */
    public static getActivePanelCount(): number {
        return WebviewPanelManager.activePanels.size;
    }

    /**
     * Get a specific active webview panel by ID
     */
    public static getActivePanel(webviewId: string): vscode.WebviewPanel | undefined {
        return WebviewPanelManager.activePanels.get(webviewId);
    }

    /**
     * Register a panel in the active panels map
     */
    public static registerPanel(webviewId: string, panel: vscode.WebviewPanel): void {
        WebviewPanelManager.activePanels.set(webviewId, panel);
    }

    /**
     * Unregister a panel from the active panels map
     */
    public static unregisterPanel(webviewId: string): void {
        WebviewPanelManager.activePanels.delete(webviewId);
    }

    /**
     * Dispose all active webview panels
     */
    public static disposeAllActivePanels(): void {
        WebviewPanelManager.activePanels.forEach((panel, _id) => {
            try {
                panel.dispose();
            } catch {
                // Ignore errors during disposal
            }
        });
        WebviewPanelManager.activePanels.clear();
        WebviewPanelManager.activeCommunicationManagers.clear();
    }

    // ========================================================================
    // Communication Manager Registry
    // ========================================================================

    /**
     * Get a specific active communication manager by ID
     */
    public static getActiveCommunicationManager(webviewId: string): WebviewCommunicationManager | undefined {
        return WebviewPanelManager.activeCommunicationManagers.get(webviewId);
    }

    /**
     * Register a communication manager
     */
    public static registerCommunicationManager(webviewId: string, comm: WebviewCommunicationManager): void {
        WebviewPanelManager.activeCommunicationManagers.set(webviewId, comm);
    }

    /**
     * Unregister a communication manager
     */
    public static unregisterCommunicationManager(webviewId: string): void {
        WebviewPanelManager.activeCommunicationManagers.delete(webviewId);
    }
}
