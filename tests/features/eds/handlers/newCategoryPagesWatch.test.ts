/**
 * When the new-category watcher looks (EDS-27): when a project opens, on a timer while
 * it stays open, after a DA.live sign-in, and when the setting changes — and what it is
 * handed: the setting's real name, the open project only, and a notice that is a plain
 * VS Code message.
 *
 * The watcher itself is faked through the wiring's own seam (its behaviour is tested in
 * `newCategoryPagesWatcher.test.ts`); what is asserted here is WHEN `check` is called and
 * the ARGUMENTS the wiring hands to VS Code.
 */

import * as vscode from 'vscode';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { registerNewCategoryPagesWatch } from '@/features/eds/handlers/newCategoryPagesWatch';
import type { NewCategoryPagesWatcherDeps } from '@/features/eds/services/catalogMenu/newCategoryPagesWatcher';
import type { Project } from '@/types/base';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';

type Listener<T> = (value: T) => void;

function emitter<T>() {
    const listeners = new Set<Listener<T>>();
    return {
        event: (listener: Listener<T>) => {
            listeners.add(listener);
            return { dispose: () => listeners.delete(listener) };
        },
        fire: (value: T) => listeners.forEach((l) => l(value)),
        count: () => listeners.size,
    };
}

function start(current: Project | undefined = createMockProject({ path: '/projects/a' })) {
    const projectChanged = emitter<Project | undefined>();
    const signedIn = emitter<void>();
    const check = jest.fn().mockResolvedValue(undefined);
    let handed: NewCategoryPagesWatcherDeps | undefined;
    const stateManager = {
        onProjectChanged: projectChanged.event,
        getCurrentProject: jest.fn(async () => current),
        saveProject: jest.fn(async (_project: Project) => undefined),
    };
    const disposable = registerNewCategoryPagesWatch({
        stateManager,
        ctxFactory: () => createMockHandlerContext(),
        onDidSignIn: signedIn.event,
        logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
        makeWatcher: (deps) => {
            handed = deps;
            return { check, idle: async () => undefined };
        },
    });
    if (!handed) throw new Error('the watcher was not built');
    return { check, projectChanged, signedIn, stateManager, disposable, deps: handed };
}

describe('registerNewCategoryPagesWatch', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
    });
    afterEach(() => jest.useRealTimers());

    it('looks once at the start', () => {
        const { check } = start();

        expect(check).toHaveBeenCalledTimes(1);
    });

    it('looks again on the timer, at the named interval', () => {
        const { check } = start();

        jest.advanceTimersByTime(TIMEOUTS.NEW_CATEGORY_PAGES_CHECK_INTERVAL - 1);
        expect(check).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(1);
        expect(check).toHaveBeenCalledTimes(2);
    });

    it('looks when a different project opens, and not when the open one is merely saved', async () => {
        const { check, projectChanged } = start();
        // The wiring learns which project is open at the start from one async read.
        await Promise.resolve();
        await Promise.resolve();

        projectChanged.fire(createMockProject({ path: '/projects/a' }));
        projectChanged.fire(createMockProject({ path: '/projects/a' }));
        expect(check).toHaveBeenCalledTimes(1);

        projectChanged.fire(createMockProject({ path: '/projects/b' }));
        expect(check).toHaveBeenCalledTimes(2);

        projectChanged.fire(undefined);
        projectChanged.fire(createMockProject({ path: '/projects/b' }));
        expect(check).toHaveBeenCalledTimes(3);
    });

    it('looks after a DA.live sign-in', () => {
        const { check, signedIn } = start();

        signedIn.fire();

        expect(check).toHaveBeenCalledTimes(2);
    });

    it('looks when the setting changes, and ignores every other setting', () => {
        const { check } = start();
        const onChange = (vscode.workspace.onDidChangeConfiguration as jest.Mock).mock.calls[0][0];
        const affects = jest.fn((key: string) => key === 'demoBuilder.categoryPages.autoAdd');

        onChange({ affectsConfiguration: () => false });
        expect(check).toHaveBeenCalledTimes(1);
        onChange({ affectsConfiguration: affects });
        expect(affects).toHaveBeenCalledWith('demoBuilder.categoryPages.autoAdd');
        expect(check).toHaveBeenCalledTimes(2);
    });

    it('reads the setting by its real name, off unless it is set', () => {
        const get = jest.fn().mockReturnValue(true);
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({ get });
        const { deps } = start();

        expect(deps.autoAddByDefault()).toBe(true);
        expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('demoBuilder.categoryPages');
        expect(get).toHaveBeenCalledWith('autoAdd', false);
    });

    it('hands the watcher the open project only, and saves through the state manager', async () => {
        const project = createMockProject({ path: '/projects/a' });
        const { deps, stateManager } = start(project);

        expect(await deps.openProject()).toBe(project);
        await deps.save(project);
        expect(stateManager.saveProject).toHaveBeenCalledWith(project);
        // A project without an Edge Delivery storefront has no site to look at.
        expect(deps.siteFor(createMockProject())).toBeNull();
    });

    it('shows a notice as a plain VS Code message and answers the button pressed', async () => {
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Add pages');
        const { deps } = start();

        const choice = await deps.notify('2 new categories', 'Add pages', 'Always add for this project');

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            '2 new categories',
            'Add pages',
            'Always add for this project',
        );
        expect(choice).toBe('Add pages');
    });

    it('stops looking once disposed', () => {
        const { check, projectChanged, signedIn, disposable } = start();

        disposable.dispose();
        jest.advanceTimersByTime(TIMEOUTS.NEW_CATEGORY_PAGES_CHECK_INTERVAL * 2);
        signedIn.fire();
        projectChanged.fire(createMockProject({ path: '/projects/z' }));

        expect(check).toHaveBeenCalledTimes(1);
        expect(projectChanged.count()).toBe(0);
        expect(signedIn.count()).toBe(0);
    });
});
