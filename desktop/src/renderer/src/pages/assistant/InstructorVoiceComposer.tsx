import { ImagePlus, Mic, MicOff, Plus, X } from 'lucide-react'
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type ClipboardEvent,
    type CSSProperties,
    type FormEvent,
    type KeyboardEvent
} from 'react'
import { cn } from '@/lib/utils'
import type { InstructorVoiceStatus } from './useInstructorVoiceSession'
import './InstructorVoiceComposer.css'

const MAX_IMAGE_COUNT = 4
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

export type InstructorVoiceComposerImage = {
    id: string
    name: string
    mimeType: string
    dataUrl: string
}

type SendResult = { success: true } | { success: false; error: string }

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error(`Could not read ${file.name || 'that image'}.`))
        reader.readAsDataURL(file)
    })
}

export function InstructorVoiceComposer({
    status,
    microphoneMuted,
    accentColor,
    instructionsAvailable,
    onStart,
    onStop,
    onToggleMicrophone,
    onSend
}: {
    status: InstructorVoiceStatus
    microphoneMuted: boolean
    accentColor: string
    instructionsAvailable: boolean
    onStart: () => void
    onStop: () => void
    onToggleMicrophone: () => void
    onSend: (text: string, images: InstructorVoiceComposerImage[]) => Promise<SendResult>
}) {
    const fileInputRef = useRef<HTMLInputElement | null>(null)
    const [text, setText] = useState('')
    const [images, setImages] = useState<InstructorVoiceComposerImage[]>([])
    const [sending, setSending] = useState(false)
    const [sendWhenActive, setSendWhenActive] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const active = status === 'active'
    const connecting = status === 'connecting' || status === 'requesting-microphone'
    const stopping = status === 'stopping'
    const hasContent = text.trim().length > 0 || images.length > 0

    const attachFiles = useCallback(async (files: File[]) => {
        if (files.length === 0) return
        setMessage(null)
        const remaining = Math.max(0, MAX_IMAGE_COUNT - images.length)
        if (remaining === 0) {
            setMessage(`You can attach up to ${MAX_IMAGE_COUNT} images.`)
            return
        }

        const accepted = files.slice(0, remaining)
        const next: InstructorVoiceComposerImage[] = []
        for (const file of accepted) {
            const mimeType = file.type.toLowerCase()
            if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
                setMessage('Voice images support PNG, JPEG, WebP, and GIF.')
                continue
            }
            if (file.size > MAX_IMAGE_BYTES) {
                setMessage(`${file.name || 'That image'} is larger than 10 MB.`)
                continue
            }
            try {
                const dataUrl = await readFileAsDataUrl(file)
                next.push({
                    id: crypto.randomUUID(),
                    name: file.name || 'Pasted image',
                    mimeType,
                    dataUrl
                })
            } catch (error) {
                setMessage(error instanceof Error ? error.message : 'Could not attach that image.')
            }
        }
        if (next.length > 0) setImages((current) => [...current, ...next].slice(0, MAX_IMAGE_COUNT))
        if (files.length > remaining) setMessage(`Only the first ${MAX_IMAGE_COUNT} images were attached.`)
    }, [images.length])

    const submit = useCallback(async () => {
        if (!hasContent || sending || stopping) return
        setMessage(null)
        if (!active) {
            if (!instructionsAvailable) {
                setMessage('Add voice instructions in Settings before starting.')
                return
            }
            setSendWhenActive(true)
            onStart()
            return
        }

        setSendWhenActive(false)
        setSending(true)
        try {
            const result = await onSend(text.trim(), images)
            if (!result.success) {
                setMessage(result.error)
                return
            }
            setText('')
            setImages([])
        } catch (sendError) {
            setMessage(sendError instanceof Error ? sendError.message : 'The voice message could not be sent.')
        } finally {
            setSending(false)
        }
    }, [active, hasContent, images, instructionsAvailable, onSend, onStart, sending, stopping, text])

    useEffect(() => {
        if (active && sendWhenActive && hasContent && !sending) void submit()
    }, [active, hasContent, sendWhenActive, sending, submit])

    useEffect(() => {
        if (status === 'error') setSendWhenActive(false)
    }, [status])

    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const files = [...(event.target.files || [])]
        event.target.value = ''
        void attachFiles(files)
    }

    const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
        const imageFiles = [...event.clipboardData.files].filter((file) => file.type.startsWith('image/'))
        if (imageFiles.length > 0) void attachFiles(imageFiles)
    }

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault()
        void submit()
    }

    const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void submit()
        }
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="instructor-voice-composer relative mx-auto w-full max-w-[760px]"
            style={{ '--voice-composer-accent': accentColor } as CSSProperties}
        >
            {images.length > 0 ? (
                <div className="instructor-voice-composer-images mb-2 flex items-end gap-2 px-2" aria-label="Attached images">
                    {images.map((image) => (
                        <div key={image.id} className="group relative h-11 w-11 overflow-hidden rounded-lg border border-sparkle-border bg-sparkle-card shadow-sm">
                            <img src={image.dataUrl} alt={image.name} className="h-full w-full object-cover" />
                            <button
                                type="button"
                                onClick={() => setImages((current) => current.filter((candidate) => candidate.id !== image.id))}
                                className="absolute right-0.5 top-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                                aria-label={`Remove ${image.name}`}
                            >
                                <X size={9} />
                            </button>
                        </div>
                    ))}
                </div>
            ) : null}

            {message ? (
                <p role="status" className="mb-1 truncate px-4 text-[9px] text-rose-400">
                    {message}
                </p>
            ) : null}

            <div className="instructor-voice-composer-pill flex h-[52px] items-center gap-1.5 rounded-full border border-sparkle-border-secondary bg-sparkle-card-elevated px-2 shadow-[0_10px_30px_rgba(0,0,0,0.16)] transition-colors focus-within:border-sparkle-border">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    multiple
                    className="hidden"
                    onChange={handleFileChange}
                    aria-hidden="true"
                    tabIndex={-1}
                />
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending || stopping || images.length >= MAX_IMAGE_COUNT}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sparkle-text-secondary transition-colors hover:bg-sparkle-accent hover:text-sparkle-text disabled:cursor-not-allowed disabled:opacity-35"
                    aria-label="Attach images"
                    title="Attach images"
                >
                    {images.length > 0 ? <ImagePlus size={17} /> : <Plus size={19} />}
                </button>

                <input
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    onPaste={handlePaste}
                    onKeyDown={handleInputKeyDown}
                    placeholder="Type"
                    disabled={sending || stopping}
                    className="min-w-0 flex-1 bg-transparent px-1 text-[12px] text-sparkle-text outline-none placeholder:text-sparkle-text-muted disabled:opacity-50"
                    aria-label="Message Zyra Voice"
                />

                {active ? (
                    <button
                        type="button"
                        onClick={onToggleMicrophone}
                        className={cn(
                            'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
                            microphoneMuted
                                ? 'bg-rose-400/10 text-rose-400'
                                : 'text-sparkle-text-secondary hover:bg-sparkle-accent hover:text-sparkle-text'
                        )}
                        aria-label={microphoneMuted ? 'Unmute microphone' : 'Mute microphone'}
                        title={microphoneMuted ? 'Unmute microphone' : 'Mute microphone'}
                    >
                        {microphoneMuted ? <MicOff size={16} /> : <Mic size={16} />}
                    </button>
                ) : null}

                <button
                    type="button"
                    onClick={active || connecting ? onStop : onStart}
                    disabled={stopping || (!active && !connecting && !instructionsAvailable)}
                    className={cn(
                        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-[transform,opacity,background-color] hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-35',
                        active || connecting ? 'bg-sparkle-text text-sparkle-bg' : 'text-[#0c121f]'
                    )}
                    style={!active && !connecting ? { backgroundColor: accentColor } : undefined}
                    aria-label={active || connecting ? 'Stop voice session' : 'Start voice session'}
                    title={active || connecting ? 'Stop voice session' : 'Start voice session'}
                >
                    {active || connecting ? <X size={17} /> : <Mic size={17} />}
                </button>
            </div>
        </form>
    )
}
