const fs = require('node:fs')
const path = require('node:path')
const { signWidevinePackage } = require('./widevine-vmp-sign.cjs')

module.exports = async (context) => {
    if (context.electronPlatformName !== 'darwin') return
    if (/-((?:x64)|(?:arm64))-temp$/i.test(context.appOutDir)) {
        const productFilename = context.packager.appInfo.productFilename
        const signature = path.join(context.appOutDir, `${productFilename}.app`, 'Contents', 'Frameworks', 'Electron Framework.framework', 'Versions', 'A', 'Resources', 'Electron Framework.sig')
        fs.rmSync(signature, { force: true })
        return
    }
    await signWidevinePackage(context, 'before-code-sign')
}
