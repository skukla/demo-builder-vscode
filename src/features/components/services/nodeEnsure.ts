/**
 * Ensure the Node a thing runs on, and the Adobe CLI under it when the thing uses
 * `aio` (PR-1a step 2): the one "make sure" call every door uses.
 *
 * The version comes from `demoBuilderNode()` (core/shell/demoBuilderNode.ts); the Adobe CLI's
 * install commands come from the prerequisites' own `aio-cli` entry and its
 * plugins, so there is one definition of "install the Adobe CLI" whether the
 * prerequisites screen runs it or a door does. Everything lands in Demo Builder's
 * own Node store (`core/shell/nodeStore.ts`).
 *
 * @module features/components/services/nodeEnsure
 */

import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { ensureFnmNodeVersion, ensureNodeWithAdobeCli } from '@/core/shell/ensureNodeVersion';
import prerequisitesConfig from '@/features/prerequisites/config/prerequisites.json';
import type { Logger } from '@/types/logger';

interface InstallStep {
    commands?: string[];
    [key: string]: unknown;
}

interface CliEntry {
    id: string;
    install?: { steps?: InstallStep[] };
    plugins?: Array<{ install?: { steps?: InstallStep[] } }>;
}

const ADOBE_CLI_PREREQUISITE = 'aio-cli';

function commandsOf(steps: InstallStep[] | undefined): string[] {
    return (steps ?? []).flatMap((step) => step.commands ?? []);
}

/**
 * The Adobe CLI's install commands, then each of its plugins', as the
 * prerequisites declare them.
 */
export function adobeCliInstallCommands(): string[] {
    const prerequisites: CliEntry[] = prerequisitesConfig.prerequisites;
    const cli = prerequisites.find((entry) => entry.id === ADOBE_CLI_PREREQUISITE);
    if (!cli) throw new Error(`prerequisites.json has no ${ADOBE_CLI_PREREQUISITE} entry`);
    return [
        ...commandsOf(cli.install?.steps),
        ...(cli.plugins ?? []).flatMap((plugin) => commandsOf(plugin.install?.steps)),
    ];
}

/**
 * Make Node `major` available in Demo Builder's store, and the Adobe CLI under it
 * when `adobeCli`. Returns an error string, or undefined to proceed.
 */
export function ensureNode(
    executor: CommandExecutor,
    target: { major: string; adobeCli: boolean },
    logger: Pick<Logger, 'debug'>,
): Promise<string | undefined> {
    return target.adobeCli
        ? ensureNodeWithAdobeCli(executor, target.major, adobeCliInstallCommands(), logger)
        : ensureFnmNodeVersion(executor, target.major, logger);
}
