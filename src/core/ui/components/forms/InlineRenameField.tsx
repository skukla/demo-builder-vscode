/**
 * InlineRenameField — rename-in-place for a displayed name.
 *
 * Display mode renders the name (caller-supplied typography class) plus a
 * hover/focus-revealed quiet pencil; clicking the pencil swaps in a prefilled,
 * focused, selected input.
 *
 * FIVE consumers render it → core placement, like ApiAccessPicker:
 *   - `projects-dashboard/ui/components/ProjectCard`
 *   - `projects-dashboard/ui/components/ProjectRow`
 *   - `dashboard/ui/ProjectDashboardScreen` (the project title)
 *   - `core/ui/components/integrations/IntegrationCard` (itself rendered on BOTH
 *     the wizard's Integrations area and the dashboard's integrations page)
 *   - `dashboard/ui/components/integrations/IntegrationDetailPanel`
 *
 * That list is enumerated rather than counted on purpose. It read "two
 * consumers" until 2026-08-15, and the staleness was not cosmetic: it is what
 * made a single hardcoded `aria-label` in here everyone's problem, unnoticed for
 * as long as it was, because the label is invisible to sighted users. See
 * `label` below.
 *
 * Enter and blur COMMIT through the async `onRename` (resolve null = success →
 * back to display mode, the parent's refreshed state supplies the new name;
 * resolve a string = error → stay in edit mode and show it inline). Escape
 * cancels. A trimmed-empty or unchanged value exits silently — no request.
 * While a rename is in flight the input is disabled.
 *
 * Containment: in display mode only the PENCIL stops click/keydown
 * propagation (the name text stays click-transparent so a hosting
 * click-to-open card still opens on a name click); in edit mode the whole
 * editor is contained — typing or committing must never open the project.
 *
 * @module core/ui/components/forms/InlineRenameField
 */

import { ActionButton } from '@adobe/react-spectrum';
import Edit from '@spectrum-icons/workflow/Edit';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/core/ui/utils/classNames';

/** Identity default: without a normalizer the field stores raw keystrokes. */
const IDENTITY = (raw: string): string => raw;

export interface InlineRenameFieldProps {
    /** The committed name (display mode). */
    name: string;
    /** Commit: resolve null on success, or an error message to show inline. */
    onRename: (newName: string) => Promise<string | null>;
    /** Hide the affordance entirely (e.g. demo running — backend rejects anyway). */
    disabled?: boolean;
    /** Class applied to the display-mode text (caller owns typography). */
    textClassName?: string;
    /**
     * Accessible name for the editor input.
     *
     * Defaults to the project wording this field shipped with, so every existing
     * consumer is unchanged. Pass your own when the thing being renamed is not a
     * project — an integration card that announces "New project name" is telling
     * a screen-reader user about the wrong object, and nothing on screen reveals
     * it, because the label is invisible.
     */
    label?: string;
    /**
     * Transform each keystroke as it's typed (e.g. project renames pass
     * `normalizeProjectName` so spaces → hyphens live, matching the create flow).
     * Omitted ⇒ raw input (the component stays name-agnostic).
     */
    normalize?: (raw: string) => string;
}

/**
 * The rename-in-place field.
 *
 * @param props - name, async commit, disabled gate, typography class, pencil label
 * @returns the display text + pencil, or the inline editor
 */
export function InlineRenameField({
    name,
    label = 'New project name',
    onRename,
    disabled = false,
    textClassName,
    normalize = IDENTITY,
}: InlineRenameFieldProps): React.ReactElement {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);
    const inputRef = useRef<HTMLInputElement>(null);
    // Mirrors `busy` for event handlers (a disable-triggered blur must not
    // re-commit while the first commit is still in flight).
    const busyRef = useRef(false);

    useEffect(() => {
        if (!editing) return;
        inputRef.current?.focus();
        inputRef.current?.select();
    }, [editing]);

    // Refocus AFTER the re-enabling render of a failed commit: browsers drop
    // focus when the focused input is disabled mid-flight, and focus() on a
    // still-disabled input is ignored — so this must run post-render.
    useEffect(() => {
        if (editing && !busy && error) inputRef.current?.focus();
    }, [editing, busy, error]);

    const startEditing = useCallback((): void => {
        setValue(name);
        setError(undefined);
        setEditing(true);
    }, [name]);

    const exitEdit = useCallback((): void => {
        setEditing(false);
        setError(undefined);
    }, []);

    const commit = useCallback(async (): Promise<void> => {
        if (busyRef.current) return;
        const trimmed = value.trim();
        if (!trimmed || trimmed === name) {
            exitEdit();
            return;
        }
        busyRef.current = true;
        setBusy(true);
        setError(undefined);
        // A rejecting onRename must not wedge the field (shared contract:
        // consumers SHOULD resolve an error string, but a throw degrades to one).
        let result: string | null;
        try {
            result = await onRename(trimmed);
        } catch {
            result = 'Rename failed';
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
        if (result === null) {
            exitEdit();
        } else {
            setError(result);
        }
    }, [value, name, onRename, exitEdit]);

    // Contain the editor: the hosting card tile opens on click/Enter/Space.
    const stopPropagation = useCallback(
        (event: React.SyntheticEvent): void => event.stopPropagation(),
        [],
    );

    if (!editing) {
        // Containment covers ONLY the pencil: the display-mode name stays
        // click-transparent so a hosting click-to-open card still opens on a
        // name click. Edit mode (below) contains the whole editor.
        return (
            <span className="inline-rename">
                <span className={cn('inline-rename-text', textClassName)}>{name}</span>
                {!disabled && (
                    // The SLOT, not the button, is what collapses while hidden —
                    // clipping a Spectrum ActionButton's own box would mean
                    // re-declaring its padding to restore it. See the
                    // `.inline-rename-pencil-slot` rules.
                    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- containment only; interaction lives on the child ActionButton
                    <span
                        className="inline-rename-pencil-slot"
                        onClick={stopPropagation}
                        onKeyDown={stopPropagation}
                    >
                        <ActionButton
                            isQuiet
                            aria-label={`Rename ${name}`}
                            UNSAFE_className="inline-rename-pencil"
                            onPress={startEditing}
                        >
                            <Edit size="S" />
                        </ActionButton>
                    </span>
                )}
            </span>
        );
    }

    return (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- containment only; interaction lives on the child input
        <span
            className="inline-rename inline-rename--editing"
            onClick={stopPropagation}
            onKeyDown={stopPropagation}
        >
            <input
                ref={inputRef}
                className="inline-rename-input"
                aria-label={label}
                value={value}
                disabled={busy}
                onChange={(event) => setValue(normalize(event.target.value))}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') void commit();
                    if (event.key === 'Escape') exitEdit();
                }}
                onBlur={() => {
                    if (!busyRef.current) void commit();
                }}
            />
            {error && (
                <span className="inline-rename-error" role="alert">
                    {error}
                </span>
            )}
        </span>
    );
}
