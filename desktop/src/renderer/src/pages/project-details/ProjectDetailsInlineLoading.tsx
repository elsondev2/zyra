import { RefreshCw } from 'lucide-react'

export function ProjectDetailsInlineLoading({
    title,
    detail
}: {
    title: string
    detail: string
}) {
    return (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                <RefreshCw size={18} className="animate-spin text-white/45" />
            </div>
            <h3 className="text-sm font-medium text-white/80">{title}</h3>
            <p className="mt-2 max-w-md text-xs text-white/45">{detail}</p>
        </div>
    )
}
