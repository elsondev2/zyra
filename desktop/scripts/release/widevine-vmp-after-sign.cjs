const { signWidevinePackage } = require('./widevine-vmp-sign.cjs')

module.exports = (context) => signWidevinePackage(context, 'after-code-sign')
