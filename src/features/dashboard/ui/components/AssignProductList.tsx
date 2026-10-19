/**
 * The project's products as a list to pick from, for "Assign products" (AB-74): search by SKU or
 * name, narrow by category and owner, and select rows (owner, 2026-10-18: "flexible but
 * sensible", and the SC must be able to see which SKUs there are).
 *
 * The products are the project's own store's (`readErpAssignOptions` scopes them), and the
 * categories are that catalog's, by path. The filters combine as "and"; a selection is kept
 * while the filters change, so "all of one category, plus these three" is a filter, Select all,
 * another filter, three clicks, with nothing to learn.
 *
 * A Spectrum TableView in multiple selection, with SKU, Name, Category and Owner as columns
 * the SC sorts by (owner, 2026-10-19: the SKU and the name as column headings, the filters
 * above). Its heading checkbox selects every row shown. The search on its own line, the
 * filters under it with the count, the table taking the rest of the modal's height (owner,
 * 2026-10-18: not a list halfway down), and what the selection would do below it.
 * Categories are two pickers, the top level and then its subcategories, rather than one long
 * path a picker cuts off. A row that cannot be tagged is disabled with the reason in its Owner
 * cell; one already this ERP's is selected and disabled.
 *
 * Kept quiet (owner, 2026-10-19: "still feels busy"): the filters carry no labels, since each
 * one's value says what it is ("All categories"); Subcategory appears only once a category
 * has some; Show selected and Clear only once something is selected. While the products are
 * read the whole frame is already there, the filters off and the reading said where the rows
 * will be, so nothing moves when they land.
 *
 * @module features/dashboard/ui/components/AssignProductList
 */

import { ActionButton, Cell, Column, Item, Picker, Row, SearchField, TableBody, TableHeader, TableView } from '@adobe/react-spectrum';
import type { Selection, SortDescriptor } from '@react-types/shared';
import React, { useMemo, useState } from 'react';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import type { ErpAssignOptions, ErpAssignProduct } from '@/types/erpAssign';

/** The filter value meaning "no filter". */
const ANY = 'any';
/** The owner filter's value for a product no ERP owns. */
const NO_ERP = 'none';

export const LIST_COPY = {
    search: 'Search SKU or name',
    category: 'Category',
    subcategory: 'Subcategory',
    anySubcategory: 'All subcategories',
    owner: 'Owner',
    anyCategory: 'All categories',
    anyOwner: 'Any owner',
    noErp: 'No ERP',
    shown: (shown: number, total: number, website?: string) =>
        `${shown === total ? total : `${shown} of ${total}`} products${website ? ` on ${website}` : ''}`,
    reading: 'Reading the products in Commerce',
    columns: { sku: 'SKU', name: 'Name', category: 'Category', owner: 'Owner' },
    selectedOnly: 'Show selected',
    showAll: 'Show all',
    clear: 'Clear',
    blocked: "Can't be tagged (no erp_owner in its set)",
    already: (erp: string) => `Already ${erp}'s`,
    nothing: 'No products match.',
};

/** One row as the table draws it: a cell per column. */
interface ProductRow {
    product: ErpAssignProduct;
    /** The product's first category in this store, by its own name (the filters give the path). */
    category: string;
    /** Who owns it, or why it is locked. */
    owner: string;
    /** Why it cannot be picked, if it cannot. */
    locked?: 'blocked' | 'already';
}

/** A column the table sorts by. */
type ColumnKey = keyof typeof LIST_COPY.columns;
const COLUMNS = Object.keys(LIST_COPY.columns) as ColumnKey[];

interface Filters {
    query: string;
    /** A top-level category's name, or ANY. */
    category: string;
    /** A subcategory's id under it, or ANY. */
    subcategory: string;
    owner: string;
    selectedOnly: boolean;
}

/** A category label's last segment: "Signs › Exit Signs" is Exit Signs. */
function leafOf(label: string): string {
    const parts = label.split(' › ');
    return parts[parts.length - 1];
}

function rowsOf(options: ErpAssignOptions, value: string): ProductRow[] {
    const labels = new Map(options.categories.map((choice) => [choice.value, choice.label]));
    const blockedSets = new Set(options.setsWithoutOwner.map((set) => set.id));
    return options.products.map((product) => {
        const label = product.categoryIds.flatMap((id) => labels.get(id) ?? [])[0];
        const owners = (options.owners[product.sku] ?? []).map((id) => options.names[id] ?? id);
        const row: ProductRow = { product, category: label ? leafOf(label) : '', owner: owners.join(', ') || LIST_COPY.noErp };
        if (product.owner === value) {
            row.locked = 'already';
            row.owner = LIST_COPY.already(options.erp.name);
        } else if (blockedSets.has(product.attributeSetId)) {
            row.locked = 'blocked';
            row.owner = LIST_COPY.blocked;
        }
        return row;
    });
}

/** A row's text in a column. */
function cellOf(row: ProductRow, column: ColumnKey): string {
    if (column === 'sku') return row.product.sku;
    if (column === 'name') return row.product.name ?? '';
    return row[column];
}

/** The rows in the order the column heading the SC clicked asks for. */
function sorted(rows: ProductRow[], sort: SortDescriptor): ProductRow[] {
    const column = COLUMNS.find((key) => key === sort.column) ?? 'sku';
    const sign = sort.direction === 'descending' ? -1 : 1;
    return [...rows].sort((a, b) => sign * cellOf(a, column).localeCompare(cellOf(b, column), undefined, { numeric: true }));
}

/** The top-level category a category label sits in: its first segment. */
function groupOf(label: string): string {
    return label.split(' › ')[0];
}

/** Whether a product is in the chosen category, and in the chosen subcategory when there is one. */
function inCategory(product: ErpAssignProduct, filters: Filters, labels: ReadonlyMap<string, string>): boolean {
    if (filters.subcategory !== ANY) return product.categoryIds.includes(filters.subcategory);
    if (filters.category === ANY) return true;
    return product.categoryIds.some((id) => {
        const label = labels.get(id);
        return label !== undefined && groupOf(label) === filters.category;
    });
}

/** A top-level category and its subcategories, by name only (the count beside the filters says how many). */
interface CategoryGroup {
    name: string;
    subcategories: Array<{ value: string; label: string }>;
}

function categoryGroups(options: ErpAssignOptions): CategoryGroup[] {
    const groups = new Map<string, CategoryGroup>();
    for (const choice of options.categories) {
        const name = groupOf(choice.label);
        const group = groups.get(name) ?? { name, subcategories: [] };
        const rest = choice.label.slice(name.length).replace(/^ › /u, '');
        if (rest) group.subcategories.push({ value: choice.value, label: rest });
        groups.set(name, group);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A filter: a flat picker whose first item means "all". Flat on purpose: a Picker with Sections
 * stopped the whole modal answering clicks when opened in the webview (2026-10-19), so the
 * category tree is two pickers, the top level and then its subcategories.
 */
function FilterPicker({ label, value, choices, onChange, isDisabled }: {
    label: string;
    value: string;
    choices: Array<{ value: string; label: string }>;
    onChange: (next: string) => void;
    isDisabled?: boolean;
}): React.ReactElement {
    return (
        // The menu wider than its box, so a long category name stays on one line (owner, 2026-10-19).
        <Picker
            aria-label={label}
            selectedKey={value}
            onSelectionChange={(key) => onChange(String(key))}
            width="size-3000"
            menuWidth="size-4600"
            isDisabled={isDisabled}
        >
            {choices.map((choice) => <Item key={choice.value}>{choice.label}</Item>)}
        </Picker>
    );
}

function matches(row: ProductRow, filters: Filters, options: ErpAssignOptions, selected: ReadonlySet<string>, labels: ReadonlyMap<string, string>): boolean {
    const { product } = row;
    const query = filters.query.trim().toLowerCase();
    if (query && !`${product.sku} ${product.name ?? ''}`.toLowerCase().includes(query)) return false;
    if (!inCategory(product, filters, labels)) return false;
    const owners = options.owners[product.sku] ?? [];
    if (filters.owner === NO_ERP && owners.length > 0) return false;
    if (filters.owner !== ANY && filters.owner !== NO_ERP && !owners.includes(filters.owner)) return false;
    return !filters.selectedOnly || selected.has(product.sku);
}

/**
 * The selection after the list reports one: the rows shown take the list's answer, the rows
 * hidden by a filter keep theirs, and a locked row is never part of it.
 */
function nextSelection(keys: Selection, shown: ProductRow[], selected: ReadonlySet<string>): Set<string> {
    const open = shown.filter((row) => !row.locked).map((row) => row.product.sku);
    const shownSet = new Set(shown.map((row) => row.product.sku));
    const next = new Set([...selected].filter((sku) => !shownSet.has(sku)));
    for (const sku of open) {
        if (keys === 'all' || keys.has(sku)) next.add(sku);
    }
    return next;
}

export interface AssignProductListProps {
    options: ErpAssignOptions;
    /** The `erp_owner` value the assignment writes. */
    value: string;
    selected: ReadonlySet<string>;
    onChange: (next: Set<string>) => void;
    /** Under the table: what the selection would do, in sentences. */
    summary?: React.ReactNode;
    /** The products are still being read: the frame, with the controls off. */
    loading?: boolean;
}

/**
 * The search, the filters, the table and what the selection would do.
 *
 * @param props - the store's products, the value written, the selection, its setter, a summary
 * @returns the table with its controls
 */
export function AssignProductList({ options, value, selected, onChange, summary, loading }: AssignProductListProps): React.ReactElement {
    const [filters, setFilters] = useState<Filters>({ query: '', category: ANY, subcategory: ANY, owner: ANY, selectedOnly: false });
    const [sort, setSort] = useState<SortDescriptor>({ column: 'sku', direction: 'ascending' });
    const set = (patch: Partial<Filters>): void => setFilters({ ...filters, ...patch });
    const rows = useMemo(() => rowsOf(options, value), [options, value]);
    const labels = useMemo(() => new Map(options.categories.map((choice) => [choice.value, choice.label])), [options]);
    const groups = useMemo(() => categoryGroups(options), [options]);
    const subcategories = groups.find((group) => group.name === filters.category)?.subcategories ?? [];
    const shown = sorted(rows.filter((row) => matches(row, filters, options, selected, labels)), sort);
    const locked = shown.filter((row) => row.locked).map((row) => row.product.sku);
    const already = shown.filter((row) => row.locked === 'already').map((row) => row.product.sku);
    const picking = selected.size > 0 || filters.selectedOnly;
    const owners = [
        { value: ANY, label: LIST_COPY.anyOwner },
        ...Object.entries(options.names).map(([id, name]) => ({ value: id, label: name })),
        { value: NO_ERP, label: LIST_COPY.noErp },
    ];
    return (
        <div className="assign-products-list">
            <SearchField
                aria-label={LIST_COPY.search}
                placeholder={LIST_COPY.search}
                value={filters.query}
                onChange={(query) => set({ query })}
                width="100%"
                isDisabled={loading}
            />
            <div className="assign-filters">
                <FilterPicker
                    label={LIST_COPY.category}
                    value={filters.category}
                    choices={[{ value: ANY, label: LIST_COPY.anyCategory }, ...groups.map((group) => ({ value: group.name, label: group.name }))]}
                    onChange={(category) => set({ category, subcategory: ANY })}
                    isDisabled={loading}
                />
                {subcategories.length > 0 && (
                    <FilterPicker
                        label={LIST_COPY.subcategory}
                        value={filters.subcategory}
                        choices={[{ value: ANY, label: LIST_COPY.anySubcategory }, ...subcategories]}
                        onChange={(subcategory) => set({ subcategory })}
                    />
                )}
                <FilterPicker label={LIST_COPY.owner} value={filters.owner} choices={owners} onChange={(owner) => set({ owner })} isDisabled={loading} />
                {!loading && <span className="assign-count">{LIST_COPY.shown(shown.length, rows.length, options.website)}</span>}
            </div>
            <div className="assign-list">
                <TableView
                    aria-label="Products"
                    selectionMode="multiple"
                    selectedKeys={[...already, ...shown.filter((row) => selected.has(row.product.sku)).map((row) => row.product.sku)]}
                    disabledKeys={locked}
                    onSelectionChange={(keys) => onChange(nextSelection(keys, shown, selected))}
                    sortDescriptor={sort}
                    onSortChange={setSort}
                    density="compact"
                    overflowMode="truncate"
                    height="100%"
                    // The reading and "none match" sit where the rows will be, under the headings.
                    renderEmptyState={() => (loading
                        ? <LoadingDisplay size="L" message={LIST_COPY.reading} />
                        : <div className="assign-list-empty">{LIST_COPY.nothing}</div>)}
                >
                    {/* Each column and cell written out: Spectrum's table throws ("reading
                        'getReusableView'") on columns and cells made by a .map (2026-10-19). */}
                    <TableHeader>
                        <Column key="sku" allowsSorting>{LIST_COPY.columns.sku}</Column>
                        <Column key="name" allowsSorting width="2fr">{LIST_COPY.columns.name}</Column>
                        <Column key="category" allowsSorting>{LIST_COPY.columns.category}</Column>
                        <Column key="owner" allowsSorting>{LIST_COPY.columns.owner}</Column>
                    </TableHeader>
                    <TableBody items={shown.map((row) => ({ id: row.product.sku, row }))}>
                        {(item) => (
                            <Row key={item.id}>
                                <Cell>{cellOf(item.row, 'sku')}</Cell>
                                <Cell>{cellOf(item.row, 'name')}</Cell>
                                <Cell>{cellOf(item.row, 'category')}</Cell>
                                <Cell>{cellOf(item.row, 'owner')}</Cell>
                            </Row>
                        )}
                    </TableBody>
                </TableView>
            </div>
            {/* The line keeps its height when empty, so the table does not resize as a pick
                starts or ends. */}
            <div className="assign-counts">
                <div className="assign-summary-slot">{summary}</div>
                {picking && (
                    <>
                        <ActionButton isQuiet onPress={() => set({ selectedOnly: !filters.selectedOnly })}>
                            {filters.selectedOnly ? LIST_COPY.showAll : LIST_COPY.selectedOnly}
                        </ActionButton>
                        <ActionButton isQuiet isDisabled={selected.size === 0} onPress={() => onChange(new Set())}>
                            {LIST_COPY.clear}
                        </ActionButton>
                    </>
                )}
            </div>
        </div>
    );
}
