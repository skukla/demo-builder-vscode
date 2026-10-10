/**
 * ShowIntegrationsCommand: the page it opens and what it does.
 *
 * Its first suite (PL-69 sitting 3, 2026-10-09) covered only the page HTML and
 * scored 5.26% with 54 mutants no test reached. The rest arrived in sitting 4:
 * the panel's names, the init payload it seeds the grid with (from a project
 * and from none), the two handler maps it wires and the order it wires them in,
 * how it disposes a sibling's panel, and execute(). One file rather than a split
 * family, so there is no shared setup to keep in step.
 *
 * Collaborators are mocked at the module seam and their ARGUMENTS asserted,
 * so a wrong map, a wrong catalog filter or a wrong secret reader fails here.
 */

import * as vscode from 'vscode';
import { createPanelHandlerContext } from '@/commands/handlerContextFactory';
import { WebviewPanelManager } from '@/core/base/webviewPanelManager';
import { dispatchHandler, getRegisteredTypes } from '@/core/handlers/dispatchHandler';
import { resolveViewMode } from '@/core/state/viewModePreference';
import { loadProjectComponentSettings } from '@/features/app-builder/services/componentSettingSecrets';
import { getAvailableAppBuilderComponents } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { ShowIntegrationsCommand } from '@/features/dashboard/commands/showIntegrations';
import { settingsCatalogOf } from '@/features/dashboard/handlers/componentSettingsHandlers';
import { dashboardHandlers } from '@/features/dashboard/handlers/dashboardHandlers';
import { addIntegrationFlowHandlers } from '@/features/project-creation/handlers/addIntegrationFlowHandlers';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState, Project } from '@/types/base';
import type { IntegrationsInitialData } from '@/types/webviewPayloads';
import { internals } from '../../../helpers/commandInternals';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockWebviewPanel } from '../../../helpers/webviewPanelFake';

jest.mock('@/commands/handlerContextFactory', () => ({
    createPanelHandlerContext: jest.fn(),
}));
jest.mock('@/core/handlers/dispatchHandler', () => ({
    ...jest.requireActual('@/core/handlers/dispatchHandler'),
    dispatchHandler: jest.fn(),
}));
jest.mock('@/core/state/viewModePreference', () => ({
    resolveViewMode: jest.fn(),
}));
jest.mock('@/features/app-builder/services/componentSettingSecrets', () => ({
    loadProjectComponentSettings: jest.fn(),
}));
jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => ({
    getAvailableAppBuilderComponents: jest.fn(),
}));
jest.mock('@/features/dashboard/handlers/componentSettingsHandlers', () => ({
    settingsCatalogOf: jest.fn(),
}));

const WEBVIEW_ID = 'demoBuilder.integrations';

// Typed to the real interfaces, no casts: a field this suite invents fails
// typecheck:tests rather than passing a shape production never builds.
const SOURCE = { owner: 'skukla', repo: 'demo-erp', branch: 'main' };
const CATALOG: AppBuilderComponentCatalogEntry[] = [
    { id: 'demo-erp', name: 'Demo ERP', description: 'A mock ERP', kind: 'integration', source: SOURCE },
];
const SETTINGS_CATALOG: AppBuilderComponentCatalogEntry[] = [
    {
        id: 'demo-erp',
        name: 'Demo ERP (settings)',
        description: 'A mock ERP',
        kind: 'integration',
        source: SOURCE,
    },
];
const COMPONENT_SETTINGS: IntegrationsInitialData['componentSettings'] = {
    'demo-erp': { fields: [], connected: [] },
};
const INSTALLED: Record<string, AppBuilderComponentState> = {
    'demo-erp': {
        kind: 'integration',
        status: 'deployed',
        source: { owner: 'skukla', repo: 'demo-erp' },
    },
};

function liveProject(): Project {
    return createMockProject({
        name: 'acme-b2b',
        title: 'Acme B2B',
        componentSelections: { backend: 'adobe-commerce-saas', frontend: 'eds-storefront' },
        appBuilderComponents: INSTALLED,
        commerceStoreStructure: { websites: [], storeGroups: [], storeViews: [] },
        adobe: {
            organization: 'org-1',
            projectId: 'proj-1',
            projectTitle: 'Acme Project',
            workspace: 'ws-1',
            workspaceTitle: 'Stage',
        },
    });
}

function commandFor(project: Project | null) {
    const context = createMockExtensionContext();
    const stateManager = createMockStateManager({
        getCurrentProject: jest.fn().mockResolvedValue(project),
    });
    const command = new ShowIntegrationsCommand(context, stateManager, createMockLogger());
    return { command, context, stateManager };
}

function setTheme(kind: number): void {
    (vscode.window.activeColorTheme as { kind: number }).kind = kind;
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getAvailableAppBuilderComponents).mockReturnValue(CATALOG);
    jest.mocked(settingsCatalogOf).mockReturnValue(SETTINGS_CATALOG);
    jest.mocked(loadProjectComponentSettings).mockResolvedValue(COMPONENT_SETTINGS);
    jest.mocked(resolveViewMode).mockReturnValue('cards');
    setTheme(vscode.ColorThemeKind.Dark);
});

describe('the panel it names', () => {
    it('is the integrations webview, titled Integrations, loading as such', () => {
        const { command } = commandFor(null);
        expect(internals(command).getWebviewId()).toBe(WEBVIEW_ID);
        expect(internals(command).getWebviewTitle()).toBe('Integrations');
        expect(internals(command).getLoadingMessage()).toBe('Loading Integrations');
    });
});

describe('the page it opens', () => {
    it('is the integrations bundle, titled Integrations, with no local-media base URI', async () => {
        const { command } = commandFor(null);
        const panel = createMockWebviewPanel();
        internals(command).panel = panel;

        const html = await internals(command).getWebviewContent();

        expect(html).toContain('integrations-bundle.js');
        expect(html).toContain('<title>Integrations</title>');
        expect(panel.webview.asWebviewUri).toHaveBeenCalledTimes(1);
    });
});

describe('the init payload', () => {
    it('seeds the grid from the current project', async () => {
        const project = liveProject();
        const { command, context } = commandFor(project);

        const data = await internals(command).getInitialData<IntegrationsInitialData>();

        expect(data).toEqual<IntegrationsInitialData>({
            theme: 'dark',
            projectName: 'Acme B2B' as IntegrationsInitialData['projectName'],
            hasAdobeContext: true,
            appBuilderComponents: INSTALLED,
            commerceStoreStructure: project.commerceStoreStructure,
            appBuilderComponentCatalog: CATALOG,
            componentSettings: COMPONENT_SETTINGS,
            integrationsViewMode: 'cards',
            destination: { projectTitle: 'Acme Project', workspaceTitle: 'Stage' },
            adobeProjectId: 'proj-1',
            adobeWorkspaceId: 'ws-1',
            adobeOrgId: 'org-1',
        });
        // The catalog is filtered by the project's stack, the Settings are read
        // against the settings catalog with the extension's secret storage.
        expect(getAvailableAppBuilderComponents).toHaveBeenCalledWith(
            'adobe-commerce-saas',
            'eds-storefront',
        );
        expect(settingsCatalogOf).toHaveBeenCalledWith(project);
        expect(loadProjectComponentSettings).toHaveBeenCalledWith(
            project,
            SETTINGS_CATALOG,
            context.secrets,
        );
        expect(resolveViewMode).toHaveBeenCalledWith('integrations');
    });

    it('names the project by its slug when it has no title', async () => {
        const { command } = commandFor(createMockProject({ name: 'acme-b2b' }));
        const data = await internals(command).getInitialData<IntegrationsInitialData>();
        expect(data.projectName).toBe('acme-b2b');
    });

    it('follows the active colour theme', async () => {
        setTheme(vscode.ColorThemeKind.Light);
        const { command } = commandFor(null);
        const data = await internals(command).getInitialData<IntegrationsInitialData>();
        expect(data.theme).toBe('light');
    });

    it('seeds an empty grid when no project is current, reading no settings', async () => {
        const { command } = commandFor(null);

        const data = await internals(command).getInitialData<IntegrationsInitialData>();

        expect(data).toEqual<IntegrationsInitialData>({
            theme: 'dark',
            projectName: '' as IntegrationsInitialData['projectName'],
            hasAdobeContext: false,
            appBuilderComponents: undefined,
            commerceStoreStructure: undefined,
            appBuilderComponentCatalog: CATALOG,
            componentSettings: {},
            integrationsViewMode: 'cards',
            destination: { projectTitle: undefined, workspaceTitle: undefined },
            adobeProjectId: undefined,
            adobeWorkspaceId: undefined,
            adobeOrgId: undefined,
        });
        expect(getAvailableAppBuilderComponents).toHaveBeenCalledWith('', '');
        expect(loadProjectComponentSettings).not.toHaveBeenCalled();
        expect(settingsCatalogOf).not.toHaveBeenCalled();
    });

    it('copes with a project that has no Adobe block and no stack selections', async () => {
        // A manifest can hold as little as a name and a path. Every read off
        // `adobe` and `componentSelections` must tolerate the block being absent,
        // not just a field inside it.
        const bare = createMockProject({ adobe: undefined, componentSelections: undefined });
        const { command } = commandFor(bare);

        const data = await internals(command).getInitialData<IntegrationsInitialData>();

        expect(data.hasAdobeContext).toBe(false);
        expect(data.destination).toEqual({ projectTitle: undefined, workspaceTitle: undefined });
        expect(data.adobeProjectId).toBeUndefined();
        expect(data.adobeWorkspaceId).toBeUndefined();
        expect(data.adobeOrgId).toBeUndefined();
        expect(getAvailableAppBuilderComponents).toHaveBeenCalledWith('', '');
    });

    it('has no Adobe context when the project carries no org', async () => {
        const { command } = commandFor(createMockProject({ adobe: { projectId: 'proj-1' } }));
        const data = await internals(command).getInitialData<IntegrationsInitialData>();
        expect(data.hasAdobeContext).toBe(false);
        expect(data.adobeOrgId).toBeUndefined();
    });
});

describe('the handlers it wires', () => {
    const flowTypes = getRegisteredTypes(addIntegrationFlowHandlers);
    const gridTypes = getRegisteredTypes(dashboardHandlers);

    function wire() {
        const { command } = commandFor(null);
        const onStreaming = jest.fn();
        internals(command).initializeMessageHandlers({ onStreaming, on: jest.fn() });
        const registered = onStreaming.mock.calls.map(([type]) => type as string);
        const listenerFor = (type: string, nth: 'first' | 'last') => {
            const calls = onStreaming.mock.calls.filter(([t]) => t === type);
            const call = nth === 'first' ? calls[0] : calls[calls.length - 1];
            return call[1] as (data: unknown) => Promise<unknown>;
        };
        return { registered, listenerFor };
    }

    it('registers the add-integration flow first, then the whole dashboard map', () => {
        const { registered } = wire();
        expect(registered).toEqual([...flowTypes, ...gridTypes]);
    });

    it('the two maps overlap on switchOrg, so the dashboard variant is registered last', () => {
        expect(flowTypes).toContain('switchOrg');
        expect(gridTypes).toContain('switchOrg');
        const { registered } = wire();
        expect(registered.lastIndexOf('switchOrg')).toBeGreaterThan(flowTypes.length - 1);
    });

    it('dispatches a flow message into the flow map with a fresh panel context', async () => {
        const context = createMockHandlerContext();
        jest.mocked(createPanelHandlerContext).mockReturnValue(context);
        jest.mocked(dispatchHandler).mockResolvedValue({ success: true, data: 'apis' });
        const { listenerFor } = wire();

        const type = flowTypes[0];
        const answer = await listenerFor(type, 'first')({ orgId: 'org-1' });

        expect(answer).toEqual({ success: true, data: 'apis' });
        expect(dispatchHandler).toHaveBeenCalledWith(
            addIntegrationFlowHandlers,
            context,
            type,
            { orgId: 'org-1' },
        );
    });

    it('dispatches a grid message into the dashboard map, switchOrg included', async () => {
        const context = createMockHandlerContext();
        jest.mocked(createPanelHandlerContext).mockReturnValue(context);
        jest.mocked(dispatchHandler).mockResolvedValue({ success: true });
        const { listenerFor } = wire();

        await listenerFor('switchOrg', 'last')({ orgId: 'org-2' });

        expect(dispatchHandler).toHaveBeenCalledWith(
            dashboardHandlers,
            context,
            'switchOrg',
            { orgId: 'org-2' },
        );
    });
});

describe('disposeActivePanel', () => {
    afterEach(() => {
        WebviewPanelManager.unregisterPanel(WEBVIEW_ID);
    });

    it('disposes the live integrations panel', () => {
        const panel = createMockWebviewPanel();
        WebviewPanelManager.registerPanel(WEBVIEW_ID, panel);

        ShowIntegrationsCommand.disposeActivePanel();

        expect(panel.dispose).toHaveBeenCalledTimes(1);
    });

    it('swallows a panel that is already gone', () => {
        const panel = createMockWebviewPanel({
            dispose: jest.fn(() => {
                throw new Error('disposed');
            }),
        });
        WebviewPanelManager.registerPanel(WEBVIEW_ID, panel);

        expect(() => ShowIntegrationsCommand.disposeActivePanel()).not.toThrow();
        expect(panel.dispose).toHaveBeenCalledTimes(1);
    });

    it('does nothing when no integrations panel is open', () => {
        const other = createMockWebviewPanel();
        WebviewPanelManager.registerPanel('demoBuilder.dashboard', other);

        ShowIntegrationsCommand.disposeActivePanel();

        expect(other.dispose).not.toHaveBeenCalled();
        WebviewPanelManager.unregisterPanel('demoBuilder.dashboard');
    });
});

describe('execute', () => {
    it('opens the panel and starts communication when none exists', async () => {
        const { command } = commandFor(null);
        const createOrRevealPanel = jest.fn().mockResolvedValue(createMockWebviewPanel());
        const initializeCommunication = jest.fn().mockResolvedValue(undefined);
        internals(command).createOrRevealPanel = createOrRevealPanel;
        internals(command).initializeCommunication = initializeCommunication;

        await command.execute();

        expect(createOrRevealPanel).toHaveBeenCalledTimes(1);
        expect(initializeCommunication).toHaveBeenCalledTimes(1);
        expect(createOrRevealPanel.mock.invocationCallOrder[0]).toBeLessThan(
            initializeCommunication.mock.invocationCallOrder[0],
        );
    });

    it('only reveals when the panel already talks to the webview', async () => {
        const { command } = commandFor(null);
        const createOrRevealPanel = jest.fn().mockImplementation(async () => {
            internals(command).communicationManager = { sendMessage: jest.fn() };
            return createMockWebviewPanel();
        });
        const initializeCommunication = jest.fn();
        internals(command).createOrRevealPanel = createOrRevealPanel;
        internals(command).initializeCommunication = initializeCommunication;

        await command.execute();

        expect(createOrRevealPanel).toHaveBeenCalledTimes(1);
        expect(initializeCommunication).not.toHaveBeenCalled();
    });
});
