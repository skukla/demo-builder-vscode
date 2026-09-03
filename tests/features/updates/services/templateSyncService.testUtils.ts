/**
 * The fakes every templateSyncService suite stands on.
 *
 * The service talks to three things: the shell (every git step), fs/promises
 * (temp dir, backup/restore of preserved files, cleanup) and the shared GitHub
 * token accessor. All three are module-scoped mocks here so a suite can say
 * "this git step fails" or "there is no token" in one line, and so the
 * arguments the service hands each collaborator can be read back.
 */

import type { Project } from '@/types/base';
import { TemplateSyncService } from '@/features/updates/services/templateSyncService';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';

export const mockExecute = jest.fn();
export const mockReadFile = jest.fn();
export const mockWriteFile = jest.fn();
export const mockMkdir = jest.fn();
export const mockRm = jest.fn();
export const mockMkdtemp = jest.fn();
export const mockGetToken = jest.fn();

jest.mock('vscode', () => ({ window: {}, workspace: {} }), { virtual: true });
// The subject reads its token through the service cache; only getToken is called.
jest.mock('@/features/eds/handlers/edsServiceCache', () => ({
    getGitHubServices: () => ({ tokenService: { getToken: (...a: unknown[]) => mockGetToken(...a) } }),
}));
jest.mock('fs/promises', () => ({
    readFile: (...a: unknown[]) => mockReadFile(...a),
    writeFile: (...a: unknown[]) => mockWriteFile(...a),
    mkdir: (...a: unknown[]) => mockMkdir(...a),
    rm: (...a: unknown[]) => mockRm(...a),
    mkdtemp: (...a: unknown[]) => mockMkdtemp(...a),
}));

export const TEMP_DIR = '/tmp/sync-xyz';
export const REPO_DIR = `${TEMP_DIR}/repo`;

/** An EDS project with the metadata the service reads. */
export function edsProject(metadataOverrides: Record<string, unknown> = {}): Project {
    return createMockProject({
        name: 'demo',
        path: '/projects/demo',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: {
                    githubRepo: 'skukla/demo-storefront',
                    templateOwner: 'adobe',
                    templateRepo: 'aem-boilerplate-commerce',
                    ...metadataOverrides,
                },
            },
        },
    });
}

export function service(logger = createMockLogger()): TemplateSyncService {
    return new TemplateSyncService(
        createMockSecretStorage({ githubToken: 'gh-token' }).secrets,
        logger,
        createMockCommandExecutor({ execute: (...a: unknown[]) => mockExecute(...a) }),
    );
}

/** Every git call succeeds unless a test says otherwise. */
export function allGitSucceeds(): void {
    mockExecute.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
}

/** Make every command matching `pattern` fail; everything else succeeds. */
export function failOn(pattern: RegExp): void {
    mockExecute.mockImplementation(async (cmd: string) =>
        pattern.test(cmd)
            ? { code: 1, stdout: '', stderr: 'boom' }
            : { code: 0, stdout: '', stderr: '' },
    );
}

/** Answer one command's stdout; everything else succeeds silently. */
export function answer(pattern: RegExp, stdout: string): void {
    mockExecute.mockImplementation(async (cmd: string) => ({
        code: 0,
        stdout: pattern.test(cmd) ? stdout : '',
        stderr: '',
    }));
}

/** Which git commands actually ran, in order. */
export function gitCalls(): string[] {
    return mockExecute.mock.calls.map((c) => String(c[0]));
}

export const pushed = (): boolean => gitCalls().some((c) => /git push/.test(c));

/** The fakes' resting state: a token, a temp dir, both preserved files present. */
export function resetFakes(): void {
    jest.clearAllMocks();
    mockGetToken.mockResolvedValue({ token: 'gh-token' });
    mockMkdtemp.mockResolvedValue(TEMP_DIR);
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockRm.mockResolvedValue(undefined);
    mockReadFile.mockImplementation(async (p: string) =>
        p.endsWith('fstab.yaml') ? 'MOUNTS' : '{"headers":{}}',
    );
    allGitSucceeds();
}
