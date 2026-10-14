import { useMemo } from 'react'

/** Small escaped React-token renderer: no editor workers, raw HTML, or language runtime. */
export function VisualizationSource({ source }: { source: string }) {
    const lines = useMemo(() => source.split('\n'), [source])
    return (
        <pre
            aria-label="Visualization source"
            className="min-h-full min-w-full flex-1 p-3 font-mono text-xs leading-5"
        >
            <code>
                {lines.map((line, index) => (
                    <div key={index}>
                        <span
                            aria-hidden="true"
                            className="mr-4 inline-block w-8 select-none text-right text-sparkle-text-muted/40"
                        >
                            {index + 1}
                        </span>
                        {line
                            .split(
                                /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|<\/?[\w-]+|\b(?:true|false|null|\d+(?:\.\d+)?)\b)/g,
                            )
                            .map((token, i) => (
                                <span
                                    key={i}
                                    style={{
                                        color: /^["']/.test(token)
                                            ? 'color-mix(in srgb, var(--color-text) 70%, #22b5aa)'
                                            : /^</.test(token)
                                              ? 'color-mix(in srgb, var(--color-text) 70%, #448eff)'
                                              : /^(?:true|false|null|\d)/.test(token)
                                                ? 'color-mix(in srgb, var(--color-text) 70%, #e3a33b)'
                                                : undefined,
                                    }}
                                >
                                    {token}
                                </span>
                            ))}
                        {!line && ' '}
                    </div>
                ))}
            </code>
        </pre>
    )
}
