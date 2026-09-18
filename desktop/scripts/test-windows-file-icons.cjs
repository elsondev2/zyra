const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const { build } = require('../package.json')

// Exercise the actual builder hook, not a second copy of its association rules.
assert.equal(build.beforePack, 'scripts/release/windows-file-icons-before-pack.cjs',
    'Windows packaging must replace shared app-logo associations with per-extension Material icons')
const beforePack = require('./release/windows-file-icons-before-pack.cjs')
const config = structuredClone(build)
const packager = { config, projectDir: root }
beforePack({ electronPlatformName: 'win32', packager })
assert.deepEqual(config, build, 'the shared config must stay unchanged during multi-platform builds')
const expectedExtensions = build.fileAssociations.flatMap(item => item.ext)
assert.deepEqual(packager.fileAssociations.flatMap(item => item.ext), expectedExtensions)
assert.equal(new Set(packager.fileAssociations.map(item => item.name)).size, expectedExtensions.length,
    'each extension needs its own ProgID or Windows overwrites the icon for the entire group')
const manifest = require('../node_modules/material-icon-theme/dist/material-icons.json')
const assetManifest = require('../resources/file-icons/manifest.json')
for (const item of packager.fileAssociations) {
    const ext = item.ext[0]
    const definition = manifest.fileExtensions[ext] || manifest.file
    assert.equal(item.name, `Zyra.File.${ext}`)
    assert.equal(item.icon, `resources/file-icons/zyra-file-${definition}.ico`)
    assert.equal(item.role, 'Viewer')
    assert.deepEqual(assetManifest.associations.find(entry => entry.ext === ext), {
        ext, progId: item.name, icon: path.basename(item.icon)
    })
    const source = assetManifest.sources[path.basename(item.icon)]
    assert.equal(source.svg, path.basename(manifest.iconDefinitions[definition].iconPath))
    assert.equal(source.sha256, require('node:crypto').createHash('sha256')
        .update(fs.readFileSync(path.join(root, 'node_modules/material-icon-theme/icons', source.svg))).digest('hex'),
    'regenerate native icons when the installed theme artwork changes')
    const ico = fs.readFileSync(path.join(root, item.icon))
    assert.equal(ico.readUInt16LE(0), 0)
    assert.equal(ico.readUInt16LE(2), 1)
    const sizes = [16, 24, 32, 48, 64, 128, 256]
    assert.equal(ico.readUInt16LE(4), sizes.length)
    let end = 6 + sizes.length * 16
    sizes.forEach((size, index) => {
        const entry = 6 + index * 16
        assert.equal(ico[entry] || 256, size)
        assert.equal(ico[entry + 1] || 256, size)
        assert.equal(ico.readUInt16LE(entry + 6), 32)
        const length = ico.readUInt32LE(entry + 8)
        const offset = ico.readUInt32LE(entry + 12)
        assert.equal(offset, end)
        assert.equal(ico.subarray(offset, offset + 8).toString('hex'), '89504e470d0a1a0a')
        assert.equal(ico.readUInt32BE(offset + 16), size)
        assert.equal(ico.readUInt32BE(offset + 20), size)
        end += length
    })
    assert.equal(end, ico.length)
}
for (const platform of ['darwin', 'linux']) {
    const other = structuredClone(build)
    beforePack({ electronPlatformName: platform, packager: { config: other, projectDir: root } })
    assert.deepEqual(other, build, 'Windows icon registration must not change other platforms')
}
const firstPass = structuredClone(packager.fileAssociations)
beforePack({ electronPlatformName: 'win32', packager })
assert.deepEqual(packager.fileAssociations, firstPass, 'repeated packaging hooks are idempotent')
assert.throws(() => beforePack({ electronPlatformName: 'win32', packager: {
    config: structuredClone(build), projectDir: path.join(root, 'nonexistent-icon-fixture')
} }), /Missing Windows file icon/, 'missing icons must fail packaging, not silently fall back to the logo')
const generated = fs.readFileSync(path.join(root, 'build/windows-file-icons.nsh'), 'utf8')
assert.equal(generated, beforePack.windowsFileIconNsis(build.fileAssociations), 'generated extension icon registration stays in sync')
assert.match(generated, /ReadRegStr \$0 SHELL_CONTEXT/, 'uninstall checks icon ownership before removing a value')
assert.match(generated, /DeleteRegKey \/ifempty SHELL_CONTEXT/, 'uninstall preserves unrelated registry values')
const installer = fs.readFileSync(path.join(root, 'build/installer.nsh'), 'utf8')
assert.match(installer, /!insertmacro ZyraInstallFileIcons/)
assert.match(installer, /!insertmacro ZyraUninstallFileIcons/)
assert.match(installer, /!insertmacro ZyraLegacyFileIcon "Zyra Code and Text Preview" "document"/,
    'legacy default-app choices retain a text icon instead of the application logo')
assert.doesNotMatch(installer, /WriteRegStr[^\n]+"Position" "Top"/, 'Zyra belongs in the normal application menu section')
for (const scope of ['*', 'Directory', 'Directory\\Background']) {
    assert.ok(installer.includes(`DeleteRegValue SHELL_CONTEXT "Software\\Classes\\${scope}\\shell\\Zyra" "Position"`),
        'upgrades must remove the old pinned position, not just stop writing it')
}
assert.ok(installer.includes('"Software\\Classes\\Directory\\Background\\shell\\Zyra" "" "Open with Zyra"'))
console.log('Windows file icons and context menu: ok')
