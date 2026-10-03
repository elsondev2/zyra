import { OpenAiLogo } from '@/components/ui/OpenAiLogo'
import zyraMark from '@/assets/branding/zyra-mark.png'
import { SettingsButton, SettingsDialog } from '../settings-layout'

export function ChatGptAuthenticationSuccess({ open, onClose }: { open: boolean; onClose: () => void }) {
    return <SettingsDialog
        open={open}
        title="Authentication successful"
        onClose={onClose}
        contentClassName="px-6 py-8"
        footer={<SettingsButton variant="accent" onClick={onClose}>Continue</SettingsButton>}
    >
        <div className="flex flex-col items-center text-center">
            <div className="flex items-center gap-3 text-[var(--settings-text)]" aria-label="ChatGPT and Zyra">
                <OpenAiLogo width={40} height={40} />
                <span className="text-[24px] font-light text-[var(--settings-text-faint)]">×</span>
                <img src={zyraMark} width={40} height={40} className="rounded-md" alt="Zyra" />
            </div>
            <p className="mt-5 max-w-[22rem] text-[14px] leading-6 text-[var(--settings-text-secondary)]">
                You can now use your Codex subscription with OpenAI models in Zyra.
            </p>
        </div>
    </SettingsDialog>
}
