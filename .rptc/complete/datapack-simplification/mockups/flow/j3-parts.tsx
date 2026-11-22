/**
 * J3's window bodies: the type table for what a save will hold (`TypeSummary.tsx`), the name field,
 * and Create Datapack's picker. The picker is the product's Save From Store layout
 * (`StorePicksStage`: Select All Data and the kinds on the left, the shown kind's items on the right),
 * drawn from the house pieces the product's own pane uses (`SearchHeader`, `SelectAllRow`,
 * `CheckboxRow`), with two lines the conventions strike left out: the per-kind "Includes related …"
 * note (rule 2) and each item's grey detail (rule 1). `j3-windows.tsx` puts them in windows.
 */

import React, { useState } from 'react';
import { STORE, type StoreKind } from './scenarioSave';
import { TypeTable } from './TypeSummary';
import type { TypeOutcome } from './scenarioClear';
import { dataTypeLabel } from '@/features/data-installer/ui/dataTypeLabel';
import { FormField } from '@/core/ui/components/forms/FormField';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import { CheckboxRow } from '@/core/ui/components/selection/CheckboxRow';
import { SelectAllRow } from '@/core/ui/components/selection/SelectAllRow';
import { cn } from '@/core/ui/utils/classNames';

const digits = (n: number): string => n.toLocaleString('en-US');

/** Save Changes: what the datapack will hold, read-only, one row per type. No line above it (J2-3). */
export function SaveSummary({ rows }: { rows: TypeOutcome[] }): React.ReactElement {
    return (
        <div className="clear-demo-body">
            <TypeTable rows={rows} />
        </div>
    );
}

/** The two name errors (Phase 7b), or none. */
export function nameError(name: string, taken: readonly string[]): string | undefined {
    if (name.trim() === '') return 'Give it a name.';
    if (taken.some((t) => t.toLowerCase() === name.trim().toLowerCase())) return `You already have a datapack named ${name.trim()}.`;
    return undefined;
}

export interface NameFieldProps {
    name: string;
    onChange: (name: string) => void;
    /** Shown once Save or Create was pressed with a name it refuses. */
    error?: string;
}

/** The longer of the two errors, for the room kept under the field. */
const ROOM_ERROR = 'You already have a datapack named Luma Holiday.';
const NO_CHANGE = (): void => undefined;

/**
 * The datapack's name. Room for an error is kept under it from the start, so an error arriving moves
 * nothing (rule 14), as `FormDialog` keeps room for its failure line: a hidden copy of the field
 * showing an error sits in the same grid cell (`modal-steps`, the house's way to let the tallest of
 * several states set the height), so the room is exactly the field's own error, not a guess at it.
 */
export function NameField({ name, onChange, error }: NameFieldProps): React.ReactElement {
    return (
        <div className="modal-steps">
            <div>
                <FormField fieldKey="datapackName" label="Datapack Name" type="text" value={name} onChange={onChange} required error={error} showError={Boolean(error)} />
            </div>
            <div className="modal-steps-ghost" aria-hidden="true">
                <FormField fieldKey="datapackNameRoom" label="Datapack Name" type="text" value="" onChange={NO_CHANGE} required error={ROOM_ERROR} showError />
            </div>
        </div>
    );
}

const matches = (name: string, query: string): boolean => name.toLowerCase().includes(query.trim().toLowerCase());

/** One kind's items, ticked or not: the filter, its Select All, the rows. Its count shows on the left only (rule 3). */
function KindPane({ kind, picked, onChange }: { kind: StoreKind; picked: string[]; onChange: (ids: string[]) => void }): React.ReactElement {
    const [query, setQuery] = useState('');
    const noun = dataTypeLabel(kind.code).toLowerCase();
    const shown = kind.items.filter((item) => matches(item, query));
    const ticked = new Set(picked);
    const allShown = shown.length > 0 && shown.every((item) => ticked.has(item));
    const toggle = (item: string): void => onChange(ticked.has(item) ? picked.filter((p) => p !== item) : [...picked, item]);
    const toggleShown = (): void => onChange(allShown ? picked.filter((p) => !shown.includes(p)) : [...new Set([...picked, ...shown])]);
    return (
        <div className="datapack-pick-list">
            <SearchHeader
                searchQuery={query}
                onSearchQueryChange={setQuery}
                searchPlaceholder={`Filter ${noun}`}
                totalCount={kind.items.length}
                filteredCount={shown.length}
                itemNoun={noun}
                itemNounPlural={noun}
                hasLoadedOnce
                hideCount
            />
            <SelectAllRow all={allShown} some={shown.some((item) => ticked.has(item))} onToggle={toggleShown} />
            <div className="datapack-pick-rows">
                {shown.map((item) => (
                    <CheckboxRow key={item} label={item} isSelected={ticked.has(item)} onChange={() => toggle(item)} />
                ))}
            </div>
        </div>
    );
}

/** A kind's count on the left: all of it ("48"), or how many of how many when some are unticked ("12 of 48"). */
function kindNote(kind: StoreKind, picked: number): string {
    return picked === kind.items.length ? digits(picked) : `${digits(picked)} of ${digits(kind.items.length)}`;
}

export interface CreatePickerProps {
    picked: Record<string, string[]>;
    onChange: (picked: Record<string, string[]>) => void;
}

/** What the new datapack holds, by kind: Select All Data, then each kind with its count; the shown kind's items on the right. */
export function CreatePicker({ picked, onChange }: CreatePickerProps): React.ReactElement {
    const [shown, setShown] = useState(STORE[0]?.code ?? '');
    const kind = STORE.find((k) => k.code === shown) ?? STORE[0];
    const count = (k: StoreKind): number => picked[k.code]?.length ?? 0;
    const all = STORE.every((k) => count(k) === k.items.length);
    const some = STORE.some((k) => count(k) > 0);
    const everything = (): void => onChange(Object.fromEntries(STORE.map((k) => [k.code, all ? [] : [...k.items]])));
    return (
        <>
            <div className="datapack-picks type-rail">
                <ul className="datapack-picks-rail">
                    <li>
                        <SelectAllRow everything all={all} some={some} onToggle={everything} />
                    </li>
                    {STORE.map((k) => (
                        <li key={k.code}>
                            <button
                                type="button"
                                className={cn('datapack-picks-kind', k.code === kind?.code && 'datapack-picks-kind--shown', count(k) > 0 && 'datapack-picks-kind--picked')}
                                aria-current={k.code === kind?.code ? 'true' : undefined}
                                onClick={() => setShown(k.code)}
                            >
                                {dataTypeLabel(k.code)}
                                <span className="datapack-picks-note">{kindNote(k, count(k))}</span>
                            </button>
                        </li>
                    ))}
                </ul>
                <div className="datapack-picks-pane">
                    {kind ? <KindPane key={kind.code} kind={kind} picked={picked[kind.code] ?? []} onChange={(ids) => onChange({ ...picked, [kind.code]: ids })} /> : null}
                </div>
            </div>
        </>
    );
}
