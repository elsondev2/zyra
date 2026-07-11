export const GITIGNORE_TEMPLATES: Record<string, string> = {
    'Node.js': `# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Build outputs
dist/
build/
out/
.next/
.nuxt/
.cache/

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db`,

    'Python': `# Byte-compiled / optimized / DLL files
__pycache__/
*.py[cod]
*$py.class

# Virtual environments
venv/
env/
ENV/
.venv

# Distribution / packaging
dist/
build/
*.egg-info/

# IDE
.vscode/
.idea/
*.swp

# Environment
.env

# OS
.DS_Store
Thumbs.db`,

    'Rust': `# Build outputs
target/
Cargo.lock

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db`,

    'Go': `# Binaries
*.exe
*.exe~
*.dll
*.so
*.dylib

# Test binary
*.test

# Output
bin/
dist/

# Go workspace file
go.work

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db`,

    'Java': `# Compiled class files
*.class

# Package Files
*.jar
*.war
*.nar
*.ear
*.zip
*.tar.gz
*.rar

# Build outputs
target/
build/
out/

# IDE
.vscode/
.idea/
*.iml
*.swp

# OS
.DS_Store
Thumbs.db`,

    '.NET': `# Build outputs
bin/
obj/
out/

# User-specific files
*.suo
*.user
*.userosscache
*.sln.docstates

# IDE
.vscode/
.vs/
*.swp

# OS
.DS_Store
Thumbs.db`,

    'Ruby': `# Gems
*.gem
.bundle/
vendor/bundle/

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db`,

    'PHP': `# Composer
vendor/
composer.lock

# IDE
.vscode/
.idea/
*.swp

# Environment
.env

# OS
.DS_Store
Thumbs.db`,

    'C/C++': `# Compiled Object files
*.o
*.obj
*.exe
*.out
*.app

# Build directories
build/
cmake-build-*/

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db`,

    'Dart/Flutter': `# Build outputs
build/
.dart_tool/
.flutter-plugins
.flutter-plugins-dependencies
.packages

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db`,

    'Elixir': `# Build outputs
_build/
deps/
*.ez

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db`,

    'General': `# Build outputs
dist/
build/
out/

# Dependencies
node_modules/
vendor/

# Environment
.env
.env.local

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db
*.log`
}
