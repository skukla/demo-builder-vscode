/**
 * A file sent to someone else cannot point the new project at the sender's cloud
 * resources (owner, 2026-11-18). The agent half of the enforcer.
 *
 * `create_project_from_file` reads a REAL file (the sentinel fixture, every
 * `sendersOwn` field of `src/types/projectFileOwnership.ts` planted) through the
 * real reader, and both of its outputs are traced: the creation inputs handed to
 * `buildProjectConfig` and the payload handed to storefront setup. The agent path
 * passes no imported settings to `buildProjectConfig`, so the same-workspace mesh
 * reuse the wizard half allows is unreachable here; the sender's mesh endpoint may
 * ride only inside the settings map, where generated files never read it.
 * The wizard half: `tests/features/project-creation/ui/wizard/sendersOwnFields.test.tsx`.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    MESH_COMPONENT,
    sendersOwnLeaks,
    sendersOwnSeed,
    sentinelFor,
} from '../../../helpers/sendersOwnFixtures';
import {
    capturedWizardState,
    ctxFactory,
    defaultStorefrontSetup,
    executeProjectCreation,
    fakeServer,
    registerCreateProjectFromFileTool,
    storefrontSetup,
} from './createProjectTool.testUtils';

const TOOL = 'create_project_from_file';
const RECEIVER = { repoName: 'my-repo', daLiveOrg: 'me', daLiveSite: 'mine' };

/** Where the new project's own resources are named. */
const WRITE_TARGETS =
    /^(projectName|projectTitle|adobeOrg|adobeProject|adobeWorkspace|adobe|edsConfig\.(repoName|githubOwner|daLiveOrg|daLiveSite|existingRepo|repoUrl))(\.|$)/;

/** The settings map carries the sender's mesh endpoint; generated files take the new mesh's. */
const ALLOWED: Record<string, RegExp[]> = {
    [`configs.${MESH_COMPONENT}.MESH_ENDPOINT`]: [/^componentConfigs\.[^.]+\.MESH_ENDPOINT$/],
};

let dir: string;

beforeEach(() => {
    jest.clearAllMocks();
    defaultStorefrontSetup();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'senders-own-'));
});

afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

async function createFromSentinelFile(): Promise<unknown> {
    const filePath = path.join(dir, 'sent.project.demo-builder.json');
    // The harness's package catalog lists `citisignal` only.
    fs.writeFileSync(
        filePath,
        JSON.stringify({ ...sendersOwnSeed(), selectedPackage: 'citisignal' })
    );
    const server = fakeServer(TOOL);
    registerCreateProjectFromFileTool(server, ctxFactory);
    return server.call({ projectName: 'new-storefront', filePath, confirm: true, ...RECEIVER });
}

describe('create_project_from_file: no sendersOwn field reaches creation', () => {
    it('CONTROL: creation ran and the file reached it', async () => {
        expect(await createFromSentinelFile()).toMatchObject({ created: true });
        expect(executeProjectCreation).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(capturedWizardState())).toContain(
            sentinelFor(`configs.${MESH_COMPONENT}.MESH_ENDPOINT`)
        );
    });

    it('hands creation no sender resource', async () => {
        await createFromSentinelFile();

        expect(
            sendersOwnLeaks(capturedWizardState(), {
                allowed: ALLOWED,
                writeTargets: WRITE_TARGETS,
            })
        ).toStrictEqual([]);
    });

    it('hands storefront setup no sender resource', async () => {
        await createFromSentinelFile();

        const payload: unknown = storefrontSetup.mock.calls[0][1];
        expect(
            sendersOwnLeaks(payload, { allowed: ALLOWED, writeTargets: WRITE_TARGETS })
        ).toStrictEqual([]);
    });

    it('PLANTED: names the sender’s workspace if creation were handed it', async () => {
        await createFromSentinelFile();

        const reseeded = {
            ...capturedWizardState(),
            adobeWorkspace: { id: sentinelFor('adobe.workspaceId') },
        };
        expect(
            sendersOwnLeaks(reseeded, { allowed: ALLOWED, writeTargets: WRITE_TARGETS })
        ).toStrictEqual([{ field: 'adobe.workspaceId', at: 'adobeWorkspace.id' }]);
    });
});
