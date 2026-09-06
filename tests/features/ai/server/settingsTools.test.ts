/**
 * `get_settings` and `set_setting`.
 *
 * The load-bearing test here is the LAST one: `SETTING_KEYS` is a hand-written
 * list, and a hand-written list of things declared elsewhere is the shape that
 * rots silently. It is asserted against `package.json` in BOTH directions —
 * a key added to the manifest and not here is invisible to agents, and a key
 * removed from the manifest but left here is a tool offering to read something
 * that no longer exists.
 */

import { readFileSync } from 'fs';
import { registerSettingsTools, SETTING_KEYS } from '@/features/ai/server/settingsTools';
import type { McpToolSchema } from '@/features/ai/server/mcpToolServer';

type Tool = (args?: unknown) => Promise<{ content: Array<{ text: string }> }>;

const VALUES: Record<string, unknown> = {
    'demoBuilder.defaultPort': 3000,
    'demoBuilder.byom.enabled': true,
    'demoBuilder.updateChannel': 'beta',
    'demoBuilder.dataInstaller.enabled': true,
    'demoBuilder.dataInstaller.apiBaseUrl': 'https://internal.example.test/api',
};

function harness(values: Record<string, unknown> = VALUES) {
    const tools = new Map<string, Tool>();
    // Kept, not discarded. The schema is what the SDK reads, and a stub that
    // throws it away is why two registration defects shipped (see McpToolServer).
    const schemas = new Map<string, McpToolSchema>();
    const read = jest.fn((key: string) => values[key]);
    registerSettingsTools(
        {
            registerTool(name: string, schema: McpToolSchema, handler: Tool) {
                tools.set(name, handler);
                schemas.set(name, schema);
            },
        },
        read
    );
    return {
        read,
        names: () => [...tools.keys()],
        schema: (name: string): McpToolSchema => schemas.get(name)!,
        /** The raw handler, so a test can call it the way the SDK might. */
        raw: (name: string): Tool => tools.get(name)!,
        async call(
            name: string,
            args: Record<string, unknown> = {}
        ): Promise<Record<string, unknown>> {
            return JSON.parse((await tools.get(name)!(args)).content[0].text);
        },
    };
}

/** Parse a handler's response when it is called outside the `call` helper. */
async function textOf(tool: Tool, args?: unknown): Promise<Record<string, unknown>> {
    return JSON.parse((await tool(args)).content[0].text);
}

it('registers both settings tools', () => {
    expect(harness().names().sort()).toEqual(['get_settings', 'set_setting']);
});

/**
 * What the SDK is TOLD about these tools.
 *
 * `readOnlyHint` is what the dry run gates on and what reaches the client in
 * `tools/list`, and `needsAuth` decides whether an agent is asked to sign in
 * before calling. Neither is decoration, and neither was asserted anywhere —
 * the stub used to discard the schema argument entirely.
 */
describe('what the tools declare', () => {
    it('declares get_settings read-only, non-destructive and credential-free', () => {
        const schema = harness().schema('get_settings');

        expect(schema.needsAuth).toBe(false);
        expect(schema.annotations).toEqual({ readOnlyHint: true, destructiveHint: false });
    });

    it('takes one optional key on get_settings', () => {
        expect(Object.keys(harness().schema('get_settings').inputSchema ?? {})).toEqual(['key']);
    });

    // set_setting is read-only too, and that is the whole design: it hands the
    // change back to the user rather than performing it.
    it('declares set_setting read-only, non-destructive and credential-free', () => {
        const schema = harness().schema('set_setting');

        expect(schema.needsAuth).toBe(false);
        expect(schema.annotations).toEqual({ readOnlyHint: true, destructiveHint: false });
    });

    it('takes a key and a suggested value on set_setting', () => {
        expect(Object.keys(harness().schema('set_setting').inputSchema ?? {})).toEqual([
            'key',
            'value',
        ]);
    });
});

describe('get_settings', () => {
    it('returns every key when none is named, set or not', async () => {
        const out = await harness().call('get_settings');

        // All 21, though the fixture only defines 5. JSON.stringify DROPS keys
        // whose value is undefined, so an unset setting used to vanish from the
        // response with nothing saying the list was short.
        expect(Object.keys(out)).toHaveLength(SETTING_KEYS.length);
        expect(out['demoBuilder.logLevel']).toBeNull();
    });

    it('returns one key when named', async () => {
        const out = await harness().call('get_settings', { key: 'demoBuilder.updateChannel' });
        expect(out).toEqual({ 'demoBuilder.updateChannel': 'beta' });
    });

    it('reports the Data Installer URL as presence, never as the endpoint', async () => {
        const out = await harness().call('get_settings');

        // package.json says why in its own words: "There is no default: this
        // repository is public." The agent's question is whether the Data
        // Installer is configured, not what the URL is.
        expect(out['demoBuilder.dataInstaller.apiBaseUrl']).toEqual({ configured: true });
        expect(JSON.stringify(out)).not.toContain('internal.example.test');
    });

    it('reports an unset Data Installer URL as not configured', async () => {
        const out = await harness({ 'demoBuilder.dataInstaller.apiBaseUrl': '   ' }).call(
            'get_settings',
            { key: 'demoBuilder.dataInstaller.apiBaseUrl' }
        );

        expect(out['demoBuilder.dataInstaller.apiBaseUrl']).toEqual({ configured: false });
    });

    it('returns other values verbatim, including the boolean gates', async () => {
        const out = await harness().call('get_settings');
        expect(out['demoBuilder.byom.enabled']).toBe(true);
        expect(out['demoBuilder.defaultPort']).toBe(3000);
    });

    it('accepts the unprefixed key form and answers under the full key', async () => {
        // Watched live 2026-08-27: the agent asked for `dataInstaller.enabled`,
        // was refused, and retried with the prefix — a wasted round trip for a
        // key that was unambiguous the first time.
        const out = await harness().call('get_settings', { key: 'defaultPort' });
        expect(out['demoBuilder.defaultPort']).toBe(3000);
        expect(out.error).toBeUndefined();
    });

    it('names what is available for an unknown key', async () => {
        const out = await harness().call('get_settings', { key: 'demoBuilder.nope' });
        expect(String(out.error)).toMatch(/not a Demo Builder setting/);
        expect(out.available).toEqual([...SETTING_KEYS]);
    });

    it('does not read anything for an unknown key', async () => {
        const h = harness();
        await h.call('get_settings', { key: 'demoBuilder.nope' });
        expect(h.read).not.toHaveBeenCalled();
    });

    // The prefix is only added when it produces a REAL key. An unknown short
    // name must come back named as the agent typed it, or the error describes a
    // key nobody asked about.
    it('echoes the unprefixed name it was given in the error', async () => {
        const out = await harness().call('get_settings', { key: 'nope' });

        expect(String(out.error)).toContain('"nope"');
        expect(String(out.error)).not.toContain('demoBuilder.nope');
    });

    it('reports a Data Installer URL with no value at all as not configured', async () => {
        // Distinct from the blank-string case: nothing has ever been set, so the
        // value is not a string. Presence is decided on the TYPE first.
        const out = await harness({}).call('get_settings', {
            key: 'demoBuilder.dataInstaller.apiBaseUrl',
        });

        expect(out['demoBuilder.dataInstaller.apiBaseUrl']).toEqual({ configured: false });
    });

    it('returns everything when the client sends no arguments object', async () => {
        // The SDK may call a handler with nothing when every field is optional.
        const out = await textOf(harness().raw('get_settings'));

        expect(Object.keys(out)).toHaveLength(SETTING_KEYS.length);
    });
});

describe('set_setting', () => {
    it('hands back rather than writing', async () => {
        const out = (await harness().call('set_setting', {
            key: 'demoBuilder.updateChannel',
            value: 'stable',
        })) as { needsUser: { reason: string; tellUser: string; resumeWith: string } };

        expect(out.needsUser.reason).toBe('settings-edit');
        expect(out.needsUser.tellUser).toContain('demoBuilder.updateChannel');
        expect(out.needsUser.tellUser).toContain('stable');
        expect(out.needsUser.resumeWith).toBe('get_settings');
    });

    it('hands back without a suggested value too', async () => {
        const out = (await harness().call('set_setting', {
            key: 'demoBuilder.byom.enabled',
        })) as { needsUser: { tellUser: string } };

        expect(out.needsUser.tellUser).toContain('demoBuilder.byom.enabled');
    });

    it('refuses a key that is not a Demo Builder setting', async () => {
        const out = await harness().call('set_setting', { key: 'editor.fontSize' });

        // Without this an agent could hand the user instructions to change any
        // VS Code setting at all, over this extension's name.
        expect(String(out.error)).toMatch(/not a Demo Builder setting/);
        expect(out.needsUser).toBeUndefined();
    });

    it('sends the user somewhere they can actually open', async () => {
        // HandoffTarget requires a target that opens, not one that describes.
        const out = (await harness().call('set_setting', {
            key: 'demoBuilder.logLevel',
        })) as { needsUser: { where: unknown; what: string } };

        expect(out.needsUser.where).toEqual({ command: 'workbench.action.openSettings' });
        expect(out.needsUser.what).toContain('demoBuilder.logLevel');
    });

    it('accepts a key the agent padded with whitespace', async () => {
        const out = (await harness().call('set_setting', {
            key: '  demoBuilder.byom.enabled  ',
        })) as { needsUser?: { tellUser: string } };

        expect(out.needsUser?.tellUser).toContain('"demoBuilder.byom.enabled"');
    });

    it('refuses a call with no arguments object rather than throwing', async () => {
        const out = await textOf(harness().raw('set_setting'));

        expect(String(out.error)).toMatch(/not a Demo Builder setting/);
    });
});

describe('SETTING_KEYS tracks package.json', () => {
    const declared = (() => {
        const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
        const blocks = pkg.contributes.configuration as Array<{
            properties?: Record<string, unknown>;
        }>;
        return blocks.flatMap((b) => Object.keys(b.properties ?? {}));
    })();

    // Control: a manifest read that returned nothing would make both checks
    // below pass while measuring nothing.
    it('control: package.json declares settings at all', () => {
        expect(declared.length).toBeGreaterThan(10);
    });

    it('exposes every declared setting', () => {
        expect(declared.filter((k) => !(SETTING_KEYS as readonly string[]).includes(k))).toEqual(
            []
        );
    });

    it('exposes no setting that has been removed from the manifest', () => {
        expect(SETTING_KEYS.filter((k) => !declared.includes(k))).toEqual([]);
    });
});
