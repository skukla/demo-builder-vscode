/**
 * Gives categories added after setup their pages while a project is open (EDS-27).
 *
 * Each look asks the catalog menu step which menu categories have no page
 * (`findNewCategoryPagesStep`, a read). What happens next depends on the setting
 * (`categoryPageAutoAdd.ts`):
 *
 * - **off** (the default): it OFFERS — "2 new categories … Add their pages?" — and writes
 *   nothing until the SC says yes. The same offer is not made twice.
 * - **on**: it adds and publishes them without asking, then says what it added, with a
 *   button that turns it off for this project.
 *
 * Either way the write is the step's add-only one (`addNewCategoryPagesStep`): no page is
 * rewritten or removed, and the nav is not touched.
 *
 * Only the OPEN project is looked at, and only while VS Code is open; when and how often
 * is the caller's business (`features/eds/handlers/newCategoryPagesWatch.ts`).
 *
 * When the look fails:
 * - a refused DA.live sign-in is one notice, then it waits for the next look. It never
 *   opens a browser, and it does not repeat the notice until a look has worked again;
 * - anything else is logged and nothing is offered. A failed read is never read as
 *   "every category is missing a page".
 *
 * Every dependency is handed in (ADR-015); there is no `vscode` here.
 *
 * @module features/eds/services/catalogMenu/newCategoryPagesWatcher
 */

import {
    addNewCategoryPagesStep,
    findNewCategoryPagesStep,
    type CatalogMenuSite,
    type NewCategory,
} from './catalogMenuStep';
import { resolveAutoAddCategoryPages, writeAutoAddOverride } from './categoryPageAutoAdd';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

export const ADD_PAGES = 'Add pages';
export const ALWAYS_FOR_PROJECT = 'Always add for this project';
export const STOP_FOR_PROJECT = 'Stop for this project';

export interface NewCategoryPagesWatcherDeps {
    /** The project open in Demo Builder, read fresh. */
    openProject(): Promise<Project | undefined>;
    /** The project's storefront, or null when it has none. */
    siteFor(project: Project): CatalogMenuSite | null;
    /** The `demoBuilder.categoryPages.autoAdd` setting, read live. */
    autoAddByDefault(): unknown;
    save(project: Project): Promise<void>;
    /** Show a notice; answers the button pressed, or undefined when it is dismissed. */
    notify(message: string, ...actions: string[]): Promise<string | undefined>;
    logger: Pick<Logger, 'info' | 'warn' | 'debug'>;
}

export interface NewCategoryPagesWatcher {
    /** Look once. Never throws; a look already waiting is not doubled. */
    check(): Promise<void>;
    /** Settles when no look, offer or write is in progress. */
    idle(): Promise<void>;
}

/** What has been said about the open project, so nothing is said twice. */
interface Said {
    path: string;
    offered?: string;
    signIn: boolean;
    failure?: string;
}

const LOG = '[Category Pages]';

function offerText(name: string, categories: NewCategory[]): string {
    const names = categories.map((c) => c.name).join(', ');
    return categories.length === 1
        ? `1 new category on "${name}" has no page yet (${names}). Add its page?`
        : `${categories.length} new categories on "${name}" have no page yet (${names}). Add their pages?`;
}

function signInText(name: string): string {
    return (
        `Demo Builder could not check "${name}" for new categories because your DA.live sign-in has expired. ` +
        'Sign in to DA.live and it will check again.'
    );
}

/**
 * @param deps - the open project, its storefront, the setting, the save and the notice
 * @returns the watcher
 */
export function createNewCategoryPagesWatcher(deps: NewCategoryPagesWatcherDeps): NewCategoryPagesWatcher {
    let said: Said = { path: '', signIn: false };
    let tail: Promise<void> = Promise.resolve();
    let lookWaiting = false;

    /** One thing at a time: a look and an answered offer never write side by side. */
    const enqueue = (job: () => Promise<void>): Promise<void> => {
        tail = tail.then(job).catch((error: unknown) => {
            deps.logger.warn(`${LOG} ${error instanceof Error ? error.message : String(error)}`);
        });
        return tail;
    };

    const nameOf = (project: Project): string => getProjectDisplayName(project);

    /** The project again, fresh, when it is still the open one. */
    async function stillOpen(path: string): Promise<{ project: Project; site: CatalogMenuSite } | undefined> {
        const project = await deps.openProject();
        if (!project || project.path !== path) return undefined;
        const site = deps.siteFor(project);
        return site ? { project, site } : undefined;
    }

    function tellSignIn(project: Project): void {
        if (said.signIn) return;
        said.signIn = true;
        void deps.notify(signInText(nameOf(project)));
    }

    async function stopForProject(path: string): Promise<void> {
        const open = await stillOpen(path);
        if (!open) return;
        writeAutoAddOverride(open.project, false);
        await deps.save(open.project);
        deps.logger.info(`${LOG} Automatic category pages turned off for ${open.project.name}`);
    }

    async function add(project: Project, site: CatalogMenuSite, unattended: boolean): Promise<void> {
        const result = await addNewCategoryPagesStep(project, site);
        if (result.added.length > 0) await deps.save(project);
        deps.logger.info(`${LOG} ${project.name}: ${result.summary}`);
        if (result.signIn) {
            tellSignIn(project);
            return;
        }
        const nothingNew = result.added.length === 0 && result.summary === said.failure;
        if (nothingNew) return;
        said.failure = result.added.length === 0 ? result.summary : undefined;
        const text = `${nameOf(project)}: ${result.summary}`;
        if (!unattended) {
            void deps.notify(text);
            return;
        }
        void deps.notify(text, STOP_FOR_PROJECT).then((choice) => {
            if (choice === STOP_FOR_PROJECT) void enqueue(() => stopForProject(project.path));
        });
    }

    async function answerOffer(path: string, choice: string | undefined): Promise<void> {
        if (choice !== ADD_PAGES && choice !== ALWAYS_FOR_PROJECT) return;
        const open = await stillOpen(path);
        if (!open) return;
        if (choice === ALWAYS_FOR_PROJECT) {
            writeAutoAddOverride(open.project, true);
            await deps.save(open.project);
        }
        await add(open.project, open.site, false);
    }

    function offer(project: Project, categories: NewCategory[]): void {
        const key = categories.map((c) => c.path).join('\n');
        if (said.offered === key) return;
        said.offered = key;
        // Not awaited: a notice can sit unanswered for hours, and looks must go on.
        void deps
            .notify(offerText(nameOf(project), categories), ADD_PAGES, ALWAYS_FOR_PROJECT)
            .then((choice) => enqueue(() => answerOffer(project.path, choice)));
    }

    async function look(): Promise<void> {
        const project = await deps.openProject();
        if (!project) return;
        if (project.path !== said.path) said = { path: project.path, signIn: false };
        const site = deps.siteFor(project);
        if (!site) return;

        const found = await findNewCategoryPagesStep(project, site);
        if (found.status === 'failed') {
            if (found.signIn) tellSignIn(project);
            else deps.logger.warn(`${LOG} Could not check ${project.name} for new categories: ${found.error}`);
            return;
        }
        said.signIn = false;
        if (found.status === 'nothing') {
            said.offered = undefined;
            return;
        }
        if (!resolveAutoAddCategoryPages(project, deps.autoAddByDefault())) {
            offer(project, found.categories);
            return;
        }
        // The one cloud write Demo Builder makes without asking at the time. Owner's
        // ruling, 2026-10-05 (CLAUDE.md property 5): an opt-in setting is the SC
        // confirming once, in advance — for ADD-ONLY category pages and nothing else.
        // It does not extend to edits, removals, or any other cloud write, which is why
        // the step called here can only add.
        await add(project, site, true);
    }

    return {
        check(): Promise<void> {
            if (lookWaiting) return tail;
            lookWaiting = true;
            return enqueue(async () => {
                lookWaiting = false;
                await look();
            });
        },
        async idle(): Promise<void> {
            // An answered notice queues its work a tick after the look that showed it.
            let seen: Promise<void> | undefined;
            while (seen !== tail) {
                seen = tail;
                await seen;
                await new Promise<void>((resolve) => setImmediate(resolve));
            }
        },
    };
}
