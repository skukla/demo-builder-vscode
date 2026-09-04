/**
 * Shared setup for the two manifest-writing suites.
 *
 * Both cover a field that must stay ABSENT when unset — `title` in one,
 * `commerceStoreStructure` in the other — and both need the same three things
 * to ask that question: a mocked `fs/promises`, a project to write, and a way
 * to read back the JSON the writer actually handed to disk. Roughly forty lines,
 * identical in both.
 *
 * The subject is `ProjectConfigWriter`, and the suites carry its stem so the
 * mirror convention finds them: they were named `projectManifest-*` until
 * 2026-09-03, and the focused mutation run (`scripts/focusModule.mjs`) never
 * saw them, so every field they pin was reported as unconstrained. This file
 * owns the import, since
 * `jest.mock('fs/promises')` hoists within this module and a suite importing
 * the writer itself could bind it before the mock was registered.
 */

import * as fs from 'fs/promises';
import type { Project } from '@/types/base';
import { createMockLogger } from '../../helpers/loggerFake';

jest.mock('fs/promises');

export const mockFs = fs as jest.Mocked<typeof fs>;
export const mockLogger = createMockLogger();

/**
 * A project with the fields the writer touches, and nothing more.
 *
 * The name is arbitrary — neither suite asserts it. They assert which KEYS the
 * written manifest carries.
 */
export function createTestProject(overrides: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'bodea-demo',
        path: '/test/path',
        created: new Date('2026-01-01T00:00:00Z'),
        componentSelections: {},
        componentInstances: {},
        componentConfigs: {},
        componentVersions: {},
        ...overrides,
    });
}

/**
 * The JSON the writer actually handed to disk.
 *
 * Found by its temp-file target rather than taken as the last write: through the
 * public `saveProjectConfig` the last write is the `.env`, and a suite reading
 * that as JSON fails on the first `#`.
 */
export function writtenManifest(): Record<string, unknown> {
    const call = mockFs.writeFile.mock.calls.find(([target]) =>
        String(target).endsWith('.demo-builder.json.tmp'),
    );
    return JSON.parse(String(call?.[1]));
}

/**
 * Drive one manifest write.
 *
 * `writeManifest` is private, so the cast is the reach — asserting through the
 * public API would write far more than the one field under test.
 */
export async function write(project: Project): Promise<void> {
    const writer = new ProjectConfigWriter(mockLogger) as unknown as {
        writeManifest(project: unknown): Promise<void>;
    };
    await writer.writeManifest(project);
}

/** Every fs call the writer makes, answered. Call from each suite's `beforeEach`. */
export function resetFsMocks(): void {
    jest.clearAllMocks();
    mockFs.access.mockResolvedValue(undefined);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.rename.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
}

// Below the mock on purpose — see the note above about hoisting.
import { MANIFEST_FORMAT_VERSION, ProjectConfigWriter } from '@/core/state/projectConfigWriter';
import { createMockProject } from '../../helpers/projectFake';

export { MANIFEST_FORMAT_VERSION, ProjectConfigWriter };
