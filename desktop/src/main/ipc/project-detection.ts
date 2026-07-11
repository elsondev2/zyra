export interface ProjectTypeDefinition {
    id: string
    displayName: string
    icon: string
    themeColor: string
    markers: string[]
    description: string
}

export interface FrameworkDefinition {
    id: string
    displayName: string
    icon: string
    themeColor: string
    parentType: string
    detectPatterns: {
        dependencies?: string[]
        devDependencies?: string[]
        files?: string[]
        configFiles?: string[]
    }
}

export const PROJECT_TYPES: ProjectTypeDefinition[] = [
    { id: 'node', displayName: 'Node.js', icon: 'nodedotjs', themeColor: '#339933', markers: ['package.json'], description: 'JavaScript/Node.js project' },
    { id: 'python', displayName: 'Python', icon: 'python', themeColor: '#3776AB', markers: ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'], description: 'Python project' },
    { id: 'rust', displayName: 'Rust', icon: 'rust', themeColor: '#DEA584', markers: ['Cargo.toml'], description: 'Rust project' },
    { id: 'go', displayName: 'Go', icon: 'go', themeColor: '#00ADD8', markers: ['go.mod'], description: 'Go/Golang project' },
    { id: 'java', displayName: 'Java', icon: 'openjdk', themeColor: '#007396', markers: ['pom.xml', 'build.gradle', 'build.gradle.kts'], description: 'Java project' },
    { id: 'dotnet', displayName: '.NET', icon: 'dotnet', themeColor: '#512BD4', markers: ['*.csproj', '*.sln', '*.fsproj'], description: '.NET/C# project' },
    { id: 'ruby', displayName: 'Ruby', icon: 'ruby', themeColor: '#CC342D', markers: ['Gemfile'], description: 'Ruby project' },
    { id: 'php', displayName: 'PHP', icon: 'php', themeColor: '#777BB4', markers: ['composer.json'], description: 'PHP project' },
    { id: 'dart', displayName: 'Dart/Flutter', icon: 'dart', themeColor: '#0175C2', markers: ['pubspec.yaml'], description: 'Dart or Flutter project' },
    { id: 'elixir', displayName: 'Elixir', icon: 'elixir', themeColor: '#4B275F', markers: ['mix.exs'], description: 'Elixir project' },
    { id: 'cpp', displayName: 'C/C++', icon: 'cplusplus', themeColor: '#00599C', markers: ['CMakeLists.txt', 'Makefile'], description: 'C or C++ project' },
    { id: 'git', displayName: 'Git Repository', icon: 'git', themeColor: '#F05032', markers: ['.git'], description: 'Version controlled folder' }
]

const FRAMEWORKS: FrameworkDefinition[] = [
    { id: 'react', displayName: 'React', icon: 'react', themeColor: '#61DAFB', parentType: 'node', detectPatterns: { dependencies: ['react', 'react-dom'] } },
    { id: 'nextjs', displayName: 'Next.js', icon: 'nextdotjs', themeColor: '#000000', parentType: 'node', detectPatterns: { dependencies: ['next'], configFiles: ['next.config.js', 'next.config.mjs', 'next.config.ts'] } },
    { id: 'vue', displayName: 'Vue.js', icon: 'vuedotjs', themeColor: '#4FC08D', parentType: 'node', detectPatterns: { dependencies: ['vue'] } },
    { id: 'angular', displayName: 'Angular', icon: 'angular', themeColor: '#DD0031', parentType: 'node', detectPatterns: { dependencies: ['@angular/core'], configFiles: ['angular.json'] } },
    { id: 'electron', displayName: 'Electron', icon: 'electron', themeColor: '#47848F', parentType: 'node', detectPatterns: { dependencies: ['electron'], devDependencies: ['electron', 'electron-builder', 'electron-vite'] } },
    { id: 'express', displayName: 'Express', icon: 'express', themeColor: '#000000', parentType: 'node', detectPatterns: { dependencies: ['express'] } },
    { id: 'vite', displayName: 'Vite', icon: 'vite', themeColor: '#646CFF', parentType: 'node', detectPatterns: { devDependencies: ['vite'], configFiles: ['vite.config.js', 'vite.config.ts'] } },
    { id: 'tailwind', displayName: 'Tailwind CSS', icon: 'tailwindcss', themeColor: '#06B6D4', parentType: 'node', detectPatterns: { devDependencies: ['tailwindcss'], configFiles: ['tailwind.config.js', 'tailwind.config.ts'] } },
    { id: 'typescript', displayName: 'TypeScript', icon: 'typescript', themeColor: '#3178C6', parentType: 'node', detectPatterns: { devDependencies: ['typescript'], configFiles: ['tsconfig.json'] } }
]

export const PROJECT_MARKERS = [
    'package.json',
    'Cargo.toml',
    'go.mod',
    'pom.xml',
    'build.gradle',
    'build.gradle.kts',
    'requirements.txt',
    'pyproject.toml',
    'setup.py',
    'Gemfile',
    'composer.json',
    '.git',
    '*.csproj',
    '*.sln',
    'CMakeLists.txt',
    'Makefile',
    'pubspec.yaml',
    'mix.exs',
    'deno.json',
    'bun.lockb',
    'settings.gradle',
    'settings.gradle.kts',
    'AndroidManifest.xml',
    '*.xcodeproj',
    '*.xcworkspace',
    'Podfile',
    'metro.config.js',
    'app.json',
    'ionic.config.json',
    'capacitor.config.json',
    'capacitor.config.ts',
    'electron.vite.config.ts',
    'electron-builder.yml',
    'electron-builder.json',
    'tauri.conf.json',
    'src-tauri',
    '*.pro',
    '*.qml',
    '*.xaml',
    '*.Designer.cs',
    'ContentView.swift'
]

export function detectProjectTypeFromMarkers(markers: string[]): ProjectTypeDefinition | undefined {
    for (const type of PROJECT_TYPES) {
        if (type.id === 'git') continue
        for (const marker of type.markers) {
            if (marker.startsWith('*')) {
                const ext = marker.slice(1)
                if (markers.some((item) => item.endsWith(ext))) return type
            } else if (markers.includes(marker)) {
                return type
            }
        }
    }
    if (markers.includes('.git')) return PROJECT_TYPES.find((type) => type.id === 'git')
    return undefined
}

export function detectFrameworksFromPackageJson(
    packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> },
    fileList: string[]
): FrameworkDefinition[] {
    const detected: FrameworkDefinition[] = []
    const deps = packageJson.dependencies || {}
    const devDeps = packageJson.devDependencies || {}

    for (const framework of FRAMEWORKS.filter((item) => item.parentType === 'node')) {
        const patterns = framework.detectPatterns
        let matched = false
        if (patterns.dependencies?.some((item) => item in deps)) matched = true
        if (patterns.devDependencies?.some((item) => item in devDeps)) matched = true
        if (patterns.configFiles?.some((item) => fileList.includes(item))) matched = true
        if (matched) detected.push(framework)
    }

    return detected
}

export function detectProjectType(markers: string[]): string {
    if (markers.includes('package.json')) return 'node'
    if (markers.includes('Cargo.toml')) return 'rust'
    if (markers.includes('go.mod')) return 'go'
    if (markers.includes('pom.xml') || markers.includes('build.gradle')) return 'java'
    if (markers.includes('requirements.txt') || markers.includes('pyproject.toml') || markers.includes('setup.py')) return 'python'
    if (markers.includes('Gemfile')) return 'ruby'
    if (markers.includes('composer.json')) return 'php'
    if (markers.some((marker) => marker.includes('.csproj') || marker.includes('.sln'))) return 'dotnet'
    if (markers.includes('pubspec.yaml')) return 'dart'
    if (markers.includes('mix.exs')) return 'elixir'
    if (markers.includes('.git')) return 'git'
    return 'unknown'
}
