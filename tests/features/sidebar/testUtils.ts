/**
 * Test utilities for Sidebar feature
 */

import type { Project } from '@/types/base';
import type { SidebarContext, NavItem } from '@/features/sidebar/types';

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

/**
 * Creates a Configure context
 */
export function createConfigureContext(project?: Partial<Project>): SidebarContext {
    return {
        type: 'configure',
        project: createMockProject(project),
    };
}

/**
 * Creates navigation items for projects context
 */
export function createProjectsNavItems(): NavItem[] {
    return [
        { id: 'projects', label: 'Projects', active: true },
    ];
}

/**
 * Creates navigation items for project detail context
 */
export function createProjectDetailNavItems(activeId = 'overview'): NavItem[] {
    return [
        { id: 'overview', label: 'Overview', active: activeId === 'overview' },
        { id: 'configure', label: 'Configure', active: activeId === 'configure' },
        { id: 'updates', label: 'Updates', active: activeId === 'updates' },
    ];
}
