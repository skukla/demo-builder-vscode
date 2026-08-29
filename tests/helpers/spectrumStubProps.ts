/**
 * Keeping Spectrum-only props off DOM nodes in per-suite stubs.
 *
 * WHY THIS EXISTS. The house convention is that Spectrum primitives are mocked
 * per suite, mocking only what the tree actually renders
 * (`.claude/skills/webview-test-authoring` §2). That convention is right, and
 * this is its cost: a stub written as
 *
 *     Text: ({ children, ...props }) => <span {...props}>{children}</span>
 *
 * forwards EVERY prop the real component accepts onto a real DOM element. React
 * recognises almost none of them and warns once per prop per render —
 * "React does not recognize the `UNSAFE_className` prop on a DOM element".
 *
 * The warnings are not cosmetic. They are the same channel a genuine mistake
 * uses, so a suite that emits them habitually cannot tell you when it starts
 * passing something it should not.
 *
 * Fixing them one prop at a time does not converge: removing `UNSAFE_className`
 * from one stub surfaced `isQuiet` behind it, and the component is free to pass
 * more tomorrow. So strip by CLASS, in one place, and let a stub opt back in to
 * whatever it genuinely wants to assert on.
 */

/**
 * Props that exist on Spectrum components and mean nothing to the DOM.
 *
 * Read from the stubs and components in this repo that actually pass them, not
 * from the whole Spectrum API — a list mirroring an entire library drifts the
 * moment the library grows something nobody uses here.
 */
const SPECTRUM_ONLY_PROPS = new Set([
    // styling escape hatches
    'UNSAFE_className',
    'UNSAFE_style',
    // appearance flags
    'isQuiet',
    'isEmphasized',
    'staticColor',
    'density',
    'overflowMode',
    // state flags Spectrum spells its own way (the DOM equivalents, where they
    // exist, are set explicitly by the stub — `disabled`, `checked`, …)
    'isSelected',
    'isIndeterminate',
    'isReadOnly',
    'isRequired',
    'isHidden',
    'validationState',
    'necessityIndicator',
    // layout props from the style-props system
    'flex',
    'alignSelf',
    'justifySelf',
    'gridArea',
    'gridColumn',
    'gridRow',
    'marginTop',
    'marginBottom',
    'marginStart',
    'marginEnd',
    'marginX',
    'marginY',
    'margin',
    'labelPosition',
    'labelAlign',
    'alignItems',
    'justifyContent',
    'direction',
    'wrap',
    'gap',
    // `isDisabled` belongs here too. A stub that wants it maps it to `disabled`
    // itself, before this runs; one that does not was leaking it to the DOM.
    'isDisabled',
]);

/**
 * The subset of `props` that is safe to spread onto a DOM element.
 *
 * Use in a stub wherever the whole bag was being forwarded:
 *
 *     Text: ({ children, ...props }: any) => (
 *         <span {...domProps(props)}>{children}</span>
 *     )
 *
 * Anything the stub needs to keep — `UNSAFE_className` re-applied as
 * `className`, a `variant` surfaced as `data-variant` — is destructured by the
 * stub BEFORE this is called, exactly as it would have been anyway. This only
 * removes what would otherwise reach the DOM unread.
 *
 * @param props - the leftover prop bag from a stub's destructuring
 * @returns the same object minus the props React would warn about
 */
export function domProps(props: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
        if (!SPECTRUM_ONLY_PROPS.has(key)) {
            out[key] = value;
        }
    }
    return out;
}
