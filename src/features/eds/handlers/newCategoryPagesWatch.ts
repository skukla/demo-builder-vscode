/**
 * When Demo Builder looks for Commerce categories without pages (EDS-27), and the VS
 * Code side of that look: the setting, the notice, the timer.
 *
 * It looks at the OPEN project only — never every project on the machine:
 *
 * - once at the start, and whenever a different project opens;
 * - every {@link TIMEOUTS.NEW_CATEGORY_PAGES_CHECK_INTERVAL} while VS Code stays open;
 * - after a DA.live sign-in (a look that failed on an expired sign-in then works);
 * - when `demoBuilder.categoryPages.autoAdd` changes.
 *
 * What a look does — offer, or add when the SC has opted in — is
 * `services/catalogMenu/newCategoryPagesWatcher.ts`. Nothing here opens a browser.
 *
 * @module features/eds/handlers/newCategoryPagesWatch
 */

import * as vscode from 'vscode';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { catalogMenuSiteFor } from '@/features/ai/server/storefrontPages';
import {
    AUTO_ADD_SETTING_LEAF,
    AUTO_ADD_SETTING_SECTION,
} from '@/features/eds/services/catalogMenu/categoryPageAutoAdd';
import {
    createNewCategoryPagesWatcher,
    type NewCategoryPagesWatcher,
    type NewCategoryPagesWatcherDeps,
} from '@/features/eds/services/catalogMenu/newCategoryPagesWatcher';
import type { HandlerContext } from '@/types/handlers';
import type { StateManager } from '@/types/state';
import { isEdsProject } from '@/types/typeGuards';

/** Reads `demoBuilder.categoryPages.autoAdd`, live. Off unless it is set. */
export function readAutoAddCategoryPagesSetting(): boolean {
    return vscode.workspace
        .getConfiguration(AUTO_ADD_SETTING_SECTION)
        .get<boolean>(AUTO_ADD_SETTING_LEAF, false);
}

export interface NewCategoryPagesWatchDeps {
    stateManager: Pick<StateManager, 'onProjectChanged' | 'getCurrentProject' | 'saveProject'>;
    /** Builds the context whose sign-ins the look uses. */
    ctxFactory: () => HandlerContext;
    /** Fires when the SC signs in to DA.live. */
    onDidSignIn: (listener: () => void) => vscode.Disposable;
    logger: NewCategoryPagesWatcherDeps['logger'];
    /** Watcher seam; production builds the real one. */
    makeWatcher?: (deps: NewCategoryPagesWatcherDeps) => NewCategoryPagesWatcher;
}

/**
 * Start looking. The returned Disposable stops the timer and removes every subscription.
 *
 * @param deps - the state manager, the context factory, the sign-in event and the logger
 * @returns what stops it
 */
export function registerNewCategoryPagesWatch(deps: NewCategoryPagesWatchDeps): vscode.Disposable {
    const { stateManager } = deps;
    const watcher = (deps.makeWatcher ?? createNewCategoryPagesWatcher)({
        openProject: () => stateManager.getCurrentProject(),
        siteFor: (project) => (isEdsProject(project) ? catalogMenuSiteFor(deps.ctxFactory(), project) : null),
        autoAddByDefault: readAutoAddCategoryPagesSetting,
        save: (project) => stateManager.saveProject(project),
        notify: (message, ...actions) =>
            Promise.resolve(vscode.window.showInformationMessage(message, ...actions)),
        logger: deps.logger,
    });
    const look = (): void => void watcher.check();

    // `onProjectChanged` fires on every save; only a change of project is an opening.
    let openPath: string | undefined;
    const subscriptions = [
        stateManager.onProjectChanged((project) => {
            const opened = project !== undefined && project.path !== openPath;
            openPath = project?.path;
            if (opened) look();
        }),
        deps.onDidSignIn(look),
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration(`${AUTO_ADD_SETTING_SECTION}.${AUTO_ADD_SETTING_LEAF}`)) look();
        }),
    ];
    const timer = setInterval(look, TIMEOUTS.NEW_CATEGORY_PAGES_CHECK_INTERVAL);

    void stateManager.getCurrentProject().then((project) => {
        openPath ??= project?.path;
    });
    look();

    return {
        dispose: () => {
            clearInterval(timer);
            subscriptions.forEach((s) => s.dispose());
        },
    };
}
