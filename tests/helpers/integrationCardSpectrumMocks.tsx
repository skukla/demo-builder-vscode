/**
 * The Spectrum wall the two integration-card surfaces share.
 *
 * `IntegrationCard` (the shared card face, in `core/ui`) and
 * `IntegrationDetailPanel` (the dashboard's drawer) render the same primitives
 * and carried a byte-identical 40-line mock of them in two different features.
 * They are the same card family: the card moved into `core/ui` when the wizard
 * became a second consumer, and the panel it opens stayed in the dashboard.
 *
 * IMPORTING THIS FILE REGISTERS THE MOCKS, and it must therefore be imported
 * BEFORE the component under test — `jest.mock` hoists above the imports of the
 * module it appears in, not across modules. Pinned by
 * `tests/sop/mock-wall-import-order.test.ts`.
 *
 * WHAT IS DELIBERATELY NOT HERE. `StatusDot` (only the card mocks it) and the
 * `Edit`/`Close` icons (only the panel renders them). The directory convention
 * is to mock what the tree actually renders, and a shared wall that hands every
 * consumer a primitive it never uses is the failure that convention exists to
 * prevent. Those stay with the suite that needs them.
 *
 * The Menu stub renders its items EAGERLY, with no popup: each `Item` becomes a
 * button firing the parent `Menu`'s `onAction` with its key. Spectrum's press
 * events do not exist in jsdom, so every stub translates `onPress` to `onClick`
 * and `isDisabled` to `disabled`, and spreads `...props` LAST so a `data-testid`
 * the component passes wins over anything the stub hardcodes.
 */

 

jest.mock('@adobe/react-spectrum', () => ({
    ActionButton: ({ children, onPress, isQuiet: _q, UNSAFE_className, ...props }: any) => (
        <button onClick={onPress} className={UNSAFE_className} {...props}>
            {children}
        </button>
    ),
    Button: ({ children, onPress, isDisabled, variant, ...props }: any) => (
        <button onClick={onPress} disabled={isDisabled} data-variant={variant} {...props}>
            {children}
        </button>
    ),
    Link: ({ children, onPress, isQuiet, ...props }: any) => (
        <span role="link" tabIndex={0} data-quiet={isQuiet} onClick={onPress} {...props}>
            {children}
        </span>
    ),
    MenuTrigger: ({ children }: any) => <div data-testid="menu-trigger">{children}</div>,
    Menu: ({ children, onAction }: any) => (
        <ul data-testid="card-menu">
            {require('react').Children.map(children, (child: any) =>
                child ? (
                    <li>
                        <button onClick={() => onAction?.(child.key)}>{child.props.children}</button>
                    </li>
                ) : null
            )}
        </ul>
    ),
    Item: ({ children }: any) => <>{children}</>,
    Text: ({ children }: any) => <span>{children}</span>,
}));

jest.mock('@spectrum-icons/workflow/More', () => ({
    __esModule: true,
    default: () => <span data-testid="icon-more" />,
}));

export {};
