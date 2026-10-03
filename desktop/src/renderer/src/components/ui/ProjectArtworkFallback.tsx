/** A quiet project identity for repositories without their own artwork. */
export function ProjectArtworkFallback({ size = 24 }: { size?: number }) {
    return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
        <rect x="1" y="1" width="30" height="30" rx="8" fill="#122B31" stroke="#35646A" />
        <path d="m12.5 10-5.5 6 5.5 6M19.5 10l5.5 6-5.5 6" stroke="#8DD8D1" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m17.8 9-3.6 14" stroke="#7FA6D9" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
}
