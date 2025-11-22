import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { PrerequisiteDefinition, PrerequisiteStatus } from '@/features/prerequisites/services/types';

// Mock prerequisite definitions
export const mockNodePrereq: PrerequisiteDefinition = {
    id: 'node',
    name: 'Node.js',
    description: 'JavaScript runtime',
    check: { command: 'node --version' },
} as any;

export const mockNpmPrereq: PrerequisiteDefinition = {
    id: 'npm',
    name: 'npm',
    description: 'Package manager',
    depends: ['node'],
    check: { command: 'npm --version' },
} as any;

export const mockAdobeCliPrereq: PrerequisiteDefinition = {
    id: 'adobe-cli',
    name: 'Adobe I/O CLI',
    description: 'Adobe I/O command-line tool',
    perNodeVersion: true,
    check: { command: 'aio --version', parseVersion: '@adobe/aio-cli/(\\S+)' },
} as any;

export const mockNodeResult: PrerequisiteStatus = {
    id: 'node',
    name: 'Node.js',
    description: 'JavaScript runtime',
    installed: true,
    version: 'v18.0.0',
    optional: false,
    canInstall: false,
};

export const mockNpmResult: PrerequisiteStatus = {
    id: 'npm',
    name: 'npm',
    description: 'Package manager',
    installed: true,
    version: '9.0.0',
    optional: false,
    canInstall: false,
};

// Helper to create mock HandlerContext
// CRITICAL: Return a function, not the object directly, to avoid closure issues
export function createMockContext(overrides?: Partial<HandlerContext>): jest.Mocked<HandlerContext> {
    const states = new Map();
    states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
    states.set(1, { prereq: mockNpmPrereq, result: mockNpmResult });

    return {
        prereqManager: {
            checkPrerequisite: jest.fn().mockResolvedValue(mockNodeResult),
            checkMultipleNodeVersions: jest.fn().mockResolvedValue([
                { version: 'Node 18', component: 'v18.0.0', installed: true },
                { version: 'Node 20', component: 'v20.0.0', installed: true },
            ]),
        } as any,
        sendMessage: jest.fn().mockResolvedValue(undefined),
        logger: {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        } as any,
        debugLogger: {
            debug: jest.fn(),
        } as any,
        stepLogger: {
            log: jest.fn(),
        } as any,
        sharedState: {
            currentPrerequisites: [mockNodePrereq, mockNpmPrereq],
            currentPrerequisiteStates: states,
        },
        ...overrides,
    } as jest.Mocked<HandlerContext>;
}
