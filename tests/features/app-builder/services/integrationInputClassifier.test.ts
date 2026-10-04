/**
 * AB-22 step 3: each input a colleague's repo reads, sorted into who supplies it
 * — the platform (Demo Builder, never shown), another app in the demo
 * (connected), or a person (a Setting, secret when its name says so).
 */

import { classifyDiscoveredInputs } from '@/features/app-builder/services/integrationInputClassifier';

describe('classifyDiscoveredInputs', () => {
    it('leaves the workspace credentials out of the schema: Demo Builder supplies them', () => {
        const result = classifyDiscoveredInputs(
            [
                { name: 'AIO_COMMERCE_AUTH_IMS_CLIENT_ID' },
                { name: 'IMS_OAUTH_S2S_CLIENT_SECRET' },
                { name: 'AIO_RUNTIME_NAMESPACE' },
                { name: 'DEMO_BUILDER_COPY_NUMBER' },
            ],
            new Map(),
        );

        expect(result.envSchema).toStrictEqual([]);
        expect(result.supplied).toEqual([
            'AIO_COMMERCE_AUTH_IMS_CLIENT_ID',
            'IMS_OAUTH_S2S_CLIENT_SECRET',
            'AIO_RUNTIME_NAMESPACE',
            'DEMO_BUILDER_COPY_NUMBER',
        ]);
    });

    it('connects a value another component in the demo provides, naming the provider', () => {
        const result = classifyDiscoveredInputs(
            [{ name: 'ERP_BASE_URL', label: "Where the ERP's actions live." }],
            new Map([['ERP_BASE_URL', 'demo-erp']]),
        );

        expect(result.envSchema).toEqual([
            { name: 'ERP_BASE_URL', type: 'text', label: "Where the ERP's actions live.", providedBy: 'demo-erp' },
        ]);
    });

    it('asks a person for the rest: secret when a name part says so, the sample as a text default only', () => {
        const result = classifyDiscoveredInputs(
            [
                { name: 'LOG_LEVEL', label: 'The log level', sample: 'info' },
                { name: 'SLACK_WEBHOOK_TOKEN', sample: 'xoxb-sample' },
                { name: 'AWS_SECRET_ACCESS_KEY' },
                { name: 'DB_PASSWORD' },
                { name: 'API_KEY' },
                { name: 'KEYCLOAK_URL' },
                { name: 'ERP_ID' },
            ],
            new Map(),
        );

        expect(result.envSchema).toEqual([
            { name: 'LOG_LEVEL', type: 'text', label: 'The log level', default: 'info' },
            { name: 'SLACK_WEBHOOK_TOKEN', type: 'secret', label: 'SLACK_WEBHOOK_TOKEN' },
            { name: 'AWS_SECRET_ACCESS_KEY', type: 'secret', label: 'AWS_SECRET_ACCESS_KEY' },
            { name: 'DB_PASSWORD', type: 'secret', label: 'DB_PASSWORD' },
            { name: 'API_KEY', type: 'secret', label: 'API_KEY' },
            { name: 'KEYCLOAK_URL', type: 'text', label: 'KEYCLOAK_URL' },
            { name: 'ERP_ID', type: 'text', label: 'ERP_ID' },
        ]);
        expect(result.supplied).toStrictEqual([]);
    });
});
