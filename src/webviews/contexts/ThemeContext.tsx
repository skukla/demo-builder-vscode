import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Theme = 'light' | 'dark';

interface ThemeContextValue {
    /** Current theme */
    theme: Theme;
    /** Toggle between light and dark themes */
    toggleTheme: () => void;
    /** Set a specific theme */
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export interface ThemeProviderProps {
    children: ReactNode;
    /** Initial theme (default: auto-detect from VS Code) */
    initialTheme?: Theme;
}

/**
 * Context Provider: Theme
 *
 * Manages application theme (light/dark mode).
 * Auto-detects theme from VS Code by default.
 *
 * @example
 * ```tsx
 * <ThemeProvider>
 *   <App />
 * </ThemeProvider>
 * ```
 */
export const ThemeProvider: React.FC<ThemeProviderProps> = ({
    children,
    initialTheme
}) => {
    const [theme, setThemeState] = useState<Theme>(() => {
        if (initialTheme) return initialTheme;

        // Auto-detect from VS Code theme
        const bodyClass = document.body.className;
        if (bodyClass.includes('vscode-dark')) return 'dark';
        if (bodyClass.includes('vscode-light')) return 'light';
        return 'dark'; // Default to dark
    });

    useEffect(() => {
        // Listen for VS Code theme changes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    const bodyClass = document.body.className;
                    const newTheme = bodyClass.includes('vscode-dark') ? 'dark' : 'light';
                    setThemeState(newTheme);
                }
            });
        });

        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['class']
        });

        return () => observer.disconnect();
    }, []);

    const toggleTheme = () => {
        setThemeState(prev => prev === 'light' ? 'dark' : 'light');
    };

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
    };

    const value: ThemeContextValue = {
        theme,
        toggleTheme,
        setTheme
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};

/**
 * Hook: useTheme
 *
 * Access the current theme and theme controls.
 * Must be used within a ThemeProvider.
 *
 * @example
 * ```tsx
 * const { theme, toggleTheme } = useTheme();
 *
 * return (
 *   <button onClick={toggleTheme}>
 *     {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
 *   </button>
 * );
 * ```
 */
export const useTheme = (): ThemeContextValue => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
