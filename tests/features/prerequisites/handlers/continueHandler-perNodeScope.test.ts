/**
 * continueHandler — per-node variant SCOPE must match checkHandler's.
 *
 * The 2026-08-27 dedup sweep found check and continue requiring the tool on
 * different Node majors: green check, blocking continue, no visible reason.
 * Both now read one set, `perNodeToolMajors()` (the Adobe CLI's own Node), and
 * ignore the prereq's and its plugins' `requiredFor`.
 *
 * Mock discipline: the shared module is requireActual with ONLY the mapping
 * getter overridden (it reads the component registry, absent in this
 * harness), and the command executor answers fnm/tool checks per major.
 */

import type { PrerequisiteStatusPayload } from '@/types/webviewPayloads';

const mockExecute = jest.fn();
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getCommandExecutor: () => ({ execute: mockExecute }) },
}));

// The per-Node check also asks whether the tool's file sits beside that Node.
// Default yes, so a check command's exit code decides, as it did before.
jest.mock('@/core/shell/ensureNodeVersion', () => ({
    ...jest.requireActual('@/core/shell/ensureNodeVersion'),
    toolInstalledUnder: jest.fn(() => Promise.resolve(true)),
}));

const mockGetNodeVersionMapping = jest.fn();
jest.mock('@/features/prerequisites/handlers/shared', () => ({
    ...jest.requireActual('@/features/prerequisites/handlers/shared'),
    getNodeVersionMapping: (...a: unknown[]) => mockGetNodeVersionMapping(...a),
}));

import { handleContinuePrerequisites } from '@/features/prerequisites/handlers/continueHandler';
import { perNodeToolMajors } from '@/features/prerequisites/handlers/shared';
import type { HandlerContext } from '@/types/handlers';
import type { PrerequisiteDefinition } from '@/features/prerequisites/services/types';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

/**
 * aio-cli's real shape: per-node tool whose plugin names the mesh in
 * `requiredFor`. Copied from `prerequisites.json`; the scope ignores it.
 */
const MESH_SCOPED_PREREQ: PrerequisiteDefinition = {
    id: 'aio-cli',
    name: 'Adobe I/O CLI',
    description: 'Adobe I/O command-line tool',
    perNodeVersion: true,
    plugins: [
        {
            id: 'api-mesh',
            name: 'API Mesh Plugin',
            description: 'Adobe API Mesh management plugin',
            check: { command: 'aio plugins', contains: '@adobe/aio-cli-plugin-api-mesh' },
            install: { commands: ['aio plugins:install @adobe/aio-cli-plugin-api-mesh'] },
            requiredFor: ['eds-commerce-mesh'],
        },
    ],
    check: { command: 'aio --version', parseVersion: '@adobe/aio-cli/(\\S+)' },
};

function makeContext(): HandlerContext {
    const states = new Map();
    return createMockHandlerContext({
        // No PrerequisitesManager builder exists; two methods stand in for it.
        prereqManager: {
            checkPrerequisite: jest.fn().mockResolvedValue({
                id: 'aio-cli',
                name: 'Adobe I/O CLI',
                installed: true,
                version: '10.0.0',
                optional: false,
                canInstall: true,
            }),
            checkMultipleNodeVersions: jest.fn().mockResolvedValue([]),
        } as unknown as HandlerContext['prereqManager'],
        sharedState: {
            isAuthenticating: false,
            currentPrerequisites: [MESH_SCOPED_PREREQ],
            currentPrerequisiteStates: states,
        },
    });
}

/** The CLI's own Node major; the mesh's Node 20 is never it. */
const [CLI_MAJOR] = perNodeToolMajors();

/** fnm has both Nodes; the tool answers only under the given majors. */
function toolUnder(...majors: string[]) {
    mockExecute.mockImplementation(async (command: string, opts?: { useNodeVersion?: string }) => {
        if (command === 'fnm list') {
            return { code: 0, stdout: `v20.11.0\nv${CLI_MAJOR}.1.0`, stderr: '' };
        }
        if (opts?.useNodeVersion && majors.includes(opts.useNodeVersion)) {
            return { code: 0, stdout: '@adobe/aio-cli/10.0.0', stderr: '' };
        }
        return { code: 1, stdout: '', stderr: 'not found' };
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    // A stack with the mesh on Node 20 beside the CLI's own Node.
    mockGetNodeVersionMapping.mockResolvedValue({ '20': 'API Mesh', [CLI_MAJOR]: 'Adobe I/O CLI' });
});

function lastStatusFor(context: HandlerContext, name: string): PrerequisiteStatusPayload {
    const calls = (context.sendMessage as jest.Mock).mock.calls.filter(
        ([type, payload]) =>
            type === 'prerequisite-status' && (payload as { name?: string }).name === name
    );
    return calls.at(-1)![1] as PrerequisiteStatusPayload;
}

describe('continue per-node variant scope (the check/continue agreement)', () => {
    it("requires the tool on the CLI's own Node, not the major a plugin's requiredFor points at", async () => {
        toolUnder(CLI_MAJOR);
        const context = makeContext();

        const result = await handleContinuePrerequisites(context, { fromIndex: 0 });

        expect(result.success).toBe(true);
        const status = lastStatusFor(context, 'Adobe I/O CLI');
        // Missing under the mesh's Node 20 does not matter; that is not a per-Node tool major.
        expect(status.status).not.toBe('error');
        expect(status.installed).toBe(true);
    });

    it("fails the variant check when the CLI's own Node lacks the tool", async () => {
        // Present under the mesh's Node 20 only: requiredFor no longer rescues it.
        toolUnder('20');
        const context = makeContext();

        await handleContinuePrerequisites(context, { fromIndex: 0 });

        const status = lastStatusFor(context, 'Adobe I/O CLI');
        expect(status.status).toBe('error');
    });
});
