import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

export function ZyraAgentLogo({ className, ...props }: IconProps) {
    return (
        <svg
            viewBox="0 0 128 128"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            {...props}
        >
            <rect x="10" y="10" width="108" height="108" rx="18" fill="currentColor" opacity="0.08" />
            <rect x="10" y="10" width="108" height="108" rx="18" stroke="currentColor" strokeWidth="6" opacity="0.65" />
            <path d="M41 40H88L42 88H89" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M78 40H96" stroke="var(--accent-primary)" strokeWidth="10" strokeLinecap="round" />
            <circle cx="96" cy="40" r="5" fill="var(--accent-primary)" />
        </svg>
    )
}
