/**
 * Fixtures and helpers shared by the `checkHandler-decisions-*` suites (PL-22).
 *
 * The jest.mock preamble stays in each suite: factories are hoisted per FILE, so a
 * mock declared here would not be installed before the suite under it imports the
 * handler. Only inert values live in this module.
 */

import type { PrerequisiteDefinition, PrerequisiteStatus } from '@/features/prerequisites/services/PrerequisitesManager';
import type { HandlerContext } from '@/types/handlers';
import { createCheckHandlerContext } from './checkHandler.testUtils';

/** Every `sendMessage(type, …)` payload, in call order. */
export function payloadsOfType(context: jest.Mocked<HandlerContext>, type: string): unknown[] {
    return (context.sendMessage as jest.Mock).mock.calls
        .filter(([t]) => t === type)
        .map(([, p]) => p);
}

/** Wire a context whose resolveDependencies returns exactly `prereqs`. */
export function contextFor(prereqs: PrerequisiteDefinition[]): jest.Mocked<HandlerContext> {
    const context = createCheckHandlerContext();
    (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue({ version: '1.0', prerequisites: prereqs });
    (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue(prereqs);
    return context;
}

export const NODE_PREREQ = {
    id: 'node',
    name: 'Node.js',
    description: 'JavaScript runtime',
    check: { command: 'node --version' },
} as PrerequisiteDefinition;

export const GIT_PREREQ = {
    id: 'git',
    name: 'Git',
    description: 'Version control',
    check: { command: 'git --version' },
} as PrerequisiteDefinition;

export const AIO_PREREQ = {
    id: 'aio',
    name: 'Adobe I/O CLI',
    description: 'Adobe CLI',
    perNodeVersion: true,
    check: { command: 'aio --version' },
} as PrerequisiteDefinition;

export function status(over: Partial<PrerequisiteStatus> & { id: string; name: string }): PrerequisiteStatus {
    return {
        description: 'd',
        installed: true,
        optional: false,
        canInstall: false,
        ...over,
    } as PrerequisiteStatus;
}
