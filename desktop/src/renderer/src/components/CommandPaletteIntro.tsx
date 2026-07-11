import { ArrowRight } from 'lucide-react'

export function CommandPaletteIntro({
    recent,
    onSelectQuery
}: {
    recent: string[]
    onSelectQuery: (value: string) => void
}) {
    return (
        <div className="px-1 pb-1">
            <div className="px-4 pb-1 pt-2 text-[18px] leading-7 text-white/44">Pinned searches</div>
            <div>
                <button
                    onClick={() => onSelectQuery('/ ')}
                    className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[17px] px-12 py-1.5 text-left text-white/78 transition-colors hover:bg-white/[0.045] hover:text-white"
                >
                    <span className="truncate text-[19px] leading-7">Projects</span>
                    <span className="rounded-full bg-white/[0.075] px-2 py-0.5 text-[15px] leading-5 text-white/58">/</span>
                </button>
                <button
                    onClick={() => onSelectQuery('// ')}
                    className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[17px] px-12 py-1.5 text-left text-white/78 transition-colors hover:bg-white/[0.045] hover:text-white"
                >
                    <span className="truncate text-[19px] leading-7">Files</span>
                    <span className="rounded-full bg-white/[0.075] px-2 py-0.5 text-[15px] leading-5 text-white/58">//</span>
                </button>
            </div>

            {recent.length > 0 && (
                <div>
                    <div className="px-4 pb-1 pt-3 text-[18px] leading-7 text-white/44">Recent searches</div>
                    <div>
                        {recent.map((value) => (
                            <button
                                key={value}
                                onClick={() => onSelectQuery(`${value} `)}
                                className="group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-[17px] px-7 py-1.5 text-left text-white/68 transition-colors hover:bg-white/[0.045] hover:text-white"
                            >
                                <span className="h-2.5 w-2.5 rounded-full bg-[#9297cf]" />
                                <span className="truncate text-[19px] leading-7">{value}</span>
                                <ArrowRight size={14} className="text-white/26 opacity-0 transition-opacity group-hover:opacity-100" />
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
