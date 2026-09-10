/**
 * DaLiveServiceCard — the namespace picker and the token form.
 *
 * The sibling suite renders the card against REAL Spectrum and covers the
 * card's outer states. This one is about the decisions inside the input form,
 * which a focused mutation run (PL-22, MUT-07) found almost entirely
 * unconstrained: the option list and its order, which namespace is selected by
 * default, the effect that repairs the selection when the GitHub user arrives
 * late, the submit gate, and the trimming done on the way out. Nothing had ever
 * submitted the form at all — `handleSubmit` was uncovered.
 *
 * Spectrum is stubbed here rather than driven, because every assertion below is
 * about what the component computed and handed to the Picker, not about how
 * Spectrum renders a listbox. The stub keeps the two things that matter: the
 * `items` array in order, and the `children` render function that maps each one
 * to an `Item` — so a mutant that empties either is visible.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@adobe/react-spectrum', () => {
    const ReactModule = jest.requireActual('react');
    return {
        Flex: ({ children }: any) => ReactModule.createElement('div', null, children),
        Text: ({ children, UNSAFE_className }: any) =>
            ReactModule.createElement('span', { className: UNSAFE_className }, children),
        ProgressCircle: ({ 'aria-label': label }: any) =>
            ReactModule.createElement('div', { 'aria-label': label }),
        Item: ({ children }: any) => ReactModule.createElement(ReactModule.Fragment, null, children),
        // Faithful in the two respects the component is being tested on: the
        // order of `items`, and that each one goes through `children(item)`.
        // No fallback if that call returns nothing — a mutant that empties the
        // render function has to show up as a missing label, not be papered over.
        Picker: ({ label, items, children, selectedKey, onSelectionChange, isDisabled }: any) =>
            ReactModule.createElement(
                'select',
                {
                    'aria-label': label,
                    disabled: isDisabled,
                    value: selectedKey,
                    // Surfaced as an attribute because a <select> in jsdom falls back
                    // to its first option when the value it is given matches none of
                    // them — so reading the element's value cannot tell "selected the
                    // first org" from "selected nothing". This reads back exactly what
                    // the component passed.
                    'data-selected-key': String(selectedKey),
                    onChange: (e: { target: { value: string } }) => onSelectionChange(e.target.value),
                },
                [...items].map((item: any, index: number) => {
                    const rendered = children(item);
                    return ReactModule.createElement(
                        'option',
                        { key: index, value: String(rendered?.key) },
                        String(rendered?.props?.children),
                    );
                }),
            ),
    };
});

jest.mock('@spectrum-icons/workflow/Alert', () => ({
    __esModule: true,
    default: () => <span data-icon="alert" />,
}));
jest.mock('@spectrum-icons/workflow/CheckmarkCircle', () => ({
    __esModule: true,
    default: () => <span data-icon="check" />,
}));

// Below the mocks on purpose: babel-plugin-jest-hoist lifts them above the
// imports of THIS file only, so the component must bind after they exist.
import {
    DaLiveServiceCard,
    type DaLiveServiceCardProps,
} from '@/features/eds/ui/components/DaLiveServiceCard';

const onSubmit = jest.fn();
const noop = () => undefined;

function renderCard(overrides: Partial<DaLiveServiceCardProps> = {}) {
    return render(
        <DaLiveServiceCard
            isChecking={false}
            isAuthenticating={false}
            isAuthenticated={false}
            showInput={true}
            onSetup={noop}
            onSubmit={onSubmit}
            onReset={noop}
            onCancelInput={noop}
            {...overrides}
        />,
    );
}

const picker = () => screen.getByRole('combobox', { name: /github namespace/i });
const optionLabels = () =>
    within(picker())
        .getAllByRole('option')
        .map((o) => o.textContent);
const selectedKey = () => picker().getAttribute('data-selected-key');
const tokenField = () => screen.getByPlaceholderText('Token');
const verifyButton = () => screen.getByRole('button', { name: 'Verify' });

const typeToken = (value: string) => fireEvent.change(tokenField(), { target: { value } });

describe('DaLiveServiceCard — namespace options', () => {
    beforeEach(() => jest.clearAllMocks());

    it('lists the personal account first, then the orgs alphabetically', () => {
        renderCard({ githubUser: 'leah', availableOrgs: ['zeta', 'alpha'] });

        expect(optionLabels()).toEqual(['leah (Personal account)', 'alpha', 'zeta']);
    });

    it('offers only the orgs when there is no GitHub user', () => {
        renderCard({ availableOrgs: ['acme'] });

        expect(optionLabels()).toEqual(['acme']);
    });

    it('offers only the personal account when the user belongs to no orgs', () => {
        // The default for availableOrgs is a shared empty array; anything in it
        // would show up as a namespace the user cannot actually write to.
        renderCard({ githubUser: 'leah' });

        expect(optionLabels()).toEqual(['leah (Personal account)']);
    });

    it('selects the personal account by default', () => {
        renderCard({ githubUser: 'leah', availableOrgs: ['acme'] });

        expect(selectedKey()).toBe('leah');
    });

    it('falls back to the first org when there is no GitHub user', () => {
        renderCard({ availableOrgs: ['acme', 'beta'] });

        expect(selectedKey()).toBe('acme');
    });

    it('adopts the personal account when the GitHub user arrives after mount', () => {
        // OAuth normally completes while this card is already on screen, so the
        // first render has no user and the selection starts empty.
        const { rerender } = renderCard({});
        expect(within(picker()).queryAllByRole('option')).toHaveLength(0);

        rerender(
            <DaLiveServiceCard
                isChecking={false}
                isAuthenticating={false}
                isAuthenticated={false}
                showInput={true}
                githubUser="leah"
                onSetup={noop}
                onSubmit={onSubmit}
                onReset={noop}
                onCancelInput={noop}
            />,
        );

        expect(optionLabels()).toEqual(['leah (Personal account)']);
        expect(selectedKey()).toBe('leah');
    });

    it('leaves an explicit pick alone when the effect re-runs', () => {
        // The repair effect fires again on every selection change. It must not
        // pull the user back to the personal account once they have chosen an org.
        renderCard({ githubUser: 'leah', availableOrgs: ['acme'] });

        fireEvent.change(picker(), { target: { value: 'acme' } });

        expect(selectedKey()).toBe('acme');
    });

    it('disables the picker when there is no namespace to choose', () => {
        renderCard({});

        expect(picker()).toBeDisabled();
    });

    it('enables the picker as soon as one namespace exists', () => {
        renderCard({ githubUser: 'leah' });

        expect(picker()).toBeEnabled();
    });
});

describe('DaLiveServiceCard — the submit gate', () => {
    beforeEach(() => jest.clearAllMocks());

    it('stays disabled with a namespace but no token', () => {
        renderCard({ githubUser: 'leah' });

        expect(verifyButton()).toBeDisabled();
    });

    it('stays disabled with a token but no namespace', () => {
        renderCard({});

        typeToken('a-token');

        expect(verifyButton()).toBeDisabled();
    });

    it('stays disabled when the token is only whitespace', () => {
        renderCard({ githubUser: 'leah' });

        typeToken('   ');

        expect(verifyButton()).toBeDisabled();
    });

    it('stays disabled when the namespace is only whitespace', () => {
        renderCard({ githubUser: '   ' });

        typeToken('a-token');

        expect(verifyButton()).toBeDisabled();
    });

    it('enables once both are present', () => {
        renderCard({ githubUser: 'leah' });

        typeToken('a-token');

        expect(verifyButton()).toBeEnabled();
    });

    it('hands the trimmed token to onSubmit and clears the field', () => {
        // A pasted DA.live token routinely carries a trailing newline.
        renderCard({ githubUser: 'leah' });
        typeToken('  eyJ.token  \n');

        fireEvent.click(verifyButton());

        expect(onSubmit).toHaveBeenCalledWith('leah', 'eyJ.token');
        expect(tokenField()).toHaveValue('');
    });

    it('trims the namespace too — it becomes a repo owner and a DA.live path', () => {
        renderCard({ githubUser: ' leah ' });
        typeToken('eyJ.token');

        fireEvent.click(verifyButton());

        expect(onSubmit).toHaveBeenCalledWith('leah', 'eyJ.token');
    });
});

describe('DaLiveServiceCard — the form’s own error and links', () => {
    beforeEach(() => jest.clearAllMocks());

    it('renders the error in the error style, not as bare text', () => {
        const { container } = renderCard({ githubUser: 'leah', error: 'Invalid token' });

        expect(container.querySelector('.status-text-error')).toHaveTextContent('Invalid token');
    });

    it.each([
        ['Bookmarklet Setup', 'onOpenBookmarkletSetup'],
        ['Open DA.live', 'onOpenDaLive'],
    ] as const)('shows %s only when its handler is supplied', (name, prop) => {
        const handler = jest.fn();

        const { unmount } = renderCard({ githubUser: 'leah', [prop]: handler });
        fireEvent.click(screen.getByRole('button', { name }));
        expect(handler).toHaveBeenCalledTimes(1);
        unmount();

        renderCard({ githubUser: 'leah' });
        expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    });
});
