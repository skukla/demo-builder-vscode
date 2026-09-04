/**
 * CreateProjectWebviewCommand — the three config files it reads, and what the
 * webview is handed when each one is missing, malformed, or fine.
 *
 * The wizard opens against `wizard-steps.json`, `defaults.json` and
 * `api-services.json`, all read off disk at construction or on first render.
 * Every one of them is tolerated when absent — the wizard still opens — so the
 * only way to tell a successful read from a swallowed failure is what reaches
 * `getInitialData`'s return value and the shared state handlers receive.
 */

import * as fs from 'fs';
import * as vscode from 'vscode';
import { StepLogger } from '@/core/logging/stepLogger';
import { CreateProjectWebviewCommand } from '@/features/project-creation/commands/createProject';
import type { Logger } from '@/types/logger';
import type { WizardStepDefinition } from '@/types/wizard';
import { internals } from '../../../helpers/commandInternals';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

// Factory mock keeping the real module: transitive deps destructure fs.promises
// at load time, so a bare auto-mock crashes the suite before any test runs.
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
}));
jest.mock('@/core/logging/debugLogger');
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({ isAuthenticated: jest.fn() })),
        getCommandExecutor: jest.fn(() => ({ execute: jest.fn() })),
    },
}));
jest.mock('@/features/prerequisites/services/PrerequisitesManager');

const VALID_STEPS: WizardStepDefinition[] = [
    { id: 'welcome', name: 'Welcome', enabled: true },
    { id: 'build-your-project', name: 'Build', enabled: true },
] as WizardStepDefinition[];

/** Serve each named file's content; anything not named does not exist. */
function serveFiles(files: Record<string, string>): void {
    (fs.existsSync as jest.Mock).mockImplementation((p: unknown) =>
        Object.keys(files).some((name) => String(p).endsWith(name))
    );
    (fs.readFileSync as jest.Mock).mockImplementation((p: unknown) => {
        const hit = Object.keys(files).find((name) => String(p).endsWith(name));
        if (!hit) throw new Error(`ENOENT: ${String(p)}`);
        return files[hit];
    });
}

function build(logger: Logger = createMockLogger()): CreateProjectWebviewCommand {
    return new CreateProjectWebviewCommand(
        createMockExtensionContext({}, '/mock/extension/path'),
        createMockStateManager(),
        logger
    );
}

describe('wizard-steps.json validation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue),
        });
    });

    /** The steps the webview is handed for this steps-file content. */
    async function stepsFor(json: string): Promise<unknown> {
        serveFiles({ 'wizard-steps.json': json });
        return (await internals(build()).getInitialData()).wizardSteps;
    }

    it('sends nothing when the steps file is not on disk', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(false);

        expect((await internals(build()).getInitialData()).wizardSteps).toBeNull();
    });

    it('does not read the file at all when it is not on disk', async () => {
        // The read would SUCCEED if it happened — only the existsSync guard
        // stops it, so a null result here is the guard doing its job.
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({ steps: VALID_STEPS }));

        expect((await internals(build()).getInitialData()).wizardSteps).toBeNull();
    });

    it('sends nothing when the file is not valid JSON', async () => {
        expect(await stepsFor('{ not json')).toBeNull();
    });

    it('sends nothing when the parsed file has no steps array', async () => {
        expect(await stepsFor(JSON.stringify({ steps: 'welcome' }))).toBeNull();
    });

    it('sends nothing when an entry is not an object', async () => {
        expect(await stepsFor(JSON.stringify({ steps: ['welcome'] }))).toBeNull();
    });

    it('sends nothing when an entry is null', async () => {
        expect(await stepsFor(JSON.stringify({ steps: [null] }))).toBeNull();
    });

    it('sends nothing when an entry has no id', async () => {
        expect(
            await stepsFor(JSON.stringify({ steps: [{ name: 'W', enabled: true }] }))
        ).toBeNull();
    });

    it('sends nothing when an entry id is not a string', async () => {
        const json = JSON.stringify({ steps: [{ id: 7, name: 'W', enabled: true }] });

        expect(await stepsFor(json)).toBeNull();
    });

    it('sends nothing when an entry has no name', async () => {
        expect(await stepsFor(JSON.stringify({ steps: [{ id: 'w', enabled: true }] }))).toBeNull();
    });

    it('sends nothing when an entry name is not a string', async () => {
        const json = JSON.stringify({ steps: [{ id: 'w', name: 7, enabled: true }] });

        expect(await stepsFor(json)).toBeNull();
    });

    it('sends nothing when the read itself throws', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockImplementation(() => {
            throw new Error('EACCES');
        });

        expect((await internals(build()).getInitialData()).wizardSteps).toBeNull();
    });

    it('sends every step through when they all carry id, name and enabled', async () => {
        expect(await stepsFor(JSON.stringify({ steps: VALID_STEPS }))).toEqual(VALID_STEPS);
    });

    it("keeps a disabled step — filtering is the webview's job, not this one's", async () => {
        const steps = [{ id: 'welcome', name: 'Welcome', enabled: false }];

        expect(await stepsFor(JSON.stringify({ steps }))).toEqual(steps);
    });
});

describe('the step logger it hands the wizard', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue),
        });
    });

    it('gives StepLogger the real step names so log lines can use them', async () => {
        const create = jest.spyOn(StepLogger, 'create');
        serveFiles({ 'wizard-steps.json': JSON.stringify({ steps: VALID_STEPS }) });
        const logger = createMockLogger();
        const command = build(logger);

        await internals(command).ensureStepLogger();

        expect(create).toHaveBeenCalledWith(
            logger,
            VALID_STEPS,
            '/mock/extension/path/src/core/logging/config/logging.json'
        );
        create.mockRestore();
    });

    it('gives StepLogger no steps at all when the file cannot be read', async () => {
        const create = jest.spyOn(StepLogger, 'create');
        (fs.existsSync as jest.Mock).mockReturnValue(false);

        await internals(build()).ensureStepLogger();

        expect(create.mock.calls[0][1]).toBeUndefined();
        create.mockRestore();
    });

    it('builds the step logger once and reuses it', async () => {
        const create = jest.spyOn(StepLogger, 'create');
        serveFiles({ 'wizard-steps.json': JSON.stringify({ steps: VALID_STEPS }) });
        const command = build();

        const first = await internals(command).ensureStepLogger();
        const second = await internals(command).ensureStepLogger();

        expect(second).toBe(first);
        expect(create).toHaveBeenCalledTimes(1);
        create.mockRestore();
    });

    it('shares one in-flight initialization between concurrent callers', async () => {
        const create = jest.spyOn(StepLogger, 'create');
        serveFiles({ 'wizard-steps.json': JSON.stringify({ steps: VALID_STEPS }) });
        const command = build();

        const [first, second] = await Promise.all([
            internals(command).ensureStepLogger(),
            internals(command).ensureStepLogger(),
        ]);

        expect(second).toBe(first);
        expect(create).toHaveBeenCalledTimes(1);
        create.mockRestore();
    });
});

describe('defaults.json', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue),
        });
    });

    const SELECTION = {
        frontend: 'eds-storefront',
        backend: 'adobe-commerce-paas',
        dependencies: ['dep-a'],
    };

    it('sends the component selection it holds', async () => {
        serveFiles({ 'defaults.json': JSON.stringify({ componentSelection: SELECTION }) });

        const data = await internals(build()).getInitialData();

        expect(data.componentDefaults).toEqual(SELECTION);
    });

    it('sends no defaults when the file is not on disk', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(false);

        expect((await internals(build()).getInitialData()).componentDefaults).toBeNull();
    });

    it('sends no defaults when the file is not valid JSON', async () => {
        serveFiles({ 'defaults.json': '{ not json' });

        expect((await internals(build()).getInitialData()).componentDefaults).toBeNull();
    });

    it('sends no defaults when the read throws', async () => {
        (fs.existsSync as jest.Mock).mockImplementation((p: unknown) =>
            String(p).endsWith('defaults.json')
        );
        (fs.readFileSync as jest.Mock).mockImplementation(() => {
            throw new Error('EACCES');
        });

        expect((await internals(build()).getInitialData()).componentDefaults).toBeNull();
    });
});

describe('api-services.json, loaded once at construction', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('puts the parsed services on the shared state handlers receive', () => {
        serveFiles({ 'api-services.json': JSON.stringify({ catalog: { code: 'CS' } }) });

        expect(internals(build()).sharedState.apiServicesConfig).toEqual({
            catalog: { code: 'CS' },
        });
    });

    it('leaves the shared state without services when the file is absent', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(false);

        expect(internals(build()).sharedState.apiServicesConfig).toBeUndefined();
    });

    it('leaves the shared state without services when the file is not valid JSON', () => {
        serveFiles({ 'api-services.json': '{ not json' });

        expect(internals(build()).sharedState.apiServicesConfig).toBeUndefined();
    });

    it('opens the wizard anyway when the read throws', () => {
        (fs.existsSync as jest.Mock).mockImplementation((p: unknown) =>
            String(p).endsWith('api-services.json')
        );
        (fs.readFileSync as jest.Mock).mockImplementation(() => {
            throw new Error('EACCES');
        });

        expect(() => build()).not.toThrow();
        expect(internals(build()).sharedState.apiServicesConfig).toBeUndefined();
    });

    it('starts the session not authenticating', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(false);

        expect(internals(build()).sharedState.isAuthenticating).toBe(false);
    });
});

describe('the rest of what the webview opens with', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue),
        });
    });

    /** getInitialData for a command whose state manager holds `projects`. */
    async function dataWithProjects(projects: Array<{ name: string }>) {
        const stateManager = createMockStateManager();
        (stateManager.getAllProjects as jest.Mock).mockResolvedValue(projects);
        const command = new CreateProjectWebviewCommand(
            createMockExtensionContext({}, '/mock/extension/path'),
            stateManager,
            createMockLogger()
        );
        return internals(command).getInitialData();
    }

    it('sends the names of the projects that already exist, so a duplicate can be refused', async () => {
        const data = await dataWithProjects([{ name: 'acme' }, { name: 'bodea' }]);

        expect(data.existingProjectNames).toEqual(['acme', 'bodea']);
    });

    it('sends an empty name list when there are no projects yet', async () => {
        expect((await dataWithProjects([])).existingProjectNames).toEqual([]);
    });

    it('sends the dark theme when VS Code is in a dark colour scheme', async () => {
        (vscode.window as unknown as { activeColorTheme: { kind: number } }).activeColorTheme = {
            kind: vscode.ColorThemeKind.Dark,
        };

        expect((await internals(build()).getInitialData()).theme).toBe('dark');
    });

    it('sends the light theme for every other colour scheme', async () => {
        (vscode.window as unknown as { activeColorTheme: { kind: number } }).activeColorTheme = {
            kind: vscode.ColorThemeKind.Light,
        };

        expect((await internals(build()).getInitialData()).theme).toBe('light');
    });

    it('sends the first workspace folder path', async () => {
        (vscode.workspace as unknown as { workspaceFolders: unknown }).workspaceFolders = [
            { uri: { fsPath: '/work/demo' } },
        ];

        expect((await internals(build()).getInitialData()).workspacePath).toBe('/work/demo');
    });

    it('sends no workspace path when no folder is open', async () => {
        (vscode.workspace as unknown as { workspaceFolders: unknown }).workspaceFolders = undefined;

        expect((await internals(build()).getInitialData()).workspacePath).toBeUndefined();
    });

    it('sends the block-library settings, empty when neither has been set', async () => {
        const data = await internals(build()).getInitialData();

        expect(data.blockLibraryDefaults).toEqual([]);
        expect(data.customBlockLibraryDefaults).toEqual([]);
        expect(data.projectsViewMode).toBe('cards');
    });

    it('sends the block-library defaults the SC has saved', async () => {
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((key: string, defaultValue?: unknown) =>
                key === 'blockLibraries.defaults' ? ['isle5'] : defaultValue
            ),
        });

        expect((await internals(build()).getInitialData()).blockLibraryDefaults).toEqual(['isle5']);
    });
});
