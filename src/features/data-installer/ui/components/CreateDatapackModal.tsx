/**
 * "Create datapack" (owner, 2026-10-30): the header's one way to make a pack from this project's
 * Commerce instance, in place of "Export from this instance" and "Save from this store", which
 * overlapped (and a Commerce store is one level inside an instance).
 *
 * ONE dialog (owner, 2026-10-31, the multi-dialog audit): the pack type as two plain options at
 * the top and the chosen option's own form right under it, as the Share dialog does with its
 * link-or-file choice. No line under the choice: each form's opening sentence already says where
 * its pack goes, and a second line said it twice. It was a dialog that asked the type and
 * then closed for a second one. It rebuilds neither form; it hosts the one that already makes
 * that pack, with the choice as its lead:
 *
 * | Pack type | Engine         | The form under the choice                                                |
 * |-----------|----------------|--------------------------------------------------------------------------|
 * | Commerce  | Demo Builder's | the pick list (`SaveFromStoreDialog`), saved into this demo's own library pack by the catalog's save (`onSaveFromStore`, with its progress window) |
 * | Commerce  | the service's  | the service's export (`ServiceExportDialog`), into the shared catalog    |
 * | ACO, from this Commerce instance | either | the ACO export (`ServiceExportDialog`), into the SC's library |
 * | ACO, from a website | either | the URL, then the project's AI (`scrape-website-to-aco-pack`) |
 *
 * Every form is L and wide, so the dialog keeps one width whichever is chosen. Switching the
 * choice starts that form afresh.
 *
 * "From a website" (owner, 2026-10-31, PL-60 slice A) builds no screen of its own: the AI reads
 * the page with the project's browser tool and saves the pack into the library through
 * `make_aco_pack_from_products`. This dialog only checks the URL with the handler and closes once
 * the AI is open; a refusal is shown on the field. The ACO source choice sits under the pack type
 * (`AcoSourceChoice`), so both choices stay in view in one dialog.
 *
 * @module features/data-installer/ui/components/CreateDatapackModal
 */

import { DialogContainer, Radio, RadioGroup } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { StorePicks } from '../../pickableKinds';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';
import { type AcoSource, AcoSourceChoice } from './AcoSourceChoice';
import { SaveFromStoreDialog } from './SaveFromStoreModal';
import { ServiceExportDialog } from './ServiceExportModal';
import { Modal } from '@/core/ui/components/ui/Modal';

/** The two pack types. */
export type PackType = 'commerce' | 'aco';

const TITLE = 'Create a datapack';

export interface CreateDatapackModalProps {
    /** The engine chosen; the service's when absent, as the export was before Demo Builder's had one. */
    engine?: 'service' | 'demo-builder';
    onClose: () => void;
    /** Demo Builder's engine, Commerce: save the picks into this demo's own pack. */
    onSaveFromStore: (picks: StorePicks) => void;
}

/** The pack type, as two plain options (the Share dialog's shape). */
function PackTypeChoice({ packType, onChange }: {
    packType: PackType;
    onChange: (packType: PackType) => void;
}): React.JSX.Element {
    return (
        <RadioGroup
            label="Pack type"
            orientation="horizontal"
            value={packType}
            onChange={(value) => onChange(value === 'aco' ? 'aco' : 'commerce')}
        >
            <Radio value="commerce">Commerce datapack</Radio>
            <Radio value="aco">ACO datapack</Radio>
        </RadioGroup>
    );
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

/** The website form: the choices, then the URL (inside `lead`), and the hand-off to the AI. */
function WebsiteSourceDialog({ lead, url, onClose, onContinue, busy }: {
    lead: React.ReactNode;
    url: string;
    onClose: () => void;
    onContinue: () => void;
    /** The URL is being checked: the button spins on its label (no "-ing" label, owner 2026-10-31). */
    busy: boolean;
}): React.JSX.Element {
    return (
        <Modal
            title={TITLE}
            size="L"
            wide
            fitContent
            onClose={onClose}
            actionButtons={[{ label: 'Continue', variant: 'accent', onPress: onContinue, isDisabled: url.trim() === '', isPending: busy }]}
        >
            <div className="datapack-export-body">{lead}</div>
        </Modal>
    );
}

export function CreateDatapackModal({ engine, onClose, onSaveFromStore }: CreateDatapackModalProps): React.JSX.Element {
    const [packType, setPackType] = useState<PackType>('commerce');
    const [source, setSource] = useState<AcoSource>('instance');
    const [url, setUrl] = useState('');
    const scrape = useWebsiteScrape(onClose);
    const choice = (
        <>
            <PackTypeChoice packType={packType} onChange={setPackType} />
            {packType === 'aco' ? (
                <AcoSourceChoice
                    source={source}
                    onSourceChange={setSource}
                    url={url}
                    onUrlChange={setUrl}
                    {...(scrape.failure ? { error: scrape.failure.message } : {})}
                />
            ) : null}
        </>
    );
    const save = useCallback(
        (picks: StorePicks): void => {
            onClose();
            onSaveFromStore(picks);
        },
        [onClose, onSaveFromStore],
    );

    const picksFromStore = packType === 'commerce' && engine === 'demo-builder';
    const fromWebsite = packType === 'aco' && source === 'website';
    return (
        <DialogContainer onDismiss={onClose}>
            {picksFromStore ? <SaveFromStoreDialog title={TITLE} lead={choice} onSave={save} onClose={onClose} /> : null}
            {fromWebsite ? (
                <WebsiteSourceDialog lead={choice} url={url} onClose={onClose} onContinue={() => scrape.load({ url: url.trim() })} busy={scrape.loading} />
            ) : null}
            {!picksFromStore && !fromWebsite ? (
                <ServiceExportDialog key={packType} title={TITLE} lead={choice} packType={packType} onClose={onClose} />
            ) : null}
        </DialogContainer>
    );
}
