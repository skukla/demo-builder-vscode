/**
 * Shared setup for the aiSetupVerifier family.
 *
 * Both suites drive the verifier entirely through the filesystem and both need
 * its three inventory inspectors held still, so the mock scaffold and the
 * subject import live here rather than being re-declared per suite (ADR-016 /
 * PL-14).
 *
 * The specs must NOT import the verifier themselves: `jest.mock` hoists only
 * above the imports of the module it appears in, so a spec that reached for
 * `@/features/ai/aiSetupVerifier` directly could bind it before these mocks
 * register. Everything they need is re-exported below.
 */

jest.mock('fs/promises', () => ({
    realpath: jest.fn(async (p: string) => p),
    readFile: jest.fn(),
    access: jest.fn(),
    readdir: jest.fn(),
}));

// The inventory inspectors are held still so the file-presence checks stay the
// subject. Each has its own suite.
jest.mock('@/features/ai/skillInspector', () => ({
    inspectSkills: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/features/ai/mcpInspector', () => ({
    inspectAllServers: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/features/ai/sessionMcpDetector', () => ({
    detectSessionMcps: jest.fn().mockResolvedValue([]),
}));

// Below the mocks on purpose — see the header.
export { verifyAiSetup, gatherInventory } from '@/features/ai/aiSetupVerifier';
export type { AiCheckResult, AiVerificationResult } from '@/features/ai/aiSetupVerifier';
export { inspectSkills } from '@/features/ai/skillInspector';
export { inspectAllServers } from '@/features/ai/mcpInspector';
export { detectSessionMcps } from '@/features/ai/sessionMcpDetector';

export const PROJECT_PATH = '/projects/test-project';
export const EXT_DIST_PATH = '/ext/dist';
