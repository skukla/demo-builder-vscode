/**
 * What the two OAuth boxes say, given what the shared service will actually do.
 *
 * The bug this closes: two empty required-looking inputs, under help text telling
 * the user to create a credential in the Developer Console, on a screen where the
 * service already had one. The user read the empty boxes as a broken auto-fill.
 *
 * The rules worth failing a build over:
 *
 * - **Served hides the inputs.** Not "shows them greyed" — hides, because an
 *   empty box IS the confusion.
 * - **Not-served always shows them.** A refused user's only way through is typing
 *   their own pair; hiding it behind a "nothing to enter" message would strand them.
 * - **Unknown shows them too.** "We could not check" must never render as a verdict.
 * - **An existing value opens the override.** Otherwise a user who already typed a
 *   credential sees it vanish behind a message saying nothing is needed.
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderFields } from './BrokeredCredentialFields.testUtils';

const SERVED = { served: true, verdict: 'configured, 200', httpStatus: 200 };
const REFUSED = { served: false, verdict: 'configured, 403 — ask an administrator', httpStatus: 403 };

const setupUser = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

describe('when the service serves a credential', () => {
    it('hides both inputs — the empty box IS the bug', () => {
        renderFields({ status: SERVED });

        expect(screen.queryByLabelText('OAuth client ID')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('OAuth client secret')).not.toBeInTheDocument();
    });

    it('says so in ONE muted help line, not a status banner', () => {
        // It first shipped as a coloured StatusCard with a bold statement and a
        // second descriptive line — on a form of label/control/help rows that read
        // as an alert about a problem rather than the absence of work.
        renderFields({ status: SERVED });

        expect(screen.queryByTestId('status-card')).not.toBeInTheDocument();
        expect(screen.getByText(/provided automatically/i)).toBeInTheDocument();
    });

    it('offers the override, and reveals BOTH fields when taken', async () => {
        const user = setupUser();
        renderFields({ status: SERVED });

        await user.click(screen.getByTestId('toggle-credential-override'));

        expect(screen.getByLabelText('OAuth client ID')).toBeInTheDocument();
        expect(screen.getByLabelText('OAuth client secret')).toBeInTheDocument();
    });

    it('the override is reversible', async () => {
        const user = setupUser();
        renderFields({ status: SERVED });

        await user.click(screen.getByTestId('toggle-credential-override'));
        await user.click(screen.getByTestId('toggle-credential-override'));

        expect(screen.queryByLabelText('OAuth client ID')).not.toBeInTheDocument();
    });

    it('turning the override OFF clears the pair, rather than hiding it', async () => {
        // `resolveAccs` prefers any present pair over the broker, so a merely
        // hidden stale credential keeps being sent — 401ing under a message that
        // says credentials are provided automatically.
        const user = setupUser();
        const { updateField } = renderFields({ status: SERVED });

        await user.click(screen.getByTestId('toggle-credential-override'));
        await user.type(screen.getByLabelText('OAuth client ID'), 'stale');
        await user.click(screen.getByTestId('toggle-credential-override'));

        expect(updateField).toHaveBeenCalledWith(
            expect.objectContaining({ key: 'ACCS_OAUTH_CLIENT_ID' }),
            '',
        );
        expect(updateField).toHaveBeenCalledWith(
            expect.objectContaining({ key: 'ACCS_OAUTH_CLIENT_SECRET' }),
            '',
        );
    });

    it('opens ALREADY overriding when a value is present', () => {
        // Without this, a user who typed their own credential returns to the step
        // and sees "nothing to enter" with their value nowhere on screen.
        const values: Record<string, string> = { ACCS_OAUTH_CLIENT_ID: 'mine' };
        renderFields({
            status: SERVED,
            getFieldValue: (field: any) => values[field.key],
        });

        expect(screen.getByLabelText('OAuth client ID')).toHaveValue('mine');
    });
});

describe('when the service will NOT serve this user', () => {
    it('shows both inputs — typing a pair is the only way through', () => {
        renderFields({ status: REFUSED });

        expect(screen.getByLabelText('OAuth client ID')).toBeInTheDocument();
        expect(screen.getByLabelText('OAuth client secret')).toBeInTheDocument();
    });

    it('names the remedy in the field’s own help text, not a banner', () => {
        renderFields({ status: REFUSED });

        expect(screen.queryByTestId('status-card')).not.toBeInTheDocument();
        expect(screen.getByText(/ask an administrator/i)).toBeInTheDocument();
    });
});

describe('when the probe has not answered', () => {
    it('shows the fields and says NOTHING while loading', () => {
        renderFields({ loading: true });

        expect(screen.getByLabelText('OAuth client ID')).toBeInTheDocument();
        expect(screen.queryByText(/provided automatically/i)).not.toBeInTheDocument();
    });

    it('shows the fields and says NOTHING when the probe failed', () => {
        // status undefined = "could not check". Rendering that as a verdict in
        // either direction would be inventing an answer we do not have.
        renderFields({ loading: false, status: undefined });

        expect(screen.getByLabelText('OAuth client ID')).toBeInTheDocument();
        expect(screen.queryByText(/provided automatically/i)).not.toBeInTheDocument();
    });
});

describe('degenerate catalog', () => {
    it('renders the id alone when the pair has no secret field', () => {
        renderFields({ status: REFUSED, secretField: undefined });

        expect(screen.getByLabelText('OAuth client ID')).toBeInTheDocument();
        expect(screen.queryByLabelText('OAuth client secret')).not.toBeInTheDocument();
    });
});
