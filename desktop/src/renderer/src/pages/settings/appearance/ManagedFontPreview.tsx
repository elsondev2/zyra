import { useEffect, useRef, useState } from 'react'
import type { DevScopeManagedFont } from '@shared/contracts/font-contracts'
import { getManagedFontPreviewAlias, type FontTarget } from './font-manager-model'

import { createFontPreviewQueue, fontRangeContainsAscii } from './font-preview-queue'

const withPreviewSlot = createFontPreviewQueue(2)

function toUint8Array(value: unknown): Uint8Array {
    if (value instanceof Uint8Array) return value
    if (value instanceof ArrayBuffer) return new Uint8Array(value)
    if (value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)) {
        return Uint8Array.from((value as { data: number[] }).data)
    }
    throw new Error('Zyra received invalid cached font data.')
}

function choosePreviewFace(font: DevScopeManagedFont): number {
    const regular = font.faces.findIndex(face => fontRangeContainsAscii(face.unicodeRange) && face.style === 'normal' && /^400(?:\s|$)/.test(face.weight))
    if (regular >= 0) return regular
    const normal = font.faces.findIndex(face => fontRangeContainsAscii(face.unicodeRange) && face.style === 'normal')
    return normal >= 0 ? normal : font.faces.findIndex(face => fontRangeContainsAscii(face.unicodeRange))
}

async function loadManagedFontPreview(font: DevScopeManagedFont, ownerDocument: Document): Promise<{ family: string; dispose: () => void }> {
    const FontFaceConstructor = ownerDocument.defaultView?.FontFace ?? globalThis.FontFace
    if (typeof FontFaceConstructor === 'undefined') throw new Error('Font previews are unavailable.')
    const result = await window.devscope.fonts.readManaged(font.id)
    if (!result.success) throw new Error(result.error)
    const faceIndex = Math.min(choosePreviewFace(result.font), result.faces.length - 1)
    const face = result.faces[faceIndex]
    if (!face) throw new Error('The cached font has no readable faces.')

    const bytes = toUint8Array(face.data)
    const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    const family = getManagedFontPreviewAlias(font.id)
    const previewFace = new FontFaceConstructor(family, source, {
        style: face.style,
        weight: face.weight,
        ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {})
    })
    await previewFace.load()
    ownerDocument.fonts.add(previewFace)
    return {
        family,
        dispose: () => ownerDocument.fonts.delete(previewFace)
    }
}

export function ManagedFontPreview({ font, target, className }: {
    font: DevScopeManagedFont
    target: FontTarget
    className?: string
}) {
    const sampleRef = useRef<HTMLSpanElement | null>(null)
    const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')
    const [previewFamily, setPreviewFamily] = useState<string | null>(null)
    const [failed, setFailed] = useState(false)

    useEffect(() => {
        const element = sampleRef.current
        const Observer = element?.ownerDocument.defaultView?.IntersectionObserver ?? globalThis.IntersectionObserver
        if (!element || typeof Observer === 'undefined') {
            setVisible(true)
            return
        }
        const observer = new Observer(entries => {
            setVisible(entries.some(entry => entry.isIntersecting))
        })
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        if (!visible) { setPreviewFamily(null); return }
        let cancelled = false
        let dispose: (() => void) | undefined
        setPreviewFamily(null)
        setFailed(false)
        void withPreviewSlot(async () => {
            if (cancelled) return
            const ownerDocument = sampleRef.current?.ownerDocument
            if (!ownerDocument) return
            const loaded = await loadManagedFontPreview(font, ownerDocument)
            if (cancelled) {
                loaded.dispose()
                return
            }
            dispose = loaded.dispose
            setPreviewFamily(loaded.family)
        }).catch(() => {
            if (!cancelled) setFailed(true)
        })
        return () => {
            cancelled = true
            dispose?.()
        }
    }, [font, visible])

    const sample = target === 'code' ? 'const zyra = "Aa 0123"' : 'The quick brown fox · Aa 0123'
    return (
        <span
            ref={sampleRef}
            className={className}
            style={previewFamily ? { fontFamily: `"${previewFamily}"` } : undefined}
        >
            {previewFamily ? sample : failed ? 'Preview unavailable' : visible ? 'Loading preview...' : 'Preview'}
        </span>
    )
}
