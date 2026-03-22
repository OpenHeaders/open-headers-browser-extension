import React, { createContext, useState, useEffect, useContext } from 'react';
import { ConfigProvider, theme } from 'antd';
import { storage } from '../utils/browser-api';

type ThemeMode = 'light' | 'dark' | 'auto';

interface ThemeContextValue {
    isDarkMode: boolean;
    themeMode: ThemeMode;
    isCompactMode: boolean;
    toggleTheme: () => void;
    setThemeMode: (mode: ThemeMode) => void;
    toggleCompactMode: () => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
    isDarkMode: false,
    themeMode: 'auto',
    isCompactMode: false,
    toggleTheme: () => {},
    setThemeMode: () => {},
    toggleCompactMode: () => {}
});

export const useTheme = (): ThemeContextValue => useContext(ThemeContext);

interface ThemeProviderProps {
    children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
    const [themeMode, setThemeMode] = useState<ThemeMode>('auto');
    const [systemPrefersDark, setSystemPrefersDark] = useState(false);
    const [isCompactMode, setIsCompactMode] = useState(false);

    // Determine if dark mode should be active
    const isDarkMode = themeMode === 'dark' || (themeMode === 'auto' && systemPrefersDark);

    // Load theme preference from storage
    useEffect(() => {
        storage.local.get(['themeMode', 'compactMode'], (result: Record<string, unknown>) => {
            if (result.themeMode) {
                setThemeMode(result.themeMode as ThemeMode);
            }
            if (result.compactMode !== undefined) {
                setIsCompactMode(result.compactMode as boolean);
            }
        });
    }, []);

    // Detect system theme preference
    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        setSystemPrefersDark(mediaQuery.matches);

        const handleChange = (e: MediaQueryListEvent) => {
            setSystemPrefersDark(e.matches);
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    // Toggle between light and dark (manual override)
    const toggleTheme = () => {
        const newMode: ThemeMode = isDarkMode ? 'light' : 'dark';
        setThemeMode(newMode);
        storage.local.set({ themeMode: newMode });
    };

    // Set theme mode (light, dark, auto)
    const handleSetThemeMode = (mode: ThemeMode) => {
        setThemeMode(mode);
        storage.local.set({ themeMode: mode });
    };

    // Toggle compact mode
    const toggleCompactMode = () => {
        const newCompactMode = !isCompactMode;
        setIsCompactMode(newCompactMode);
        storage.local.set({ compactMode: newCompactMode });
    };

    // Configure Ant Design theme algorithms
    const getThemeAlgorithms = () => {
        const algorithms: Array<typeof theme.darkAlgorithm> = [];

        algorithms.push(isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm);

        if (isCompactMode) {
            algorithms.push(theme.compactAlgorithm);
        }

        return algorithms.length === 1 ? algorithms[0] : algorithms;
    };

    const antTheme = {
        algorithm: getThemeAlgorithms(),
        token: {
            colorPrimary: '#1677ff',
            borderRadius: 6,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }
    };

    return (
        <ThemeContext.Provider value={{
            isDarkMode,
            themeMode,
            isCompactMode,
            toggleTheme,
            setThemeMode: handleSetThemeMode,
            toggleCompactMode
        }}>
            <ConfigProvider theme={antTheme}>
                {children}
            </ConfigProvider>
        </ThemeContext.Provider>
    );
};
