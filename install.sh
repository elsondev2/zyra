#!/usr/bin/env bash
set -euo pipefail

REPO="justelson/zyra"
VERSION="latest"
INSTALL_DIR="${HOME}/.local/share/zyra"
BIN_DIR="${HOME}/.local/bin"
SOURCE_DIRECTORY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    --version) VERSION="${2#v}"; shift 2 ;;
    --install-dir) INSTALL_DIR="$2"; shift 2 ;;
    --bin-dir) BIN_DIR="$2"; shift 2 ;;
    --source-dir) SOURCE_DIRECTORY="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

OS="$(uname -s)"
ARCH="$(uname -m)"
case "${OS}:${ARCH}" in
  Darwin:arm64) TARGET="macos-arm64" ;;
  Darwin:x86_64) TARGET="macos-x64" ;;
  Linux:x86_64|Linux:amd64) TARGET="linux-x64" ;;
  *) echo "Zyra does not yet provide a TUI binary for ${OS} ${ARCH}." >&2; exit 1 ;;
esac

if [[ "$VERSION" == "latest" ]]; then
  if [[ -n "$SOURCE_DIRECTORY" ]]; then
    candidate="$(find "$SOURCE_DIRECTORY" -maxdepth 1 -type f -name "Zyra-TUI-*-${TARGET}" -print -quit)"
    [[ -n "$candidate" ]] || { echo "Could not infer a Zyra version from $SOURCE_DIRECTORY." >&2; exit 1; }
    name="$(basename "$candidate")"
    VERSION="${name#Zyra-TUI-}"
    VERSION="${VERSION%-${TARGET}}"
  else
    release_json="$(curl --fail --silent --show-error -L -H 'User-Agent: Zyra-Installer' "https://api.github.com/repos/${REPO}/releases/latest")"
    tag="$(printf '%s\n' "$release_json" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
    [[ -n "$tag" ]] || { echo "GitHub did not return a latest Zyra release." >&2; exit 1; }
    VERSION="${tag#v}"
  fi
fi

[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-(alpha|beta)([.-]?[0-9]+)?)?$ ]] || {
  echo "Invalid Zyra release version: $VERSION" >&2
  exit 1
}

ASSET="Zyra-TUI-${VERSION}-${TARGET}"
TEMP_DIRECTORY="$(mktemp -d "${TMPDIR:-/tmp}/zyra-install.XXXXXX")"
trap 'rm -rf -- "$TEMP_DIRECTORY"' EXIT

download_file() {
  local name="$1"
  local output="$2"
  if [[ -n "$SOURCE_DIRECTORY" ]]; then
    [[ -f "$SOURCE_DIRECTORY/$name" ]] || { echo "Missing local release file: $SOURCE_DIRECTORY/$name" >&2; exit 1; }
    cp "$SOURCE_DIRECTORY/$name" "$output"
  else
    curl --fail --silent --show-error -L -H 'User-Agent: Zyra-Installer' \
      "https://github.com/${REPO}/releases/download/v${VERSION}/${name}" -o "$output"
  fi
}

echo "Downloading Zyra ${VERSION} for ${TARGET}..."
download_file "$ASSET" "$TEMP_DIRECTORY/$ASSET"
download_file "SHA256SUMS" "$TEMP_DIRECTORY/SHA256SUMS"
EXPECTED="$(awk -v name="$ASSET" '$2 == name { print $1; exit }' "$TEMP_DIRECTORY/SHA256SUMS")"
[[ -n "$EXPECTED" ]] || { echo "SHA256SUMS does not contain $ASSET." >&2; exit 1; }
if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL="$(sha256sum "$TEMP_DIRECTORY/$ASSET" | awk '{print $1}')"
else
  ACTUAL="$(shasum -a 256 "$TEMP_DIRECTORY/$ASSET" | awk '{print $1}')"
fi
[[ "$ACTUAL" == "$EXPECTED" ]] || { echo "Zyra download failed SHA-256 verification." >&2; exit 1; }

VERSION_DIRECTORY="$INSTALL_DIR/$VERSION"
mkdir -p "$VERSION_DIRECTORY" "$BIN_DIR"
install -m 755 "$TEMP_DIRECTORY/$ASSET" "$VERSION_DIRECTORY/zyra"
ln -sfn "$VERSION_DIRECTORY/zyra" "$BIN_DIR/zyra"

echo "Checking the installed binary..."
"$VERSION_DIRECTORY/zyra" --version
echo
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo "Zyra ${VERSION} is installed. Add $BIN_DIR to PATH, then run: zyra"
else
  echo "Zyra ${VERSION} is installed. Run: zyra"
fi
