/**
 * Sidebar Message Handlers
 *
 * Handles messages from the Sidebar webview.
 * Follows Pattern B: Returns response data (doesn't use sendMessage).
 */

import * as vscode from 'vscode';
import type { MessageHandler, HandlerContext, HandlerResponse } from '@/types/handlers';
import type { SidebarContext } from '../types';

/**
 * Handle navigation requests
 *
 * Executes the navigation command to switch screens.
 */
export const handleNavigate: MessageHandler = async (
    context: HandlerContext,
    payload?: unknown
): Promise<HandlerResponse> => {
    try {
        const typedPayload = payload as { target?: string } | undefined;
        if (!typedPayload?.target) {
            return {
                success: false,
                error: 'Navigation target is required',
            };
        }

        await vscode.commands.executeCommand('demoBuilder.navigate', {
            target: typedPayload.target,
        });

        context.logger.info(`Navigated to: ${typedPayload.target}`);
        return { success: true };
    } catch (error) {
        context.logger.error('Navigation failed', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Navigation failed',
        };
    }
};

/**
 * Get current sidebar context
 *
 * Returns the appropriate context based on current state.
 * Note: Wizard context is managed separately by the wizard command.
 */
export const handleGetContext: MessageHandler = async (
    context: HandlerContext
): Promise<HandlerResponse> => {
    try {
        // Check if project is selected
        const currentProject = await context.stateManager.getCurrentProject();
        if (currentProject) {
            const sidebarContext: SidebarContext = {
                type: 'project',
                project: currentProject,
            };
            return {
                success: true,
                data: { context: sidebarContext },
            };
        }

        // Default to projects list
        const sidebarContext: SidebarContext = { type: 'projects' };
        return {
            success: true,
            data: { context: sidebarContext },
        };
    } catch (error) {
        context.logger.error(
            'Failed to get sidebar context',
            error instanceof Error ? error : undefined
        );
        return {
            success: false,
            error: 'Failed to get sidebar context',
        };
    }
};

/**
 * Set sidebar context
 *
 * Used by external commands (like wizard) to update the sidebar display.
 * This is called via the SidebarProvider.updateContext() method, not directly.
 */
export const handleSetContext: MessageHandler = async (
    context: HandlerContext,
    payload?: unknown
): Promise<HandlerResponse> => {
    try {
        const typedPayload = payload as { context?: SidebarContext } | undefined;
        if (!typedPayload?.context) {
            return {
                success: false,
                error: 'Context is required',
            };
        }

        // Context updates are handled by the provider directly
        // This handler exists for message-based updates if needed
        context.logger.info(`Sidebar context set to: ${typedPayload.context.type}`);
        return { success: true };
    } catch (error) {
        context.logger.error(
            'Failed to set sidebar context',
            error instanceof Error ? error : undefined
        );
        return {
            success: false,
            error: 'Failed to set sidebar context',
        };
    }
};
