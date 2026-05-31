/**
 * DaLiveServiceCard - Shared Test Utilities
 *
 * Spectrum provider wrapper shared across the DaLiveServiceCard test suites.
 * Not a `*.test.tsx` file, so Jest does not run it directly.
 */

import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';

/** Test wrapper with Spectrum provider. */
export const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Provider theme={defaultTheme} colorScheme="light">
        {children}
    </Provider>
);
