import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

function ExpandableFontSample({ label, style, children }: { label: string; style: CSSProperties; children: ReactNode }) {
    const [expanded, setExpanded] = useState(false)
    const [height, setHeight] = useState(176)
    const content = useRef<HTMLDivElement>(null)
    const id = useId()
    useLayoutEffect(() => {
        const element = content.current
        if (!element) return
        const measure = () => setHeight(element.getBoundingClientRect().height)
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(element)
        return () => observer.disconnect()
    }, [])
    return <div className="mt-3 overflow-hidden rounded-lg bg-[var(--settings-control)] ring-1 ring-inset ring-[var(--settings-row-divider)]">
        <div id={id} className="relative overflow-hidden transition-[height] duration-300 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none" style={{ height: expanded ? height : Math.min(176, height), ...style }}>
            <div ref={content} aria-label={label} className="px-4 py-4 text-[12px] leading-[1.7] text-[var(--settings-text-secondary)]">{children}</div>
            <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[var(--settings-control)] to-transparent transition-opacity duration-200 motion-reduce:transition-none ${expanded ? 'opacity-0' : 'opacity-100'}`} />
        </div>
        <button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)} className="flex w-full items-center justify-center gap-1.5 border-t border-[var(--settings-row-divider)] px-3 py-2 text-[11px] text-[var(--settings-text-muted)] hover:bg-[var(--settings-row-hover)] hover:text-[var(--settings-text)] focus-visible:outline focus-visible:outline-[var(--accent-primary)]">{expanded ? 'Show less' : 'Show more'}<ChevronDown size={12} className={`transition-transform duration-300 motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} /></button>
    </div>
}
export function UiTypographySample({ fontFamily }: { fontFamily: string }) {
    return <ExpandableFontSample label="UI font sample" style={{ fontFamily }}>
        <article className="space-y-3">
            <header><h1 className="text-[21px] font-semibold leading-tight tracking-[-0.02em] text-[var(--settings-text)]">A little room for a good idea</h1><p className="mt-1 text-[11px] text-[var(--accent-primary)]">Field notes · September 17 · A two-minute read</p></header>
            <p>A blank page can be an invitation. Start with <strong className="font-bold text-[var(--settings-text)]">one clear thought</strong>, leave room for <em className="italic text-[var(--accent-secondary)]">the unexpected</em>, and let the next sentence find its rhythm.</p>
            <h2 className="text-[16px] font-semibold text-[var(--settings-text)]">Small details, different voices</h2>
            <blockquote className="border-l-2 border-[var(--accent-primary)] pl-3 italic text-[var(--settings-text)]">“The first draft only needs to open the door.”</blockquote>
            <p>Try <strong className="font-bold"><em className="italic">a stronger emphasis</em></strong>, a <span className="text-[var(--accent-primary)] underline underline-offset-2">useful reference</span>, or an <code className="rounded bg-[var(--settings-track)] px-1 text-[var(--status-info)]" style={{ fontFamily: 'inherit' }}>inline note</code>. Keep <del className="text-[var(--settings-text-muted)]">the extra words</del> what matters.</p>
            <div className="grid gap-4 sm:grid-cols-2"><div><h3 className="mb-1 text-[13px] font-semibold text-[var(--accent-secondary)]">A short checklist</h3><ul className="space-y-1"><li><span className="text-[var(--status-success)]">☑</span> Give the idea a name</li><li><span className="text-[var(--status-success)]">☑</span> Find its clearest shape</li><li><span className="text-[var(--settings-text-muted)]">☐</span> Leave a little breathing room</li></ul></div><div><h3 className="mb-1 text-[13px] font-semibold text-[var(--accent-secondary)]">Make it yours</h3><ol className="list-decimal space-y-1 pl-4"><li>Read it out loud.</li><li>Change one small thing.<ul className="list-disc pl-4 text-[var(--settings-text-muted)]"><li>Notice what feels better.</li></ul></li></ol></div></div>
            <hr className="border-[var(--settings-divider)]" />
            <table className="w-full text-left text-[11px]"><thead className="text-[var(--settings-text)]"><tr><th className="pb-1 font-semibold">A detail</th><th className="pb-1 font-semibold">What it adds</th></tr></thead><tbody><tr><td className="py-1 text-[var(--status-info)]">Quiet space</td><td>Somewhere for a thought to land</td></tr><tr><td className="py-1 text-[var(--status-success)]">A clear ending</td><td>Enough said, without saying everything</td></tr></tbody></table>
            <p className="text-[11px]">A final <mark className="rounded bg-[color-mix(in_srgb,var(--status-warning)_18%,transparent)] px-1 text-[var(--settings-text)]">bright detail</mark>: H<sub>2</sub>O, x<sup>2</sup>, 0123456789 &amp; Aa–Zz.</p>
        </article>
    </ExpandableFontSample>
}
const codeLines: ReactNode[] = [
    <><span className="text-[var(--settings-text-muted)]">// Turn a passing idea into a little constellation.</span></>,
    <><span className="text-[var(--accent-secondary)]">type</span> <span className="text-[var(--status-info)]">Star</span> = {'{'} name: <span className="text-[var(--status-info)]">string</span>; light: <span className="text-[var(--status-info)]">number</span> {'}'}</>,
    <></>,
    <><span className="text-[var(--accent-secondary)]">const</span> sky: <span className="text-[var(--status-info)]">Star</span>[] = [</>,
    <>  {'{'} name: <span className="text-[var(--status-success)]">'Sirius'</span>, light: <span className="text-[var(--status-warning)]">8.6</span> {'}'},</>,
    <>  {'{'} name: <span className="text-[var(--status-success)]">'Vega'</span>,   light: <span className="text-[var(--status-warning)]">25</span> {'}'},</>,
    <>]</>,
    <></>,
    <><span className="text-[var(--accent-secondary)]">export function</span> <span className="text-[var(--accent-primary)]">illuminate</span>(stars: <span className="text-[var(--status-info)]">Star</span>[]) {'{'}</>,
    <>  <span className="text-[var(--accent-secondary)]">return</span> stars</>,
    <>    .<span className="text-[var(--accent-primary)]">filter</span>(star =&gt; star.light &gt; <span className="text-[var(--status-warning)]">0</span>)</>,
    <>    .<span className="text-[var(--accent-primary)]">map</span>(({ '{' } name {'}'}) =&gt; <span className="text-[var(--status-success)]">{'`✦ ${name}`'}</span>)</>,
    <>    .<span className="text-[var(--accent-primary)]">join</span>(<span className="text-[var(--status-success)]">' · '</span>)</>,
    <>{'}'}</>,
    <></>,
    <><span className="text-[var(--settings-text-muted)]">// ✦ Sirius · ✦ Vega</span></>,
    <>console.<span className="text-[var(--accent-primary)]">log</span>(<span className="text-[var(--accent-primary)]">illuminate</span>(sky))</>
]
export function CodeTypographySample({ fontFamily }: { fontFamily: string }) {
    return <ExpandableFontSample label="Code font sample" style={{ fontFamily }}>
        <div className="mb-3 text-[10px] text-[var(--settings-text-muted)]">constellation.ts</div>
        <pre className="whitespace-pre-wrap break-words text-[11px] leading-5" style={{ fontFamily: 'inherit' }}><code style={{ fontFamily: 'inherit' }}>{codeLines.map((line, index) => <span key={index} className="grid grid-cols-[22px_minmax(0,1fr)]"><span aria-hidden="true" className="select-none text-[var(--settings-text-faint)]">{index + 1}</span><span>{line}{'\n'}</span></span>)}</code></pre>
    </ExpandableFontSample>
}
