/**
 * SyncStorefrontCommand
 *
 * Dashboard tile + command-palette entry that runs the same storefront sync
 * the Demo Builder MCP `sync_storefront` tool runs — both call into the
 * vscode-free `storefrontSyncService`.
 *
 * What this wrapper adds on top of the service:
 *   1. Token discovery via `GitHubTokenService` (the MCP path reads env vars
 *      instead, see `src/mcp-server.ts`).
 *   2. `withProgress` notification + `showInputBox` commit message prompt.
 *   3. Non-technical-user conflict resolution flow when `git push` is
 *      rejected AS NON-FAST-FORWARD: auto `git pull --rebase`; if rebase
 *      produces conflict markers, opens VS Code's Source Control view and
 *      polls via `PollingService.pollUntilCondition` until markers clear;
 *      cancel runs `git rebase --abort` programmatically. The user never sees
 *      a terminal — all merge-editor work happens in VS Code's built-in UI.
 *      A `ruleset` rejection is routed AROUND this flow and reported as
 *      itself; see the catch in `execute`.
 */

import * as childProcess from 'child_process';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { isManagedStorefrontFile } from './managedStorefrontFiles';
import { BaseCommand } from '@/core/base';
import { COMPONENT_IDS } from '@/core/constants';
import { PollingService } from '@/core/shell/pollingService';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { getDaLiveAuthService } from '@/features/eds/handlers/edsHelpers';
import { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';
import { HelixApiError } from '@/features/eds/services/helix/helixApiClient';
import {
    PushRejectedError,
    syncAndPublish,
    type SyncAndPublishResult,
} from '@/features/eds/services/storefront/storefrontSyncService';
import type { Project } from '@/types/base';

const execFile = promisify(childProcess.execFile);

/**
 * Matches `git`'s standard 3-way merge conflict markers. The regex is
 * intentionally lenient on the trailing portion of each marker so we still
 * detect markers when the file has trailing CRLF/whitespace.
 */
const CONFLICT_MARKER_RE = /^(<{7}|={7}|>{7})( |$)/m;

export class SyncStorefrontCommand extends BaseCommand {
    async execute(): Promise<void> {
        const project = await this.stateManager.getCurrentProject();
        if (!project) {
            await this.showWarning('No project loaded.');
            return;
        }

        const storefrontPath = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.path;
        if (!storefrontPath) {
            await this.showError(
                'This project does not have an EDS storefront — Sync Storefront only applies to EDS projects.',
            );
            return;
        }

        try {
            await fsPromises.stat(path.join(storefrontPath, '.git'));
        } catch {
            await this.showError(
                'Storefront repository not initialized. Re-create the project or run the EDS setup step.',
            );
            return;
        }

        const commitMessage = await this.showInputBox({
            prompt: 'Commit message',
            value: 'Demo Builder: sync local changes',
            placeHolder: 'Describe what changed',
        });
        if (!commitMessage) return; // user cancelled

        const tokenService = new GitHubTokenService(this.context.secrets, this.logger);
        const tokenEntry = await tokenService.getToken();
        const githubToken = tokenEntry?.token;
        const daLiveToken = await this.readDaLiveToken();
        const githubRepo = this.resolveGithubRepo(project);

        // Set when the push was refused by a repository rule. Reported after the
        // progress notification closes, for the same reason `reportSyncResult` is.
        let rulesetRejection: PushRejectedError | undefined;

        const result = await this.withProgress('Syncing storefront', async (progress) => {
            try {
                progress.report({ message: 'Committing changes…' });
                return await syncAndPublish({
                    storefrontPath,
                    commitMessage,
                    githubRepo,
                    githubToken,
                    daLiveToken,
                });
            } catch (err) {
                if (err instanceof PushRejectedError && err.reason === 'ruleset') {
                    // NOT the rebase flow. A rule violation — push protection
                    // finding a secret, most often — survives any rebase, and
                    // that flow's whole vocabulary is wrong for it: it opens by
                    // announcing "remote has new commits" when the remote never
                    // moved, then reports "push failed after resolving
                    // conflicts" for conflicts that never existed. The accurate
                    // diagnosis is already on the error, and it used to reach
                    // only the debug log, because `showError` displays its first
                    // argument and logs the second.
                    rulesetRejection = err;
                    return null;
                }
                if (err instanceof PushRejectedError) {
                    await this.handlePushRejected({
                        storefrontPath,
                        progress,
                        githubToken,
                        daLiveToken,
                        githubRepo,
                    });
                    return null; // the rebase path reports its own outcome
                }
                throw err;
            }
        });

        if (rulesetRejection) {
            await this.showError(rulesetRejection.message, rulesetRejection);
            return;
        }

        // Report the plain-sync outcome AFTER the progress notification closes.
        // `reportSyncResult` awaits a confirmation dialog ("…nothing to commit" /
        // "…synced", each with an OK/Open button); showing it inside `withProgress`
        // held the "Committing changes…" spinner open until the user dismissed it.
        if (result) {
            await this.reportSyncResult(result, project);
        }
    }

    /**
     * Auto-resolve a non-fast-forward push by running `git pull --rebase` in
     * the storefront. Three paths from here:
     *   - rebase is clean → retry push (and re-run Helix if applicable)
     *   - rebase has conflicts → guide the user through VS Code's Source
     *     Control + merge editor; poll until conflict markers clear; resume
     *   - user cancels (rejects the warning) → `git rebase --abort`
     */
    private async handlePushRejected(args: {
        storefrontPath: string;
        progress: vscode.Progress<{ message?: string }>;
        githubToken?: string;
        daLiveToken?: string;
        githubRepo?: { owner: string; site: string; branch?: string };
    }): Promise<void> {
        const { storefrontPath, progress, githubToken, daLiveToken, githubRepo } = args;

        progress.report({ message: 'Remote has new commits — pulling and rebasing…' });

        const rebaseOutcome = await this.attemptRebase(storefrontPath);
        if (rebaseOutcome === 'clean') {
            await this.completePushAfterRebase({
                storefrontPath,
                progress,
                githubToken,
                daLiveToken,
                githubRepo,
            });
            return;
        }

        // Classify the conflict set before prompting. When EVERY conflicted
        // file is one the EDS pipeline authoritatively owns (config.json,
        // fstab.yaml), silently take the remote copy — the user can't
        // meaningfully judge a machine-generated config merge, so don't ask.
        const conflictedRel = await this.listConflictedFilesRel(storefrontPath).catch(() => []);
        if (conflictedRel.length > 0 && conflictedRel.every(isManagedStorefrontFile)) {
            const ok = await this.autoResolveManagedConflicts(storefrontPath, conflictedRel);
            if (ok) {
                await this.completePushAfterRebase({
                    storefrontPath,
                    progress,
                    githubToken,
                    daLiveToken,
                    githubRepo,
                    autoResolvedManaged: true,
                });
                return;
            }
            await this.showError(
                'Could not automatically resolve the configuration update. Your local changes are intact.',
            );
            return;
        }

        // Conflict path — open Source Control, poll until clear, decide based on user action.
        const action = await vscode.window.showWarningMessage(
            'Demo Builder pulled the latest changes and found conflicts that need your input. ' +
                'Resolve each conflict in the Source Control panel (Accept Current / Incoming / Both buttons), ' +
                'then click Continue. Cancel undoes the pull and leaves your storefront exactly as it was.',
            { modal: true },
            'Continue',
            'Cancel and Reset',
        );

        if (action !== 'Continue') {
            await this.safeAbortRebase(storefrontPath);
            await this.showInfo('Sync canceled. Your local changes are intact.');
            return;
        }

        progress.report({ message: 'Waiting for conflict resolution in Source Control…' });
        await this.revealStorefrontConflicts(storefrontPath);

        try {
            const polling = new PollingService();
            await polling.pollUntilCondition(() => this.areAllConflictsResolved(storefrontPath), {
                timeout: TIMEOUTS.VERY_LONG,
                name: 'storefront-conflict-resolution',
                initialDelay: TIMEOUTS.POLL.INITIAL,
                maxDelay: TIMEOUTS.POLL.MAX,
            });
        } catch (err) {
            await this.safeAbortRebase(storefrontPath);
            await this.showError(
                'Timed out waiting for conflict resolution. Your local changes are intact. Try Sync Storefront again when ready.',
                err instanceof Error ? err : undefined,
            );
            return;
        }

        progress.report({ message: 'Continuing rebase…' });
        try {
            await execFile('git', ['-C', storefrontPath, 'rebase', '--continue']);
        } catch (err) {
            await this.safeAbortRebase(storefrontPath);
            await this.showError(
                'Could not continue the rebase. Your local changes are intact.',
                err instanceof Error ? err : undefined,
            );
            return;
        }

        await this.completePushAfterRebase({
            storefrontPath,
            progress,
            githubToken,
            daLiveToken,
            githubRepo,
        });
    }

    /**
     * Silently resolve a rebase whose ONLY conflicts are managed files by taking
     * the authoritative REMOTE copy of each and continuing the rebase.
     *
     * ⚠️ `git pull --rebase` replays your LOCAL commits ONTO upstream, so during
     * the rebase `--ours` is the upstream/REMOTE copy and `--theirs` is your
     * local change. "Take the remote copy" is therefore `checkout --ours` — NOT
     * `--theirs`. This is the single highest-risk line in the feature.
     *
     * Returns true on success. On any failure the rebase is aborted (leaving the
     * user's local branch exactly as it was) and false is returned.
     */
    private async autoResolveManagedConflicts(
        storefrontPath: string,
        relFiles: string[],
    ): Promise<boolean> {
        try {
            for (const rel of relFiles) {
                await execFile('git', ['-C', storefrontPath, 'checkout', '--ours', '--', rel]);
                await execFile('git', ['-C', storefrontPath, 'add', '--', rel]);
            }

            // Advance the rebase. Taking --ours can empty the replayed commit
            // (local change === remote), which makes `rebase --continue` refuse
            // with a "no changes / did you forget to use git add?" message; in
            // that case the correct move is to skip the now-empty commit. Pass
            // `core.editor=true` so git never opens an interactive editor.
            try {
                await execFile('git', [
                    '-C',
                    storefrontPath,
                    '-c',
                    'core.editor=true',
                    'rebase',
                    '--continue',
                ]);
            } catch (err) {
                const stderr = (err as NodeJS.ErrnoException & { stderr?: string }).stderr ?? '';
                const stdout = (err as NodeJS.ErrnoException & { stdout?: string }).stdout ?? '';
                if (/no changes|nothing to commit|did you forget/i.test(stderr + stdout)) {
                    await execFile('git', [
                        '-C',
                        storefrontPath,
                        '-c',
                        'core.editor=true',
                        'rebase',
                        '--skip',
                    ]);
                } else {
                    throw err;
                }
            }

            this.logger.debug(
                '[SyncStorefront] Auto-resolved managed conflicts (took remote copy): ' +
                    relFiles.join(', '),
            );
            return true;
        } catch (err) {
            await this.safeAbortRebase(storefrontPath);
            this.logger.warn(
                '[SyncStorefront] Managed-conflict auto-resolve failed; aborted rebase',
                err instanceof Error ? err : undefined,
            );
            return false;
        }
    }

    private async completePushAfterRebase(args: {
        storefrontPath: string;
        progress: vscode.Progress<{ message?: string }>;
        githubToken?: string;
        daLiveToken?: string;
        githubRepo?: { owner: string; site: string; branch?: string };
        autoResolvedManaged?: boolean;
    }): Promise<void> {
        const {
            storefrontPath,
            progress,
            githubToken,
            daLiveToken,
            githubRepo,
            autoResolvedManaged,
        } = args;

        // Re-enter syncAndPublish with skipCommit:true so the rebase-resolved
        // commits push through the same code path as a fresh sync — token
        // injection, push semantics, and Helix preview+publish all stay in
        // one place. The rebase has already produced the commits we want to
        // push, so we skip the stage + commit phase.
        progress.report({ message: 'Pushing to GitHub…' });
        let result: SyncAndPublishResult;
        try {
            result = await syncAndPublish({
                storefrontPath,
                commitMessage: '', // unused when skipCommit:true
                githubToken,
                daLiveToken,
                githubRepo,
                skipCommit: true,
            });
        } catch (err) {
            if (err instanceof HelixApiError) {
                // Push succeeded; Helix preview/publish failed. The repo is in
                // a consistent state — surface the partial success as a warning.
                await this.showWarning(
                    'Pushed to GitHub but the Helix preview/publish step failed. Run Sync Storefront again or republish from the dashboard.',
                );
                this.logger.warn('[SyncStorefront] Helix step failed after successful push', err);
                return;
            }
            // PushRejectedError or GitOperationError — push itself failed.
            await this.showError(
                'Push failed after resolving conflicts. Your local changes are intact.',
                err instanceof Error ? err : undefined,
            );
            return;
        }

        if (result.helixPublished) {
            await this.showSuccessMessage(
                autoResolvedManaged
                    ? 'Storefront synced. Preview + live updated. Resolved a configuration update automatically.'
                    : 'Storefront synced. Preview + live updated.',
            );
            return;
        }
        // Pushed; Helix step was deliberately skipped (tokens or repo coordinates absent).
        await this.showSuccessMessage(
            autoResolvedManaged
                ? 'Storefront synced. Resolved a configuration update automatically.'
                : 'Storefront synced.',
        );
    }

    private async attemptRebase(storefrontPath: string): Promise<'clean' | 'conflicts'> {
        try {
            await execFile('git', ['-C', storefrontPath, 'pull', '--rebase']);
            return 'clean';
        } catch (err) {
            const stderr = (err as NodeJS.ErrnoException & { stderr?: string }).stderr ?? '';
            const stdout = (err as NodeJS.ErrnoException & { stdout?: string }).stdout ?? '';
            if (/conflict/i.test(stderr) || /conflict/i.test(stdout)) {
                return 'conflicts';
            }
            // Some other rebase failure — surface as conflicts to give the user
            // the Cancel-and-Reset escape hatch.
            this.logger.warn(
                '[SyncStorefront] git pull --rebase failed with non-conflict error; treating as conflict for user control',
                err instanceof Error ? err : undefined,
            );
            return 'conflicts';
        }
    }

    /**
     * Surface the storefront's merge conflicts in VS Code's UI.
     *
     * The storefront is an independent git repo nested several levels inside the
     * workspace folder (`<project>/components/eds-storefront`). VS Code's Source
     * Control panel does not auto-discover it, so the conflict prompt used to
     * send users to a panel that showed nothing. Register the repo with the
     * built-in Git extension, reveal the SCM view, and open each conflicted file
     * so the inline merge controls are right in front of the user.
     */
    private async revealStorefrontConflicts(storefrontPath: string): Promise<void> {
        try {
            await vscode.commands.executeCommand('git.openRepository', storefrontPath);
        } catch (err) {
            this.logger.warn(
                '[SyncStorefront] Could not register the storefront repo with Source Control; conflicts may not be visible there',
                err instanceof Error ? err : undefined,
            );
        }

        await vscode.commands.executeCommand('workbench.view.scm');

        let conflicted: string[] = [];
        try {
            conflicted = await this.listConflictedFiles(storefrontPath);
        } catch {
            conflicted = [];
        }
        for (const file of conflicted) {
            try {
                const doc = await vscode.workspace.openTextDocument(file);
                await vscode.window.showTextDocument(doc, { preview: false });
            } catch {
                // Best-effort: the SCM view still lists the file even if it won't open here.
            }
        }
    }

    /**
     * Absolute paths of files with unresolved merge conflicts in the storefront.
     * `git diff --name-only --diff-filter=U` lists exactly those files. Throws
     * on git failure so callers can decide how to interpret the error.
     */
    private async listConflictedFiles(storefrontPath: string): Promise<string[]> {
        const rel = await this.listConflictedFilesRel(storefrontPath);
        return rel.map((r) => path.resolve(storefrontPath, r));
    }

    /**
     * Raw REL paths of files with unresolved merge conflicts (as git reports
     * them, relative to the storefront root). Kept separate from
     * `listConflictedFiles` so managed-file classification can match on the
     * repo-relative path before it is resolved to an absolute path.
     */
    private async listConflictedFilesRel(storefrontPath: string): Promise<string[]> {
        const { stdout } = await execFile('git', [
            '-C',
            storefrontPath,
            'diff',
            '--name-only',
            '--diff-filter=U',
        ]);
        return stdout
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean);
    }

    private async areAllConflictsResolved(storefrontPath: string): Promise<boolean> {
        // When no files carry unresolved conflicts, the rebase can continue.
        // Belt-and-braces: also scan the listed files for marker text in case
        // `git status` lags behind on-disk edits.
        let files: string[];
        try {
            files = await this.listConflictedFiles(storefrontPath);
        } catch {
            return false;
        }
        if (files.length === 0) return true;

        for (const abs of files) {
            try {
                const content = await fsPromises.readFile(abs, 'utf-8');
                if (CONFLICT_MARKER_RE.test(content)) return false;
            } catch {
                // File deleted or unreadable; treat as unresolved.
                return false;
            }
        }
        return true;
    }

    private async safeAbortRebase(storefrontPath: string): Promise<void> {
        try {
            await execFile('git', ['-C', storefrontPath, 'rebase', '--abort']);
        } catch {
            // Either no rebase in progress or `git rebase --abort` failed; in
            // either case there's nothing more we can safely do here.
        }
    }

    private resolveGithubRepo(
        project: Project,
    ): { owner: string; site: string; branch?: string } | undefined {
        const meta = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata;
        const githubRepo = typeof meta?.githubRepo === 'string' ? meta.githubRepo : undefined;
        if (!githubRepo || !githubRepo.includes('/')) return undefined;
        const [owner, site] = githubRepo.split('/');
        const branch = typeof meta?.edsBranch === 'string' ? meta.edsBranch : undefined;
        return { owner, site, branch };
    }

    private async readDaLiveToken(): Promise<string | undefined> {
        // Source of truth is `DaLiveAuthService` — globalState-backed, with the
        // `~/.aem/da-token.json` helper cache as a fallback. It is NOT in
        // SecretStorage: this used to read a `demoBuilder.daLive.imsToken`
        // secret that nothing in the codebase ever wrote, so the Helix publish
        // leg silently skipped on every sync while the command still reported
        // "Storefront synced." Absent token = skip Helix, which the result
        // message reflects.
        try {
            return (await getDaLiveAuthService(this.context).getAccessToken()) ?? undefined;
        } catch {
            return undefined;
        }
    }

    private async reportSyncResult(result: SyncAndPublishResult, project: Project): Promise<void> {
        if (!result.committed && !result.pushed) {
            await this.showInfo('Storefront is already up to date — nothing to commit.');
            return;
        }
        const liveUrl = this.deriveLiveUrl(project);
        if (result.helixPublished && liveUrl) {
            const action = await vscode.window.showInformationMessage(
                `Storefront synced and published. View at ${liveUrl}`,
                'Open',
            );
            if (action === 'Open') {
                await vscode.env.openExternal(vscode.Uri.parse(liveUrl));
            }
            return;
        }
        if (result.helixPublished) {
            await this.showSuccessMessage('Storefront synced and published.');
            return;
        }
        await this.showSuccessMessage('Storefront synced.');
    }

    private deriveLiveUrl(project: Project): string | undefined {
        const meta = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata;
        return typeof meta?.liveUrl === 'string' ? meta.liveUrl : undefined;
    }
}
