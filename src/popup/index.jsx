import React from 'react';
import { createRoot } from 'react-dom/client';
import { App as AntApp } from 'antd';
import { ThemeProvider } from '../context/ThemeContext';
import App from './App';
import './styles/popup.less';

// Initialize React app
const container = document.getElementById('root');
const root = createRoot(container);

root.render(
    <ThemeProvider>
        <AntApp>
            <App />
        </AntApp>
    </ThemeProvider>
);