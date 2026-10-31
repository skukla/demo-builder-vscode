/**
 * "Create datapack" (owner, 2026-10-30): the header's one way to make a pack from this project's
 * Commerce instance, in place of "Export from this instance" and "Save from this store", which
 * overlapped (and a Commerce store is one level inside an instance). The dialog asks the pack
 * type once, names the project it reads from, and routes to the screen that already makes that
 * pack; it rebuilds none of them:
 *
 * | Pack type | Engine         | Goes to                                                          |
 * |-----------|----------------|------------------------------------------------------------------|
 * | Commerce  | Demo Builder's | the pick screen (`SaveFromStoreModal`, through `onSaveFromStore`), into this demo's own library pack |
 * | Commerce  | the service's  | the service's export (`ServiceExportModal`), into the shared catalog |
 * | ACO, from this Commerce instance | either | the ACO export (`ServiceExportModal`), into the SC's library |
 * | ACO, from a website | either | the project's AI, opened on the URL (`scrape-website-to-aco-pack`) |
 *
 * The pick screen is the catalog's (`useHeldPack`, with its progress window), so this closes and
 * asks the catalog to open it; the export screens open in its place.
 *
 * "From a website" (owner, 2026-10-31, PL-60 slice A) builds no screen of its own: the AI reads
 * the page with the project's browser tool and saves the pack into the library through
 * `make_aco_pack_from_products`. This dialog only checks the URL with the handler and closes
 * once the AI is open; a refusal is shown on the field.
 *
 * @module features/data-installer/ui/components/CreateDatapackModal
 */

import { DialogContainer, Radio, RadioGroup } from '@adobe/react-spectrum';
import React, { useEffect, useRef, useState } from 'react';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';
import { type AcoSource, AcoSourceChoice } from './AcoSourceChoice';
import { ServiceExportModal } from './ServiceExportModal';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import { Modal } from '@/core/ui/components/ui/Modal';

/** The two pack types. */
export type PackType = 'commerce' | 'aco';

export interface CreateDatapackModalProps {
    /** The engine chosen; the service's when absent, as the export was before Demo Builder's had one. */
    engine?: 'service' | 'demo-builder';
    onClose: () => void;
    /** Demo Builder's engine, Commerce: open the catalog's pick screen. */
    onSaveFromStore: () => void;
}

/** Where a Commerce pack goes, by engine, as its choice says it. */
function commerceLabel(engine: CreateDatapackModalProps['engine']): string {
    return engine === 'demo-builder'
        ? "Commerce datapack: pick what goes in from this store, saved as this demo's own pack in your datapack library"
        : "Commerce datapack: export data types into the Data Installer's shared catalog";
}

/** The sentence naming what the pack is read from. */
function readsFrom(projectName: string | undefined): string {
    return projectName
        ? `Makes a datapack from the Commerce instance of ${projectName}.`
        : "Makes a datapack from this project's Commerce instance.";
}

/**
 * "From a website": send the URL, and close once the AI is open. A refusal stays on screen.
 */
function useWebsiteScrape(onClose: () => void) {
    const request = useDataInstallerRequest<null>('scrape-website-to-aco-pack');
    // The latest onClose, so the effect below runs on the answer only, whatever the parent passes.
    const close = useRef(onClose);
    close.current = onClose;
    const { settled, loading, failure } = request;
    useEffect(() => {
        if (settled && !loading && !failure) close.current();
    }, [settled, loading, failure]);
    return request;
}

export function CreateDatapackModal({ engine, onClose, onSaveFromStore }: CreateDatapackModalProps): React.JSX.Element {
    const [packType, setPackType] = useState<PackType>('commerce');
    const [source, setSource] = useState<AcoSource>('instance');
    const [url, setUrl] = useState('');
    const [chosen, setChosen] = useState<PackType | undefined>(undefined);
    const target = useDataInstallerRequest<{ projectName?: string }>('get-datapack-import-target');
    const scrape = useWebsiteScrape(onClose);
    const loadTarget = target.load;
    useEffect(() => {
        loadTarget({});
    }, [loadTarget]);

    const fromWebsite = packType === 'aco' && source === 'website';
    const proceed = (): void => {
        if (fromWebsite) {
            scrape.load({ url: url.trim() });
            return;
        }
        if (packType === 'commerce' && engine === 'demo-builder') {
            onClose();
            onSaveFromStore();
            return;
        }
        setChosen(packType);
    };

    if (chosen) return <ServiceExportModal onClose={onClose} packType={chosen} />;
    return (
        <DialogContainer onDismiss={onClose}>
            <Modal
                title="Create a datapack"
                fitContent
                onClose={onClose}
                actionButtons={[
                    {
                        label: 'Continue',
                        variant: 'accent',
                        onPress: proceed,
                        isDisabled: fromWebsite && (url.trim() === '' || scrape.loading),
                    },
                ]}
            >
                <div className="datapack-export-body">
                    <LeadText>{readsFrom(target.value?.projectName)}</LeadText>
                    <RadioGroup label="Pack type" value={packType} onChange={(value) => setPackType(value === 'aco' ? 'aco' : 'commerce')}>
                        <Radio value="commerce">{commerceLabel(engine)}</Radio>
                        <Radio value="aco">ACO datapack: an Adobe Commerce Optimizer catalog, into your datapack library</Radio>
                    </RadioGroup>
                    {packType === 'aco' && (
                        <AcoSourceChoice
                            source={source}
                            onSourceChange={setSource}
                            url={url}
                            onUrlChange={setUrl}
                            {...(scrape.failure ? { error: scrape.failure.message } : {})}
                        />
                    )}
                </div>
            </Modal>
        </DialogContainer>
    );
}
