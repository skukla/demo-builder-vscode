/**
 * Type/JSON Alignment Validation Tests - Prerequisites & Logging
 *
 * Tests for TypeScript type synchronization with:
 * - prerequisites.json
 * - logging.json
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Prerequisites.json Field Sets
// ============================================================================

const PREREQUISITES_ROOT_FIELDS = new Set([
    '$schema', 'version', 'prerequisites', 'componentRequirements',
]);

const PREREQUISITE_DEFINITION_FIELDS = new Set([
    'id', 'name', 'description', 'optional', 'depends', 'perNodeVersion',
    'check', 'install', 'uninstall', 'postInstall', 'multiVersion',
    'versionCheck', 'plugins',
]);

const PREREQUISITE_CHECK_FIELDS = new Set([
    'command', 'parseVersion', 'contains', 'parseInstalledVersions',
]);

const PREREQUISITE_INSTALL_FIELDS = new Set([
    'commands', 'message', 'requires', 'dynamic', 'template',
    'versions', 'manual', 'url', 'steps',
]);

const INSTALL_STEP_FIELDS = new Set([
    'name', 'message', 'commands', 'commandTemplate', 'estimatedDuration',
    'progressStrategy', 'milestones', 'progressParser', 'continueOnError',
]);

const PROGRESS_MILESTONE_FIELDS = new Set([
    'pattern', 'progress', 'message',
]);

const PREREQUISITE_PLUGIN_FIELDS = new Set([
    'id', 'name', 'description', 'check', 'install', 'requiredFor',
]);

const COMPONENT_REQUIREMENT_FIELDS = new Set([
    'prerequisites', 'plugins', 'nodeVersions',
]);

const POST_INSTALL_FIELDS = new Set([
    'message', 'action',
]);

// ============================================================================
// Logging.json Field Sets
// ============================================================================

const LOGGING_ROOT_FIELDS = new Set([
    'operations', 'statuses',
]);

// ============================================================================
// Helper Functions
// ============================================================================

function getObjectFields(obj: Record<string, unknown>): string[] {
    return Object.keys(obj);
}

function findUnknownFields(
    obj: Record<string, unknown>,
    allowedFields: Set<string>
): string[] {
    return getObjectFields(obj).filter(field => !allowedFields.has(field));
}

function formatUnknownFieldsError(
    objectType: string,
    objectId: string | unknown,
    unknownFields: string[],
    typeFile: string
): string {
    return `${objectType} "${objectId}" has unknown fields: ${unknownFields.join(', ')}. ` +
           `Add these to TypeScript interface (${typeFile}) or remove from JSON.`;
}

// ============================================================================
// Tests
// ============================================================================

describe('Type/JSON Alignment - Prerequisites & Logging', () => {
    let prerequisitesConfig: Record<string, unknown>;
    let loggingConfig: Record<string, unknown>;

    beforeAll(() => {
        const prerequisitesPath = path.join(__dirname, '../../src/features/prerequisites/config/prerequisites.json');
        const loggingPath = path.join(__dirname, '../../src/core/logging/config/logging.json');

        prerequisitesConfig = JSON.parse(fs.readFileSync(prerequisitesPath, 'utf-8'));
        loggingConfig = JSON.parse(fs.readFileSync(loggingPath, 'utf-8'));
    });

    describe('prerequisites.json <-> PrerequisitesConfig alignment', () => {
        it('should have no unknown fields in root config', () => {
            const unknown = findUnknownFields(prerequisitesConfig, PREREQUISITES_ROOT_FIELDS);
            if (unknown.length > 0) {
                throw new Error(`prerequisites.json root has unknown fields: ${unknown.join(', ')}. ` +
                     `Add to PrerequisitesConfig (src/features/prerequisites/services/types.ts) or remove from JSON.`);
            }
        });

        it('should have no unknown fields in any prerequisite definition', () => {
            const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
            prerequisites.forEach(prereq => {
                const unknown = findUnknownFields(prereq, PREREQUISITE_DEFINITION_FIELDS);
                if (unknown.length > 0) {
                    throw new Error(formatUnknownFieldsError(
                        'Prerequisite', prereq.id, unknown,
                        'src/features/prerequisites/services/types.ts - PrerequisiteDefinition'
                    ));
                }
            });
        });

        it('should have no unknown fields in prerequisite.check blocks', () => {
            const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
            prerequisites.forEach(prereq => {
                if (prereq.check) {
                    const check = prereq.check as Record<string, unknown>;
                    const unknown = findUnknownFields(check, PREREQUISITE_CHECK_FIELDS);
                    if (unknown.length > 0) {
                        throw new Error(`Prerequisite "${prereq.id}" check has unknown fields: ${unknown.join(', ')}. ` +
                             `Add to PrerequisiteCheck (src/features/prerequisites/services/types.ts) or remove from JSON.`);
                    }
                }
            });
        });

        it('should have no unknown fields in prerequisite.versionCheck blocks', () => {
            const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
            prerequisites.forEach(prereq => {
                if (prereq.versionCheck) {
                    const versionCheck = prereq.versionCheck as Record<string, unknown>;
                    const unknown = findUnknownFields(versionCheck, PREREQUISITE_CHECK_FIELDS);
                    if (unknown.length > 0) {
                        throw new Error(`Prerequisite "${prereq.id}" versionCheck has unknown fields: ${unknown.join(', ')}. ` +
                             `Add to PrerequisiteCheck (src/features/prerequisites/services/types.ts) or remove from JSON.`);
                    }
                }
            });
        });

        it('should have no unknown fields in prerequisite.install blocks', () => {
            const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
            prerequisites.forEach(prereq => {
                if (prereq.install) {
                    const install = prereq.install as Record<string, unknown>;
                    const unknown = findUnknownFields(install, PREREQUISITE_INSTALL_FIELDS);
                    if (unknown.length > 0) {
                        throw new Error(`Prerequisite "${prereq.id}" install has unknown fields: ${unknown.join(', ')}. ` +
                             `Add to PrerequisiteInstall (src/features/prerequisites/services/types.ts) or remove from JSON.`);
                    }
                }
            });
        });

        it('should have no unknown fields in prerequisite.uninstall blocks', () => {
            const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
            prerequisites.forEach(prereq => {
                if (prereq.uninstall) {
                    const uninstall = prereq.uninstall as Record<string, unknown>;
                    const unknown = findUnknownFields(uninstall, PREREQUISITE_INSTALL_FIELDS);
                    if (unknown.length > 0) {
                        throw new Error(`Prerequisite "${prereq.id}" uninstall has unknown fields: ${unknown.join(', ')}. ` +
                             `Add to PrerequisiteInstall (src/features/prerequisites/services/types.ts) or remove from JSON.`);
                    }
                }
            });
        });

        it('should have no unknown fields in prerequisite.postInstall blocks', () => {
            const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
            prerequisites.forEach(prereq => {
                if (prereq.postInstall) {
                    const postInstall = prereq.postInstall as Record<string, unknown>;
                    const unknown = findUnknownFields(postInstall, POST_INSTALL_FIELDS);
                    if (unknown.length > 0) {
                        throw new Error(`Prerequisite "${prereq.id}" postInstall has unknown fields: ${unknown.join(', ')}. ` +
                             `Add to PostInstall (src/features/prerequisites/services/types.ts) or remove from JSON.`);
                    }
                }
            });
        });

        it('should have no unknown fields in install.steps entries', () => {
            const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
            prerequisites.forEach(prereq => {
                if (prereq.install) {
                    const install = prereq.install as Record<string, unknown>;
                    if (install.steps) {
                        const steps = install.steps as Array<Record<string, unknown>>;
                        steps.forEach((step, index) => {
                            const unknown = findUnknownFields(step, INSTALL_STEP_FIELDS);
                            if (unknown.length > 0) {
                                throw new Error(`Prerequisite "${prereq.id}" install.steps[${index}] has unknown fields: ` +
                                     `${unknown.join(', ')}. Add to InstallStep (src/features/prerequisites/services/types.ts) or remove from JSON.`);
                            }
                        });
                    }
                }
            });
        });

        it('should have no unknown fields in step.milestones entries', () => {
            const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
            prerequisites.forEach(prereq => {
                if (prereq.install) {
                    const install = prereq.install as Record<string, unknown>;
                    if (install.steps) {
                        const steps = install.steps as Array<Record<string, unknown>>;
                        steps.forEach((step, stepIndex) => {
                            if (step.milestones) {
                                const milestones = step.milestones as Array<Record<string, unknown>>;
                                milestones.forEach((milestone, milestoneIndex) => {
                                    const unknown = findUnknownFields(milestone, PROGRESS_MILESTONE_FIELDS);
                                    if (unknown.length > 0) {
                                        throw new Error(`Prerequisite "${prereq.id}" install.steps[${stepIndex}].milestones[${milestoneIndex}] ` +
                                             `has unknown fields: ${unknown.join(', ')}. ` +
                                             `Add to ProgressMilestone (src/features/prerequisites/services/types.ts) or remove from JSON.`);
                                    }
                                });
                            }
                        });
                    }
                }
            });
        });

        it('should have no unknown fields in prerequisite.plugins entries', () => {
            const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
            prerequisites.forEach(prereq => {
                if (prereq.plugins) {
                    const plugins = prereq.plugins as Array<Record<string, unknown>>;
                    plugins.forEach((plugin, index) => {
                        const unknown = findUnknownFields(plugin, PREREQUISITE_PLUGIN_FIELDS);
                        if (unknown.length > 0) {
                            throw new Error(`Prerequisite "${prereq.id}" plugins[${index}] has unknown fields: ` +
                                 `${unknown.join(', ')}. Add to PrerequisitePlugin (src/features/prerequisites/services/types.ts) or remove from JSON.`);
                        }
                    });
                }
            });
        });

        it('should have no unknown fields in plugin.check blocks', () => {
            const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
            prerequisites.forEach(prereq => {
                if (prereq.plugins) {
                    const plugins = prereq.plugins as Array<Record<string, unknown>>;
                    plugins.forEach((plugin, index) => {
                        if (plugin.check) {
                            const check = plugin.check as Record<string, unknown>;
                            const unknown = findUnknownFields(check, PREREQUISITE_CHECK_FIELDS);
                            if (unknown.length > 0) {
                                throw new Error(`Prerequisite "${prereq.id}" plugins[${index}].check has unknown fields: ` +
                                     `${unknown.join(', ')}. Add to PrerequisiteCheck (src/features/prerequisites/services/types.ts) or remove from JSON.`);
                            }
                        }
                    });
                }
            });
        });

        it('should have no unknown fields in plugin.install blocks', () => {
            const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
            prerequisites.forEach(prereq => {
                if (prereq.plugins) {
                    const plugins = prereq.plugins as Array<Record<string, unknown>>;
                    plugins.forEach((plugin, index) => {
                        if (plugin.install) {
                            const install = plugin.install as Record<string, unknown>;
                            const unknown = findUnknownFields(install, PREREQUISITE_INSTALL_FIELDS);
                            if (unknown.length > 0) {
                                throw new Error(`Prerequisite "${prereq.id}" plugins[${index}].install has unknown fields: ` +
                                     `${unknown.join(', ')}. Add to PrerequisiteInstall (src/features/prerequisites/services/types.ts) or remove from JSON.`);
                            }
                        }
                    });
                }
            });
        });

        it('should have no unknown fields in plugin.install.steps entries', () => {
            const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
            prerequisites.forEach(prereq => {
                if (prereq.plugins) {
                    const plugins = prereq.plugins as Array<Record<string, unknown>>;
                    plugins.forEach((plugin, pluginIndex) => {
                        if (plugin.install) {
                            const install = plugin.install as Record<string, unknown>;
                            if (install.steps) {
                                const steps = install.steps as Array<Record<string, unknown>>;
                                steps.forEach((step, stepIndex) => {
                                    const unknown = findUnknownFields(step, INSTALL_STEP_FIELDS);
                                    if (unknown.length > 0) {
                                        throw new Error(`Prerequisite "${prereq.id}" plugins[${pluginIndex}].install.steps[${stepIndex}] ` +
                                             `has unknown fields: ${unknown.join(', ')}. ` +
                                             `Add to InstallStep (src/features/prerequisites/services/types.ts) or remove from JSON.`);
                                    }
                                });
                            }
                        }
                    });
                }
            });
        });

        it('should have no unknown fields in componentRequirements entries', () => {
            const requirements = prerequisitesConfig.componentRequirements as Record<string, Record<string, unknown>> | undefined;
            if (!requirements) return;

            Object.entries(requirements).forEach(([componentId, requirement]) => {
                const unknown = findUnknownFields(requirement, COMPONENT_REQUIREMENT_FIELDS);
                if (unknown.length > 0) {
                    throw new Error(`componentRequirements["${componentId}"] has unknown fields: ${unknown.join(', ')}. ` +
                         `Add to ComponentRequirement (src/features/prerequisites/services/types.ts) or remove from JSON.`);
                }
            });
        });
    });

    describe('logging.json <-> LoggingTemplates alignment', () => {
        it('should have no unknown fields in root config', () => {
            const unknown = findUnknownFields(loggingConfig, LOGGING_ROOT_FIELDS);
            if (unknown.length > 0) {
                throw new Error(`logging.json root has unknown fields: ${unknown.join(', ')}. ` +
                     `Add to LoggingTemplates (src/core/logging/stepLogger.ts) or remove from JSON.`);
            }
        });

        it('should have operations section as an object', () => {
            expect(loggingConfig.operations).toBeDefined();
            expect(typeof loggingConfig.operations).toBe('object');
            expect(loggingConfig.operations).not.toBeNull();
        });

        it('should have statuses section as an object', () => {
            expect(loggingConfig.statuses).toBeDefined();
            expect(typeof loggingConfig.statuses).toBe('object');
            expect(loggingConfig.statuses).not.toBeNull();
        });

        it('should have only string values in operations section', () => {
            const operations = loggingConfig.operations as Record<string, unknown>;
            Object.entries(operations).forEach(([key, value]) => {
                if (typeof value !== 'string') {
                    throw new Error(`logging.json operations.${key} is not a string: found ${typeof value}. ` +
                         `All logging template values must be strings.`);
                }
            });
        });

        it('should have non-empty string values in operations section', () => {
            const operations = loggingConfig.operations as Record<string, unknown>;
            Object.entries(operations).forEach(([key, value]) => {
                if (typeof value === 'string' && value.trim() === '') {
                    throw new Error(`logging.json operations.${key} is empty. ` +
                         `Logging templates must contain message text.`);
                }
            });
        });

        it('should have only string values in statuses section', () => {
            const statuses = loggingConfig.statuses as Record<string, unknown>;
            Object.entries(statuses).forEach(([key, value]) => {
                if (typeof value !== 'string') {
                    throw new Error(`logging.json statuses.${key} is not a string: found ${typeof value}. ` +
                         `All logging template values must be strings.`);
                }
            });
        });

        it('should have non-empty string values in statuses section', () => {
            const statuses = loggingConfig.statuses as Record<string, unknown>;
            Object.entries(statuses).forEach(([key, value]) => {
                if (typeof value === 'string' && value.trim() === '') {
                    throw new Error(`logging.json statuses.${key} is empty. ` +
                         `Logging templates must contain message text.`);
                }
            });
        });
    });
});
