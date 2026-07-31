import { Archive, Bot, Bug, FolderOpen, Info, Palette, Settings2, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'

const SETTINGS_SECTIONS = [
    {
        to: '/settings/chat',
        title: 'Chat & permissions',
        description: 'Supervision, reconnect behavior, history prefetch, status, and accessibility.',
        icon: ShieldCheck,
        tone: 'text-emerald-300 bg-emerald-500/10'
    },
    {
        to: '/settings/assistant',
        title: 'Assistant defaults',
        description: 'Model, effort, speed, streaming, voice, usage, and account details.',
        icon: Bot,
        tone: 'text-sky-300 bg-sky-500/10'
    },
    {
        to: '/settings/projects',
        title: 'Projects & icons',
        description: 'Bounded scan roots, persistent indexing, detected logos, and manual overrides.',
        icon: FolderOpen,
        tone: 'text-indigo-300 bg-indigo-500/10'
    },
    {
        to: '/settings/appearance',
        title: 'Appearance',
        description: 'Themes, accent color, light mode, and compact layout.',
        icon: Palette,
        tone: 'text-violet-300 bg-violet-500/10'
    },
    {
        to: '/settings/behavior',
        title: 'Desktop behavior',
        description: 'Startup, scrolling, file preview, terminal, and package runtime.',
        icon: SlidersHorizontal,
        tone: 'text-amber-300 bg-amber-500/10'
    },
    {
        to: '/settings/archived',
        title: 'Archived chats',
        description: 'Review and restore chats without deleting canonical transcripts.',
        icon: Archive,
        tone: 'text-fuchsia-300 bg-fuchsia-500/10'
    },
    {
        to: '/settings/logs',
        title: 'Diagnostics',
        description: 'Inspect local AI request logs and clear diagnostic entries.',
        icon: Bug,
        tone: 'text-orange-300 bg-orange-500/10'
    },
    {
        to: '/settings/about',
        title: 'About Zyra',
        description: 'Version, update channel, release status, and project links.',
        icon: Info,
        tone: 'text-teal-300 bg-teal-500/10'
    }
] as const

export default function Settings() {
    return (
        <div className="mx-auto w-full max-w-6xl animate-fadeIn">
            <header className="mb-7">
                <div className="flex items-center gap-3">
                    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-2.5 text-sparkle-text-secondary">
                        <Settings2 size={21} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-sparkle-text">Settings</h1>
                        <p className="mt-1 text-sm text-sparkle-text-secondary">Persisted controls for chat, projects, Desktop, and diagnostics.</p>
                    </div>
                </div>
            </header>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {SETTINGS_SECTIONS.map(({ to, title, description, icon: Icon, tone }) => (
                    <Link
                        key={to}
                        to={to}
                        className="group rounded-2xl border border-white/10 bg-sparkle-card p-5 transition-[border-color,background-color,transform] hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.035]"
                    >
                        <div className={`mb-4 inline-flex rounded-xl p-2.5 ${tone}`}><Icon size={19} /></div>
                        <h2 className="text-sm font-semibold text-sparkle-text transition-colors group-hover:text-white">{title}</h2>
                        <p className="mt-2 text-sm leading-6 text-sparkle-text-secondary">{description}</p>
                    </Link>
                ))}
            </div>
        </div>
    )
}
