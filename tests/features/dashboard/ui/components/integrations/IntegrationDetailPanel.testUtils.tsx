/**
 * Shared setup for the IntegrationDetailPanel suites.
 *
 * THIS FILE OWNS THE MOCKS AND EVERY IMPORT THEY REPLACE. Specs import those
 * from HERE and declare no jest.mock of their own — jest.mock hoists above the
 * imports of the module it appears in, NOT across modules, so an import left
 * behind in a spec loads the real module before these mocks register.
 *
 * Extracted 2026-08-30 (lane C1) from byte-identical copies in:
 *   IntegrationDetailPanel-commerceScope.test.tsx
 *   IntegrationDetailPanel.test.tsx
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
                        <button onClick={() => onAction?.(child.key)}>
                            {child.props.children}
                        </button>
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
jest.mock('@spectrum-icons/workflow/Edit', () => ({
    __esModule: true,
    default: () => <span data-testid="icon-edit" />,
}));
jest.mock('@spectrum-icons/workflow/Close', () => ({
    __esModule: true,
    default: () => <span data-testid="icon-close" />,
}));

export { IntegrationDetailPanel } from '@/features/dashboard/ui/components/integrations/IntegrationDetailPanel';
