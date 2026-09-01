/**
 * continueHandler — per-node variant SCOPE must match checkHandler's.
 *
 * The 2026-08-27 dedup sweep adjudicated the check/continue pair as variants
 * and found this in the differences: check resolves the required Node majors
 * through `resolveRequiredMajors` (narrowed by the prereq's `requiredFor` /
 * plugin `requiredFor` component ids), while continue demanded the tool on
 * EVERY major in the mapping. Live case: aio-cli's plugins are requiredFor
 * the mesh components only, and the headless stack runs its frontend on
 * Node 24 with the mesh on Node 20 — so check passed green (aio-cli on 20)
 * and Continue then flagged Node 24 as a missing variant and flipped the
 * prerequisite to 'error'. Green check, blocking continue, no visible reason.
 *
 * These tests pin the scope agreement. Mock discipline: the shared module is
 * requireActual with ONLY the two mapping getters overridden (they read the
 * component registry via extensionPath, absent in this harness), and the
 * command executor answers fnm/tool checks per major.
 */

import type { PrerequisiteStatusPayload } from '@/types/webviewPayloads';

const mockExecute = jest.fn();
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getCommandExecutor: () => ({ execute: mockExecute }) },
}));

const mockGetNodeVersionMapping = jest.fn();
const mockGetNodeVersionIdMapping = jest.fn();
jest.mock('@/features/prerequisites/handlers/shared', () => ({
    ...jest.requireActual('@/features/prerequisites/handlers/shared'),
    getNodeVersionMapping: (...a: unknown[]) => mockGetNodeVersionMapping(...a),
    getNodeVersionIdMapping: (...a: unknown[]) => mockGetNodeVersionIdMapping(...a),
}));

import { handleContinuePrerequisites } from '@/features/prerequisites/handlers/continueHandler';
import type { HandlerContext } from '@/types/handlers';
import { createMockLogger } from '../../../helpers/loggerFake';

/** aio-cli's real shape: per-node tool whose plugins serve the mesh only. */
const MESH_SCOPED_PREREQ = {
    id: 'aio-cli',
    name: 'Adobe I/O CLI',
    description: 'Adobe I/O command-line tool',
    perNodeVersion: true,
    plugins: [{ requiredFor: ['eds-commerce-mesh'] }],
    check: { command: 'aio --version', parseVersion: '@adobe/aio-cli/(\\S+)' },
} as never;

function makeContext(): HandlerContext {
    const states = new Map();
    return {
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
        },
        sendMessage: jest.fn().mockResolvedValue(undefined),
        logger: createMockLogger(),
        debugLogger: { debug: jest.fn() },
        sharedState: {
            currentPrerequisites: [MESH_SCOPED_PREREQ],
            currentPrerequisiteStates: states,
        },
    } as unknown as HandlerContext;
}

beforeEach(() => {
    jest.clearAllMocks();
    // The headless stack's real shape: mesh on 20, frontend on 24.
    mockGetNodeVersionMapping.mockResolvedValue({ '20': 'API Mesh', '24': 'Headless' });
    mockGetNodeVersionIdMapping.mockResolvedValue({ '20': 'eds-commerce-mesh', '24': 'headless' });
    mockExecute.mockImplementation(async (command: string, opts?: { useNodeVersion?: string }) => {
        if (command === 'fnm list') {
            return { code: 0, stdout: 'v20.11.0\nv24.1.0', stderr: '' };
        }
        // The tool exists under Node 20 (where the mesh needs it) and NOT 24.
        if (opts?.useNodeVersion === '20') {
            return { code: 0, stdout: '@adobe/aio-cli/10.0.0', stderr: '' };
        }
        return { code: 1, stdout: '', stderr: 'not found' };
    });
});

function lastStatusFor(context: HandlerContext, name: string): PrerequisiteStatusPayload {
    const calls = (context.sendMessage as jest.Mock).mock.calls.filter(
        ([type, payload]) =>
            type === 'prerequisite-status' && (payload as { name?: string }).name === name
    );
    return calls.at(-1)![1] as PrerequisiteStatusPayload;
}

describe('continue per-node variant scope (the check/continue agreement)', () => {
    it('requires the variant only on the majors the prereq is requiredFor — not every major', async () => {
        const context = makeContext();

        const result = await handleContinuePrerequisites(context, { fromIndex: 0 });

        expect(result.success).toBe(true);
        const status = lastStatusFor(context, 'Adobe I/O CLI');
        // The mesh needs Node 20 only; the tool is there. Node 24 belongs to
        // the frontend, which never asked for this tool — continue must not
        // flip a green check to 'error' over it.
        expect(status.status).not.toBe('error');
        expect(status.installed).toBe(true);
    });

    it('still fails the variant check when a REQUIRED major lacks the tool', async () => {
        const context = makeContext();
        // Now the tool is missing on 20 too — the one major that IS required.
        mockExecute.mockImplementation(async (command: string) => {
            if (command === 'fnm list') {
                return { code: 0, stdout: 'v20.11.0\nv24.1.0', stderr: '' };
            }
            return { code: 1, stdout: '', stderr: 'not found' };
        });

        await handleContinuePrerequisites(context, { fromIndex: 0 });

        const status = lastStatusFor(context, 'Adobe I/O CLI');
        expect(status.status).toBe('error');
    });
});
