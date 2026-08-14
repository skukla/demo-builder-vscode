/**
 * AI Surface Handlers
 *
 * Handler map for the standalone AI webview. Owns the AI-related message
 * routes plus the verify/regenerate handler implementations — the standalone
 * AI surface wires these up directly via `dispatchHandler`. The prompt CRUD
 * half lives in `aiPromptHandlers.ts` (extracted for the 500-line handler
 * cap) and is re-exported here so import sites are unchanged.
 *
 * @module features/dashboard/handlers/aiHandlers
 */

import * as path from 'path';
import * as vscode from 'vscode';
import {
    handleCopyAiPrompt,
    handleDeleteAiPrompt,
    handleListAiPrompts,
    handleSaveAiPrompt,
} from './aiPromptHandlers';
import { sanitizeErrorForLogging } from '@/core/validation';
import {
    clearMcpCache,
    verifyAiSetup,
    type AiVerificationResult,
} from '@/features/ai';
import {
    applicableMcpPackages,
    generateAIContextFiles,
    installAiDefaultsMcpTools,
    projectNeedsAppBuilderTooling,
} from '@/features/project-creation/services';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

// Prompt CRUD + merge helpers moved to aiPromptHandlers.ts; re-export so the
// existing import sites (dashboardHandlers, showPromptsPicker,
// defaultPromptsSeeder, tests) keep resolving through this module.
export {
    GLOBAL_AI_PROMPTS_KEY,
    deleteAiPromptById,
    handleCopyAiPrompt,
    handleDeleteAiPrompt,
    handleListAiPrompts,
    handleSaveAiPrompt,
    mergePromptsForRead,
    readMergedAiPrompts,
} from './aiPromptHandlers';

// ==========================================================
// Handlers
// ==========================================================

/**
 * Handle verify-ai-setup — run AI context file health checks.
 *
 * Reads projectPath from stateManager (not the webview payload) to prevent
 * a compromised webview from supplying an arbitrary filesystem path.
 */
export async function handleVerifyAiSetup(context: HandlerContext): Promise<HandlerResponse> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }
    // extensionDistPath is always server-side (prevent webview-supplied path traversal)
    const extensionDistPath = path.join(context.context.extensionPath, 'dist');

    context.logger.info(`[AI Verify] Verifying AI setup: ${project.path}`);
    // Recorded hashes (ADR-013) let the inventory flag user-edited bundle files
    // (`editedFiles`). Absent on pre-ADR projects → no false "edited" flags.
    const result = await verifyAiSetup(project.path, extensionDistPath, project.aiFileHashes);
    logAiVerification(context, result);

    return {
        success: true,
        ...result,
    };
}

/**
 * Surface the verification result on the established log channels. Observability
 * only — never throws, never alters the result. The per-MCP failure branch logs
 * the captured proxy stderr tail (`entry.error`), which is the decisive detail
 * when an MCP server fails to spawn.
 */
export function logAiVerification(context: HandlerContext, result: AiVerificationResult): void {
    const checksSummary = result.checks.map((c) => `${c.name}=${c.status}`).join(', ');
    context.debugLogger.debug(`[AI Verify] checks: ${checksSummary}`);

    // verifyAiSetup always populates inventory; guard anyway so this
    // observability-only helper can never throw and mask the real result.
    const inventory = result.inventory;
    if (!inventory) return;
    if (inventory.skillsError) {
        context.logger.warn(`[AI Verify] skills: inspection error: ${inventory.skillsError}`);
    } else {
        context.logger.info(`[AI Verify] skills: ${inventory.skills.length} found`);
    }

    for (const entry of inventory.mcps) {
        if (entry.status === 'ok') {
            context.debugLogger.debug(
                `[AI Verify] mcp ${entry.id}: ok (${entry.tools?.length ?? 0} tools)`,
            );
        } else {
            // Redact per line: `warn` bypasses the redactor, and a user-added
            // third-party server may echo a credential-bearing env to stderr on a
            // crash. Sanitize line-by-line (not the whole tail) because
            // sanitizeErrorForLogging keeps only the first line — mapping it over
            // each line preserves the multi-line socket/connect diagnostic.
            const safeError = (entry.error ?? '')
                .split('\n')
                .map((line) => sanitizeErrorForLogging(line))
                .join('\n');
            context.logger.warn(`[AI Verify] mcp ${entry.id}: ${entry.status}\n${safeError}`);
        }
    }
    if (inventory.mcpsError) {
        context.logger.warn(`[AI Verify] mcp inspection error: ${inventory.mcpsError}`);
    }

    const sessionSuffix = inventory.sessionMcpsError
        ? ` (error: ${inventory.sessionMcpsError})`
        : '';
    context.debugLogger.debug(
        `[AI Verify] session MCPs: ${inventory.sessionMcps.length}${sessionSuffix}`,
    );
}


/**
 * Handle openInClaude — dispatch Claude Code with optional prompt pre-fill.
 *
 * Thin pass-through to the `demoBuilder.openInClaude` command. In the
 * always-root home model that command launches the single home Chat at the
 * projects root (never a project subdir) — nothing anchors the workspace. This
 * handler simply forwards the (optional) prompt.
 */
export async function handleOpenInClaude(
    _context: HandlerContext,
    payload?: { prompt?: string },
): Promise<HandlerResponse> {
    const prompt = payload?.prompt;
    if (prompt) {
        await vscode.commands.executeCommand('demoBuilder.openInClaude', { prompt });
    } else {
        await vscode.commands.executeCommand('demoBuilder.openInClaude');
    }
    return { success: true };
}

/**
 * Handle regenerate-ai-files — re-generate AI context files for the project.
 *
 * For EDS projects this also runs the storefront install pipeline before
 * rewriting context files. That step (a) ensures the storefront's package.json
 * declares every ai-defaults MCP package as a devDep and (b) runs `npm install`
 * so they actually exist on disk under the storefront's node_modules. Without
 * it, projects created before a given MCP was added to ai-defaults.json end up
 * with a `.mcp.json` that references files that aren't there — the case that
 * surfaced as "playwright · MCP error -32000: Connection closed" in the
 * dashboard's AI Capabilities modal.
 *
 * Order is load-bearing: install runs first so the path `mcpConfigWriter`
 * later resolves to (under the storefront) is guaranteed to exist by the time
 * any verify re-spawns. Headless projects skip the install step entirely —
 * they have no storefront and the MCP entries that need it aren't wired.
 *
 * Clears the MCP inspector cache on success so the next verify re-spawns and
 * the modal flips from a stale failure to fresh inventory.
 */
export async function handleRegenerateAiFiles(context: HandlerContext): Promise<HandlerResponse> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    context.logger.info('[AI Verify] Regenerating AI files…');

    // Reuse the wizard's `creationProgress` channel so the AI Capabilities modal
    // can render per-step LoadingDisplay instead of a static spinner. Steps:
    //   1. Downloading AI tool packages        (App Builder-adjacent projects — the long pole)
    //   2. Writing AGENTS.md                   ┐
    //   3. Writing MCP configuration           │ emitted from generateAIContextFiles
    //   4. Writing skills                      ┘ via the onProgress tracker below
    //   5. Finalizing                          (clearMcpCache)
    const needsAiTooling = projectNeedsAppBuilderTooling(project);
    const totalSteps = needsAiTooling ? 5 : 4;
    let stepNumber = 0;
    const emit = (currentOperation: string, message?: string): void => {
        stepNumber++;
        const progress = Math.round((stepNumber / totalSteps) * 100);
        void context.sendMessage('creationProgress', {
            currentOperation,
            progress,
            message: message ?? '',
            logs: [],
        });
    };

    if (needsAiTooling) {
        // Name the ACTUAL packages so the long step says what it downloads
        // (requirement 5 of the tiered-refresh feature).
        const packages = applicableMcpPackages(project);
        emit(
            'Downloading AI tool packages',
            `Fetching ${packages.join(', ')} — can take up to a minute`,
        );
        // MCP tools install into the per-project isolated dir (keyed to
        // project.path), decoupled from the storefront manifest.
        const installResult = await installAiDefaultsMcpTools(project.path, project);
        if (!installResult.success) {
            return {
                success: false,
                error: `Failed to install AI tooling dependencies: ${installResult.error ?? 'unknown error'}`,
            };
        }
    }

    // Use server-side project.path — do not accept a webview-supplied path override.
    // Pass an onProgress tracker so the three writer steps surface in the same
    // creationProgress channel.
    const generated = await generateAIContextFiles(
        project.path,
        project,
        context.context.extensionPath,
        (currentOperation: string, _progress: number, message?: string) =>
            emit(currentOperation, message),
    );

    const skills = generated?.skills ?? [];
    context.logger.info(
        `[AI Verify] Regenerated ${skills.length} skill files: ${skills.join(', ')}`,
    );

    // ADR-013: a skipped file is an event, not silence — user-edited bundle
    // files were kept, and both the response and the log say which.
    const skippedFiles = generated?.report?.skipped ?? [];
    const removedFiles = generated?.report?.removed ?? [];
    if (skippedFiles.length > 0) {
        context.logger.info(
            `[AI Verify] Kept ${skippedFiles.length} user-edited file(s) (skipped): ` +
                skippedFiles.join(', '),
        );
    }

    // Persist the freshness stamp. generateAIContextFiles set
    // project.aiContextVersion = AI_CONTEXT_VERSION on the passed object; without
    // this save the manifest keeps the old stamp and the on-open freshness check
    // re-fires every open (both the dashboard button and the on-open heal use
    // this path). saveProjectConfigOnly writes the manifest without touching
    // currentProject or firing change events.
    await context.stateManager.saveProjectConfigOnly(project);

    emit('Finalizing', 'Refreshing AI capability inventory');
    // The .mcp.json may now point at newly-installed binaries (or the same
    // binaries via storefront-anchored absolute paths). Drop the inspector
    // cache so the next verify re-spawns from a clean slate.
    clearMcpCache();

    return { success: true, skippedFiles, removedFiles };
}

// ==========================================================
// Handler Map
// ==========================================================

export const aiHandlers = defineHandlers({
    'verify-ai-setup': handleVerifyAiSetup,
    'regenerate-ai-files': handleRegenerateAiFiles,
    openInClaude: handleOpenInClaude,
    'save-ai-prompt': handleSaveAiPrompt,
    'delete-ai-prompt': handleDeleteAiPrompt,
    'list-ai-prompts': handleListAiPrompts,
    copyAiPrompt: handleCopyAiPrompt,
});
