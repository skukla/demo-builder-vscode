/**
 * Every setting with a fixed list of values shows those values as names, not as stored codes.
 *
 * Found by the owner in release test 2.7 (2026-11-16): Settings showed the Cleanup Behavior
 * dropdown as "ask", "deleteAll", "localOnly", which read like code. VS Code shows `enumItemLabels`
 * in the dropdown when they are present and the raw value when not, so a setting without them puts
 * its stored codes in front of the SC. The labels are names, so they are Title Case, by the same check
 * every other label here passes (`firstNonTitleWord`). The stored values never change: saved settings
 * keep working.
 *
 * Not `ui-label-case.test.ts`: that one reads labels written in the webview source and cannot see a
 * label that is MISSING. This one reads `package.json`'s settings, where the defect is an absence.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { firstNonTitleWord } from './uiLabelCase.scan';

interface SettingSchema {
    enum?: unknown[];
    enumItemLabels?: string[];
    properties?: Record<string, SettingSchema>;
}

const MANIFEST = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
    contributes: {
        configuration:
            | { properties: Record<string, SettingSchema> }
            | Array<{ properties: Record<string, SettingSchema> }>;
    };
};

/** Every setting (and nested property) that lists its values, by its full key. */
function enumSettings(): Array<[string, SettingSchema]> {
    const sections = ([] as Array<{ properties: Record<string, SettingSchema> }>).concat(
        MANIFEST.contributes.configuration
    );
    const found: Array<[string, SettingSchema]> = [];
    const walk = (key: string, schema: SettingSchema): void => {
        if (schema.enum) found.push([key, schema]);
        for (const [child, nested] of Object.entries(schema.properties ?? {}))
            walk(`${key}.${child}`, nested);
    };
    for (const section of sections) {
        for (const [key, schema] of Object.entries(section.properties ?? {})) walk(key, schema);
    }
    return found;
}

describe('settings with a fixed list of values', () => {
    it('CONTROL: the manifest has enum settings to check', () => {
        expect(enumSettings().length).toBeGreaterThan(5);
    });

    it('label every value, one label per value', () => {
        const unlabelled = enumSettings()
            .filter(([, schema]) => schema.enumItemLabels?.length !== schema.enum?.length)
            .map(([key]) => key);

        expect(unlabelled).toStrictEqual([]);
    });

    it('label them in Title Case', () => {
        const notTitle = enumSettings().flatMap(([key, schema]) =>
            (schema.enumItemLabels ?? [])
                .filter((label) => firstNonTitleWord(label) !== undefined)
                .map((label) => `${key}: "${label}"`)
        );

        expect(notTitle).toStrictEqual([]);
    });
});
