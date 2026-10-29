/**
 * AGENTS.md names the Adobe workspace each integration lives in (AB-23 slice 6).
 *
 * Since AB-23 an added integration deploys into a workspace of its own, and a bound
 * pair shares one. The Adobe section used to name only the project's workspace, so
 * an agent reading it would look for the ERP in Production and find nothing there.
 * The bundle is rewritten after every add and removal (`refreshAiBundle`), so the
 * list follows the project.
 */

import { buildAdobeIo } from '@/features/project-creation/services/aiBundle/agentsMdSections';
import { integrationWorkspaceLines } from '@/features/project-creation/services/aiBundle/agentsMdWorkspaces';
import type { AppBuilderComponentState, Project } from '@/types/base';
import { createMockProject } from '../../../../helpers/projectFake';

const PAIR_WORKSPACE = { id: '1000000000000000004', name: 'Northwind-ERP', title: 'Northwind ERP' };

const deployed = (
    kind: AppBuilderComponentState['kind'],
    workspace?: AppBuilderComponentState['workspace'],
): AppBuilderComponentState => ({
    kind,
    status: 'deployed',
    source: { owner: 'skukla', repo: 'r' },
    ...(workspace ? { workspace } : {}),
});

function bodea(components: Project['appBuilderComponents']): Project {
    return createMockProject({
        adobe: {
            organization: '100000',
            projectId: '1000000000000000001',
            projectTitle: 'Demo Project',
            workspace: '1000000000000000002',
            workspaceTitle: 'Production',
            authenticated: true,
        },
        appBuilderComponents: components,
    });
}

describe('integrationWorkspaceLines', () => {
    it('lists a pair once, under its workspace title and name, with both ids', () => {
        const project = bodea({
            'erp-integration': deployed('integration', PAIR_WORKSPACE),
            'demo-erp': deployed('system', PAIR_WORKSPACE),
            'eds-accs-mesh': deployed('mesh'),
        });

        expect(integrationWorkspaceLines(project)).toEqual([
            '- **Integration workspaces** — each integration below is deployed into, and removed' +
                ' with, its own workspace, not the one above:',
            '  - Northwind ERP (`Northwind-ERP`): `demo-erp`, `erp-integration`',
        ]);
    });

    it('says nothing when every component lives in the project workspace', () => {
        const project = bodea({ 'eds-accs-mesh': deployed('mesh') });

        expect(integrationWorkspaceLines(project)).toStrictEqual([]);
    });

    it('strips markdown from a title an SC typed', () => {
        const project = bodea({
            'erp-integration': deployed('integration', { ...PAIR_WORKSPACE, title: 'Evil **ERP**\n# x' }),
        });

        expect(integrationWorkspaceLines(project)[1]).toBe(
            '  - Evil ERP x (`Northwind-ERP`): `erp-integration`',
        );
    });
});

describe('the Adobe section', () => {
    it('names the integration workspaces after the project workspace', () => {
        const section = buildAdobeIo(
            bodea({ 'erp-integration': deployed('integration', PAIR_WORKSPACE) }),
        );

        expect(section).toContain('- **Workspace:** Production\n- **Integration workspaces**');
        expect(section).toContain('Northwind ERP (`Northwind-ERP`): `erp-integration`');
    });
});
