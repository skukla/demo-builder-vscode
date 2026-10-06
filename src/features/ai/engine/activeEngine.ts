/**
 * The engine this window serves right now, and whether it can start a chat.
 *
 * Reads `demoBuilder.ai.engine` and asks which agent CLIs are installed, then lets
 * `resolveEngine` decide. One function, so the Chat launch and the "AI Ready" badge
 * cannot disagree about which agent the SC is using.
 *
 * @module features/ai/engine/activeEngine
 */

import * as vscode from 'vscode';
import { isAgentCliInstalled, type CommandProbe } from './agentCli';
import {
    describeEngine,
    resolveEngine,
    type AgentEngineDescriptor,
    type AgentEngineSetting,
} from './agentEngine';
import type { AgentPermissions } from './chatLaunch';

export interface ActiveEngine {
    descriptor: AgentEngineDescriptor;
    /**
     * Whether the chat can start: the engine's CLI is installed, or the engine
     * needs none (VS Code's own chat).
     */
    installed: boolean;
    /** `demoBuilder.ai.permissions`; terminal engines only. */
    permissions: AgentPermissions;
}

/**
 * Resolve the engine from the setting and the installed CLIs.
 *
 * @param probe - the extension's command executor (`commandExists`)
 */
export async function resolveActiveEngine(probe: CommandProbe): Promise<ActiveEngine> {
    const config = vscode.workspace.getConfiguration('demoBuilder.ai');
    const setting = config.get<AgentEngineSetting>('engine');
    const permissions = config.get<AgentPermissions>('permissions') ?? 'ask';
    // An explicit setting (or the default) decides alone; only `auto` needs to know
    // what is installed.
    const detect = setting === 'auto';
    const engine = resolveEngine(setting, {
        claudeCode: detect && (await isAgentCliInstalled('claude', probe)),
        copilotCli: detect && (await isAgentCliInstalled('copilot', probe)),
    });
    const descriptor = describeEngine(engine);
    const installed =
        descriptor.launch.kind === 'terminal'
            ? await isAgentCliInstalled(descriptor.launch.command, probe)
            : true;
    return { descriptor, installed, permissions };
}

/**
 * What the "AI Ready" badge needs: can the SC's agent start a chat, and what is
 * it called. The badge says "Copilot CLI not installed", not a name the SC
 * never chose.
 */
export async function agentCliStatus(
    probe: CommandProbe,
): Promise<{ installed: boolean; name: string }> {
    const { descriptor, installed } = await resolveActiveEngine(probe);
    return { installed, name: descriptor.displayName };
}
