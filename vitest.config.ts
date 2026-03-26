import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        environment: 'jsdom',
        setupFiles: ['./tests/setup.ts'],
        include: ['tests/**/*.test.{ts,tsx}'],
        typecheck: {
            enabled: true,
            tsconfig: './tsconfig.test.json',
            include: ['tests/**/*.test.{ts,tsx}'],
        },
        testTimeout: 10000,
        coverage: {
            provider: 'v8',
            include: ['src/**'],
            exclude: [
                'src/assets/lib/**',
                'src/assets/welcome/**',
                'src/assets/recording/inject/**',
                'src/assets/recording/content/**',
            ],
            reporter: ['text', 'text-summary', 'html'],
            reportsDirectory: 'coverage',
        },
    },

    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
            '@utils': path.resolve(__dirname, 'src/utils'),
            '@context': path.resolve(__dirname, 'src/context'),
            '@hooks': path.resolve(__dirname, 'src/hooks'),
            '@components': path.resolve(__dirname, 'src/components'),
            '@assets': path.resolve(__dirname, 'src/assets'),
            '@styles': path.resolve(__dirname, 'src/assets/styles'),
        },
    },
});
