/**
 * Settings tools (Phase 4, Group 7) — read the 21 `demoBuilder.*` keys, and
 * hand a change back to the user.
 *
 * ## Why the read exists
 *
 * Two of these keys are FUNCTIONAL GATES, not preferences: the Data Installer
 * surface does not exist without `dataInstaller.enabled` and
 * `dataInstaller.apiBaseUrl`. An agent asked "why can I not import a datapack?"
 * had no way to discover that the answer was a setting, and would go looking for
 * a broken service instead. Several others explain behaviour that otherwise
 * looks like a bug — `byom.enabled` off means product pages will not route,
 * `updateChannel` decides which releases are even visible.
 *
 * ## Why the write is a handoff
 *
 * A tool COULD call `workspace.getConfiguration().update()`. It should not.
 * Settings are the user's own surface, several of these keys are `machine`
 * scoped, and a value silently changed by an agent is indistinguishable from one
 * the user set — with no record of which. The handoff names the key and lets
 * them change it where they can see it.
 *
 * ## One value is reported as presence, not content
 *
 * `dataInstaller.apiBaseUrl` ships with NO default, and `package.json` says why
 * in its own description: "There is no default: this repository is public." It
 * is an internal endpoint someone sets locally. The agent's actual question is
 * whether the Data Installer is configured, which `configured: true` answers
 * without putting the endpoint in a transcript. Every other key returns its
 * value, including the two that look sensitive and are not —
 * `accsDiscovery.services` and `byom.overlayUrl` both ship their defaults in the
 * public `package.json` already, so withholding them would protect nothing while
 * making the tool inconsistent.
 *
 * @module features/ai/server/settingsTools
 */

import { z } from 'zod';
import { needsUser } from './handoff';
import { asText } from './mcpToolResult';

/**
 * Every `demoBuilder.*` key, as declared in `package.json` `contributes.configuration`.
 *
 * Listed rather than derived: the tool must name what it can read at
 * REGISTRATION time, and a key that has been removed from the manifest should
 * fail a test here rather than silently vanish from the surface. The pairing is
 * asserted against `package.json` in this tool's tests.
 */
export const SETTING_KEYS = [
    'demoBuilder.defaultPort',
    'demoBuilder.autoUpdate',
    'demoBuilder.autoZoom',
    'demoBuilder.updateChannel',
    'demoBuilder.logLevel',
    'demoBuilder.projectsViewMode',
    'demoBuilder.cleanupBehavior',
    'demoBuilder.blockLibraries.defaults',
    'demoBuilder.blockLibraries.custom',
    'demoBuilder.blockLibraries.syncBehavior',
    'demoBuilder.appBuilderComponents.custom',
    'demoBuilder.daLive.aemAuthorUrl',
    'demoBuilder.daLive.IMSOrgId',
    'demoBuilder.daLive.authoringExperience',
    'demoBuilder.daLive.ewCanvasBranch',
    'demoBuilder.accsDiscovery.services',
    'demoBuilder.byom.enabled',
    'demoBuilder.byom.overlayUrl',
    'demoBuilder.ai.engine',
    'demoBuilder.dataInstaller.enabled',
    'demoBuilder.dataInstaller.apiBaseUrl',
] as const;

/**
 * Keys reported as `{configured: boolean}` rather than by value.
 *
 * One entry, and it needs to stay hard to add to: every addition makes the tool
 * answer a different question than the one asked. See the module docstring for
 * why this key qualifies and why the other endpoint-shaped keys do not.
 */
const PRESENCE_ONLY = new Set(['demoBuilder.dataInstaller.apiBaseUrl']);

/**
 * How a single key is reported.
 *
 * `undefined` becomes `null` deliberately. `JSON.stringify` DROPS a key whose
 * value is undefined, so an unset setting with no declared default vanished from
 * the response entirely — an agent asking "what are my settings?" got a short
 * list with nothing saying it was short. `null` keeps every key present and
 * visibly unset, which is the answer to the question that was asked.
 */
function project(key: string, value: unknown): unknown {
    if (PRESENCE_ONLY.has(key)) {
        return { configured: typeof value === 'string' && value.trim().length > 0 };
    }
    return value === undefined ? null : value;
}

/**
 * Register `get_settings` and `set_setting`.
 *
 * @param server     McpServer (typed `any`; see registerProjectTools docstring).
 * @param readSetting Reads one `demoBuilder.*` key. Injected from `extension.ts`
 *   so this module carries no vscode import, matching viewTools and lifecycleTools.
 */
export function registerSettingsTools(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: any,
    readSetting: (key: string) => unknown,
): void {
    server.registerTool(
        'get_settings',
        {
            title: 'Get Settings',
            description:
                "The extension's VS Code settings and their current values. Check here when a " +
                'feature seems absent rather than broken — dataInstaller.enabled and byom.enabled ' +
                'are functional gates, not preferences.',
            inputSchema: {
                key: z
                    .string()
                    .optional()
                    .describe('One demoBuilder.* key. Omit for all of them.'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const requested = args?.key ? String(args.key) : undefined;

            if (requested) {
                if (!(SETTING_KEYS as readonly string[]).includes(requested)) {
                    // Name what IS available rather than only what is not.
                    return asText({
                        error: `"${requested}" is not a Demo Builder setting.`,
                        available: SETTING_KEYS,
                    });
                }
                return asText({ [requested]: project(requested, readSetting(requested)) });
            }

            const settings: Record<string, unknown> = {};
            for (const key of SETTING_KEYS) {
                settings[key] = project(key, readSetting(key));
            }
            return asText(settings);
        },
    );

    server.registerTool(
        'set_setting',
        {
            title: 'Set Setting',
            description:
                'Change one of the extension\'s VS Code settings. Hands back to the user — settings ' +
                'are their surface, and this call changes nothing by itself.',
            inputSchema: {
                key: z.string().describe('The demoBuilder.* key to change'),
                value: z
                    .string()
                    .optional()
                    .describe('The value to suggest, for the message shown to the user'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const key = String(args?.key ?? '').trim();
            if (!(SETTING_KEYS as readonly string[]).includes(key)) {
                return asText({
                    error: `"${key}" is not a Demo Builder setting.`,
                    available: SETTING_KEYS,
                });
            }

            const suggested = args?.value ? String(args.value) : undefined;
            return asText(
                needsUser({
                    reason: 'settings-edit',
                    what: `Change ${key} in VS Code settings`,
                    // The Settings UI filtered to this exact key — openable, which
                    // is what HandoffTarget requires of a `where`.
                    where: { command: 'workbench.action.openSettings' },
                    tellUser:
                        `Open VS Code Settings (Cmd+, / Ctrl+,), search for "${key}", and set it` +
                        `${suggested ? ` to ${suggested}` : ''}. ` +
                        'Nothing has been changed by this call — settings are yours to set, and a ' +
                        'value changed silently by an agent looks exactly like one you chose.',
                    resumeWith: 'get_settings',
                }),
            );
        },
    );
}
