/**
 * Unit Tests: DaLiveServiceCard - Default Org Behavior
 *
 * Default-org pre-fill and async-arrival sync tests, split from
 * DaLiveServiceCard.test.tsx to stay under the max-lines limit. Shared Spectrum
 * wrapper is imported from DaLiveServiceCard.testUtils.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TestWrapper } from './DaLiveServiceCard.testUtils';

describe('DaLiveServiceCard', () => {
    let mockOnSetup: jest.Mock;
    let mockOnSubmit: jest.Mock;
    let mockOnReset: jest.Mock;
    let mockOnCancelInput: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockOnSetup = jest.fn();
        mockOnSubmit = jest.fn();
        mockOnReset = jest.fn();
        mockOnCancelInput = jest.fn();
    });

    describe('Default Org Pre-fill', () => {
        it('should pre-fill org input with defaultOrg prop', async () => {
            // Given: defaultOrg is provided
            const { DaLiveServiceCard } = await import(
                '@/features/eds/ui/components/DaLiveServiceCard'
            );

            // When: Component renders with showInput and defaultOrg
            render(
                <TestWrapper>
                    <DaLiveServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={false}
                        showInput={true}
                        defaultOrg="config-org"
                        onSetup={mockOnSetup}
                        onSubmit={mockOnSubmit}
                        onReset={mockOnReset}
                        onCancelInput={mockOnCancelInput}
                    />
                </TestWrapper>
            );

            // Then: Org input should have the default value
            const orgInput = screen.getByPlaceholderText(/organization/i) as HTMLInputElement;
            expect(orgInput.value).toBe('config-org');
        });

        it('should have empty org input when no defaultOrg', async () => {
            // Given: No defaultOrg
            const { DaLiveServiceCard } = await import(
                '@/features/eds/ui/components/DaLiveServiceCard'
            );

            // When: Component renders with showInput
            render(
                <TestWrapper>
                    <DaLiveServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={false}
                        showInput={true}
                        onSetup={mockOnSetup}
                        onSubmit={mockOnSubmit}
                        onReset={mockOnReset}
                        onCancelInput={mockOnCancelInput}
                    />
                </TestWrapper>
            );

            // Then: Org input should be empty
            const orgInput = screen.getByPlaceholderText(/organization/i) as HTMLInputElement;
            expect(orgInput.value).toBe('');
        });
    });

    describe('Default Org Sync After Async Arrival', () => {
        it('should populate org input when defaultOrg arrives after initial render', async () => {
            // Given: Component renders with showInput=true but no defaultOrg yet (async delay)
            const { DaLiveServiceCard } = await import(
                '@/features/eds/ui/components/DaLiveServiceCard'
            );

            const { rerender } = render(
                <TestWrapper>
                    <DaLiveServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={false}
                        showInput={true}
                        onSetup={mockOnSetup}
                        onSubmit={mockOnSubmit}
                        onReset={mockOnReset}
                        onCancelInput={mockOnCancelInput}
                    />
                </TestWrapper>
            );

            // Org input starts empty
            const orgInput = screen.getByPlaceholderText(/organization/i) as HTMLInputElement;
            expect(orgInput.value).toBe('');

            // When: defaultOrg prop arrives (async backend response)
            rerender(
                <TestWrapper>
                    <DaLiveServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={false}
                        showInput={true}
                        defaultOrg="async-org"
                        onSetup={mockOnSetup}
                        onSubmit={mockOnSubmit}
                        onReset={mockOnReset}
                        onCancelInput={mockOnCancelInput}
                    />
                </TestWrapper>
            );

            // Then: Org input should be populated from the late-arriving prop
            expect(orgInput.value).toBe('async-org');
        });

        it('should preserve user-typed org when defaultOrg arrives later', async () => {
            // Given: Component renders without defaultOrg, user types their own value
            const { DaLiveServiceCard } = await import(
                '@/features/eds/ui/components/DaLiveServiceCard'
            );

            const { rerender } = render(
                <TestWrapper>
                    <DaLiveServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={false}
                        showInput={true}
                        onSetup={mockOnSetup}
                        onSubmit={mockOnSubmit}
                        onReset={mockOnReset}
                        onCancelInput={mockOnCancelInput}
                    />
                </TestWrapper>
            );

            // User types their own org
            const orgInput = screen.getByPlaceholderText(/organization/i) as HTMLInputElement;
            fireEvent.change(orgInput, { target: { value: 'user-typed-org' } });
            expect(orgInput.value).toBe('user-typed-org');

            // When: defaultOrg prop arrives later
            rerender(
                <TestWrapper>
                    <DaLiveServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={false}
                        showInput={true}
                        defaultOrg="config-org"
                        onSetup={mockOnSetup}
                        onSubmit={mockOnSubmit}
                        onReset={mockOnReset}
                        onCancelInput={mockOnCancelInput}
                    />
                </TestWrapper>
            );

            // Then: User's typed value should be preserved (not overwritten)
            expect(orgInput.value).toBe('user-typed-org');
        });

        it('should keep org value after submit and re-show of input form', async () => {
            // Given: Component with defaultOrg, user submits, then form is re-shown
            const { DaLiveServiceCard } = await import(
                '@/features/eds/ui/components/DaLiveServiceCard'
            );

            const { rerender } = render(
                <TestWrapper>
                    <DaLiveServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={false}
                        showInput={true}
                        defaultOrg="my-org"
                        onSetup={mockOnSetup}
                        onSubmit={mockOnSubmit}
                        onReset={mockOnReset}
                        onCancelInput={mockOnCancelInput}
                    />
                </TestWrapper>
            );

            // Fill in token and submit
            const tokenInput = screen.getByPlaceholderText(/token/i) as HTMLInputElement;
            fireEvent.change(tokenInput, { target: { value: 'my-token' } });
            fireEvent.click(screen.getByRole('button', { name: /verify/i }));

            // Simulate: hide form then re-show (user clicks "Change")
            rerender(
                <TestWrapper>
                    <DaLiveServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={false}
                        showInput={false}
                        defaultOrg="my-org"
                        onSetup={mockOnSetup}
                        onSubmit={mockOnSubmit}
                        onReset={mockOnReset}
                        onCancelInput={mockOnCancelInput}
                    />
                </TestWrapper>
            );

            rerender(
                <TestWrapper>
                    <DaLiveServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={false}
                        showInput={true}
                        defaultOrg="my-org"
                        onSetup={mockOnSetup}
                        onSubmit={mockOnSubmit}
                        onReset={mockOnReset}
                        onCancelInput={mockOnCancelInput}
                    />
                </TestWrapper>
            );

            // Then: Org input should be re-populated from defaultOrg (not empty)
            const orgInputAfter = screen.getByPlaceholderText(/organization/i) as HTMLInputElement;
            expect(orgInputAfter.value).toBe('my-org');
        });
    });
});
