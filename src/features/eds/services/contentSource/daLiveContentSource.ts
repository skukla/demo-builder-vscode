/**
 * DA.live ContentSource (Slice 2)
 *
 * The DA.live implementation of the `ContentSource` seam — a refactor-in-place
 * of the behavior previously inlined in `configurationService` (the
 * `content.da.live/{org}/{site}/` registration URL) and `helixApiClient` (the
 * `Bearer <imsToken>` content-source-authorization header). Behavior is
 * byte-identical to the pre-seam DA.live path.
 *
 * @module features/eds/services/contentSource/daLiveContentSource
 */

import type { TokenProvider } from '../daLiveContentOperations';
import type { ContentSource, ContentSourceCoords } from './contentSource';

export class DaLiveContentSource implements ContentSource {
    readonly type = 'da-live' as const;

    /**
     * @param tokenProvider DA.live IMS token provider. Only required for
     *   `getContentSourceAuthorization` (the Helix header path); registration-only
     *   construction (e.g. `buildSiteConfigParams`) may omit it.
     */
    constructor(private readonly tokenProvider?: TokenProvider) {}

    buildRegistrationSource(coords: ContentSourceCoords): { url: string; type: string } {
        return {
            url: `https://content.da.live/${coords.org}/${coords.site}/`,
            type: 'markup',
        };
    }

    async getContentSourceAuthorization(): Promise<string | null> {
        const token = await this.tokenProvider?.getAccessToken();
        return token ? `Bearer ${token}` : null;
    }
}
