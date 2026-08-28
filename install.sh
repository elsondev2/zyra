#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

has_command() {
  command -v "$1" >/dev/null 2>&1
}

install_node() {
  echo "Node.js not found. Installing Node.js LTS..."

  if has_command brew; then
    brew install node
  elif has_command apt-get; then
    sudo apt-get update
    sudo apt-get install -y nodejs npm
  elif has_command dnf; then
    sudo dnf install -y nodejs npm
  elif has_command pacman; then
    sudo pacman -Sy --needed nodejs npm
  elif has_command zypper; then
    sudo zypper install -y nodejs npm
  else
    echo "No supported Node installer found."
    echo "Install Node LTS from https://nodejs.org, then rerun ./install.sh."
    exit 1
  fi
}

if ! has_command node; then
  install_node
fi

if ! has_command node; then
  echo "Node.js installed, but node is not visible in this shell yet."
  echo "Open a new terminal and rerun ./install.sh."
  exit 1
fi

node -e "const v=process.versions.node.split('.').map(Number); const ok=v[0]>22||(v[0]===22&&(v[1]>19||(v[1]===19&&v[2]>=0))); if(!ok){console.error('Zyra needs Node.js 22.19.0 or newer. Current Node is '+process.versions.node); process.exit(1)}"

echo "Installing Zyra dependencies..."
cd "$ROOT"
if has_command bun; then
  bun install
elif has_command npm; then
  echo "Bun not found. Falling back to npm."
  npm install
else
  echo "Bun/npm is missing. Install Bun for package-manager tasks, or npm as a fallback."
  exit 1
fi

COMMAND_DIR="$HOME/.local/bin"
COMMAND_PATH="$COMMAND_DIR/zyra"
PATH_ALREADY_CONFIGURED=false
if [[ ":$PATH:" == *":$COMMAND_DIR:"* ]]; then PATH_ALREADY_CONFIGURED=true; fi
DESKTOP_REGISTRATION="$HOME/.zyra/desktop-install-v1.json"
DESKTOP_EXE=""
if [[ -f "$DESKTOP_REGISTRATION" ]]; then
  DESKTOP_EXE="$(node -e 'try{const fs=require("fs"),path=require("path");const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const p=JSON.parse(fs.readFileSync(path.join(process.argv[2],"package.json"),"utf8"));const s=fs.lstatSync(v.executable);if(v.version===1&&v.appVersion===p.version&&v.platform===process.platform&&v.architecture===process.arch&&s.isFile()&&!s.isSymbolicLink())process.stdout.write(v.executable)}catch{}' "$DESKTOP_REGISTRATION" "$ROOT")"
  if [[ -n "$DESKTOP_EXE" && "$(uname -s)" == "Darwin" ]]; then
    codesign --verify --deep --strict "$DESKTOP_EXE" >/dev/null 2>&1 || DESKTOP_EXE=""
  fi
fi
mkdir -p "$COMMAND_DIR"
{
  echo '#!/usr/bin/env sh'
  echo '# zyra-managed-launcher:v1'
  if [[ -n "$DESKTOP_EXE" ]]; then
    printf 'if [ -x %q ]; then exec %q --tui "$@"; fi\n' "$DESKTOP_EXE" "$DESKTOP_EXE"
  fi
  printf 'exec node %q "$@"\n' "$ROOT/bin/zyra.mjs"
} > "$COMMAND_PATH"
chmod 755 "$COMMAND_PATH"

export PATH="$COMMAND_DIR:$PATH"
echo "Checking install..."
"$COMMAND_PATH" doctor

echo ""
echo "Zyra is installed."
if [[ "$PATH_ALREADY_CONFIGURED" != true ]]; then
  echo "Add $COMMAND_DIR to PATH, then run: zyra"
else
  echo "Open a new terminal and run: zyra"
fi
