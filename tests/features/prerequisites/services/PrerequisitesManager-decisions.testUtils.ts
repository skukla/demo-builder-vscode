/**
 * Fixtures shared by the `PrerequisitesManager-decisions-*` suites (PL-22).
 *
 * The jest.mock preamble stays in each suite: factories are hoisted per FILE, so a
 * mock declared here would not be installed before the suite under it imports the
 * manager. Only inert values live in this module.
 */

import type { PrerequisiteDefinition } from '@/features/prerequisites/services/types';

/** A prerequisite whose check parses a version out of stdout. */
export const GIT: PrerequisiteDefinition = {
    id: 'git',
    name: 'Git',
    description: 'Version control',
    check: { command: 'git --version', parseVersion: 'git version ([0-9.]+)' },
};

/** A prerequisite whose check looks for a substring instead of a version. */
export const DOCKER: PrerequisiteDefinition = {
    id: 'docker',
    name: 'Docker',
    description: 'Containers',
    check: { command: 'docker --version', contains: 'Docker version' },
};

/** A prerequisite whose check has neither a version regex nor a substring. */
export const BARE: PrerequisiteDefinition = {
    id: 'bare',
    name: 'Bare',
    description: 'Presence only',
    check: { command: 'bare --version' },
};

export const AIO: PrerequisiteDefinition = {
    id: 'aio-cli',
    name: 'Adobe I/O CLI',
    description: 'Adobe I/O CLI',
    perNodeVersion: true,
    check: { command: 'aio --version', parseVersion: '@adobe/aio-cli/([0-9.]+)' },
};
