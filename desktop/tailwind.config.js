/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
    theme: {
        extend: {
            colors: {
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
                sans: ['Hanken Grotesk Variable', 'Hanken Grotesk', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', 'Segoe UI', 'system-ui', 'sans-serif']
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
