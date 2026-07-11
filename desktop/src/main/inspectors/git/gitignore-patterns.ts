import type { GitignorePattern } from './types'

export function getGitignoreTemplates(): string[] {
    return [
        'Node.js',
        'Python',
        'Rust',
        'Go',
        'Java',
        '.NET',
        'Ruby',
        'PHP',
        'C/C++',
        'Dart/Flutter',
        'Elixir',
        'General',
        'Custom'
    ]
}

export function getGitignorePatterns(): GitignorePattern[] {
    return [
        {
            id: 'node_modules',
            label: 'node_modules',
            description: 'Node.js dependencies',
            category: 'dependencies',
            patterns: ['node_modules/', 'npm-debug.log*', 'yarn-debug.log*', 'yarn-error.log*', 'pnpm-debug.log*']
        },
        {
            id: 'vendor',
            label: 'vendor',
            description: 'PHP/Ruby dependencies',
            category: 'dependencies',
            patterns: ['vendor/', 'composer.lock']
        },
        {
            id: 'python_venv',
            label: 'Python Virtual Env',
            description: 'Python virtual environments',
            category: 'dependencies',
            patterns: ['venv/', 'env/', 'ENV/', '.venv', '__pycache__/', '*.py[cod]', '*$py.class']
        },
        {
            id: 'rust_target',
            label: 'Rust target',
            description: 'Rust build directory',
            category: 'dependencies',
            patterns: ['target/', 'Cargo.lock']
        },
        {
            id: 'go_vendor',
            label: 'Go vendor',
            description: 'Go dependencies',
            category: 'dependencies',
            patterns: ['vendor/', 'go.work']
        },
        {
            id: 'dist',
            label: 'dist',
            description: 'Distribution/build output',
            category: 'build',
            patterns: ['dist/', 'build/', 'out/']
        },
        {
            id: 'next_build',
            label: 'Next.js build',
            description: 'Next.js build files',
            category: 'build',
            patterns: ['.next/', '.nuxt/', '.cache/']
        },
        {
            id: 'compiled',
            label: 'Compiled files',
            description: 'Compiled binaries and objects',
            category: 'build',
            patterns: ['*.exe', '*.dll', '*.so', '*.dylib', '*.o', '*.obj', '*.class', '*.jar', '*.war']
        },
        {
            id: 'dotnet_build',
            label: '.NET build',
            description: '.NET build outputs',
            category: 'build',
            patterns: ['bin/', 'obj/', '*.suo', '*.user']
        },
        {
            id: 'env_files',
            label: '.env files',
            description: 'Environment variables',
            category: 'environment',
            patterns: ['.env', '.env.local', '.env.*.local', '.env.development', '.env.production']
        },
        {
            id: 'secrets',
            label: 'Secrets',
            description: 'Secret keys and credentials',
            category: 'environment',
            patterns: ['*.key', '*.pem', '*.p12', 'secrets.json', 'credentials.json']
        },
        {
            id: 'config_local',
            label: 'Local configs',
            description: 'Local configuration files',
            category: 'environment',
            patterns: ['config.local.*', 'settings.local.*', '*.local.json']
        },
        {
            id: 'vscode',
            label: 'VS Code',
            description: 'Visual Studio Code settings',
            category: 'ide',
            patterns: ['.vscode/']
        },
        {
            id: 'idea',
            label: 'IntelliJ IDEA',
            description: 'JetBrains IDE settings',
            category: 'ide',
            patterns: ['.idea/', '*.iml', '*.iws', '*.ipr']
        },
        {
            id: 'vim',
            label: 'Vim',
            description: 'Vim swap files',
            category: 'ide',
            patterns: ['*.swp', '*.swo', '*~', '.*.swp']
        },
        {
            id: 'sublime',
            label: 'Sublime Text',
            description: 'Sublime Text settings',
            category: 'ide',
            patterns: ['*.sublime-project', '*.sublime-workspace']
        },
        {
            id: 'visual_studio',
            label: 'Visual Studio',
            description: 'Visual Studio files',
            category: 'ide',
            patterns: ['.vs/', '*.suo', '*.user', '*.userosscache', '*.sln.docstates']
        },
        {
            id: 'macos',
            label: 'macOS',
            description: 'macOS system files',
            category: 'os',
            patterns: ['.DS_Store', '.AppleDouble', '.LSOverride', '._*']
        },
        {
            id: 'windows',
            label: 'Windows',
            description: 'Windows system files',
            category: 'os',
            patterns: ['Thumbs.db', 'ehthumbs.db', 'Desktop.ini', '$RECYCLE.BIN/']
        },
        {
            id: 'linux',
            label: 'Linux',
            description: 'Linux system files',
            category: 'os',
            patterns: ['*~', '.directory', '.Trash-*']
        },
        {
            id: 'logs',
            label: 'Log files',
            description: 'Application logs',
            category: 'logs',
            patterns: ['*.log', 'logs/', 'log/', '*.log.*']
        },
        {
            id: 'npm_logs',
            label: 'npm logs',
            description: 'npm debug logs',
            category: 'logs',
            patterns: ['npm-debug.log*', 'yarn-debug.log*', 'yarn-error.log*', 'lerna-debug.log*']
        },
        {
            id: 'cache',
            label: 'Cache',
            description: 'Cache directories',
            category: 'cache',
            patterns: ['.cache/', 'cache/', '*.cache', '.parcel-cache/']
        },
        {
            id: 'temp',
            label: 'Temp files',
            description: 'Temporary files',
            category: 'cache',
            patterns: ['tmp/', 'temp/', '*.tmp', '*.temp']
        },
        {
            id: 'coverage',
            label: 'Coverage',
            description: 'Test coverage reports',
            category: 'testing',
            patterns: ['coverage/', '.nyc_output/', '*.lcov', 'htmlcov/']
        },
        {
            id: 'test_output',
            label: 'Test output',
            description: 'Test result files',
            category: 'testing',
            patterns: ['test-results/', 'junit.xml', '*.test', '*.spec.js.snap']
        }
    ]
}
