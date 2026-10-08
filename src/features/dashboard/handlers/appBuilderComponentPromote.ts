/**
 * The human doors for saving a blank-starter app to its own GitHub repository,
 * and for undoing it (AB-1c). Each asks, confirms in a modal that names the
 * public repository or the delete, then calls the dialog-free core in
 * `appRepoPromotion.ts` and saves the project. Saving, started from the card,
 * asks and narrates in the card's progress modal; the undo sends without waiting
 * for an answer, so it SAYS its outcome in a notification. The card itself
 * refreshes through the component snapshot push.
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
import { narrateOutcomeToModal, progressSurfaceOf } from '@/core/vscode/operationProgress';
import { askForDetailsDuringOperation, withModalAsking } from '@/core/vscode/operationPrompt';
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
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';
import type { OperationPromptField } from '@/types/webviewPayloads';

export const CREATE_REPOSITORY = 'Create repository';
export const DELETE_REPOSITORY = 'Delete repository';

function promotionDeps(context: HandlerContext): PromotionDeps {
    const { repoLifecycle, treeCommits } = getGitHubServices(context.context.secrets);
    return { repoOps: repoLifecycle, fileOps: treeCommits, logger: context.logger };
}

function cancelled(): HandlerResponse {
    return { success: true, cancelled: true };
}

/** How a door tells the SC: a notification, unless a modal is already saying it. */
type Say = (message: string) => void;

const notify: Say = (message) => void vscode.window.showErrorMessage(message);

/** A refusal, said in a notification too when nobody is waiting on the answer. */
function refuse(error: string, say: Say = notify): HandlerResponse {
    say(error);
    return { success: false, error, code: ErrorCode.INVALID_OPERATION };
}

/** A failure the SC is told about, with the reason, and returned. */
function failed(
    context: HandlerContext,
    sentence: string,
    error: unknown,
    say: Say = notify,
): HandlerResponse {
    const message = (error as Error).message;
    context.logger.warn(`[Promote] ${sentence}: ${message}`);
    say(`${sentence}: ${message}`);
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

/** What saving does, in full: what goes, what is left out, who sees it, the undo. */
function createDetail(name: string, app: AppFiles): string {
    return (
        `Demo Builder pushes ${app.files.size} files of "${name}" as one commit. ` +
        `${app.leftOut} are left out: secret files (.env), the Adobe workspace file ` +
        '(.aio), build output, and whatever its .gitignore lists. Anyone can see a ' +
        'public repository. Projects you export from now on carry this repository, so ' +
        'whoever imports them gets the app. To undo, choose "Delete its GitHub ' +
        'repository" on its card.'
    );
}

/** The modal: the public repository by name, what goes, what is left out, the undo. */
async function confirmCreate(fullName: string, name: string, app: AppFiles): Promise<boolean> {
    const choice = await vscode.window.showWarningMessage(
        `Create the public GitHub repository ${fullName}?`,
        { modal: true, detail: createDetail(name, app) },
        CREATE_REPOSITORY,
    );
    return choice === CREATE_REPOSITORY;
}

/** Where the repository goes and what it is called. */
interface RepositoryChoice {
    owner?: string;
    repoName: string;
}

/** Ask where and what to call it, then confirm: three dialogs at the top of the window. */
async function askInDialogs(
    context: HandlerContext,
    login: string,
    name: string,
    app: AppFiles,
): Promise<RepositoryChoice | undefined> {
    const where = await pickOwner(context, login);
    if (!where) return undefined;
    const repoName = await askRepoName(normalizeRepositoryName(name));
    if (!repoName) return undefined;
    const confirmed = await confirmCreate(`${where.owner ?? login}/${repoName}`, name, app);
    return confirmed ? { owner: where.owner, repoName } : undefined;
}

/**
 * The same three answers as one question in the card's progress modal: where,
 * what to call it, and the yes — the Create button IS the confirmation, under the
 * same sentence about what goes public.
 */
async function askInModal(
    context: HandlerContext,
    login: string,
    name: string,
    app: AppFiles,
): Promise<RepositoryChoice | undefined> {
    const orgs = await getGitHubServices(context.context.secrets).tokenService.getUserOrgs();
    let owner = login;
    let typed = normalizeRepositoryName(name);
    let problem: string | undefined;
    for (;;) {
        const ownerField: OperationPromptField = {
            id: 'owner',
            label: 'Where should the repository live?',
            kind: 'choice',
            value: owner,
            options: [
                { id: login, label: `${login} (your account)` },
                ...orgs.map((org) => ({ id: org, label: org })),
            ],
        };
        const asked = await askForDetailsDuringOperation({
            message: `Save "${name}" to a new public GitHub repository? ${createDetail(name, app)}`,
            fields: [
                ...(orgs.length > 0 ? [ownerField] : []),
                { id: 'name', label: 'Repository name', value: typed, description: problem },
            ],
            actions: [CREATE_REPOSITORY],
        });
        if (asked.action !== CREATE_REPOSITORY) return undefined;
        owner = asked.values.owner || owner;
        const repoName = normalizeRepositoryName(asked.values.name ?? '');
        if (repoName) return { owner: owner === login ? undefined : owner, repoName };
        typed = asked.values.name ?? '';
        problem = 'Enter a repository name.';
    }
}

/** The signed-in GitHub login, or undefined when there is no usable sign-in. */
async function gitHubLogin(context: HandlerContext): Promise<string | undefined> {
    const { tokenService } = getGitHubServices(context.context.secrets);
    const validation = await tokenService.validateToken();
    return validation.valid ? validation.user?.login : undefined;
}

/** What the card sends: the app, and whether its screen's modal narrates. */
export interface PromotePayload {
    id?: string;
    progress?: 'modal';
}

/**
 * Handle 'promoteAppBuilderComponent' — save a blank-starter app to a new public
 * repository. Asks where and what to call it, confirms with the file count, then
 * creates, pushes and records it. From the card, the asking and the narration are
 * the card's progress modal (picker-to-modal); otherwise dialogs and notifications.
 */
export const handlePromoteAppBuilderComponent: MessageHandler<PromotePayload> =
    narrateOutcomeToModal(
        async (context, payload) => {
            const inModal = progressSurfaceOf(payload) === 'modal';
            const target = await resolveComponentTarget(context, payload?.id);
            if (!target.ok) return target.error;
            const { id } = target;
            return inModal ? withModalAsking(id, () => promote(context, target, true)) : promote(context, target, false);
        },
        (payload) => payload?.id,
    );

async function promote(
    context: HandlerContext,
    { id, project }: { id: string; project: Project },
    inModal: boolean,
): Promise<HandlerResponse> {
    // The modal says a refusal or a failure itself; a notification would say it twice.
    const say = (message: string, kind: 'error' | 'info' = 'error'): void => {
        if (inModal) return;
        void (kind === 'error'
            ? vscode.window.showErrorMessage(message)
            : vscode.window.showInformationMessage(message));
    };
    const refusal = promotionRefusal(project, id);
    if (refusal) return refuse(refusal, say);
    const login = await gitHubLogin(context);
    if (!login) return refuse('Sign in to GitHub first, then save the app again.', say);

    const name = getAppBuilderComponent(project, id)?.name ?? id;
    const app = await collectAppFiles(project.componentInstances?.[id]?.path ?? '');
    const ask = inModal ? askInModal : askInDialogs;
    const choice = await ask(context, login, name, app);
    if (!choice) return cancelled();

    try {
        const saved = await withOperationProgress(
            { id, title: `Saving ${name} to GitHub`, inModal },
            async () => {
                const opts = { repoName: choice.repoName, owner: choice.owner, files: app.files };
                return {
                    success: true,
                    ...(await promoteApp(promotionDeps(context), project, id, opts)),
                };
            },
        );
        await context.stateManager.saveProject(project);
        await postComponentsSnapshot(context);
        say(`"${name}" is saved to ${saved.url}.`, 'info');
        const { owner, repo, url, fileCount } = saved;
        return { success: true, repository: { owner, repo, url, fileCount } };
    } catch (error) {
        return failed(context, `Could not save "${name}" to GitHub`, error, say);
    }
}

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
