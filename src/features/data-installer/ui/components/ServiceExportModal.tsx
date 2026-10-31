/**
 * Capture a datapack FROM the Commerce instance: the service's Commerce export (Stage 3), or an
 * ACO pack. Opened by `CreateDatapackModal`, the catalog header's "Create datapack", once the
 * pack type is chosen there (a Commerce pack with Demo Builder's engine goes to the pick screen,
 * `SaveFromStoreModal`, instead). The inverse of {@link ImportDatapackModal}, and the differences
 * are the design:
 *
 * **The user NAMES the target.** An import writes into a Commerce instance the
 * project already identifies; an export writes into a catalog that 23 curated
 * entries share. Nothing here guesses a name — both fields are typed and
 * required, and the Export button stays disabled until they and at least one
 * data type are given.
 *
 * **The type list is the EXPORT one.** `list-datapack-data-types` is asked with
 * `mode: 'export'`, which is a genuinely different set: `giftcards` has an
 * import processor and no export counterpart, so it is simply absent rather than
 * offered and silently skipped.
 *
 * **A failure carries its reason.** The service answers a failed export with an
 * all-zero summary and no explanation unless `verbose` is sent; the write client
 * always sends it, and this renders what comes back. Showing a bare "export
 * failed" would reproduce exactly the silence that cost a day to diagnose.
 *
 * Two views only — form and result — because an export returns inline. There is
 * no activation id to watch, unlike an import.
 *
 * **Or an ACO pack** (datapack-engine step 14 item 19, `AcoExportChoices`): made by Demo
 * Builder into the SC's library, so offered with any engine; the Commerce pack only with the
 * service's. Which one is `packType`, asked once by `CreateDatapackModal`, never again here.
 * The result view is `ExportDatapackResult`.
 *
 * @module features/data-installer/ui/components/ServiceExportModal
 */

import { ActionButton, Checkbox, DialogContainer } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { dataTypeLabel } from '../dataTypeLabel';
import { type AcoExportChoice, useAcoExportChoice } from '../hooks/useAcoExportChoice';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';
import { AcoExportChoices } from './AcoExportChoices';
import { type ExportOutcome, ExportDatapackResult } from './ExportDatapackResult';
import { SaveDatapackFileButton } from './SaveDatapackFileButton';
import { FormField } from '@/core/ui/components/forms/FormField';
import { Modal } from '@/core/ui/components/ui/Modal';

/** What the project implies about where to export FROM. */
interface ProjectTarget {
    instance?: string;
    projectName?: string;
}

/**
 * The data-type list and everything that acts on it.
 *
 * One object rather than seven loose props: the form is otherwise five fields
 * wide, and threading the list through as separate arguments pushed it past the
 * prop ceiling the moment Select all arrived.
 */
interface TypeChoices {
    available: string[];
    selected: string[];
    allSelected: boolean;
    loading: boolean;
    /** Something has actually come back — see the `!settled` guard below. */
    settled: boolean;
    error?: string;
    onToggle: (dataType: string, isSelected: boolean) => void;
    onToggleAll: () => void;
}

export interface ServiceExportModalProps {
    onClose: () => void;
    /** The pack this makes: the service's Commerce export, or an ACO pack (`CreateDatapackModal` asks). */
    packType: 'commerce' | 'aco';
}

export function ServiceExportModal({ onClose, packType }: ServiceExportModalProps): React.JSX.Element {
    const [name, setName] = useState('');
    const [version, setVersion] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    /** Back was pressed — the outcome was seen; show the form again. */
    const [dismissed, setDismissed] = useState(false);

    // `dataTypes` is a STRING ARRAY — `getProcessorOrder` returns names, not
    // objects. An earlier version read `entry.dataType` off each, which yielded
    // undefined for every one and rendered an empty Data Types section. The
    // fixture agreed with the bug; the Extension Dev Host is what caught it.
    const types = useDataInstallerRequest<{ dataTypes?: string[] }>('list-datapack-data-types');
    const target = useDataInstallerRequest<ProjectTarget>('get-datapack-import-target');
    const run = useDataInstallerRequest<ExportOutcome>('start-datapack-export');
    const aco = useAcoExportChoice(packType === 'aco');

    const loadTypes = types.load;
    useEffect(() => {
        // `operationMode`, NOT `mode`: the handler refuses anything else, and a
        // refusal here used to render as an empty Data Types section with no
        // explanation. The EXPORT set is not the import set — see the docstring.
        loadTypes({ operationMode: 'export' });
    }, [loadTypes]);

    const loadTarget = target.load;
    useEffect(() => {
        loadTarget({});
    }, [loadTarget]);

    const available = useMemo(
        () => (types.value?.dataTypes ?? []).filter(Boolean),
        [types.value],
    );

    const toggle = useCallback((dataType: string, isSelected: boolean): void => {
        setSelected((current) =>
            isSelected ? [...current, dataType] : current.filter((t) => t !== dataType),
        );
    }, []);

    const allSelected = available.length > 0 && selected.length === available.length;

    // Selecting all takes the service's own order, so the request carries the
    // types in the sequence the processors run rather than in click order.
    const toggleAll = useCallback((): void => {
        setSelected(allSelected ? [] : [...available]);
    }, [allSelected, available]);

    const chosen = aco.isAco ? aco.ready : selected.length > 0;
    const canExport = name.trim().length > 0 && version.trim().length > 0 && chosen;

    const start = useCallback((): void => {
        setDismissed(false);
        const id = { datapackName: name.trim(), version: version.trim() };
        const commerce = { commerceInstance: target.value?.instance ?? '', dataTypes: selected };
        run.load(aco.isAco ? { ...id, ...aco.fields() } : { ...id, ...commerce });
    }, [run, name, version, selected, target.value, aco]);

    const goBack = useCallback((): void => setDismissed(true), []);

    const outcome = dismissed ? null : run.value;
    const failure = dismissed ? null : run.failure;
    const showingResult = Boolean(outcome ?? failure);
    const captured = outcome?.perType?.some((row) => row.success);
    const savable = captured ? { name: name.trim(), version: version.trim() } : null;

    return (
        <DialogContainer onDismiss={onClose}>
            <Modal
                // L, not the default M: there are 18 exportable types and the
                // longest (b2b_shared_catalog_company_assignments) is 38
                // characters. At M they either wrap mid-name or scroll.
                size="L"
                wide
                title="Export a datapack"
                onClose={onClose}
                closeLabel="Close"
                actionButtons={
                    showingResult
                        ? [{ label: 'Back', variant: 'secondary', onPress: goBack }]
                        : [
                              {
                                  label: 'Export',
                                  variant: 'accent',
                                  onPress: start,
                                  isDisabled: !canExport,
                                  isPending: run.loading,
                              },
                          ]
                }
            >
                <div className="datapack-export-body">
                    {showingResult ? (
                        <>
                            <ExportDatapackResult outcome={outcome} error={failure?.message} />
                            {savable ? (
                                <SaveDatapackFileButton id={savable} source={aco.isAco ? 'library' : 'installer'} />
                            ) : null}
                        </>
                    ) : (
                        <ExportForm
                            projectName={target.value?.projectName}
                            name={name}
                            version={version}
                            onNameChange={setName}
                            onVersionChange={setVersion}
                            aco={aco}
                            types={{
                                available,
                                selected,
                                allSelected,
                                loading: types.loading,
                                settled: types.settled,
                                error: types.failure?.message,
                                onToggle: toggle,
                                onToggleAll: toggleAll,
                            }}
                        />
                    )}
                </div>
            </Modal>
        </DialogContainer>
    );
}

/** Name the pack, pick what goes in it. */
function ExportForm({
    projectName,
    name,
    version,
    onNameChange,
    onVersionChange,
    aco,
    types,
}: {
    projectName?: string;
    name: string;
    version: string;
    onNameChange: (value: string) => void;
    onVersionChange: (value: string) => void;
    aco: AcoExportChoice;
    types: TypeChoices;
}): React.JSX.Element {
    return (
        <>
            <p className="datapack-export-intro">
                {projectName
                    ? `Capture data from ${projectName} into a new datapack.`
                    : 'Capture data from this project’s Commerce instance into a new datapack.'}{' '}
                {aco.isAco
                    ? 'The name and version identify it in your datapack library.'
                    : 'The name and version identify it in the shared catalog, so pick something other teams will recognise as yours.'}
            </p>

            <FormField
                fieldKey="datapackName"
                label="Datapack name"
                type="text"
                value={name}
                onChange={onNameChange}
                required
                placeholder="e.g. citisignal-snapshot"
            />
            <FormField
                fieldKey="version"
                label="Version"
                type="text"
                value={version}
                onChange={onVersionChange}
                required
                placeholder="e.g. main"
            />

            <AcoExportChoices choice={aco}>
                <div className="datapack-import-types">
                    {/* Label and bulk toggle side by side, matching the import list.
                        The toggle appears only once there is a list to act on. */}
                    <div className="datapack-import-types-head">
                        <span className="datapack-import-label">Data types</span>
                        {types.available.length > 0 ? (
                            <ActionButton isQuiet onPress={types.onToggleAll}>
                                {types.allSelected ? 'Clear all' : 'Select all'}
                            </ActionButton>
                        ) : null}
                    </div>
                    {renderTypeChoices(types)}
                </div>
            </AcoExportChoices>
        </>
    );
}

/**
 * The data-type choices, or why there are none.
 *
 * A helper rather than chained ternaries in JSX — nested ternaries are on the
 * project's avoid list, and its sibling views solve this the same way. The
 * failure branch matters: an empty section with no reason is precisely the
 * silence this feature spent a day diagnosing in the service itself.
 */
function renderTypeChoices({
    error,
    loading,
    settled,
    available,
    selected,
    onToggle,
}: TypeChoices): React.JSX.Element {
    if (error) {
        return (
            <p className="datapack-export-note">
                The exportable data types could not be loaded — {error}
            </p>
        );
    }
    // `!settled` too: `loading` starts false and the fetch runs from a useEffect,
    // so frame 1 fell past this and drew an empty type grid before the note
    // appeared.
    if (loading || !settled) {
        return <p className="datapack-export-note">Loading what can be exported</p>;
    }
    return (
        <div className="datapack-type-grid">
            {available.map((dataType) => (
                <Checkbox
                    key={dataType}
                    isSelected={selected.includes(dataType)}
                    onChange={(isSelected) => onToggle(dataType, isSelected)}
                >
                    {dataTypeLabel(dataType)}
                </Checkbox>
            ))}
        </div>
    );
}
