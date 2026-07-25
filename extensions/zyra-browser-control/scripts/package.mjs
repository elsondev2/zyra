import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
execFileSync(process.execPath, [path.join(root, 'scripts', 'build.mjs')], { stdio: 'inherit' })
const source = path.join(root, 'dist', 'unpacked')
const files = (await readdir(source)).sort()
const entries = []
let offset = 0
for (const name of files) {
  const data = await readFile(path.join(source, name))
  const fileName = Buffer.from(name.replace(/\\/g, '/'))
  const crc = crc32(data)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0, 6)
  local.writeUInt16LE(0, 8)
  local.writeUInt16LE(0, 10)
  local.writeUInt16LE(0x0021, 12)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(data.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(fileName.length, 26)
  const record = Buffer.concat([local, fileName, data])
  entries.push({ name: fileName, crc, size: data.length, offset, record })
  offset += record.length
}
const centralParts = []
for (const entry of entries) {
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0, 8)
  central.writeUInt16LE(0, 10)
  central.writeUInt16LE(0, 12)
  central.writeUInt16LE(0x0021, 14)
  central.writeUInt32LE(entry.crc, 16)
  central.writeUInt32LE(entry.size, 20)
  central.writeUInt32LE(entry.size, 24)
  central.writeUInt16LE(entry.name.length, 28)
  central.writeUInt32LE(entry.offset, 42)
  centralParts.push(central, entry.name)
}
const centralDirectory = Buffer.concat(centralParts)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0)
end.writeUInt16LE(entries.length, 8)
end.writeUInt16LE(entries.length, 10)
end.writeUInt32LE(centralDirectory.length, 12)
end.writeUInt32LE(offset, 16)
const target = path.join(root, 'dist', 'zyra-browser-control.zip')
await writeFile(target, Buffer.concat([...entries.map((entry) => entry.record), centralDirectory, end]))
console.log(`Packaged deterministic extension: ${path.relative(root, target)}`)

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}
