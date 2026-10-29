/**
 * appConfigPackages — configs a person has edited by hand.
 *
 * An SC opens `app.config.yaml` to comment a package out, and YAML turns a key with
 * nothing under it into `null`, a stray word into a string. Every reader here feeds a
 * decision made BEFORE a deploy or a removal (which URLs the app has, whether it needs
 * the workspace credential, what to look for after undeploy), so a config in one of
 * these shapes has to answer "declares nothing" — a throw would stop the operation
 * with a TypeError that names no file.
 */

import { mockRead } from './appConfigPackages.testUtils';
import {
    declaresIncludeImsCredentials,
    listDeclaredActions,
    listDeclaredExtensionPoints,
} from '@/features/app-builder/services/appConfigPackages';

const APP = '/app/app.config.yaml';
const EXT = '/app/src/ext/ext.config.yaml';
const EXTENSION_APP = 'extensions:\n  commerce/backend-ui/1:\n    $include: src/ext/ext.config.yaml\n';

/** Serve `files` by absolute path; anything else is ENOENT. */
function disk(files: Record<string, string>): void {
    mockRead.mockImplementation((file: string) =>
        file in files ? Promise.resolve(files[file]) : Promise.reject(new Error(`ENOENT ${file}`)),
    );
}

beforeEach(() => jest.clearAllMocks());

describe('listDeclaredExtensionPoints — an extensions key that is not a map', () => {
    it('answers nothing for a word where the map should be', async () => {
        // A string has keys of its own ("0", "1", …); they are not extension points.
        disk({ [APP]: 'extensions: none\n' });

        await expect(listDeclaredExtensionPoints('/app')).resolves.toStrictEqual([]);
    });
});

describe('listDeclaredActions — hand-edited configs declare what they can, and never throw', () => {
    const standalone = (packages: string): string => `application:\n  runtimeManifest:\n    packages:\n${packages}`;

    it.each([
        ['a package with nothing under it', standalone('      demo-erp:\n')],
        ['a package with no actions key', standalone('      demo-erp:\n        license: Apache-2.0\n')],
        ['an actions key with nothing under it', standalone('      demo-erp:\n        actions:\n')],
        ['a word where the actions map should be', standalone('      demo-erp:\n        actions: none\n')],
        ['an application block with no runtimeManifest', 'application:\n  hooks: {}\n'],
    ])('declares no actions for %s', async (_label, appConfig) => {
        disk({ [APP]: appConfig });

        await expect(listDeclaredActions('/app')).resolves.toStrictEqual([]);
    });

    it('lists an action with nothing under it, as not a web action', async () => {
        // `consumer:` alone is still a declared action; it just carries no flags.
        disk({ [APP]: standalone('      demo-erp:\n        actions:\n          consumer:\n          label: text\n') });

        await expect(listDeclaredActions('/app')).resolves.toStrictEqual([
            { packageName: 'demo-erp', actionName: 'consumer', web: false },
            { packageName: 'demo-erp', actionName: 'label', web: false },
        ]);
    });

    it("reads a quoted 'true' and an upper-case YES as web actions", async () => {
        disk({
            [APP]: standalone(
                "      demo-erp:\n        actions:\n          a: { web: 'true' }\n          b: { web: 'YES' }\n          c: { web: 'no' }\n",
            ),
        });

        const web = (await listDeclaredActions('/app')).map((a) => `${a.actionName}:${a.web}`);

        expect(web).toStrictEqual(['a:true', 'b:true', 'c:false']);
    });

    it.each([
        ['an extension entry with nothing under it', 'extensions:\n  commerce/backend-ui/1:\n'],
        ['an extension entry with no $include', 'extensions:\n  commerce/backend-ui/1:\n    operations: {}\n'],
        ['an $include that is a list', 'extensions:\n  commerce/backend-ui/1:\n    $include: [src/ext/ext.config.yaml]\n'],
    ])('skips %s without trying to read a file for it', async (_label, appConfig) => {
        disk({ [APP]: appConfig });

        await expect(listDeclaredActions('/app')).resolves.toStrictEqual([]);
        expect(mockRead).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['cannot be read', undefined],
        ['is empty', ''],
        ['has no runtimeManifest', 'operations: {}\n'],
        ['has a runtimeManifest with no packages', 'runtimeManifest:\n  license: Apache-2.0\n'],
    ])('declares no actions for an extension whose config %s', async (_label, extConfig) => {
        disk({ [APP]: EXTENSION_APP, ...(extConfig === undefined ? {} : { [EXT]: extConfig }) });

        await expect(listDeclaredActions('/app')).resolves.toStrictEqual([]);
    });

    it.each([
        ['is empty', ''],
        ['holds a sentence instead of a map', 'see the README\n'],
    ])('declares no actions for a package whose included actions file %s', async (_label, actionsFile) => {
        disk({
            [APP]: EXTENSION_APP,
            [EXT]: 'runtimeManifest:\n  packages:\n    kit:\n      actions:\n        $include: ./actions.config.yaml\n',
            '/app/src/ext/actions.config.yaml': actionsFile,
        });

        await expect(listDeclaredActions('/app')).resolves.toStrictEqual([]);
    });
});

describe('declaresIncludeImsCredentials — hand-edited configs', () => {
    it.each([
        ['an extension entry with nothing under it', 'extensions:\n  commerce/backend-ui/1:\n'],
        ['an extension entry with no $include', 'extensions:\n  commerce/backend-ui/1:\n    operations: {}\n'],
        ['an $include that is a list', 'extensions:\n  commerce/backend-ui/1:\n    $include: [src/ext/ext.config.yaml]\n'],
    ])('is false, not a throw, for %s', async (_label, appConfig) => {
        disk({ [APP]: appConfig });

        await expect(declaresIncludeImsCredentials('/app')).resolves.toBe(false);
        expect(mockRead).toHaveBeenCalledTimes(1);
    });

    it('finds the annotation on an action declared inside a list', async () => {
        // "Anywhere inside it": a sequence of actions is searched like a map of them.
        disk({
            [APP]: 'application:\n  runtimeManifest:\n    sequences:\n      - name: one\n      - annotations: { include-ims-credentials: true }\n',
        });

        await expect(declaresIncludeImsCredentials('/app')).resolves.toBe(true);
    });

    it('is false for a list that only mentions the annotation by name', async () => {
        disk({ [APP]: 'application:\n  notes:\n    - include-ims-credentials\n    - true\n' });

        await expect(declaresIncludeImsCredentials('/app')).resolves.toBe(false);
    });
});
