/**
 * The human doors for saving a blank-starter app to its own GitHub repository,
 * and for undoing it (AB-1c). Each asks, confirms in a modal that names the
 * public repository or the delete, then calls the dialog-free core in
 * `appRepoPromotion.ts` and saves the project. The card sends these without
 * waiting for an answer, so each door also SAYS its outcome in a notification;
 * the card itself refreshes through the component snapshot push.
 *
 * Creating and deleting a repository are cloud operations on the SC's own
 * account, so neither runs without the modal's yes — and an agent never reaches
 * these doors (no MCP tool yet; see the plan's walkthrough queue).
 *
 * @module features/dashboard/handlers/appBuilderComponentPromote
 */

import * as vscode from 'vscode';
import { resolveComponentTarget } from './appBuilderComponentOperation';
import { postComponentsSnapshot } from './appBuilderComponentPush';
import { getAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import { normalizeRepositoryName } from '@/core/validation/normalizers';
import { withOperationProgress } from '@/core/vscode/withOperationProgress';
import {
    collectAppFiles,
    promoteApp,
    promotionRefusal,
    unpromoteApp,
    unpromotionRefusal,
    type AppFiles,
    type PromotionDeps,
} from '@/features/app-builder/services/appRepoPromotion';
import { getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';

export const CREATE_REPOSITORY = 'Create repository';
export const DELETE_REPOSITORY = 'Delete repository';

function promotionDeps(context: HandlerContext): PromotionDeps {
    const { repoOperations, fileOperations } = getGitHubServices(context.context.secrets);
    return { repoOps: repoOperations, fileOps: fileOperations, logger: context.logger };
}

function cancelled(): HandlerResponse {
    return { success: true, cancelled: true };
}

/** A refusal, said in a notification too: nobody is waiting on the answer. */
function refuse(error: string): HandlerResponse {
    void vscode.window.showErrorMessage(error);
    return { success: false, error, code: ErrorCode.INVALID_OPERATION };
}

/** A failure the SC is told about, with the reason, and returned. */
function failed(context: HandlerContext, sentence: string, error: unknown): HandlerResponse {
    const message = (error as Error).message;
    context.logger.warn(`[Promote] ${sentence}: ${message}`);
    void vscode.window.showErrorMessage(`${sentence}: ${message}`);
    return { success: false, error: message };
}

/** The SC's own account first, then each organisation; undefined when cancelled. */
async function pickOwner(
    context: HandlerContext,
    login: string,
): Promise<{ owner?: string } | undefined> {
    const orgs = await getGitHubServices(context.context.secrets).tokenService.getUserOrgs();
    if (orgs.length === 0) return {};
    const picked = await vscode.window.showQuickPick(
        [
            { label: login, description: 'Your account' },
            ...orgs.map((org) => ({ label: org, description: 'Organisation' })),
        ],
        { title: 'Where should the repository live?', ignoreFocusOut: true },
    );
    if (!picked) return undefined;
    return picked.label === login ? {} : { owner: picked.label };
}

async function askRepoName(suggested: string): Promise<string | undefined> {
    const raw = await vscode.window.showInputBox({
        title: 'Name the new repository',
        value: suggested,
        ignoreFocusOut: true,
        validateInput: (value) =>
            normalizeRepositoryName(value) ? undefined : 'Enter a repository name.',
    });
    return raw === undefined ? undefined : normalizeRepositoryName(raw);
}

/** The modal: the public repository by name, what goes, what is left out, the undo. */
async function confirmCreate(fullName: string, name: string, app: AppFiles): Promise<boolean> {
    const choice = await vscode.window.showWarningMessage(
        `Create the public GitHub repository ${fullName}?`,
        {
            modal: true,
            detail:
                `Demo Builder pushes ${app.files.size} files of "${name}" as one commit. ` +
                `${app.leftOut} are left out: secret files (.env), the Adobe workspace file ` +
                '(.aio), build output, and whatever its .gitignore lists. Anyone can see a ' +
                'public repository. Projects you export from now on carry this repository, so ' +
                'whoever imports them gets the app. To undo, choose "Delete its GitHub ' +
                'repository" on its card.',
        },
        CREATE_REPOSITORY,
    );
    return choice === CREATE_REPOSITORY;
}

/** The signed-in GitHub login, or undefined when there is no usable sign-in. */
async function gitHubLogin(context: HandlerContext): Promise<string | undefined> {
    const { tokenService } = getGitHubServices(context.context.secrets);
    const validation = await tokenService.validateToken();
    return validation.valid ? validation.user?.login : undefined;
}

/**
 * Handle 'promoteAppBuilderComponent' — save a blank-starter app to a new public
 * repository. Asks where and what to call it, confirms with the file count, then
 * creates, pushes and records it.
 */
export const handlePromoteAppBuilderComponent: MessageHandler<{ id?: string }> = async (
    context,
    payload,
) => {
    const target = await resolveComponentTarget(context, payload?.id);
    if (!target.ok) return target.error;
    const { id, project } = target;
    const refusal = promotionRefusal(project, id);
    if (refusal) return refuse(refusal);
    const login = await gitHubLogin(context);
    if (!login) return refuse('Sign in to GitHub first, then save the app again.');

    const name = getAppBuilderComponent(project, id)?.name ?? id;
    const where = await pickOwner(context, login);
    if (!where) return cancelled();
    const repoName = await askRepoName(normalizeRepositoryName(name));
    if (!repoName) return cancelled();
    const app = await collectAppFiles(project.componentInstances?.[id]?.path ?? '');
    if (!(await confirmCreate(`${where.owner ?? login}/${repoName}`, name, app))) {
        return cancelled();
    }

    try {
        const saved = await withOperationProgress(
            { id, title: `Saving ${name} to GitHub`, inModal: false },
            async () => {
                const opts = { repoName, owner: where.owner, files: app.files };
                return {
                    success: true,
                    ...(await promoteApp(promotionDeps(context), project, id, opts)),
                };
            },
        );
        await context.stateManager.saveProject(project);
        await postComponentsSnapshot(context);
        void vscode.window.showInformationMessage(`"${name}" is saved to ${saved.url}.`);
        const { owner, repo, url, fileCount } = saved;
        return { success: true, repository: { owner, repo, url, fileCount } };
    } catch (error) {
        return failed(context, `Could not save "${name}" to GitHub`, error);
    }
};

/**
 * Handle 'unpromoteAppBuilderComponent' — the undo: delete the repository Demo
 * Builder made for this app and make it a blank-starter app again. The app's
 * folder is not touched.
 */
export const handleUnpromoteAppBuilderComponent: MessageHandler<{ id?: string }> = async (
    context,
    payload,
) => {
    const target = await resolveComponentTarget(context, payload?.id);
    if (!target.ok) return target.error;
    const { id, project } = target;
    const refusal = unpromotionRefusal(project, id);
    if (refusal) return refuse(refusal);

    const state = getAppBuilderComponent(project, id);
    const fullName = `${state?.source.owner}/${state?.source.repo}`;
    const choice = await vscode.window.showWarningMessage(
        `Delete ${fullName} from GitHub? This cannot be undone.`,
        {
            modal: true,
            detail:
                `Demo Builder created it when you saved "${state?.name ?? id}". The app on this ` +
                'computer stays as it is. Anything pushed to the repository since is deleted ' +
                'with it, and projects exported in the meantime point at a repository that ' +
                'will no longer exist.',
        },
        DELETE_REPOSITORY,
    );
    if (choice !== DELETE_REPOSITORY) return cancelled();

    try {
        await unpromoteApp(promotionDeps(context), project, id);
        await context.stateManager.saveProject(project);
        await postComponentsSnapshot(context);
        void vscode.window.showInformationMessage(`Deleted ${fullName}.`);
        return { success: true, deleted: fullName };
    } catch (error) {
        return failed(context, `Could not delete ${fullName}`, error);
    }
};
