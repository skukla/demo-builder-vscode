/**
 * FormField — the props each field TYPE hands to Spectrum, and the defaults behind them.
 *
 * The sibling suite renders real Spectrum and proves each type appears. This one
 * asks the other question: WHAT does FormField pass down? That is where the
 * component actually differs from a bare Spectrum field — the blur handler only a
 * `url` field gets, the description that falls back to the placeholder, the props
 * spread in from `selectableDefaultProps`, the label that grows a help button when
 * there is help, the value a `select` reports when the SC picks something, and the
 * two defaults (not required, no error shown) that decide what an untouched form
 * looks like.
 *
 * Spectrum is mocked as recording `jest.fn()` components, so each of those is read
 * as an ARGUMENT rather than inferred from rendered markup — a mock cannot see a
 * malformed call, and every mutant surviving here was a prop nobody looked at.
 */

import React from 'react';
import { Item, Picker, TextField } from '@adobe/react-spectrum';
import { FieldHelpButton } from '@/core/ui/components/forms/FieldHelpButton';
import { FormField, type FormFieldProps } from '@/core/ui/components/forms/FormField';
import { renderWithProviders } from '../../../../helpers/react-test-utils';

jest.mock('@adobe/react-spectrum', () => ({
    Provider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    defaultTheme: {},
    // Renders its LABEL so the help button in the composed label mounts; everything
    // else about the field is read from the recorded props, not from markup.
    TextField: jest.fn(({ label }: { label?: React.ReactNode }) => <div>{label}</div>),
    Picker: jest.fn(() => null),
    Item: jest.fn(() => null),
    Flex: jest.fn(({ children }: { children?: React.ReactNode }) => <>{children}</>),
    Text: jest.fn(({ children }: { children?: React.ReactNode }) => <>{children}</>),
}));

jest.mock('@/core/ui/components/forms/FieldHelpButton', () => ({
    FieldHelpButton: jest.fn(() => null),
}));

const textField = TextField as unknown as jest.Mock;
const picker = Picker as unknown as jest.Mock;
const item = Item as unknown as jest.Mock;
const helpButton = FieldHelpButton as unknown as jest.Mock;

/** The props of the LAST render — what the field is showing now. */
function lastProps(mock: jest.Mock): Record<string, unknown> {
    return mock.mock.calls[mock.mock.calls.length - 1][0] as Record<string, unknown>;
}

const OPTIONS = [
    { value: 'option1', label: 'Option One' },
    { value: 'option2', label: 'Option Two' },
];

function field(overrides: Partial<FormFieldProps> = {}): React.ReactElement {
    const props: FormFieldProps = {
        fieldKey: 'commerce-url',
        label: 'Commerce URL',
        type: 'text',
        value: '',
        onChange: jest.fn(),
        ...overrides,
    };
    return <FormField {...props} />;
}

describe('FormField defaults', () => {
    beforeEach(() => jest.clearAllMocks());

    it('leaves a field optional, unerrored and unmarked when only the basics are given', () => {
        renderWithProviders(field({ error: 'Invalid URL' }));

        const props = lastProps(textField);
        expect(props.isRequired).toBe(false);
        // An error the SC has not earned yet: present in the props, shown by nothing.
        expect(props.validationState).toBeUndefined();
        expect(props.errorMessage).toBeUndefined();
    });

    it('marks the field required and shows the error once asked to', () => {
        renderWithProviders(field({ required: true, error: 'Invalid URL', showError: true }));

        const props = lastProps(textField);
        expect(props.isRequired).toBe(true);
        expect(props.validationState).toBe('invalid');
        expect(props.errorMessage).toBe('Invalid URL');
    });

    it('calls the CURRENT onChange after the handler prop is replaced', () => {
        const first = jest.fn();
        const second = jest.fn();
        const { rerender } = renderWithProviders(field({ onChange: first }));

        rerender(field({ onChange: second }));
        (lastProps(textField).onChange as (v: string) => void)('typed');

        // A stale dependency list would keep the handler this field was mounted
        // with, and the SC's edits would land in the previous screen's state.
        expect(second).toHaveBeenCalledWith('typed');
        expect(first).not.toHaveBeenCalled();
    });
});

describe('FormField label', () => {
    beforeEach(() => jest.clearAllMocks());

    it('grows a help button beside the label when the field has help', () => {
        const help = { title: 'About this', text: 'Some guidance.' };
        renderWithProviders(field({ help, baseUri: 'vscode-webview://test' }));

        expect(helpButton).toHaveBeenCalledWith(
            expect.objectContaining({
                help,
                // Modal unless the caller asks for a popover.
                variant: 'modal',
                fieldLabel: 'Commerce URL',
                baseUri: 'vscode-webview://test',
            }),
            expect.anything()
        );
    });

    it('honours an explicit help variant', () => {
        renderWithProviders(field({ help: { title: 'T', text: 'x' }, helpVariant: 'popover' }));

        expect(helpButton).toHaveBeenCalledWith(
            expect.objectContaining({ variant: 'popover' }),
            expect.anything()
        );
    });

    it('passes the plain label through when there is no help', () => {
        renderWithProviders(field());

        expect(helpButton).not.toHaveBeenCalled();
        expect(lastProps(textField).label).toBe('Commerce URL');
    });
});

describe('FormField by type', () => {
    beforeEach(() => jest.clearAllMocks());

    it('renders a number field through the same text input', () => {
        renderWithProviders(field({ type: 'number', value: '42' }));

        expect(textField).toHaveBeenCalledTimes(1);
        expect(lastProps(textField).value).toBe('42');
    });

    it('renders nothing at all for a type it does not handle', () => {
        const { container } = renderWithProviders(
            field({ type: 'checkbox' as unknown as FormFieldProps['type'] })
        );

        expect(container).toBeEmptyDOMElement();
        expect(textField).not.toHaveBeenCalled();
        expect(picker).not.toHaveBeenCalled();
    });

    it('gives a url field its blur handler — that is where normalisation happens', () => {
        const onBlur = jest.fn();
        renderWithProviders(field({ type: 'url', onBlur }));

        expect(lastProps(textField).onBlur).toBe(onBlur);
    });

    it('withholds the blur handler from a plain text field that was given one', () => {
        renderWithProviders(field({ type: 'text', onBlur: jest.fn() }));

        expect(lastProps(textField).onBlur).toBeUndefined();
    });

    it('withholds it from a url field that was given none', () => {
        renderWithProviders(field({ type: 'url' }));

        expect(lastProps(textField).onBlur).toBeUndefined();
    });

    it('spreads selectableDefaultProps onto a text field', () => {
        renderWithProviders(field({ selectableDefaultProps: { autoFocus: true } }));

        expect(lastProps(textField).autoFocus).toBe(true);
    });
});

describe('FormField password', () => {
    beforeEach(() => jest.clearAllMocks());

    function password(overrides: Partial<FormFieldProps> = {}): React.ReactElement {
        return field({ type: 'password', label: 'API Key', ...overrides });
    }

    it('obscures the value and shows the placeholder when there is no description', () => {
        renderWithProviders(password({ placeholder: 'starts with sk-' }));

        const props = lastProps(textField);
        expect(props.type).toBe('password');
        expect(props.description).toBe('starts with sk-');
    });

    it('prefers the description over the placeholder when both are given', () => {
        renderWithProviders(
            password({ placeholder: 'starts with sk-', description: 'From the Commerce admin' })
        );

        expect(lastProps(textField).description).toBe('From the Commerce admin');
    });

    it('spreads selectableDefaultProps onto the password field too', () => {
        renderWithProviders(password({ selectableDefaultProps: { autoFocus: true } }));

        expect(lastProps(textField).autoFocus).toBe(true);
    });
});

describe('FormField select', () => {
    beforeEach(() => jest.clearAllMocks());

    function select(overrides: Partial<FormFieldProps> = {}): React.ReactElement {
        return field({ type: 'select', label: 'Environment', value: '', ...overrides });
    }

    it('offers one item per option, keyed by VALUE and labelled by LABEL', () => {
        renderWithProviders(select({ options: OPTIONS }));

        const children = lastProps(picker).children as Array<React.ReactElement<{ children: string }>>;
        expect(children.map((child) => [child.key, child.props.children])).toEqual([
            ['option1', 'Option One'],
            ['option2', 'Option Two'],
        ]);
        expect(children.every((child) => child.type === item)).toBe(true);
    });

    it('offers nothing when no options are given', () => {
        renderWithProviders(select());

        expect(lastProps(picker).children).toStrictEqual([]);
    });

    it("reports the chosen option's VALUE", () => {
        const onChange = jest.fn();
        renderWithProviders(select({ options: OPTIONS, onChange }));

        (lastProps(picker).onSelectionChange as (key: unknown) => void)('option2');

        expect(onChange).toHaveBeenCalledWith('option2');
    });

    it('reports an empty string when the selection is cleared', () => {
        const onChange = jest.fn();
        renderWithProviders(select({ options: OPTIONS, onChange }));

        (lastProps(picker).onSelectionChange as (key: unknown) => void)(null);

        expect(onChange).toHaveBeenCalledWith('');
    });
});
