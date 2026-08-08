const semanticScale = (cssVariable) => Object.fromEntries(
    [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
        .map((shade) => [shade, `rgb(var(${cssVariable}) / <alpha-value>)`])
)

/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
    theme: {
        extend: {
            colors: {
                // Legacy utilities are semantic so every catalog theme, including
                // Light, keeps readable text, hover fills, accents, and statuses.
                white: 'rgb(var(--theme-foreground-rgb) / <alpha-value>)',
                black: 'rgb(var(--theme-background-rgb) / <alpha-value>)',
                'media-white': 'rgb(255 255 255 / <alpha-value>)',
                'media-black': 'rgb(0 0 0 / <alpha-value>)',
                blue: semanticScale('--accent-primary-rgb'),
                cyan: semanticScale('--accent-primary-rgb'),
                sky: semanticScale('--accent-primary-rgb'),
                indigo: semanticScale('--accent-secondary-rgb'),
                violet: semanticScale('--accent-secondary-rgb'),
                purple: semanticScale('--accent-secondary-rgb'),
                pink: semanticScale('--accent-secondary-rgb'),
                emerald: semanticScale('--status-success-rgb'),
                green: semanticScale('--status-success-rgb'),
                lime: semanticScale('--status-success-rgb'),
                amber: semanticScale('--status-warning-rgb'),
                yellow: semanticScale('--status-warning-rgb'),
                orange: semanticScale('--status-warning-rgb'),
                red: semanticScale('--status-danger-rgb'),
                rose: semanticScale('--status-danger-rgb'),
                sparkle: {
                    bg: 'var(--color-bg)',
                    text: 'var(--color-text)',
                    'text-dark': 'var(--color-text-dark)',
                    'text-darker': 'var(--color-text-darker)',
                    'text-secondary': 'var(--color-text-secondary)',
                    'text-muted': 'var(--color-text-muted)',
                    card: 'var(--color-card)',
                    border: 'var(--color-border)',
                    'border-secondary': 'var(--color-border-secondary)',
                    primary: 'var(--color-primary)',
                    secondary: 'var(--color-secondary)',
                    accent: 'var(--color-accent)'
                }
            },
            fontFamily: {
                sans: ['var(--font-ui)', 'Hanken Grotesk Variable', 'Hanken Grotesk', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', 'Segoe UI', 'system-ui', 'sans-serif'],
                mono: ['var(--font-code)', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'Liberation Mono', 'monospace']
            },
            borderRadius: {
                // Even sharper corners as requested
                lg: '0.25rem',     // 4px (was 6px)
                xl: '0.5rem',      // 8px (was 10px)
                '2xl': '0.625rem', // 10px (was 12px)
                '3xl': '0.75rem'   // 12px (was 16px)
            }
        }
    },
    plugins: []
}
