/**
 * VS Code Chat Participant
 *
 * Registers a 'demo-builder' chat participant that injects Demo Builder project
 * context (from .claude/CLAUDE.md) into each Claude Code chat session.
 *
 * Usage: @demo-builder how do I add a block to my storefront?
 *
 * The handler reads the active project's CLAUDE.md on every request so context
 * stays current without requiring extension restart.
 *
 * Phase 2 (future): extend the handler to support slash commands
 * (e.g., /sync, /preview) and stream MCP tool calls back to the chat.
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import type { Project } from '@/types/base';

export type ProjectResolver = () => Promise<Project | null>;

/**
 * Register the demo-builder chat participant.
 *
 * NOT WIRED UP — Phase 2 activation only.
 * Call this from extension.ts once Phase 2 ships. Exporting now lets the
 * feature index expose the type without triggering side effects.
 *
 * @param context  VS Code extension context (participant is added to subscriptions)
 * @param projectResolver  Returns the active Demo Builder project, or null if none
 */
export function registerChatParticipant(
    context: vscode.ExtensionContext,
    projectResolver: ProjectResolver,
): vscode.Disposable {
    const participant = vscode.chat.createChatParticipant('demo-builder', makeHandler(projectResolver));
    context.subscriptions.push(participant);
    return participant;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function makeHandler(
    projectResolver: ProjectResolver,
): vscode.ChatRequestHandler {
    return async (
        _request: vscode.ChatRequest,
        _context: vscode.ChatContext,
        response: vscode.ChatResponseStream,
        _token: vscode.CancellationToken,
    ): Promise<void> => {
        const project = await projectResolver();

        if (!project) {
            response.markdown(
                'No Demo Builder project found in this workspace.\n\n' +
                'Open a Demo Builder project folder, or create a new project via the Demo Builder sidebar.',
            );
            return;
        }

        const claudeMd = await readClaudeMd(project.path);
        response.markdown(claudeMd);
    };
}

async function readClaudeMd(projectPath: string): Promise<string> {
    const claudeMdPath = path.join(projectPath, '.claude', 'CLAUDE.md');
    try {
        return await fsPromises.readFile(claudeMdPath, 'utf-8');
    } catch {
        const safeName = path.basename(projectPath).replace(/[\n\r#]/g, '');
        return (
            `**Demo Builder project: ${safeName}**\n\n` +
            'Project context file (CLAUDE.md) not found. ' +
            'Run "Regenerate AI Files" from the Configure screen to create it.'
        );
    }
}
