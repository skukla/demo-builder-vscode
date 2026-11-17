/**
 * A read-back's data types in two lanes (walk F160, owner yes 2026-11-16).
 *
 * "Finding unsaved changes" (then "Checking for your changes") read each type after the last. Measured on Luma (Debug Logs,
 * 2026-11-16): products 53 s, then gift cards, categories, attributes, sets and assignments about
 * 20 s more. Products and gift cards now read in a lane of their own beside the rest, which still
 * go one type at a time: the wait is about the products' alone, and Commerce is never asked for more
 * at once than two types' reads.
 *
 * @module features/data-installer/services/demoBuilderEngine/readLanes
 */

/** The types read in the product lane: most of a read-back's time. */
const PRODUCT_LANE: ReadonlySet<string> = new Set(['products', 'giftcards']);

/** Each kind read in turn. */
async function oneByOne<T>(
    kinds: readonly string[],
    read: (kind: string) => Promise<T>,
    into: Map<string, T>,
): Promise<void> {
    for (const kind of kinds) into.set(kind, await read(kind));
}

/**
 * Every kind read, the product lane beside the rest, each lane one kind at a time.
 *
 * @param kinds - the kinds to read, in the order the answer keeps
 * @param read - one kind's read
 * @returns each kind's answer, in the order of `kinds`
 */
export async function inLanes<T>(
    kinds: readonly string[],
    read: (kind: string) => Promise<T>,
): Promise<Map<string, T>> {
    const answers = new Map<string, T>();
    await Promise.all([
        oneByOne(
            kinds.filter((kind) => PRODUCT_LANE.has(kind)),
            read,
            answers,
        ),
        oneByOne(
            kinds.filter((kind) => !PRODUCT_LANE.has(kind)),
            read,
            answers,
        ),
    ]);
    return new Map(
        kinds.filter((kind) => answers.has(kind)).map((kind) => [kind, answers.get(kind) as T]),
    );
}
