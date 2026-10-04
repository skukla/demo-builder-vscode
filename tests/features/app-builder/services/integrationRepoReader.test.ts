/**
 * AB-22 steps 1–2: what a colleague's App Builder repo says about itself, read
 * from its files after cloning. The fixtures are cut from real repos read
 * 2026-10-03 (commerce-erp-integration and demo-erp), not written from memory.
 */

import { readIntegrationRepo } from '@/features/app-builder/services/integrationRepoReader';

/** A repo as path → text; anything absent reads as missing. */
function repo(files: Record<string, string>): (path: string) => Promise<string | undefined> {
    return async (path) => files[path];
}

/** The App Management layout: extensions, includes two levels deep, install.yaml, engines. */
const APP_MANAGEMENT = {
    'app.config.yaml': [
        'extensions:',
        '  commerce/extensibility/1:',
        '    $include: src/commerce-extensibility-1/ext.config.yaml',
        'productDependencies:',
        '  - code: COMMC',
    ].join('\n'),
    'src/commerce-extensibility-1/ext.config.yaml': [
        'runtimeManifest:',
        '  packages:',
        '    starter-kit:',
        '      actions:',
        '        $include: ./actions/erp/actions.config.yaml',
    ].join('\n'),
    'src/commerce-extensibility-1/actions/erp/actions.config.yaml': [
        'status:',
        '  function: ./status/index.js',
        '  inputs:',
        '    LOG_LEVEL: $LOG_LEVEL',
        '    AIO_COMMERCE_AUTH_IMS_CLIENT_ID: $AIO_COMMERCE_AUTH_IMS_CLIENT_ID',
        '    ERP_BASE_URL: $ERP_BASE_URL',
        '    FIXED: info',
        'lookup:',
        '  inputs:',
        '    ERP_BASE_URL: $ERP_BASE_URL',
        '    SLACK_WEBHOOK_TOKEN: $SLACK_WEBHOOK_TOKEN',
    ].join('\n'),
    'app.commerce.config.ts': 'export default {};',
    'install.yaml': [
        'extensions:',
        '  - extensionPointId: commerce/extensibility/1',
        'apis:',
        '  - code: commerceeventing',
        '  - code: CloudIntegrationSDK',
    ].join('\n'),
    'package.json': JSON.stringify({ name: 'x', engines: { node: '^24.0.0' } }),
    '.nvmrc': 'lts/*',
    'env.dist': [
        '# The log level configured for all the actions.',
        'LOG_LEVEL=info',
        '',
        "# Where the ERP's actions live.",
        'ERP_BASE_URL=',
        '# Not read by any action.',
        'UNUSED=1',
    ].join('\n'),
};

/** The standalone layout: application.runtimeManifest, inputs in place. */
const STANDALONE = {
    'app.config.yaml': [
        'application:',
        '  runtimeManifest:',
        '    packages:',
        '      demo-erp:',
        '        actions:',
        '          health:',
        '            inputs:',
        '              LOG_LEVEL: info',
        '              ERP_ID: $ERP_ID',
    ].join('\n'),
    '.nvmrc': 'v22.11.0\n',
};

describe('readIntegrationRepo', () => {
    it('reads an App Management repo: layout, lifecycle, Node major, Console APIs and every $VAR input across includes', async () => {
        const facts = await readIntegrationRepo(repo(APP_MANAGEMENT));

        expect(facts).toEqual({
            hasAppConfig: true,
            layout: 'extension',
            lifecycle: 'app-management',
            nodeVersion: '24',
            requiredApis: ['commerceeventing', 'CloudIntegrationSDK'],
            inputs: [
                { name: 'AIO_COMMERCE_AUTH_IMS_CLIENT_ID' },
                { name: 'ERP_BASE_URL', label: "Where the ERP's actions live." },
                { name: 'LOG_LEVEL', label: 'The log level configured for all the actions.', sample: 'info' },
                { name: 'SLACK_WEBHOOK_TOKEN' },
            ],
        });
    });

    it('never lists a variable from env.dist that no input reads', async () => {
        const facts = await readIntegrationRepo(repo(APP_MANAGEMENT));

        expect(facts.inputs.map((input) => input.name)).not.toContain('UNUSED');
    });

    it('reads a standalone repo, with the Node major from .nvmrc when package.json names none', async () => {
        const facts = await readIntegrationRepo(repo(STANDALONE));

        expect(facts).toEqual({
            hasAppConfig: true,
            layout: 'standalone',
            lifecycle: 'deploy-only',
            nodeVersion: '22',
            requiredApis: [],
            inputs: [{ name: 'ERP_ID' }],
        });
    });

    it('says so when there is no app.config.yaml, and reads nothing else into it', async () => {
        const facts = await readIntegrationRepo(repo({ 'package.json': '{}' }));

        expect(facts).toEqual({
            hasAppConfig: false,
            lifecycle: 'deploy-only',
            requiredApis: [],
            inputs: [],
        });
    });

    it('reads .env.example for labels when there is no env.dist, and leaves a blank sample out', async () => {
        const facts = await readIntegrationRepo(
            repo({ ...STANDALONE, '.env.example': '# Which ERP this is\nERP_ID=\n' }),
        );

        expect(facts.inputs).toEqual([{ name: 'ERP_ID', label: 'Which ERP this is' }]);
    });

    it('survives an include that is missing, malformed YAML, and an include cycle', async () => {
        const facts = await readIntegrationRepo(
            repo({
                'app.config.yaml': [
                    'extensions:',
                    '  a/1:',
                    '    $include: missing.yaml',
                    '  b/1:',
                    '    $include: broken.yaml',
                    '  c/1:',
                    '    $include: loop.yaml',
                ].join('\n'),
                'broken.yaml': 'inputs: [unclosed',
                'loop.yaml': 'x:\n  $include: loop.yaml\ninputs:\n  A: $A\n',
            }),
        );

        expect(facts.layout).toBe('extension');
        expect(facts.inputs).toEqual([{ name: 'A' }]);
    });

    it('refuses an include that climbs out of the repository', async () => {
        const read = jest.fn(repo({ 'app.config.yaml': 'extensions:\n  a/1:\n    $include: ../../etc/x.yaml\n' }));

        await readIntegrationRepo(read);

        expect(read).not.toHaveBeenCalledWith(expect.stringContaining('..'));
    });
});
