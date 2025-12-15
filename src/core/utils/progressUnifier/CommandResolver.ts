/**
 * CommandResolver
 *
 * Resolves install step commands with Node version substitution
 * and fnm wrapper injection.
 */

import { InstallStep } from '@/features/prerequisites/services/PrerequisitesManager';

/**
 * Options for command resolution
 */
export interface CommandResolveOptions {
    nodeVersion?: string;
}

/**
 * Command resolver for install steps
 *
 * Handles:
 * - Direct commands from step.commands array
 * - Template commands with {version} placeholder substitution
 * - fnm wrapper injection for Node version-specific execution
 */
export class CommandResolver {
    /**
     * Resolve commands from an install step
     *
     * @param step The install step definition
     * @param options Resolution options (nodeVersion)
     * @returns Array of resolved command strings
     */
    resolveCommands(step: InstallStep, options?: CommandResolveOptions): string[] {
        let commands: string[] = [];

        if (step.commands) {
            commands = step.commands;
        } else if (step.commandTemplate) {
            const template = step.commandTemplate;
            const hasPlaceholder = template.includes('{version}');

            if (hasPlaceholder) {
                // Template requires substitution
                if (options?.nodeVersion) {
                    commands = [template.replace(/{version}/g, options.nodeVersion)];
                }
                // If nodeVersion not provided, return empty array
            } else {
                // Pre-substituted template (e.g., "fnm install 18")
                commands = [template];
            }
        }

        // Wrap commands with fnm if Node version specified
        if (options?.nodeVersion && commands.length > 0) {
            commands = commands.map(cmd =>
                cmd.startsWith('fnm ') ? cmd : `fnm exec --using ${options.nodeVersion} ${cmd}`
            );
        }

        return commands;
    }

    /**
     * Resolve step name with Node version substitution
     *
     * @param step The install step definition
     * @param options Resolution options (nodeVersion)
     * @returns Resolved step name
     */
    resolveStepName(step: InstallStep, options?: CommandResolveOptions): string {
        if (options?.nodeVersion) {
            return step.name.replace(/{version}/g, options.nodeVersion);
        }
        return step.name;
    }
}
