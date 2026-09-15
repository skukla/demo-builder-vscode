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
export const PATCH_FILE = `${TEMP_DIR}/template.patch`;
/** The template version the storefront recorded at its last create, reset or sync. */
export const BASE_SHA = 'aaa1111';
/** The template's latest commit, as `git rev-parse template/main` reports it. */
export const TEMPLATE_HEAD = 'bbb2222';

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
                    lastSyncedCommit: BASE_SHA,
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

/**
 * What git says when every step goes well: the template has moved on from the
 * recorded version, and its change touches one file that is not preserved.
 * Every other step succeeds silently.
 */
export function happyGit(cmd: string): { code: number; stdout: string; stderr: string } {
    if (/^git rev-parse template\/main$/.test(cmd)) {
        return { code: 0, stdout: `${TEMPLATE_HEAD}\n`, stderr: '' };
    }
    if (/^git diff-tree -r --name-only /.test(cmd)) {
        return { code: 0, stdout: 'blocks/hero/hero.js\n', stderr: '' };
    }
    return { code: 0, stdout: '', stderr: '' };
}

/** Every git call succeeds unless a test says otherwise. */
export function allGitSucceeds(): void {
    mockExecute.mockImplementation(async (cmd: string) => happyGit(cmd));
}

/** Make every command matching `pattern` fail; everything else succeeds. */
export function failOn(pattern: RegExp, stderr = 'boom'): void {
    mockExecute.mockImplementation(async (cmd: string) =>
        pattern.test(cmd) ? { code: 1, stdout: '', stderr } : happyGit(cmd),
    );
}

/** Answer one command's stdout; everything else succeeds as `happyGit` says. */
export function answer(pattern: RegExp, stdout: string): void {
    mockExecute.mockImplementation(async (cmd: string) =>
        pattern.test(cmd) ? { code: 0, stdout, stderr: '' } : happyGit(cmd),
    );
}

/**
 * The 3-way apply stops, and the unmerged-file probe answers `probeStdout`
 * (with `probeCode`). Everything else succeeds as `happyGit` says.
 */
export function applyStops(probeStdout: string, stderr = 'error: patch failed', probeCode = 0): void {
    mockExecute.mockImplementation(async (cmd: string) => {
        if (/^git apply /.test(cmd)) return { code: 1, stdout: '', stderr };
        if (/diff-filter=U/.test(cmd)) return { code: probeCode, stdout: probeStdout, stderr: '' };
        return happyGit(cmd);
    });
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
