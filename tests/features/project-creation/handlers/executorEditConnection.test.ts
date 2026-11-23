/**
 * An Edit that points a project holding a datapack at another Commerce instance (D6 review S4). Such
 * an Edit rebuilds the project, and the datapack would stay in the instance it is in. So before
 * anything runs it asks what Configure asks: Change Anyway, Uninstall First, or cancel.
 */

import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import type { ConnectionAnswerDeps } from '@/features/dashboard/commands/configureConnectionAnswer';
import { type EditConnectionDeps, settleConnectionBeforeRebuild } from '@/features/project-creation/handlers/executorEditConnection';
import type { Project } from '@/types/base';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

const ACCS = 'adobe-commerce-accs';
const endpoint = (tenant: string) => `https://na1-sandbox.api.commerce.adobe.com/${tenant}/graphql`;
const project = (): Project =>
    createMockProject({
        path: '/nonexistent/acme',
        datapack: { name: 'luma', version: 'main', store: 'library' },
        componentSelections: { backend: ACCS },
        componentConfigs: { [ACCS]: { ACCS_GRAPHQL_ENDPOINT: endpoint('TenantA0123456789ABCD') } },
    });
const edit = (tenant: string): ProjectCreationConfig => ({
    projectName: 'acme',
    componentConfigs: { [ACCS]: { ACCS_GRAPHQL_ENDPOINT: endpoint(tenant) } },
});

function deps(answer: 'keep' | 'uninstall' | undefined) {
    const uninstall = jest.fn(async () => ({}));
    const ask = jest.fn(async () => answer);
    const answering: ConnectionAnswerDeps = { recordedInstance: async () => undefined, displayName: async () => 'Luma', uninstall };
    const given: EditConnectionDeps = { answer: () => answering, ask };
    return { given, uninstall, ask };
}

const context = () => createMockHandlerContext();

it('asks, naming the datapack, and cancelling stops the Edit before anything runs', async () => {
    const { given, ask, uninstall } = deps(undefined);

    await expect(settleConnectionBeforeRebuild(context(), edit('TenantB0123456789ABCD'), project(), given)).rejects.toThrow(
        'Saving changes was cancelled by user. Nothing was changed.'
    );
    expect(ask).toHaveBeenCalledWith('Luma');
    expect(uninstall).not.toHaveBeenCalled();
});

it('Uninstall First: uninstalls from the project as it was, then lets the rebuild run', async () => {
    const { given, uninstall } = deps('uninstall');

    await expect(settleConnectionBeforeRebuild(context(), edit('TenantB0123456789ABCD'), project(), given)).resolves.toBeUndefined();
    expect(uninstall).toHaveBeenCalledTimes(1);
});

it('Change Anyway: lets the rebuild run, uninstalling nothing', async () => {
    const { given, uninstall } = deps('keep');

    await expect(settleConnectionBeforeRebuild(context(), edit('TenantB0123456789ABCD'), project(), given)).resolves.toBeUndefined();
    expect(uninstall).not.toHaveBeenCalled();
});

it('CONTROL: asks nothing for an Edit that keeps the instance', async () => {
    const { given, ask } = deps(undefined);

    await settleConnectionBeforeRebuild(context(), edit('TenantA0123456789ABCD'), project(), given);

    expect(ask).not.toHaveBeenCalled();
});
