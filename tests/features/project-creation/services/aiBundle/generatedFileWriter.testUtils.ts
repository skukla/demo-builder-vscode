/**
 * Shared helpers for suites that route writes through the ADR-013
 * GeneratedFileWriter seam (skillsWriter, aiContextWriter). The seam's own
 * matrices are pinned in generatedFileWriter.test.ts — consumers construct a
 * real writer (against the suite's mocked fs/promises) and assert routing.
 */

import { createGeneratedFileWriter } from '@/features/project-creation/services/aiBundle/generatedFileWriter';
import type { Logger } from '@/types/logger';

export function makeMockLogger(): Logger {
    return {
        trace: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };
}

/**
 * Real ADR-013 writer over the suite's mocked fs. With no recorded hashes it
 * reproduces pre-ADR overwrite-once behavior, so legacy content/count
 * assertions hold unchanged.
 */
export function makeTestWriter(projectPath: string, recorded: Record<string, string> = {}) {
    return createGeneratedFileWriter(projectPath, recorded, makeMockLogger());
}

/** The ENOENT the writer's presence probe expects for absent files. */
export function enoentError(): NodeJS.ErrnoException {
    return Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
}

/**
 * Contents of the isolated `.demo-builder-mcp/package.json` manifest with the
 * given packages installed. Skill gating (`writeSkillFiles`) reads this via
 * `readInstalledMcpPackages` — suites feed it to their readFile mock so the
 * declared tools count as installed.
 */
export function mcpToolsManifest(packages: string[]): string {
    return JSON.stringify({
        name: 'demo-builder-mcp-tools',
        private: true,
        version: '1.0.0',
        dependencies: Object.fromEntries(packages.map((pkg) => [pkg, '*'])),
    });
}
