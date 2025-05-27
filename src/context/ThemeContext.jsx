import React, { createContext, useState, useEffect, useContext } from 'react';
import { ConfigProvider, theme } from 'antd';
import { storage } from '../utils/browser-api';

const ThemeContext = createContext({
    isDarkMode: false,
    themeMode: 'auto', // 'light', 'dark', 'auto'
    toggleTheme: () => {},
    setThemeMode: () => {}
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }) => {
    const [themeMode, setThemeMode] = useState('auto');
    const [systemPrefersDark, setSystemPrefersDark] = useState(false);

    // Determine if dark mode should be active
    const isDarkMode = themeMode === 'dark' || (themeMode === 'auto' && systemPrefersDark);

    // Load theme preference from storage
    useEffect(() => {
        storage.local.get(['themeMode'], (result) => {
            if (result.themeMode) {
                setThemeMode(result.themeMode);
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

    // Apply theme class to body
    useEffect(() => {
        if (isDarkMode) {
            document.body.classList.add('dark-theme');
            document.body.classList.remove('light-theme');
        } else {
            document.body.classList.add('light-theme');
            document.body.classList.remove('dark-theme');
        }
    }, [isDarkMode]);

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

    // Ant Design theme configuration - Enhanced for better dark mode
    const antTheme = {
        algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
            colorPrimary: '#1677ff',
            borderRadius: 6,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            ...(isDarkMode ? {
                colorBgContainer: '#1f1f1f',
                colorBgElevated: '#262626',
                colorBgLayout: '#141414',
                colorBorder: '#303030',
                colorBorderSecondary: '#303030',
                colorText: 'rgba(255, 255, 255, 0.85)',
                colorTextSecondary: 'rgba(255, 255, 255, 0.65)',
                colorTextTertiary: 'rgba(255, 255, 255, 0.45)',
                colorTextQuaternary: 'rgba(255, 255, 255, 0.25)',
                colorBgTextHover: 'rgba(255, 255, 255, 0.08)',
                colorBgTextActive: 'rgba(255, 255, 255, 0.15)',
                // Additional tokens for better dark mode support
                colorBgBase: '#141414',
                colorFillSecondary: 'rgba(255, 255, 255, 0.06)',
                colorFillTertiary: 'rgba(255, 255, 255, 0.04)',
                colorFillQuaternary: 'rgba(255, 255, 255, 0.02)',
                colorSplit: 'rgba(255, 255, 255, 0.06)',
            } : {})
        },
        components: isDarkMode ? {
            // Component-specific overrides for dark mode
            Collapse: {
                headerBg: '#1f1f1f',
                contentBg: '#141414',
                headerPadding: '10px 16px',
            },
            Input: {
                colorBgContainer: '#262626',
                colorBorder: '#303030',
                colorText: 'rgba(255, 255, 255, 0.85)',
                colorTextPlaceholder: 'rgba(255, 255, 255, 0.45)',
            },
            Select: {
                colorBgContainer: '#262626',
                colorBorder: '#303030',
                optionSelectedBg: '#303030',
                colorBgElevated: '#262626',
            },
            Table: {
                colorBgContainer: '#141414',
                headerBg: '#1f1f1f',
                rowHoverBg: '#262626',
                colorBorderSecondary: '#303030',
            },
            Tag: {
                defaultBg: '#262626',
                defaultColor: 'rgba(255, 255, 255, 0.85)',
            },
            Radio: {
                buttonSolidCheckedBg: '#1677ff',
                buttonBg: '#262626',
                buttonColor: 'rgba(255, 255, 255, 0.65)',
                buttonSolidCheckedColor: '#fff',
            },
            Button: {
                defaultBg: '#262626',
                defaultBorderColor: '#303030',
                defaultColor: 'rgba(255, 255, 255, 0.85)',
            },
            Alert: {
                colorInfoBg: 'rgba(22, 119, 255, 0.1)',
                colorInfoBorder: 'rgba(22, 119, 255, 0.3)',
                colorWarningBg: 'rgba(250, 173, 20, 0.1)',
                colorWarningBorder: 'rgba(250, 173, 20, 0.3)',
            },
            Typography: {
                colorText: 'rgba(255, 255, 255, 0.85)',
                colorTextHeading: 'rgba(255, 255, 255, 0.85)',
                colorTextSecondary: 'rgba(255, 255, 255, 0.65)',
                colorTextDescription: 'rgba(255, 255, 255, 0.45)',
            }
        } : {},
    };

    return (
        <ThemeContext.Provider value={{ isDarkMode, themeMode, toggleTheme, setThemeMode: handleSetThemeMode }}>
            <ConfigProvider theme={antTheme} componentSize="small">
                {children}
            </ConfigProvider>
        </ThemeContext.Provider>
    );
};