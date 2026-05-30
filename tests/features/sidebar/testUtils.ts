/**
 * Test utilities for Sidebar feature
 */

import type { Project } from '@/types/base';
import type { SidebarContext } from '@/features/sidebar/types';

/**
 * Creates a mock project for testing
 */
export function createMockProject(overrides?: Partial<Project>): Project {
    const now = new Date();
    return {
        name: 'Test Project',
        created: now,
        lastModified: now,
        path: '/test/path',
        status: 'stopped',
        organization: 'Test Org',
        ...overrides,
    };
}

/**
 * Creates a Projects context
 */
export function createProjectsContext(): SidebarContext {
    return { type: 'projects' };
}

/**
 * Creates a Project Detail context
 */
export function createProjectContext(project?: Partial<Project>): SidebarContext {
    return {
        type: 'project',
        project: createMockProject(project),
    };
}

