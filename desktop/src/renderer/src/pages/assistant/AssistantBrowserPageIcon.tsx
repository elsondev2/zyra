import { memo, useEffect, useMemo, useState } from 'react'
import { FileText, Globe2 } from 'lucide-react'
import { BROWSER_LOCAL_FILE_SCHEME } from '@shared/browser-view'
import { cn } from '@/lib/utils'

export function browserPageIconCandidates(faviconUrl: string | null, pageUrl?: string | null): string[] {
    const candidates: string[] = []
    const add = (value: string | null | undefined) => {
        const candidate = String(value || '').trim()
        if (!candidate || candidates.includes(candidate)) return
        if (/^data:image\//i.test(candidate)) {
            candidates.push(candidate)
            return
        }
        try {
            const parsed = new URL(candidate)
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') candidates.push(parsed.toString())
        } catch {
            // Invalid page metadata falls through to the origin favicon.
        }
    }

    add(faviconUrl)
    try {
        const page = new URL(String(pageUrl || ''))
        if (page.protocol === 'http:' || page.protocol === 'https:') add(new URL('/favicon.ico', page.origin).toString())
    } catch {
        // Pages without an HTTP origin use the generic Browser icon.
    }
    return candidates
}

export const AssistantBrowserPageIcon = memo(function AssistantBrowserPageIcon({
    faviconUrl,
    pageUrl = null,
    size = 10,
    className
}: {
    faviconUrl: string | null
    pageUrl?: string | null
    size?: number
    className?: string
}) {
    const candidates = useMemo(() => browserPageIconCandidates(faviconUrl, pageUrl), [faviconUrl, pageUrl])
    const localFile = useMemo(() => {
        try { return new URL(String(pageUrl || '')).protocol === `${BROWSER_LOCAL_FILE_SCHEME}:` } catch { return false }
    }, [pageUrl])
    const [candidateIndex, setCandidateIndex] = useState(0)
    const [resolvedOriginIcon, setResolvedOriginIcon] = useState<string | null>(null)
    const [originLookupComplete, setOriginLookupComplete] = useState(false)

    useEffect(() => {
        setCandidateIndex(0)
        setResolvedOriginIcon(null)
        setOriginLookupComplete(false)
    }, [candidates])

    useEffect(() => {
        if (candidateIndex < candidates.length || originLookupComplete || !pageUrl || localFile) return
        const getPageIcon = window.devscope?.getBrowserPageIcon
        if (typeof getPageIcon !== 'function') {
            setOriginLookupComplete(true)
            return
        }
        let cancelled = false
        setOriginLookupComplete(true)
        void getPageIcon(pageUrl).then((result) => {
            if (!cancelled && result.success && result.dataUrl) setResolvedOriginIcon(result.dataUrl)
        }).catch(() => undefined)
        return () => { cancelled = true }
    }, [candidateIndex, candidates.length, localFile, originLookupComplete, pageUrl])

    const directCandidate = candidates[candidateIndex] || null
    const candidate = directCandidate || resolvedOriginIcon
    if (!candidate && localFile) {
        return <FileText size={size} className={cn('shrink-0 text-sparkle-text-muted/68', className)} />
    }
    if (!candidate) {
        return <Globe2 size={size} className={cn('shrink-0 text-sparkle-text-muted/60', className)} />
    }

    return (
        <img
            src={candidate}
            alt=""
            width={size}
            height={size}
            draggable={false}
            referrerPolicy="no-referrer"
            onError={() => {
                if (directCandidate) setCandidateIndex((current) => current + 1)
                else setResolvedOriginIcon(null)
            }}
            className={cn('shrink-0 object-contain', className)}
        />
    )
})
