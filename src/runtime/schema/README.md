# Worker schema dependency

Owned Node chat workers preload the exact installed root TypeBox dependency from a compiled module graph. This reduces hundreds of small file reads on chat startup. The public APIs and shared internal registries remain those of TypeBox; custom extension dependency versions are not redirected.

Regenerate with `node scripts/build-runtime-schema.mjs`. Verify with `node scripts/build-runtime-schema.mjs --check`. The owned runtime build also regenerates this dependency. The manifest pins the installed package version, and the package license is retained beside the generated modules.

Standalone bundled executables already bundle their dependencies and use their existing startup path. Source SDK users retain the normal dependency path unless they explicitly preload this module.
