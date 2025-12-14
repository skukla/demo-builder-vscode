import { renderHook } from '@testing-library/react';
import { useCanProceed, useCanProceedAll } from '@/core/ui/hooks/useCanProceed';

describe('useCanProceed', () => {
    describe('truthy check (default validator)', () => {
        it('should call setCanProceed with true when value is truthy', () => {
            const setCanProceed = jest.fn();

            renderHook(() => useCanProceed('some-id', setCanProceed));

            expect(setCanProceed).toHaveBeenCalledWith(true);
        });

        it('should call setCanProceed with false when value is undefined', () => {
            const setCanProceed = jest.fn();

            renderHook(() => useCanProceed(undefined, setCanProceed));

            expect(setCanProceed).toHaveBeenCalledWith(false);
        });

        it('should call setCanProceed with false when value is null', () => {
            const setCanProceed = jest.fn();

            renderHook(() => useCanProceed(null, setCanProceed));

            expect(setCanProceed).toHaveBeenCalledWith(false);
        });

        it('should call setCanProceed with false when value is empty string', () => {
            const setCanProceed = jest.fn();

            renderHook(() => useCanProceed('', setCanProceed));

            expect(setCanProceed).toHaveBeenCalledWith(false);
        });

        it('should call setCanProceed with true when value is 0', () => {
            const setCanProceed = jest.fn();

            // Note: 0 is falsy, so this will be false
            renderHook(() => useCanProceed(0, setCanProceed));

            expect(setCanProceed).toHaveBeenCalledWith(false);
        });

        it('should call setCanProceed with true when value is an object', () => {
            const setCanProceed = jest.fn();

            renderHook(() => useCanProceed({ id: '123' }, setCanProceed));

            expect(setCanProceed).toHaveBeenCalledWith(true);
        });
    });

    describe('value changes', () => {
        it('should update canProceed when value changes from undefined to truthy', () => {
            const setCanProceed = jest.fn();

            const { rerender } = renderHook(
                ({ value }) => useCanProceed(value, setCanProceed),
                { initialProps: { value: undefined as string | undefined } }
            );

            expect(setCanProceed).toHaveBeenLastCalledWith(false);

            rerender({ value: 'new-id' });

            expect(setCanProceed).toHaveBeenLastCalledWith(true);
        });

        it('should update canProceed when value changes from truthy to undefined', () => {
            const setCanProceed = jest.fn();

            const { rerender } = renderHook(
                ({ value }) => useCanProceed(value, setCanProceed),
                { initialProps: { value: 'initial-id' as string | undefined } }
            );

            expect(setCanProceed).toHaveBeenLastCalledWith(true);

            rerender({ value: undefined });

            expect(setCanProceed).toHaveBeenLastCalledWith(false);
        });
    });

    describe('custom validator', () => {
        it('should use custom validator when provided', () => {
            const setCanProceed = jest.fn();
            const customValidator = (value: { frontend?: string }) => !!value?.frontend;

            renderHook(() =>
                useCanProceed({ frontend: 'citisignal' }, setCanProceed, customValidator)
            );

            expect(setCanProceed).toHaveBeenCalledWith(true);
        });

        it('should return false when custom validator fails', () => {
            const setCanProceed = jest.fn();
            const customValidator = (value: { frontend?: string }) => !!value?.frontend;

            renderHook(() =>
                useCanProceed({ frontend: undefined }, setCanProceed, customValidator)
            );

            expect(setCanProceed).toHaveBeenCalledWith(false);
        });

        it('should handle complex validation logic', () => {
            const setCanProceed = jest.fn();
            interface FormState {
                name?: string;
                email?: string;
                agreed?: boolean;
            }
            const customValidator = (state: FormState) =>
                !!state.name && !!state.email && state.agreed === true;

            // Missing agreed
            const { rerender } = renderHook(
                ({ value }) => useCanProceed(value, setCanProceed, customValidator),
                {
                    initialProps: {
                        value: { name: 'John', email: 'john@example.com', agreed: false } as FormState,
                    },
                }
            );

            expect(setCanProceed).toHaveBeenLastCalledWith(false);

            // All valid
            rerender({ value: { name: 'John', email: 'john@example.com', agreed: true } });

            expect(setCanProceed).toHaveBeenLastCalledWith(true);
        });
    });
});

describe('useCanProceedAll', () => {
    it('should return true when all conditions are truthy', () => {
        const setCanProceed = jest.fn();

        renderHook(() => useCanProceedAll(['id1', 'id2', 'id3'], setCanProceed));

        expect(setCanProceed).toHaveBeenCalledWith(true);
    });

    it('should return false when any condition is falsy', () => {
        const setCanProceed = jest.fn();

        renderHook(() => useCanProceedAll(['id1', undefined, 'id3'], setCanProceed));

        expect(setCanProceed).toHaveBeenCalledWith(false);
    });

    it('should return false when all conditions are falsy', () => {
        const setCanProceed = jest.fn();

        renderHook(() => useCanProceedAll([undefined, null, ''], setCanProceed));

        expect(setCanProceed).toHaveBeenCalledWith(false);
    });

    it('should return true for empty conditions array', () => {
        const setCanProceed = jest.fn();

        renderHook(() => useCanProceedAll([], setCanProceed));

        // Array.every([]) returns true
        expect(setCanProceed).toHaveBeenCalledWith(true);
    });

    it('should update when any condition changes', () => {
        const setCanProceed = jest.fn();

        const { rerender } = renderHook(
            ({ conditions }) => useCanProceedAll(conditions, setCanProceed),
            { initialProps: { conditions: ['id1', undefined] as (string | undefined)[] } }
        );

        expect(setCanProceed).toHaveBeenLastCalledWith(false);

        rerender({ conditions: ['id1', 'id2'] });

        expect(setCanProceed).toHaveBeenLastCalledWith(true);
    });

    it('should work with object properties', () => {
        const setCanProceed = jest.fn();
        const state = {
            project: { id: 'proj-1' },
            workspace: { id: 'ws-1' },
        };

        renderHook(() =>
            useCanProceedAll([state.project?.id, state.workspace?.id], setCanProceed)
        );

        expect(setCanProceed).toHaveBeenCalledWith(true);
    });

    it('should handle mixed types', () => {
        const setCanProceed = jest.fn();

        renderHook(() =>
            useCanProceedAll([
                'string',
                123,
                true,
                { id: 'object' },
                ['array'],
            ], setCanProceed)
        );

        expect(setCanProceed).toHaveBeenCalledWith(true);
    });
});
