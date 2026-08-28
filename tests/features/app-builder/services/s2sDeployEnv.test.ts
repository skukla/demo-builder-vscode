/**
 * s2sDeployEnv — the AIO_COMMERCE_AUTH_IMS_* mapping.
 *
 * The six names are aio-commerce-lib-auth's IMS_AUTH_PARAMS (read from its
 * source 2026-08-27); array-valued vars take JSON array strings, the format
 * its parser accepts explicitly.
 */

import { buildS2SDeployEnv } from '@/features/app-builder/services/s2sDeployEnv';

const CREDENTIALS = {
    clientId: 'client-id-abc',
    clientSecret: 'fake-test-pw-not-a-secret',
    technicalAccountId: 'ta-id-1',
    technicalAccountEmail: 'ta@techacct.adobe.com',
    imsOrgCode: '8EBB33FE5E43BA110A495EF8@AdobeOrg',
};

describe('buildS2SDeployEnv', () => {
    it('emits exactly the six IMS_AUTH_PARAMS names the kit lib requires', () => {
        expect(Object.keys(buildS2SDeployEnv(CREDENTIALS)).sort()).toEqual([
            'AIO_COMMERCE_AUTH_IMS_CLIENT_ID',
            'AIO_COMMERCE_AUTH_IMS_CLIENT_SECRETS',
            'AIO_COMMERCE_AUTH_IMS_ORG_ID',
            'AIO_COMMERCE_AUTH_IMS_SCOPES',
            'AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_EMAIL',
            'AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_ID',
        ]);
    });

    it('array-valued vars are JSON array strings the lib parser accepts', () => {
        const env = buildS2SDeployEnv(CREDENTIALS);
        expect(JSON.parse(env.AIO_COMMERCE_AUTH_IMS_CLIENT_SECRETS)).toEqual([
            'fake-test-pw-not-a-secret',
        ]);
        expect(JSON.parse(env.AIO_COMMERCE_AUTH_IMS_SCOPES)).toEqual([
            'AdobeID',
            'openid',
            'read_organizations',
            'additional_info.projectedProductContext',
            'additional_info.roles',
            'adobeio_api',
            'event_receiver_api',
        ]);
    });

    it('scalar vars carry the credential values verbatim', () => {
        const env = buildS2SDeployEnv(CREDENTIALS);
        expect(env.AIO_COMMERCE_AUTH_IMS_CLIENT_ID).toBe('client-id-abc');
        expect(env.AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_ID).toBe('ta-id-1');
        expect(env.AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_EMAIL).toBe('ta@techacct.adobe.com');
        expect(env.AIO_COMMERCE_AUTH_IMS_ORG_ID).toBe('8EBB33FE5E43BA110A495EF8@AdobeOrg');
    });
});
