import type { SVGProps } from 'react'

type DevScopeIconProps = SVGProps<SVGSVGElement> & {
    size?: number | string
}

/** Three indexed projects, matching DevScope's compact project library. */
export function DevScopeIcon({ size = 16, ...props }: DevScopeIconProps) {
    return <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
        aria-hidden={props['aria-label'] ? undefined : true}
        {...props}
    >
        <rect x="2.75" y="3.5" width="5" height="4.5" rx="1" />
        <rect x="2.75" y="9.75" width="5" height="4.5" rx="1" />
        <rect x="2.75" y="16" width="5" height="4.5" rx="1" />
        <path d="M11 5.75h10M11 12h7.5M11 18.25h10" />
    </svg>
}
