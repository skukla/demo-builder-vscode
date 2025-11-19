import type { AdobeOrg, AdobeProject, AdobeWorkspace, AdobeConsoleWhereResponse } from '@/features/authentication/services/types';

/**
 * Shared test utilities for AuthCacheManager tests
 */

// Mock getLogger
export const mockLogger = () => {
    jest.mock('@/core/logging', () => ({
        getLogger: jest.fn(() => ({
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        })),
    }));
};

// Mock data factories
export const createMockOrg = (overrides?: Partial<AdobeOrg>): AdobeOrg => ({
    id: 'org123',
    code: 'ORGCODE',
    name: 'Test Organization',
    ...overrides,
});

export const createMockOrg2 = (): AdobeOrg => ({
    id: 'org456',
    code: 'ORG2',
    name: 'Second Organization',
});

export const createMockProject = (overrides?: Partial<AdobeProject>): AdobeProject => ({
    id: 'proj123',
    name: 'Test Project',
    ...overrides,
});

export const createMockWorkspace = (overrides?: Partial<AdobeWorkspace>): AdobeWorkspace => ({
    id: 'ws123',
    name: 'Test Workspace',
    ...overrides,
});

export const createMockConsoleWhere = (): AdobeConsoleWhereResponse => {
    const org = createMockOrg();
    const project = createMockProject();
    const workspace = createMockWorkspace();

    return {
        org: org as any, // Type assertion needed for test data
        project: project as any,
        workspace: workspace as any,
    };
};

// Time mocking utilities
export const mockTime = () => {
    let mockTimeValue = 1000000;

    const spy = jest.spyOn(Date, 'now').mockImplementation(() => mockTimeValue);

    return {
        spy,
        advance: (ms: number) => {
            mockTimeValue += ms;
        },
        restore: () => {
            spy.mockRestore();
        },
        get current() {
            return mockTimeValue;
        },
    };
};
