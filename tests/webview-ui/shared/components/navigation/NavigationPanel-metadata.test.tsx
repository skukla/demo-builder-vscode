import React from 'react';
import { NavigationPanel } from '@/core/ui/components/navigation/NavigationPanel';

describe('NavigationPanel - Metadata', () => {
    describe('DisplayName', () => {
        it('has display name set', () => {
            expect(NavigationPanel.displayName).toBe('NavigationPanel');
        });
    });

    describe('Memoization', () => {
        it('is memoized component', () => {
            expect(NavigationPanel).toHaveProperty('$$typeof');
        });
    });
});
