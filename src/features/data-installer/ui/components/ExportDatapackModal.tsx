/**
 * Capture a datapack FROM the connected Commerce instance — Stage 3's surface.
 *
 * The inverse of {@link ImportDatapackModal}, and the differences are the design:
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
 * @module features/data-installer/ui/components/ExportDatapackModal
 */

import { Checkbox, DialogContainer } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { FormField } from '@/core/ui/components/forms/FormField';
import { Modal } from '@/core/ui/components/ui/Modal';

/** What one data type's export did, as the handler reports it. */
interface ExportTypeOutcome {
    dataType: string;
    success: boolean;
    exported: number;
    excluded: number;
    reason?: string;
}

interface ExportOutcome {
    success: boolean;
    perType: ExportTypeOutcome[];
}

/** What the project implies about where to export FROM. */
interface ProjectTarget {
    instance?: string;
    projectName?: string;
}

export interface ExportDatapackModalProps {
    onClose: () => void;
}

export function ExportDatapackModal({ onClose }: ExportDatapackModalProps): React.JSX.Element {
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

    const loadTypes = types.load;
    useEffect(() => {
        // The EXPORT set, which is not the import set — see the module docstring.
        loadTypes({ mode: 'export' });
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

    const canExport =
        name.trim().length > 0 && version.trim().length > 0 && selected.length > 0 && !run.loading;

    const start = useCallback((): void => {
        setDismissed(false);
        run.load({
            datapackName: name.trim(),
            version: version.trim(),
            commerceInstance: target.value?.instance ?? '',
            dataTypes: selected,
        });
    }, [run, name, version, selected, target.value]);

    const goBack = useCallback((): void => setDismissed(true), []);

    const outcome = dismissed ? null : run.value;
    const failure = dismissed ? null : run.failure;
    const showingResult = Boolean(outcome ?? failure);

    return (
        <DialogContainer onDismiss={onClose}>
            <Modal
                title="Export a datapack"
                onClose={onClose}
                closeLabel="Close"
                actionButtons={
                    showingResult
                        ? [{ label: 'Back', variant: 'secondary', onPress: goBack }]
                        : [
                              {
                                  label: run.loading ? 'Exporting…' : 'Export',
                                  variant: 'accent',
                                  onPress: start,
                                  isDisabled: !canExport,
                              },
                          ]
                }
            >
                <div className="datapack-export-body">
                    {showingResult ? (
                        <ExportResult outcome={outcome} error={failure?.message} />
                    ) : (
                        <ExportForm
                            projectName={target.value?.projectName}
                            name={name}
                            version={version}
                            onNameChange={setName}
                            onVersionChange={setVersion}
                            available={available}
                            selected={selected}
                            onToggle={toggle}
                            loadingTypes={types.loading}
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
    available,
    selected,
    onToggle,
    loadingTypes,
}: {
    projectName?: string;
    name: string;
    version: string;
    onNameChange: (value: string) => void;
    onVersionChange: (value: string) => void;
    available: string[];
    selected: string[];
    onToggle: (dataType: string, isSelected: boolean) => void;
    loadingTypes: boolean;
}): React.JSX.Element {
    return (
        <>
            <p className="datapack-export-intro">
                {projectName
                    ? `Capture data from ${projectName} into a new datapack.`
                    : 'Capture data from this project’s Commerce instance into a new datapack.'}{' '}
                The name and version identify it in the shared catalog, so pick something other
                teams will recognise as yours.
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

            <div className="datapack-import-types">
                <span className="datapack-import-label">Data types</span>
                {loadingTypes ? (
                    <p className="datapack-export-note">Loading what can be exported…</p>
                ) : (
                    <div className="datapack-import-type-grid">
                        {available.map((dataType) => (
                            <Checkbox
                                key={dataType}
                                isSelected={selected.includes(dataType)}
                                onChange={(isSelected) => onToggle(dataType, isSelected)}
                            >
                                {dataType}
                            </Checkbox>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}

/**
 * What the export did, per type.
 *
 * The `reason` line is the point of this view. The service reports a failed
 * export as an all-zero count with no explanation unless `verbose` is asked for;
 * the client asks, so the explanation exists and belongs on screen.
 */
function ExportResult({
    outcome,
    error,
}: {
    outcome: ExportOutcome | null;
    error?: string;
}): React.JSX.Element {
    if (error) {
        return <StatusDisplay variant="error" title="The export could not run" message={error} />;
    }
    const perType = outcome?.perType ?? [];
    const captured = perType.filter((row) => row.success);
    return (
        <StatusDisplay
            variant={outcome?.success ? 'success' : 'error'}
            title={
                outcome?.success
                    ? `Exported ${captured.length} of ${perType.length} data types`
                    : 'The export did not complete'
            }
            details={perType.map(describeType)}
        />
    );
}

/** One line per type: what it captured, or why it did not. */
function describeType(row: ExportTypeOutcome): string {
    if (!row.success) {
        return `${row.dataType}: failed — ${row.reason ?? 'the service gave no reason'}`;
    }
    const excluded = row.excluded > 0 ? ` (${row.excluded} excluded by the service)` : '';
    return `${row.dataType}: ${row.exported} exported${excluded}`;
}
