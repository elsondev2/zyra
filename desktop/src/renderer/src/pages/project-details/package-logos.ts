export type PackageLogoSource = { label: string; color: string } & (
    { slug: string; url?: never; monochrome?: never }
    | { url: string; slug?: never; monochrome: true }
)

const react: PackageLogoSource = { label: 'React', slug: 'react', color: '#61DAFB' }
const typescript: PackageLogoSource = { label: 'TypeScript', slug: 'typescript', color: '#3178C6' }
const aws: PackageLogoSource = {
    label: 'AWS', color: '#FF9900', monochrome: true,
    // AWS is no longer in the live Simple Icons catalog. Keep the verified
    // archived artwork rather than requesting a slug that now returns 404.
    url: 'https://cdn.jsdelivr.net/npm/simple-icons@v13/icons/amazonwebservices.svg'
}
const knownPackages: Record<string, PackageLogoSource> = {
    react, 'react-dom': react, 'react-router': react, 'react-router-dom': react,
    typescript, vite: { label: 'Vite', slug: 'vite', color: '#9135FF' },
    'lucide-react': { label: 'Lucide', slug: 'lucide', color: '#F56565' },
    esbuild: { label: 'esbuild', slug: 'esbuild', color: '#FFCF00' },
    electron: { label: 'Electron', slug: 'electron', color: '#47848F' }
}
const families: Array<[string, PackageLogoSource]> = [
    ['@anthropic-ai/', { label: 'Anthropic', slug: 'anthropic', color: '#191919' }],
    ['@aws-sdk/', aws],
    ['@google/', { label: 'Google', slug: 'google', color: '#4285F4' }],
    ['@modelcontextprotocol/', { label: 'Model Context Protocol', slug: 'modelcontextprotocol', color: '#000000' }],
    ['@vitejs/', knownPackages.vite]
]

export function getPackageLogo(packageName: string): PackageLogoSource | null {
    const name = packageName.trim().toLowerCase()
    if (name.startsWith('@types/')) return Object.hasOwn(knownPackages, name.slice(7)) ? knownPackages[name.slice(7)] : typescript
    return Object.hasOwn(knownPackages, name) ? knownPackages[name]
        : families.find(([prefix]) => name.startsWith(prefix))?.[1] || null
}
