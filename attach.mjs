/**
 * Can THIS token attach the Commerce profile right now, even though the org
 * catalog lists none? Takes the profile's id from Bodea's live credential, which
 * already holds it, and tries it on a throwaway credential. Ids are not printed.
 */
import ims from '@adobe/aio-lib-ims';
const { getToken } = ims;
import sdk from '@adobe/aio-lib-console';
const client = await sdk.init(await getToken('cli'), 'aio-cli-console-auth');
const ORG = '285361', PROJECT = '4566206088345759588', BODEA_WS = '4566206088345804846';

const bodea = ((await client.getCredentials(ORG, PROJECT, BODEA_WS))?.body ?? []).find((c) => c.flow_type === 'entp');
const profile = ((await client.getSDKProperties(ORG, bodea.id_integration, 'ACCS-REST-API'))?.body?.licenseConfigs ?? [])[0];
console.log(`profile read from Bodea's credential: ${profile ? `"${profile.name}"` : 'NONE'}  (has id=${Boolean(profile?.id)}, productId=${Boolean(profile?.productId)})`);
if (!profile?.id) process.exit(0);

let wsId;
try {
    wsId = (await client.createWorkspace(ORG, PROJECT, {
        name: `zzAttach${Math.random().toString(36).slice(2, 6)}`, title: 'zz attach check', description: '',
    }))?.body?.workspaceId;
    await client.createOAuthServerToServerCredential(ORG, PROJECT, wsId, `zzat${Math.random().toString(36).slice(2,5)}`, 'throwaway');
    const cred = ((await client.getCredentials(ORG, PROJECT, wsId))?.body ?? []).find((c) => c.flow_type === 'entp');
    try {
        await client.subscribeOAuthServerToServerIntegrationToServices(ORG, cred.id_integration, [
            { sdkCode: 'ACCS-REST-API', licenseConfigs: [{ op: 'add', id: profile.id, productId: profile.productId }], roles: null },
        ]);
        const got = ((await client.getSDKProperties(ORG, cred.id_integration, 'ACCS-REST-API'))?.body?.licenseConfigs ?? []).length;
        console.log(`ATTACH SUCCEEDED — the new credential holds ${got} profile(s)`);
    } catch (error) {
        console.log(`ATTACH REFUSED — ${String(error?.message ?? error).slice(0, 260)}`);
    }
} finally {
    if (wsId) {
        try { await client.deleteWorkspace(ORG, PROJECT, wsId); console.log('cleanup: throwaway deleted'); }
        catch { console.log(`cleanup FAILED — delete ${wsId} by hand`); }
    }
}
