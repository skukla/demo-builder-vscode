/**
 * Configure's Save, pointing a project that holds a datapack at another Commerce instance
 * (step-07 D6), at the command. The answer's rules are `configureConnectionAnswer.ts` (its own
 * suite); here the uninstall is walled so what the command does with the answer is checked:
 * nothing is saved until the SC answers, and Uninstall First runs before the change lands.
 */

import { ConfigureProjectWebviewCommand } from './configure.testUtils';
import { ServiceLocator } from '@/core/di/serviceLocator';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { internals } from '../../../helpers/commandInternals';

const mockUninstall = jest.fn();
jest.mock('@/features/dashboard/commands/configureConnectionAnswer', () => ({
    ...jest.requireActual('@/features/dashboard/commands/configureConnectionAnswer'),
    connectionAnswerDeps: () => ({ recordedInstance: async () => undefined, displayName: async () => 'Luma', uninstall: mockUninstall }),
}));
jest.mock('@/commands/handlerContextFactory', () => ({
    createPanelHandlerContext: jest.fn(() => ({ stub: 'handler-context' })),
}));
jest.mock('@/features/components/services/commerceSecretMigration', () => ({
    loadDeclaredSecretFlags: jest.fn(async () => ({})),
    migrateDeclaredSecrets: jest.fn(async (configs: unknown) => ({
        sanitizedConfigs: configs,
        moved: [],
        retained: [],
        cleared: [],
    })),
}));
jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    detectMeshChanges: jest.fn(async () => ({ hasChanges: false })),
}));
jest.mock('@/features/eds/services/storefront/storefrontStalenessDetector', () => ({
    detectStorefrontChanges: jest.fn(() => ({ hasChanges: false })),
}));
jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: { refreshStatus: jest.fn().mockResolvedValue(undefined) },
}));

const ACCS = 'adobe-commerce-accs';
const endpoint = (tenant: string) => `https://na1-sandbox.api.commerce.adobe.com/${tenant}/graphql`;
const MOVE = { [ACCS]: { ACCS_GRAPHQL_ENDPOINT: endpoint('TenantB0123456789ABCD') } };

interface SaveInternals {
    handleSaveConfiguration(data: {
        configChanges: Record<string, Record<string, string>>;
        installedDatapack?: string;
    }): Promise<unknown>;
}

let command: ConfigureProjectWebviewCommand;
let stateManager: ReturnType<typeof createMockStateManager>;
let project: Project;

beforeEach(() => {
    jest.clearAllMocks();
    ServiceLocator.setCommandExecutor(createMockCommandExecutor());
    ServiceLocator.setAuthenticationService(createMockAuthenticationService());
    project = createMockProject({
        path: '/nonexistent/acme',
        datapack: { name: 'luma', version: 'main', store: 'library' },
        componentSelections: { backend: ACCS },
        componentConfigs: { [ACCS]: { ACCS_GRAPHQL_ENDPOINT: endpoint('TenantA0123456789ABCD') } },
    });
    stateManager = createMockStateManager({
        getCurrentProject: jest.fn().mockResolvedValue(project),
    });
    command = new ConfigureProjectWebviewCommand(
        createMockExtensionContext(),
        stateManager,
        createMockLogger() as unknown as Logger
    );
    internals(command).registerProgrammaticWrites = jest.fn().mockResolvedValue(undefined);
    internals(command).regenerateEnvFiles = jest.fn().mockResolvedValue(undefined);
    internals(command).showPostSaveNotifications = jest.fn().mockResolvedValue(undefined);
});

const save = (data: Parameters<SaveInternals['handleSaveConfiguration']>[0]) =>
    (command as unknown as SaveInternals).handleSaveConfiguration(data);

it('saves nothing and asks, naming the datapack, when the SC has not answered', async () => {
    await expect(save({ configChanges: MOVE })).resolves.toStrictEqual({
        success: false,
        data: { installedDatapack: 'Luma' },
    });
    expect(stateManager.saveProject).not.toHaveBeenCalled();
    expect(mockUninstall).not.toHaveBeenCalled();
});

it('Uninstall First: uninstalls from the instance it is in, then saves the change', async () => {
    const order: string[] = [];
    mockUninstall.mockImplementation(async (p: Project) => {
        order.push(`uninstall from ${String(p.componentConfigs?.[ACCS]?.ACCS_GRAPHQL_ENDPOINT)}`);
        return {};
    });
    stateManager.saveProject.mockImplementation(async (p: Project) => {
        order.push(`save ${String(p.componentConfigs?.[ACCS]?.ACCS_GRAPHQL_ENDPOINT)}`);
    });

    await expect(
        save({ configChanges: MOVE, installedDatapack: 'uninstall' })
    ).resolves.toMatchObject({ success: true });

    expect(order).toStrictEqual([
        `uninstall from ${endpoint('TenantA0123456789ABCD')}`,
        `save ${endpoint('TenantB0123456789ABCD')}`,
    ]);
});

it('Change Anyway: saves the change, uninstalling nothing', async () => {
    await expect(save({ configChanges: MOVE, installedDatapack: 'keep' })).resolves.toMatchObject({
        success: true,
    });

    expect(mockUninstall).not.toHaveBeenCalled();
    expect(stateManager.saveProject).toHaveBeenCalledTimes(1);
});
