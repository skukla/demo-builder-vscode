/**
 * The gate is two literals in two files that must agree: the context key this
 * module publishes, and the `when` clause `package.json` hides the commands
 * behind. Nothing else checks that pairing — a typo in either would leave the
 * commands permanently hidden (or permanently visible) with every other test
 * green.
 */

import * as fs from 'fs';
import * as path from 'path';
import { EVALUATION_TOOLS_CONTEXT_KEY, EVALUATION_TOOLS_SETTING_KEY } from '@/features/ai/evaluation/evaluationGate';

const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../../../package.json'), 'utf-8'),
) as {
    contributes: {
        commands: Array<{ command: string }>;
        menus?: { commandPalette?: Array<{ command: string; when?: string }> };
        configuration: Array<{ title?: string; properties: Record<string, { default?: unknown }> }>;
    };
};

/** The tools that exist to MEASURE the extension, not to build a demo. */
const GATED_COMMANDS = [
    'demoBuilder.evaluatePrompt',
    'demoBuilder.showEvaluationWorkbench',
    'demoBuilder.showAgentTrace',
    'demoBuilder.toggleAgentDryRun',
];

describe('evaluation tools gate', () => {
    const palette = manifest.contributes.menus?.commandPalette ?? [];

    it('hides every evaluation command behind the context key this module sets', () => {
        for (const command of GATED_COMMANDS) {
            const entry = palette.find((e) => e.command === command);
            expect(entry).toBeDefined();
            expect(entry?.when).toBe(EVALUATION_TOOLS_CONTEXT_KEY);
        }
    });

    it('gates commands that are actually declared', () => {
        const declared = new Set(manifest.contributes.commands.map((c) => c.command));
        expect(GATED_COMMANDS.filter((c) => !declared.has(c))).toEqual([]);
    });

    it('defaults the setting to off — a producer should not meet these', () => {
        const properties = Object.assign(
            {},
            ...manifest.contributes.configuration.map((b) => b.properties),
        ) as Record<string, { default?: unknown }>;
        expect(properties[EVALUATION_TOOLS_SETTING_KEY]).toBeDefined();
        expect(properties[EVALUATION_TOOLS_SETTING_KEY].default).toBe(false);
    });

    it('leaves every OTHER command visible', () => {
        // The palette list is an allowlist of things to HIDE. A stray entry here
        // would hide a command users need, which is invisible in a unit test of
        // that command.
        const gated = new Set(GATED_COMMANDS);
        expect(palette.filter((e) => !gated.has(e.command)).map((e) => e.command)).toEqual([]);
    });
});
