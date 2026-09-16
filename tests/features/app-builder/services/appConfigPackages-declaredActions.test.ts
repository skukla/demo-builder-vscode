/**
 * listDeclaredActions — every Runtime action an app declares, which is where an
 * extension-layout app's deployed URLs come from (the CLI cannot report them).
 *
 * The YAML below keeps the real starter kit's spellings, read from a cloned copy on
 * 2026-09-16: an UNQUOTED `web: yes` inline, a QUOTED `web: 'yes'` behind an
 * action-level `$include`, and that include written relative to the ext.config.yaml
 * that names it. `yes` is a string under YAML 1.2, which is the trap the web check
 * exists for.
 */

jest.mock('fs', () => ({ promises: { readFile: jest.fn(), writeFile: jest.fn() } }));

import { promises as fsPromises } from 'fs';
import { listDeclaredActions } from '@/features/app-builder/services/appConfigPackages';

const mockRead = fsPromises.readFile as jest.Mock;

/** Serve `files` by absolute path; anything else is ENOENT. */
function disk(files: Record<string, string>): void {
    mockRead.mockImplementation((file: string) =>
        file in files ? Promise.resolve(files[file]) : Promise.reject(new Error(`ENOENT ${file}`)),
    );
}

const APP_CONFIG = `extensions:
  commerce/extensibility/1:
    $include: src/commerce-extensibility-1/ext.config.yaml
`;

const EXT_CONFIG = `runtimeManifest:
  packages:
    starter-kit:
      license: Apache-2.0
      actions:
        $include: ./actions/starter-kit/actions.config.yaml
    app-management:
      license: Apache-2.0
      actions:
        installation:
          function: .generated/actions/app-management/installation.js
          web: yes
          runtime: nodejs:24
        consumer:
          function: .generated/actions/app-management/consumer.js
          runtime: nodejs:24
`;

const STARTER_KIT_ACTIONS = `info:
  function: ./info/index.js
  web: 'yes'
  runtime: nodejs:24
`;

beforeEach(() => jest.clearAllMocks());

describe('listDeclaredActions', () => {
    it('reads an extension app, resolving an action include beside the file that names it', async () => {
        disk({
            '/app/app.config.yaml': APP_CONFIG,
            '/app/src/commerce-extensibility-1/ext.config.yaml': EXT_CONFIG,
            '/app/src/commerce-extensibility-1/actions/starter-kit/actions.config.yaml': STARTER_KIT_ACTIONS,
        });

        await expect(listDeclaredActions('/app')).resolves.toStrictEqual([
            { packageName: 'starter-kit', actionName: 'info', web: true },
            { packageName: 'app-management', actionName: 'installation', web: true },
            { packageName: 'app-management', actionName: 'consumer', web: false },
        ]);
    });

    it('reads a standalone app, including a web-export flag and an explicit false', async () => {
        disk({
            '/app/app.config.yaml': `application:
  runtimeManifest:
    packages:
      demo-erp:
        actions:
          health: { function: a.js, web-export: true }
          events-retry: { function: b.js, web: false }
          admin: { function: c.js, web: raw }
`,
        });

        await expect(listDeclaredActions('/app')).resolves.toStrictEqual([
            { packageName: 'demo-erp', actionName: 'health', web: true },
            { packageName: 'demo-erp', actionName: 'events-retry', web: false },
            { packageName: 'demo-erp', actionName: 'admin', web: true },
        ]);
    });

    it('skips an include it cannot read and keeps the rest', async () => {
        disk({
            '/app/app.config.yaml': APP_CONFIG,
            '/app/src/commerce-extensibility-1/ext.config.yaml': EXT_CONFIG,
        });

        const names = (await listDeclaredActions('/app')).map((a) => `${a.packageName}/${a.actionName}`);

        expect(names).toStrictEqual(['app-management/installation', 'app-management/consumer']);
    });

    it('declares nothing when there is no config', async () => {
        disk({});

        await expect(listDeclaredActions('/app')).resolves.toStrictEqual([]);
    });
});
