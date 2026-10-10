/**
 * The install-step command line: what to run, what to call it, and how to spawn it.
 *
 * Resolves a step's commands (static list or `{version}` template), wraps them in
 * `fnm exec` when a Node version is named, and spawns them in a shell with Demo
 * Builder's Node folder on the environment. Moved out of ProgressUnifier.ts by
 * EDS-8 (2026-10-08); the bodies are unchanged.
 */

import type { ChildProcessWithoutNullStreams } from 'child_process';
import type { IProcessSpawner } from './types';
import { fnmExecCommand, nodeFolderProcessEnv } from '@/core/shell/nodeFolder';
import type { InstallStep } from '@/types/prerequisites';

/**
 * Command resolution options
 */
export interface CommandResolveOptions {
    nodeVersion?: string;
}

/**
 * Resolve commands from an install step
 */
export function resolveCommands(step: InstallStep, options?: CommandResolveOptions): string[] {
    let commands: string[] = [];

    if (step.commands) {
        commands = step.commands;
    } else if (step.commandTemplate) {
        const template = step.commandTemplate;
        const hasPlaceholder = template.includes('{version}');

        if (hasPlaceholder) {
            if (options?.nodeVersion) {
                commands = [template.replace(/{version}/g, options.nodeVersion)];
            }
        } else {
            commands = [template];
        }
    }

    // Wrap commands with fnm if Node version specified
    const nodeVersion = options?.nodeVersion;
    if (nodeVersion && commands.length > 0) {
        commands = commands.map(cmd =>
            cmd.startsWith('fnm ') ? cmd : fnmExecCommand('fnm', nodeVersion, cmd),
        );
    }

    return commands;
}

/**
 * Resolve step name with Node version substitution
 */
export function resolveStepName(step: InstallStep, options?: CommandResolveOptions): string {
    if (options?.nodeVersion) {
        return step.name.replace(/{version}/g, options.nodeVersion);
    }
    return step.name;
}

/**
 * Spawn a command with proper shell configuration
 *
 * SECURITY: shell: true usage
 *
 * This method uses shell: true for the following reasons:
 * 1. fnm environment setup requires shell evaluation: eval "$(fnm env)"
 * 2. Command chaining with && for fnm initialization + actual command
 * 3. Commands come from prerequisites.json (controlled configuration file)
 *
 * SAFE because:
 * - All commands originate from prerequisites.json (not user input)
 * - Node versions are validated before reaching this code
 * - File paths would be validated by validateProjectPath() if used
 * - No external API data flows into command strings here
 * - Template variables ({version}) are replaced with validated values
 */
export function spawnCommand(
    processSpawner: IProcessSpawner,
    command: string,
): ChildProcessWithoutNullStreams {
    let actualCommand = command;
    if (command.startsWith('fnm ')) {
        actualCommand = `eval "$(fnm env)" && ${command}`;
    }

    return processSpawner(actualCommand, [], {
        shell: true,
        env: {
            // Demo Builder's Node folder (PR-1a): installs land there.
            ...nodeFolderProcessEnv(),
            NO_COLOR: '1',
            FORCE_COLOR: '0',
        },
    });
}
