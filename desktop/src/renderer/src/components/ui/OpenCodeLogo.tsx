import { useId, type SVGProps } from 'react'

/**
 * OpenCode mark adapted from the MIT-licensed T3 Code icon source
 * (OpenCodeIcon in apps/web/src/components/Icons.tsx).
 * See THIRD_PARTY_NOTICES.md. Copyright (c) 2026 T3 Tools Inc.
 * The product mark remains with its owner and does not imply endorsement.
 *
 * Rendered monochrome via currentColor so it follows the surrounding theme;
 * the counter is punched with a mask instead of a background-colored overlay.
 */
export function OpenCodeLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
    const maskId = `${useId().replaceAll(':', '')}-opencode-mark`
    return (
        <svg
            aria-hidden="true"
            className={className}
            fill="currentColor"
            viewBox="0 0 32 40"
            xmlns="http://www.w3.org/2000/svg"
            {...props}
        >
            <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="40">
                <path fill="#fff" d="M24 8H8V32H24V8ZM32 40H0V0H32V40Z" />
                <path fill="#000" d="M24 32H8V16H24V32Z" />
            </mask>
            <rect width="32" height="40" fill="currentColor" mask={`url(#${maskId})`} />
        </svg>
    )
}
