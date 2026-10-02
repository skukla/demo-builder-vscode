/**
 * "Appearance" on the mock ERP's card (AB-59): how the ERP's own screen looks in this demo — a
 * theme (its colour, logo and menu position together) and a colour that can override it. A
 * demo control, not an ERP setting: it left the ERP's own Settings screen (owner, 2026-10-02).
 *
 * Built from the house pieces: the core `Modal`, `LoadingDisplay` while the ERP is read, and
 * Spectrum radio groups for the choices, each with a swatch of its colour as the ERP's own theme
 * cards showed them. The refusal line is the one `IntegrationSettingsModal` uses. A theme lights
 * when the ERP's look is exactly that theme; a look no theme matches lights none, and saves its
 * colour alone.
 *
 * Hosts its own DialogContainer, the house rule for a modal (tests/sop/modal-hosting.test.ts).
 *
 * @module features/dashboard/ui/components/ErpAppearanceDialog
 */

import { DialogContainer, Flex, Radio, RadioGroup, Text } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { Modal } from '@/core/ui/components/ui/Modal';
import {
    useErpDemoControls,
    type ErpDemoControlTarget,
} from '@/features/dashboard/ui/hooks/useErpDemoControls';
import { ERP_PALETTES, ERP_THEMES, type ErpAppearance } from '@/types/erpDemoControls';

const NAV_LABELS: Record<string, string> = { rail: 'side menu', top: 'top menu' };

/** A theme and a colour, as chosen. */
interface Look {
    theme?: string;
    palette?: string;
}

/** The theme the ERP's look is exactly, if any, and its colour. */
function lookOf(appearance: ErpAppearance | null): Look {
    const theme = ERP_THEMES.find(
        (candidate) =>
            candidate.palette === appearance?.palette &&
            candidate.logo === appearance.logo &&
            candidate.nav === appearance.nav,
    );
    return { theme: theme?.id, palette: appearance?.palette };
}

function paletteOf(id: string): { label: string; accent: string } {
    const found = ERP_PALETTES.find((candidate) => candidate.id === id);
    return found ?? { label: id, accent: 'transparent' };
}

/** A colour's swatch: the colour is a custom property, the drawing is in integrations.css. */
function Swatch({ accent }: { accent: string }): React.ReactElement {
    return (
        <span
            className="erp-demo-swatch"
            aria-hidden="true"
            style={{ '--erp-demo-swatch': accent } as React.CSSProperties}
        />
    );
}

function LookPickers({ look, onTheme, onPalette }: {
    look: Look;
    onTheme: (theme: string) => void;
    onPalette: (palette: string) => void;
}): React.ReactElement {
    return (
        <>
            <RadioGroup label="Theme" value={look.theme ?? ''} onChange={onTheme}>
                {ERP_THEMES.map((theme) => (
                    <Radio key={theme.id} value={theme.id}>
                        <Swatch accent={paletteOf(theme.palette).accent} />
                        {theme.label}
                        <span className="erp-demo-detail">
                            {` · ${paletteOf(theme.palette).label}, ${NAV_LABELS[theme.nav]}`}
                        </span>
                    </Radio>
                ))}
            </RadioGroup>
            <RadioGroup
                label="Colour"
                orientation="horizontal"
                value={look.palette ?? ''}
                onChange={onPalette}
            >
                {ERP_PALETTES.map((palette) => (
                    <Radio key={palette.id} value={palette.id}>
                        <Swatch accent={palette.accent} />
                        {palette.label}
                    </Radio>
                ))}
            </RadioGroup>
        </>
    );
}

/**
 * Host the appearance modal while the open control is the ERP's look.
 *
 * @param props - the open control (or none) and the close callback
 * @returns the dialog container
 */
export function ErpAppearanceDialog({ target, onClose }: {
    target: ErpDemoControlTarget | null;
    onClose: () => void;
}): React.ReactElement {
    return (
        <DialogContainer onDismiss={onClose}>
            {target?.control === 'appearance' && (
                <AppearanceModal target={target} onClose={onClose} />
            )}
        </DialogContainer>
    );
}

/** The ERP's look as it is, then the theme and colour to change it to; mounted per opening. */
function AppearanceModal({ target, onClose }: {
    target: ErpDemoControlTarget;
    onClose: () => void;
}): React.ReactElement {
    const { state, error, busy, run } = useErpDemoControls(target);
    const saved = lookOf(state?.appearance ?? null);
    const [chosen, setChosen] = useState<Look | null>(null);
    const look = chosen ?? saved;
    const changed =
        chosen !== null && (look.theme !== saved.theme || look.palette !== saved.palette);

    const chooseTheme = (theme: string): void => {
        setChosen({ theme, palette: ERP_THEMES.find((t) => t.id === theme)?.palette });
    };
    const choosePalette = (palette: string): void => setChosen({ ...look, palette });
    const save = async (): Promise<void> => {
        const payload = { ...(look.theme ? { theme: look.theme } : {}), palette: look.palette };
        if (await run('setErpAppearance', payload)) onClose();
    };

    return (
        <Modal
            title={`${target.name}: demo appearance`}
            size="M"
            fitContent
            onClose={onClose}
            closeLabel="Cancel"
            actionButtons={[{
                label: 'Save',
                variant: 'accent',
                onPress: () => {
                    void save();
                },
                isDisabled: !changed || busy,
            }]}
        >
            <Flex direction="column" gap="size-200">
                <Text>
                    How {target.name}&apos;s own screen looks in this demo. A demo control, not an
                    ERP setting: it changes no records.
                </Text>
                {!state && busy && <LoadingDisplay size="S" message={`Reading ${target.name}`} />}
                {state && (
                    <LookPickers look={look} onTheme={chooseTheme} onPalette={choosePalette} />
                )}
                {error && <Text UNSAFE_className="text-sm text-red-600">{error}</Text>}
            </Flex>
        </Modal>
    );
}
