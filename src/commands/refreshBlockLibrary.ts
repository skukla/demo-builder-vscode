/**
 * RefreshBlockLibraryCommand
 *
 * Dashboard kebab action (EDS-only) that re-syncs the DA.live authoring library
 * with the project's current `component-definition.json`. This is the destructive
 * full-rebuild path — for users who hand-edit `component-definition.json` outside
 * the AI promote flow and need the library to catch up.
 *
 * The command owns UX only — the progress notification and the success/error
 * toasts. The whole rebuild sequence (extract params → build services → run the
 * library-only pipeline → retry once on DA.live token expiry) lives in the
 * shared, UI-free `refreshBlockLibraryHeadless` core, which the
 * `refresh_block_library` MCP tool also calls.
 *
 * Runs in the extension host (uses vscode-coupled services), NOT the MCP server.
 */

import { BaseCommand } from '@/core/base/baseCommand';
import {
    refreshBlockLibraryHeadless,
    type RefreshBlockLibraryHeadlessDeps,
    type RefreshBlockLibraryHeadlessResult,
} from '@/features/eds/services/refreshBlockLibraryHeadless';

export class RefreshBlockLibraryCommand extends BaseCommand {
    /**
     * Helix seam, forwarded to the headless core. Production leaves it undefined and
     * the core builds the real service.
     *
     * It lives on the COMMAND because the command is this path's composition root —
     * the core takes no other collaborator from here. Without it the suite had to
     * `jest.mock` the Helix module purely so a construction it never asserts on would
     * not run (ADR-016's wall).
     */
    public helixService?: RefreshBlockLibraryHeadlessDeps['helixService'];

    public async execute(): Promise<void> {
        const project = await this.stateManager.getCurrentProject();
        if (!project) {
            await this.showWarning('No project loaded.');
            return;
        }

        // Run the shared, UI-free rebuild core inside the progress notification,
        // bridging its progress messages to the reporter. The result is captured
        // from the task (not withProgress's return) so it survives regardless.
        let result: RefreshBlockLibraryHeadlessResult = { success: false };
        await this.withProgress('Refreshing block library', async (progress) => {
            result = await refreshBlockLibraryHeadless({
                project,
                context: this.context,
                logger: this.logger,
                helixService: this.helixService,
                onProgress: (message) => progress.report({ message }),
            });
        });

        if (result.success) {
            await this.showSuccessMessage('Block library refreshed.');
            return;
        }
        // The user cancelled the mid-pipeline DA.live re-auth — no error toast.
        if (result.cancelled) {
            return;
        }
        await this.showError(`Failed to refresh block library: ${result.error || 'Unknown error'}`);
    }
}
