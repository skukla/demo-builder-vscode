/**
 * Walking a DA.live site's folders for its page documents.
 *
 * One list call per folder, folders one after another. Shared by the catalog menu's
 * search for hand-built category pages (`catalogMenu/storefrontPageAdapter.ts`) and
 * reset's listing of the authored pages under `/products`
 * (`reset/edsResetProductPages.ts`).
 *
 * Two facts about the list API, both measured (see `contentAuthoringTools.ts`):
 * DA.live prefixes every listed path with `/{org}/{site}`, and a folder has no `ext`.
 * A page is decided by the path's own `.html` ending: the API's `ext` is spelled both
 * ways in this repo.
 *
 * A listing that fails throws. A caller that would write or remove pages on the answer
 * must never read a failure as "no pages".
 *
 * @module features/eds/services/daLive/daLivePageWalk
 */

import type { DaLiveContentOperations } from './daLiveContentOperations';

const PAGE_SUFFIX = '.html';

/**
 * @param daLive - the DA.live client
 * @param org - DA.live org
 * @param site - DA.live site
 * @param startFolder - the folder to start in (`/`, `/products`)
 * @param skipFolder - folders, by site path, that are not opened
 * @returns the web path of every page document found, in listing order (`/nav`, `/signs/exit`)
 */
export async function listDaLivePages(
    daLive: Pick<DaLiveContentOperations, 'listDirectory'>,
    org: string,
    site: string,
    startFolder: string,
    skipFolder: (sitePath: string) => boolean = () => false,
): Promise<string[]> {
    const prefix = `/${org}/${site}`;
    const found: string[] = [];
    const walk = async (folder: string): Promise<void> => {
        for (const entry of await daLive.listDirectory(org, site, folder)) {
            const sitePath = entry.path.startsWith(prefix) ? entry.path.slice(prefix.length) : entry.path;
            if (!entry.ext) {
                if (!skipFolder(sitePath)) await walk(sitePath);
            } else if (sitePath.endsWith(PAGE_SUFFIX)) {
                found.push(sitePath.slice(0, -PAGE_SUFFIX.length));
            }
        }
    };
    await walk(startFolder);
    return found;
}
