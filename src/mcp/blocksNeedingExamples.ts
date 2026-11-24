/**
 * `list_blocks_needing_examples` (EDS-71 step 4c): the blocks in the storefront's code with no
 * example an author can use in DA.live, each with what an agent needs to draft one.
 *
 * A block needs one when its page in the storefront's DA.live block list
 * (`.da/library/blocks/<id>`) is a page Demo Builder generated (`oldStubPages.ts`: the
 * code-shaped "Column N content" placeholder, or the old one-cell stub) or is missing. Signed in
 * to DA.live, each block folder's page is read; otherwise the answer is the list the last block
 * list build recorded on the project (`examplesNeededRecord.ts`), as the dashboard's Draft
 * Examples tile counts it, and a `note` says so. Read-only: it never changes that record.
 *
 * @module mcp/blocksNeedingExamples
 */

import {
    blockFolders,
    readmeExcerpt,
    storefrontReader,
    type ExamplePageSource,
} from './blockAuthoringShape';
import { analyzeBlockCode, type BlockCodeAnalysis } from '@/features/eds/services/blockLibrary/blockCode';
import { displayName } from '@/features/eds/services/blockLibrary/blockDoc';
import { inBatches } from '@/features/eds/services/blockLibrary/libraryPages';
import {
    isGeneratedPlaceholder,
    isOldStubPage,
    type ReadBlockPage,
} from '@/features/eds/services/blockLibrary/oldStubPages';
import { DaLiveAuthError } from '@/features/eds/services/types';

/** Blocks answered per call by default; the details make each row a few hundred bytes. */
export const DEFAULT_NEEDS_EXAMPLE_LIMIT = 10;
/** The most a call may ask for (the tool schema's maximum). */
export const MAX_NEEDS_EXAMPLE_LIMIT = 25;
/** The README excerpt per block, clipped beyond this. */
export const NEEDS_EXAMPLE_README_CHARS = 400;

/** What a block's page is: Demo Builder's placeholder, the old stub, or none at all. */
type PageState = 'placeholder' | 'old-stub' | 'none';

interface Found {
    id: string;
    page?: PageState;
}

interface FoundList {
    source: 'da-live' | 'recorded';
    found: Found[];
    unreadable?: number;
    note?: string;
}

const RECORDED_NOTE = 'DA.live is not signed in, so this is the list the last block list build '
    + 'recorded (the dashboard\'s Draft Examples count). Sign in to DA.live to read the pages now.';
const NO_SITE_NOTE = 'This storefront has no DA.live site recorded, so this is the list the last '
    + 'block list build recorded.';

/** The page's state when the block needs an example; undefined when it has one. */
function pageState(blockId: string, page: string | undefined): PageState | undefined {
    if (page === undefined) return 'none';
    if (isGeneratedPlaceholder(blockId, page)) return 'placeholder';
    return isOldStubPage(blockId, page, [displayName(blockId)]) ? 'old-stub' : undefined;
}

/** Each folder's page, read; one that cannot be read is counted, not listed. */
async function readFromDaLive(folders: string[], read: ReadBlockPage): Promise<FoundList> {
    // 'unreadable' when the page could not be read; undefined when the block has an example.
    const states = await inBatches(folders, async (id): Promise<PageState | 'unreadable' | undefined> => {
        try {
            return pageState(id, await read(id));
        } catch (error) {
            if (error instanceof DaLiveAuthError) throw error;
            return 'unreadable';
        }
    });
    const found = folders.flatMap((id, n) => {
        const state = states[n];
        return state && state !== 'unreadable' ? [{ id, page: state }] : [];
    });
    const unreadable = states.filter((state) => state === 'unreadable').length;
    return { source: 'da-live', found, ...(unreadable > 0 ? { unreadable } : {}) };
}

/** The recorded list, as far as the code still has the blocks. */
function fromRecord(folders: string[], recorded: string[], note: string): FoundList {
    const inCode = new Set(folders);
    const found = recorded.filter((id) => inCode.has(id)).map((id) => ({ id }));
    return { source: 'recorded', found, note };
}

async function findBlocks(
    folders: string[],
    recorded: string[],
    source: ExamplePageSource,
): Promise<FoundList> {
    if ('unavailable' in source) {
        const note = source.unavailable === 'no-da-live-site' ? NO_SITE_NOTE : RECORDED_NOTE;
        return fromRecord(folders, recorded, note);
    }
    try {
        return await readFromDaLive(folders, source.read);
    } catch (error) {
        if (!(error instanceof DaLiveAuthError)) throw error;
        return fromRecord(folders, recorded, RECORDED_NOTE);
    }
}

/** One block's row: its title, page state, code shape and README excerpt. */
async function describe(
    read: (file: string) => Promise<string | undefined>,
    { id, page }: Found,
): Promise<{ id: string; title: string; page?: PageState; code: BlockCodeAnalysis; readme?: string }> {
    const [code, readme] = await Promise.all([
        analyzeBlockCode(id, read),
        readmeExcerpt(read, id, NEEDS_EXAMPLE_README_CHARS),
    ]);
    return { id, title: displayName(id), ...(page ? { page } : {}), code, ...(readme ? { readme } : {}) };
}

/**
 * The blocks needing an example, `limit` of them from `offset`.
 *
 * @param storefrontPath - the storefront checkout (its `blocks/` folders and files)
 * @param recorded - the list the last block list build recorded on the project
 * @param source - the storefront's DA.live pages, or why they cannot be read
 */
export async function listBlocksNeedingExamples(
    storefrontPath: string,
    recorded: string[],
    source: ExamplePageSource,
    offset = 0,
    limit = DEFAULT_NEEDS_EXAMPLE_LIMIT,
) {
    const folders = await blockFolders(storefrontPath);
    const { found, ...rest } = await findBlocks(folders, recorded, source);
    const slice = found.slice(offset, offset + limit);
    const read = storefrontReader(storefrontPath);
    const blocks = await Promise.all(slice.map((entry) => describe(read, entry)));
    const left = found.length - offset - slice.length;
    return {
        ...rest,
        blocks,
        count: blocks.length,
        total: found.length,
        ...(left > 0 ? { more: `${left} more — pass offset ${offset + slice.length}` } : {}),
    };
}
