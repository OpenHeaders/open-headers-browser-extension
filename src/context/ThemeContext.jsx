import React, { createContext, useState, useEffect, useContext } from 'react';
import { ConfigProvider, theme } from 'antd';
import { storage } from '../utils/browser-api';

const ThemeContext = createContext({
    isDarkMode: false,
    themeMode: 'auto', // 'light', 'dark', 'auto'
    isCompactMode: false,
    toggleTheme: () => {},
    setThemeMode: () => {},
    toggleCompactMode: () => {}
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }) => {
    const [themeMode, setThemeMode] = useState('auto');
    const [systemPrefersDark, setSystemPrefersDark] = useState(false);
    const [isCompactMode, setIsCompactMode] = useState(false);

    // Determine if dark mode should be active
    const isDarkMode = themeMode === 'dark' || (themeMode === 'auto' && systemPrefersDark);

    // Load theme preference from storage
    useEffect(() => {
        storage.local.get(['themeMode', 'compactMode'], (result) => {
            if (result.themeMode) {
                setThemeMode(result.themeMode);
            }
            if (result.compactMode !== undefined) {
                setIsCompactMode(result.compactMode);
            }
        });
    }, []);

    // Detect system theme preference
    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        setSystemPrefersDark(mediaQuery.matches);

        const handleChange = (e) => {
            setSystemPrefersDark(e.matches);
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    // Toggle between light and dark (manual override)
    const toggleTheme = () => {
        const newMode = isDarkMode ? 'light' : 'dark';
        setThemeMode(newMode);
        storage.local.set({ themeMode: newMode });
    };

    // Set theme mode (light, dark, auto)
    const handleSetThemeMode = (mode) => {
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
        const algorithms = [];
        
        // Add dark/light algorithm
        algorithms.push(isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm);
        
        // Add compact algorithm if enabled
        if (isCompactMode) {
            algorithms.push(theme.compactAlgorithm);
        }
        
        return algorithms.length === 1 ? algorithms[0] : algorithms;
    };

    // Ant Design theme configuration - Using only built-in algorithms
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