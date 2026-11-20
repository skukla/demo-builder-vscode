/**
 * SOP: a message that sends the SC to Settings gives a button that opens the setting (owner rule,
 * release test 1.4, 2026-11-16). Words alone leave the SC hunting for a key; the button runs
 * `workbench.action.openSettings` with the setting's id.
 *
 * Read from the source with the compiler, so comments are not read: every string the extension
 * shows that says "in Settings" (or "Settings →") must sit beside its way to open the setting.
 * Beside means within a few lines, where one of these is:
 *
 * - `setting:` — a datapack failure carrying the id; `renderDataInstallerFailure` turns it into
 *   the Open Settings button, which sends `open-setting`;
 * - `workbench.action.openSettings`, or an `Open Settings` action on a VS Code message.
 *
 * A website's own Settings page ("on github.com, Settings → Applications") is not a VS Code setting,
 * so it is not read either.
 *
 * Agent-facing text (`src/features/ai/server/`) is not read: an agent has no button to press, and
 * the tool descriptions tell it to ask the SC instead. Log lines are not read: the SC does not see
 * them as a message.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import * as ts from 'typescript';

const ROOT = join(__dirname, '..', '..');
const SRC = join(ROOT, 'src');

/** A string that sends the SC to Settings. */
const POINTS_TO_SETTINGS = /\bin [Ss]ettings\b|\bSettings\s*(?:→|->)/;
/** A website's own Settings page ("on github.com, Settings →"), not a VS Code setting. */
const A_WEBSITES_SETTINGS = /\bon [a-z0-9-]+\.(?:com|live|net)\b/;
/** The way to open the setting, written beside the message. */
const OPENS_THE_SETTING =
    /\bsetting\s*:|workbench\.action\.openSettings|OPEN_SETTINGS|'Open Settings'/;
/** How far from the message the way to open it may be written, in lines. */
const NEAR = 6;
/** Not read: text for agents, which press no buttons. */
const AGENT_TEXT = join('src', 'features', 'ai', 'server');

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        return /\.tsx?$/.test(name) && !name.endsWith('.d.ts') ? [path] : [];
    });
}

/** Inside a logger call: the SC does not see it as a message. */
function inLogCall(node: ts.Node): boolean {
    for (let at: ts.Node | undefined = node.parent; at; at = at.parent) {
        if (
            ts.isCallExpression(at) &&
            /\b(?:logger|debugLogger|log)\b/i.test(at.expression.getText())
        )
            return true;
        if (ts.isStatement(at)) return false;
    }
    return false;
}

/** Each message in one file's text that points to Settings with no way to open it nearby. */
export function unopenableSettingMessages(file: string, text: string): string[] {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const lines = text.split('\n');
    const found: string[] = [];
    const visit = (node: ts.Node): void => {
        const isText =
            ts.isStringLiteral(node) ||
            ts.isNoSubstitutionTemplateLiteral(node) ||
            ts.isTemplateHead(node) ||
            ts.isTemplateMiddle(node) ||
            ts.isTemplateTail(node);
        if (isText && POINTS_TO_SETTINGS.test(node.text) && !A_WEBSITES_SETTINGS.test(node.text) && !inLogCall(node)) {
            const line = source.getLineAndCharacterOfPosition(node.getStart()).line;
            const near = lines.slice(Math.max(0, line - NEAR), line + NEAR + 1).join('\n');
            if (!OPENS_THE_SETTING.test(near)) found.push(`${file}:${line + 1} "${node.text}"`);
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return found;
}

describe('a message that sends the SC to Settings', () => {
    const files = sourceFiles(SRC)
        .map((path) => relative(ROOT, path))
        .filter((path) => !path.startsWith(AGENT_TEXT));

    it('CONTROL: the scan reads the messages that point to Settings', () => {
        const pointing = files.filter((file) =>
            POINTS_TO_SETTINGS.test(readFileSync(join(ROOT, file), 'utf8'))
        );
        expect(pointing.length).toBeGreaterThanOrEqual(3);
    });

    it('CONTROL: a planted message with no button is caught, and one with a setting id is not', () => {
        const bare = "const failure = {\n    error: 'Set the address in Settings.',\n};\n";
        const opened =
            "const failure = {\n    error: 'Set the address in Settings.',\n    setting: 'demoBuilder.x.y',\n};\n";
        const logged = "logger.warn('Set the address in Settings.');\n";
        const website = "const tip = 'Request it: on github.com, Settings → Applications.';\n";

        expect(unopenableSettingMessages('planted.ts', bare)).toHaveLength(1);
        expect(unopenableSettingMessages('planted.ts', opened)).toStrictEqual([]);
        expect(unopenableSettingMessages('planted.ts', logged)).toStrictEqual([]);
        expect(unopenableSettingMessages('planted.ts', website)).toStrictEqual([]);
    });

    it('offers a button that opens the setting', () => {
        const missing = files.flatMap((file) =>
            unopenableSettingMessages(file, readFileSync(join(ROOT, file), 'utf8'))
        );

        expect(missing).toStrictEqual([]);
    });
});
