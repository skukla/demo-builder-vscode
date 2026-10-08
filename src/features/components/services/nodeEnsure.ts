/**
 * Ensure the Node a thing runs on, and the Adobe CLI under it when the thing uses
 * `aio` (PR-1a step 2): the one "make sure" call every door uses.
 *
 * The version comes from `demoBuilderNode()` (core/shell/demoBuilderNode.ts); the Adobe CLI's
 * install commands come from the prerequisites' own `aio-cli` entry and its
 * plugins, so there is one definition of "install the Adobe CLI" whether the
 * prerequisites screen runs it or a door does. Everything lands in Demo Builder's
 * Node folder (`core/shell/nodeFolder.ts`).
 *
 * @module features/components/services/nodeEnsure
 */

import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { ensureFnmNodeVersion, ensureNodeWithAdobeCli } from '@/core/shell/ensureNodeVersion';
import type { PrerequisitesManager } from '@/features/prerequisites/services/PrerequisitesManager';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';

/** The prerequisites reader the Adobe CLI's install commands come from (its one definition). */
export type AdobeCliPrerequisites = Pick<
    PrerequisitesManager,
    'getPrerequisiteById' | 'getInstallSteps' | 'getPluginInstallCommands'
>;

const ADOBE_CLI_PREREQUISITE = 'aio-cli';

/** A handler context's prerequisites manager; every real one carries it (handlerContextFactory, headlessHandlerContext). */
export function prerequisitesOf(context: Pick<HandlerContext, 'prereqManager'>): AdobeCliPrerequisites {
    if (!context.prereqManager) throw new Error('This handler context has no prerequisites manager');
    return context.prereqManager;
}

/**
 * The Adobe CLI's install commands for Node `major`, then each of its plugins', read
 * through the prerequisites manager exactly as the prerequisites screen reads them
 * (`getInstallSteps`, `getPluginInstallCommands`), so "install the Adobe CLI" has
 * one definition wherever it runs.
 */
export async function adobeCliInstallCommands(prereqs: AdobeCliPrerequisites, major: string): Promise<string[]> {
    const cli = await prereqs.getPrerequisiteById(ADOBE_CLI_PREREQUISITE);
    if (!cli) throw new Error(`prerequisites.json has no ${ADOBE_CLI_PREREQUISITE} entry`);
    const steps = prereqs.getInstallSteps(cli, { nodeVersions: [major] })?.steps ?? [];
    const commands = steps.flatMap((step) => step.commands ?? []);
    for (const plugin of cli.plugins ?? []) {
        commands.push(...((await prereqs.getPluginInstallCommands(cli.id, plugin.id))?.commands ?? []));
    }
    return commands;
}

/**
 * Make Node `major` available in Demo Builder's Node folder, and the Adobe CLI under
 * it when `adobeCli`. Returns an error string, or undefined to proceed.
 */
export async function ensureNode(
    executor: CommandExecutor,
    prereqs: AdobeCliPrerequisites,
    target: { major: string; adobeCli: boolean },
    logger: Pick<Logger, 'debug'>,
): Promise<string | undefined> {
    return target.adobeCli
        ? ensureNodeWithAdobeCli(executor, target.major, await adobeCliInstallCommands(prereqs, target.major), logger)
        : ensureFnmNodeVersion(executor, target.major, logger);
}
