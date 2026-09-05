/**
 * Wire→domain normalizers — the SHAPE each parser hands back.
 *
 * The sibling suite proves the parsers read the live service correctly, using
 * fixtures captured from it. This one covers the other half of the contract, and
 * the half the fixtures cannot reach: what happens to a field the service does
 * NOT send, or sends with the wrong type.
 *
 * Every optional field here is spread conditionally, so the difference between
 * "absent" and "present and undefined" is invisible to `toBeUndefined` and
 * entirely visible to a consumer: `'total' in page` is how a caller decides
 * whether to page, and `{ processingTimeMs: undefined }` serialises into a
 * manifest as a field that exists. So absence is asserted with `in`, and the
 * whole object at once rather than field by field — with `toStrictEqual` wherever
 * a dropped row could leave an `undefined` in an array, because `toEqual` ignores
 * exactly that.
 *
 * The wire is `unknown` on purpose — this is the only module allowed to read it,
 * and a service that widens a type must degrade the UI rather than break it. The
 * wrong-type cases below are what that promise means in practice.
 */

import {
    parseActivityLog,
    parseDataItem,
    parseDataItemInventory,
    parseDataTypeCatalog,
    parseDatapackDetail,
    parseDatapackList,
    parseHealth,
    parseImportStart,
    parseInstalledDatapacks,
    parseJobFailureReason,
    parseJobStatus,
    parseProcessorOrder,
    parseValidation,
} from '@/features/data-installer/services/dataInstallerParsers';

/** A catalog row carrying only what an identity needs. */
const ROW = { datapack_name: 'citisignal', version: 'main' };

// =============================================================================
// The primitive readers, through the parsers that use them
// =============================================================================

describe('a field of the wrong type is treated as absent, never passed through', () => {
    it('a non-array data_types list yields an empty one, not a fabricated entry', () => {
        const [item] = parseDatapackList({ datapacks: [{ ...ROW, data_types: 'products' }] }).items;

        expect(item.dataTypes).toEqual([]);
    });

    it('a data_types list drops the members that are not strings', () => {
        const [item] = parseDatapackList({
            datapacks: [{ ...ROW, data_types: ['products', 7, null, 'categories'] }],
        }).items;

        expect(item.dataTypes).toEqual(['products', 'categories']);
    });

    it('a non-string description is omitted rather than carried', () => {
        const [item] = parseDatapackList({
            datapacks: [{ ...ROW, description: ['a lie'] }],
        }).items;

        expect('description' in item).toBe(false);
    });

    // `?? ` only catches null and undefined, so an empty string that survives the
    // string reader would BECOME the display name and the catalog would render a
    // nameless row.
    it('an empty display_name falls back to the datapack name', () => {
        const [item] = parseDatapackList({ datapacks: [{ ...ROW, display_name: '' }] }).items;

        expect(item.displayName).toBe('citisignal');
    });

    it('a numeric-looking string count is not a count', () => {
        expect(parseDatapackList({ datapacks: [], count: '2' }).count).toBe(0);
    });

    it('a NaN count is not a count either', () => {
        expect(parseDatapackList({ datapacks: [], count: Number.NaN }).count).toBe(0);
    });
});

// =============================================================================
// parseDatapackList / the paged envelope
// =============================================================================

describe('the catalog row carries every optional field the service sent', () => {
    it('keeps description, owner and both timestamps', () => {
        const [item] = parseDatapackList({
            datapacks: [
                {
                    ...ROW,
                    display_name: 'CitiSignal',
                    data_types: ['products'],
                    shared: true,
                    description: 'A telco brand',
                    owner: 'skukla',
                    created_at: '2026-01-01T00:00:00Z',
                    updated_at: '2026-02-02T00:00:00Z',
                    cover_image: 'https://cdn/cover.png',
                    thumbnail_image: 'https://cdn/thumb.png',
                },
            ],
        }).items;

        expect(item).toEqual({
            id: { name: 'citisignal', version: 'main' },
            displayName: 'CitiSignal',
            shared: true,
            dataTypes: ['products'],
            art: { cover: 'https://cdn/cover.png', thumbnail: 'https://cdn/thumb.png' },
            description: 'A telco brand',
            owner: 'skukla',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-02-02T00:00:00Z',
        });
    });

    it('omits every one of them when the service sent none', () => {
        const [item] = parseDatapackList({ datapacks: [ROW] }).items;

        expect(item).toEqual({
            id: { name: 'citisignal', version: 'main' },
            displayName: 'citisignal',
            shared: false,
            dataTypes: [],
            art: {},
        });
    });
});

describe('the paged envelope reports what the service sent', () => {
    it('prefers the service count over the page length', () => {
        // count is the SERVICE's answer for this page; the array length is only a
        // fallback for an endpoint that reports nothing.
        expect(parseDatapackList({ datapacks: [ROW], count: 7 }).count).toBe(7);
    });

    it('carries limit and skip through', () => {
        const page = parseDatapackList({ datapacks: [ROW], count: 1, limit: 20, skip: 40 });

        expect(page).toEqual({ items: page.items, count: 1, limit: 20, skip: 40 });
    });

    it('omits limit and skip entirely when the service sends neither', () => {
        const page = parseDatapackList({ datapacks: [ROW], count: 1 });

        expect('limit' in page).toBe(false);
        expect('skip' in page).toBe(false);
    });
});

// =============================================================================
// parseDatapackDetail — the summary path and its fallback
// =============================================================================

describe('parseDatapackDetail', () => {
    it('names a pack by its id when it carries no display name', () => {
        expect(parseDatapackDetail({ ...ROW }).displayName).toBe('citisignal');
    });

    // A metadata response with no datapack_name still has to produce a usable
    // object: the detail view renders whatever it gets.
    it('builds a detail from a body with no identity at all', () => {
        expect(
            parseDatapackDetail({ display_name: 'Orphan', data_types: ['products'], shared: true })
        ).toEqual({
            id: { name: '', version: '' },
            displayName: 'Orphan',
            shared: true,
            dataTypes: ['products'],
            art: {},
        });
    });

    it('gives an unnamed, undescribed body an empty display name rather than none', () => {
        expect(parseDatapackDetail({ version: 'main' }).displayName).toBe('');
    });

    it('reads shared as a real boolean on the fallback path too', () => {
        expect(parseDatapackDetail({ display_name: 'X', shared: 'yes' }).shared).toBe(false);
    });

    it('carries the duration as durationMs when the service sends one', () => {
        expect(parseDatapackDetail({ ...ROW, duration: 1234 }).durationMs).toBe(1234);
    });

    it('omits durationMs entirely when it does not', () => {
        expect('durationMs' in parseDatapackDetail({ ...ROW })).toBe(false);
    });
});

// =============================================================================
// parseDataItem
// =============================================================================

describe('parseDataItem envelope', () => {
    it('always names the data type it was asked for', () => {
        expect(parseDataItem({}, 'products').dataType).toBe('products');
    });

    it('carries count and include_content, including a false one', () => {
        expect(parseDataItem({ count: 3, include_content: false, data: '{}' }, 'products')).toEqual(
            {
                dataType: 'products',
                count: 3,
                includeContent: false,
                records: {},
            }
        );
    });

    it('omits count and includeContent when the service sends neither', () => {
        const item = parseDataItem({ data: '{}' }, 'products');

        expect('count' in item).toBe(false);
        expect('includeContent' in item).toBe(false);
    });

    it('treats a non-boolean include_content as absent', () => {
        expect('includeContent' in parseDataItem({ include_content: 'yes' }, 'products')).toBe(
            false
        );
    });

    // A response with no data at all is an envelope, not an item whose records
    // are undefined — a consumer checks for the key.
    it('omits records entirely when the response carries no data', () => {
        const item = parseDataItem({ count: 0 }, 'products');

        expect('records' in item).toBe(false);
        expect(item).toEqual({ dataType: 'products', count: 0 });
    });
});

// =============================================================================
// parseDataItemInventory
// =============================================================================

describe('parseDataItemInventory', () => {
    const found = (dataType: string, isFound: boolean) => ({
        found: isFound,
        metadata: { data_type: dataType },
    });

    it('skips a result row that names no data type at all', () => {
        const inv = parseDataItemInventory({
            results: [found('products', true), { found: true }, found('categories', false)],
        });

        // toStrictEqual, not toEqual: toEqual ignores an `undefined` array member,
        // so a skipped row that was pushed as undefined would read as equal.
        expect(inv.present).toStrictEqual(['products']);
        expect(inv.missing).toStrictEqual(['categories']);
    });

    // The items[] shape is a tolerance for a documented-but-unseen response. It
    // must not ALSO run when results[] already answered, or every type would be
    // counted twice.
    it('does not also read items[] when results[] produced entries', () => {
        const inv = parseDataItemInventory({
            results: [found('products', true)],
            items: [{ data_type: 'categories' }],
        });

        expect(inv.present).toStrictEqual(['products']);
    });

    // The same must hold when results[] answered with nothing but MISSING types:
    // the fallback is for a body that said nothing at all, not for one that said
    // "none of these are here".
    it('does not read items[] when results[] reported only missing types', () => {
        const inv = parseDataItemInventory({
            results: [found('products', false)],
            items: [{ data_type: 'categories' }],
        });

        expect(inv.present).toStrictEqual([]);
        expect(inv.missing).toStrictEqual(['products']);
    });

    it('skips an items[] entry that names no data type', () => {
        const inv = parseDataItemInventory({ items: [{ data_type: 'products' }, {}] });

        expect(inv.present).toStrictEqual(['products']);
    });

    it("prefers the service's own counts over the arrays it derived them from", () => {
        const inv = parseDataItemInventory({
            results: [found('products', true), found('categories', false)],
            found_count: 9,
            missing_count: 8,
            requested_count: 17,
        });

        expect(inv).toMatchObject({ presentCount: 9, missingCount: 8, requestedCount: 17 });
    });

    it('derives the requested count as present PLUS missing when none is sent', () => {
        const inv = parseDataItemInventory({
            results: [found('a', true), found('b', true), found('c', false)],
        });

        expect(inv).toMatchObject({ presentCount: 2, missingCount: 1, requestedCount: 3 });
    });
});

// =============================================================================
// parseDataTypeCatalog / parseProcessorOrder / parseInstalledDatapacks
// =============================================================================

describe('parseDataTypeCatalog', () => {
    it('drops a row with no data_type rather than emitting a hole', () => {
        expect(
            parseDataTypeCatalog({ data_types: [{ data_type: 'products' }, { order: 1 }] })
        ).toStrictEqual([{ dataType: 'products', dependsOn: [], metadata: 'available' }]);
    });

    it('carries description, apiType and order when they are sent', () => {
        expect(
            parseDataTypeCatalog({
                data_types: [
                    {
                        data_type: 'products',
                        description: 'Catalog products',
                        api_type: 'rest',
                        order: 3,
                        depends_on: ['categories'],
                    },
                ],
            })
        ).toStrictEqual([
            {
                dataType: 'products',
                dependsOn: ['categories'],
                metadata: 'available',
                description: 'Catalog products',
                apiType: 'rest',
                order: 3,
            },
        ]);
    });

    // order 0 is a real position — first — and an `order &&` test would drop it.
    it('keeps an order of zero', () => {
        expect(parseDataTypeCatalog({ data_types: [{ data_type: 'x', order: 0 }] })[0].order).toBe(
            0
        );
    });
});

describe('parseProcessorOrder', () => {
    it('drops an entry that names no data type', () => {
        expect(
            parseProcessorOrder({ processors: [{ data_type: 'products' }, { step: 2 }] })
        ).toStrictEqual(['products']);
    });
});

describe('parseInstalledDatapacks', () => {
    it('drops a row with no commerce instance — it is what the row is FOR', () => {
        expect(
            parseInstalledDatapacks({
                datapacks: [{ ...ROW, commerce_instance: 'https://a.test' }, { ...ROW }],
            }).items
        ).toStrictEqual([
            {
                commerceInstance: 'https://a.test',
                id: { name: 'citisignal', version: 'main' },
                dataTypes: [],
                art: {},
            },
        ]);
    });

    it('carries displayName, installedAt and processingTimeMs when sent', () => {
        const [row] = parseInstalledDatapacks({
            datapacks: [
                {
                    ...ROW,
                    commerce_instance: 'https://a.test',
                    display_name: 'CitiSignal',
                    installed_at: '2026-03-03T00:00:00Z',
                    overall_processing_time: 4321,
                },
            ],
        }).items;

        expect(row).toMatchObject({
            displayName: 'CitiSignal',
            installedAt: '2026-03-03T00:00:00Z',
            processingTimeMs: 4321,
        });
    });

    it('omits all three when none is sent', () => {
        const [row] = parseInstalledDatapacks({
            datapacks: [{ ...ROW, commerce_instance: 'https://a.test' }],
        }).items;

        expect('displayName' in row).toBe(false);
        expect('installedAt' in row).toBe(false);
        expect('processingTimeMs' in row).toBe(false);
    });
});

// =============================================================================
// parseActivityLog
// =============================================================================

describe('parseActivityLog', () => {
    it('carries every optional field a log row can have', () => {
        const [row] = parseActivityLog({
            logs: [
                {
                    ...ROW,
                    commerce_instance: 'https://a.test',
                    operation_mode: 'import',
                    site_type: 'luma',
                    scenario: 'anything-goes',
                    timestamp: '2026-04-04T00:00:00Z',
                    activation_id: 'act-1',
                    data_types: ['products'],
                },
            ],
        }).items;

        expect(row).toEqual({
            id: { name: 'citisignal', version: 'main' },
            dataTypes: ['products'],
            commerceInstance: 'https://a.test',
            mode: 'import',
            siteType: 'luma',
            scenario: 'anything-goes',
            at: '2026-04-04T00:00:00Z',
            activationId: 'act-1',
        });
    });

    it('omits each of them when the row does not carry it', () => {
        const [row] = parseActivityLog({ logs: [ROW] }).items;

        expect(row).toEqual({ id: { name: 'citisignal', version: 'main' }, dataTypes: [] });
    });
});

// =============================================================================
// parseJobStatus
// =============================================================================

describe('parseJobStatus', () => {
    // The four terminal statuses are what the runner branches on. A status
    // outside them is a shape it cannot interpret, so it is not recorded.
    it('records only the statuses the runner knows how to read', () => {
        const snapshot = parseJobStatus({
            data_types: {
                products: { status: 'success' },
                categories: { status: 'queued' },
                prices: { status: 'processing' },
            },
        });

        expect(snapshot.perType).toEqual({ products: 'success', prices: 'processing' });
    });

    it('prefers the activation id in the body over the fallback', () => {
        expect(parseJobStatus({ activation_id: 'from-body' }, 'from-caller').activationId).toBe(
            'from-body'
        );
    });

    it('uses the fallback when the body carries none', () => {
        expect(parseJobStatus({}, 'from-caller').activationId).toBe('from-caller');
    });

    it('omits processingTimeMs rather than reporting an undefined duration', () => {
        expect('processingTimeMs' in parseJobStatus({})).toBe(false);
    });

    it('carries it when the body has one', () => {
        expect(parseJobStatus({ overall_processing_time: 900 }).processingTimeMs).toBe(900);
    });
});

// =============================================================================
// parseJobFailureReason
// =============================================================================

describe('parseJobFailureReason', () => {
    // `success: false` is the ONLY body that explains anything. A successful
    // echo carrying an error field is not a failure report.
    it('ignores an error on a body that did not report failure', () => {
        expect(parseJobFailureReason({ success: true, error: 'stale noise' })).toBeUndefined();
    });

    it('reads the error off a body that did', () => {
        expect(parseJobFailureReason({ success: false, error: 'invalid data_types' })).toEqual({
            error: 'invalid data_types',
        });
    });

    it('reports nothing when a failure names no reason', () => {
        expect(parseJobFailureReason({ success: false })).toBeUndefined();
    });
});

// =============================================================================
// parseImportStart — the id there is nothing to poll without
// =============================================================================

describe('parseImportStart', () => {
    it('reads the activation id off an accepted start', () => {
        expect(
            parseImportStart({
                success: true,
                status: 'pending',
                activation_id: 'act-9',
                pipeline: 'import',
            })
        ).toEqual({ activationId: 'act-9' });
    });

    // An accepted job with nothing to poll cannot be told apart from one that
    // never reports, so the caller must see undefined rather than an empty id.
    it('answers undefined when the response carries no activation id', () => {
        expect(parseImportStart({ success: true, status: 'pending' })).toBeUndefined();
    });

    it('answers undefined for a body that is not an object at all', () => {
        expect(parseImportStart('accepted')).toBeUndefined();
    });
});

// =============================================================================
// parseValidation — a refusal is an ANSWER
// =============================================================================

describe('parseValidation', () => {
    it('reads success as valid, with no reason to give', () => {
        expect(parseValidation({ success: true })).toEqual({ valid: true });
    });

    // The service's own wording names the cause, and getting that wording is the
    // entire reason the validate call exists.
    it('carries the refusal reason through verbatim', () => {
        expect(parseValidation({ success: false, error: 'data_type products is unknown' })).toEqual(
            {
                valid: false,
                reason: 'data_type products is unknown',
            }
        );
    });

    it('treats anything that is not success as a refusal', () => {
        expect(parseValidation({ status: 'pending' })).toEqual({ valid: false });
    });

    it('omits the reason rather than carrying an empty one', () => {
        expect('reason' in parseValidation({ success: false, error: '' })).toBe(false);
    });
});

// =============================================================================
// parseHealth
// =============================================================================

describe('parseHealth', () => {
    it('reports a body that did not say success as unreachable', () => {
        expect(parseHealth({})).toEqual({ reachable: false });
    });

    it('keeps only the env checks whose values are strings', () => {
        expect(
            parseHealth({ success: true, env_check: { TOKEN: 'set', RETRIES: 3, URL: 'set' } })
        ).toEqual({ reachable: true, envChecks: { TOKEN: 'set', URL: 'set' } });
    });

    it('omits envChecks entirely when none survives', () => {
        const health = parseHealth({ success: true, env_check: { RETRIES: 3 } });

        expect('envChecks' in health).toBe(false);
    });

    it('carries the message when there is one, and omits it when there is not', () => {
        expect(parseHealth({ success: true, message: 'ok' }).message).toBe('ok');
        expect('message' in parseHealth({ success: true })).toBe(false);
    });
});
