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

type Tool = (args: unknown) => Promise<{ content: Array<{ text: string }> }>;

const VALUES: Record<string, unknown> = {
    'demoBuilder.defaultPort': 3000,
    'demoBuilder.byom.enabled': true,
    'demoBuilder.updateChannel': 'beta',
    'demoBuilder.dataInstaller.enabled': true,
    'demoBuilder.dataInstaller.apiBaseUrl': 'https://internal.example.test/api',
};

function harness(values: Record<string, unknown> = VALUES) {
    const tools = new Map<string, Tool>();
    const read = jest.fn((key: string) => values[key]);
    registerSettingsTools(
        {
            registerTool(name: string, _def: never, handler: Tool) {
                tools.set(name, handler);
            },
        },
        read,
    );
    return {
        read,
        names: () => [...tools.keys()],
        async call(name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
            return JSON.parse((await tools.get(name)!(args)).content[0].text);
        },
    };
}

it('registers both settings tools', () => {
    expect(harness().names().sort()).toEqual(['get_settings', 'set_setting']);
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
            { key: 'demoBuilder.dataInstaller.apiBaseUrl' },
        );

        expect(out['demoBuilder.dataInstaller.apiBaseUrl']).toEqual({ configured: false });
    });

    it('returns other values verbatim, including the boolean gates', async () => {
        const out = await harness().call('get_settings');
        expect(out['demoBuilder.byom.enabled']).toBe(true);
        expect(out['demoBuilder.defaultPort']).toBe(3000);
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
        expect(declared.filter((k) => !(SETTING_KEYS as readonly string[]).includes(k))).toEqual([]);
    });

    it('exposes no setting that has been removed from the manifest', () => {
        expect(SETTING_KEYS.filter((k) => !declared.includes(k))).toEqual([]);
    });
});
