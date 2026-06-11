/**
 * contentSourceFactory (Slice 2)
 *
 * Selects the `ContentSource` implementation from the persisted
 * `contentSourceType`. Defaults to DA.live (so existing projects are
 * unaffected) and treats an unknown value as a hard error — never a silent
 * DA.live fallback, which would mask a corrupt manifest.
 *
 * @module features/eds/services/contentSource/contentSourceFactory
 */

import type { TokenProvider } from '../daLiveContentOperations';
import type { ContentSource } from './contentSource';
import { DaLiveContentSource } from './daLiveContentSource';
import { AemContentSource } from './aemContentSource';

export interface ContentSourceFactoryInput {
    /** Persisted discriminator; absent → DA.live. */
    contentSourceType?: string;
    /** DA.live IMS token provider (for the Helix content-source-authorization header). */
    tokenProvider?: TokenProvider;
    /** AEM-Sites config (required when contentSourceType === 'aem-sites'). */
    aemContentSource?: { authorUrl: string; contentPath: string };
}

export function createContentSource(input: ContentSourceFactoryInput): ContentSource {
    const type = input.contentSourceType ?? 'da-live';
    switch (type) {
        case 'da-live':
            return new DaLiveContentSource(input.tokenProvider);
        case 'aem-sites':
            if (!input.aemContentSource) {
                throw new Error(
                    'Content source "aem-sites" requires aemContentSource config (authorUrl + contentPath)',
                );
            }
            return new AemContentSource(
                input.aemContentSource.authorUrl,
                input.aemContentSource.contentPath,
            );
        default:
            throw new Error(
                `Unknown content source type: "${type}" (expected "da-live" or "aem-sites")`,
            );
    }
}
