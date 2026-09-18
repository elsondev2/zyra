import { AudioLines, Files, Globe2, PackageOpen, SquareTerminal } from 'lucide-react'
import type { AccessoryOpenInput } from '@shared/accessories'
import { IncognitoIcon } from '@/components/ui/IncognitoIcon'
import { AppSubmenu, type AppSubmenuItem } from './AppSubmenu'

export function AccessoriesMenu({ onOpen, onVoiceLab }: { onOpen: (input: AccessoryOpenInput) => void; onVoiceLab?: () => void }) {
    const items: AppSubmenuItem[] = [
        { id: 'browser', label: 'Browser', icon: <Globe2 size={15} />, onSelect: () => onOpen({ kind: 'browser', sessionMode: 'normal' }) },
        { id: 'incognito', label: 'Incognito Browser', icon: <IncognitoIcon size={15} />, onSelect: () => onOpen({ kind: 'browser', sessionMode: 'incognito' }) },
        { id: 'terminal', label: 'Terminal', icon: <SquareTerminal size={15} />, onSelect: () => onOpen({ kind: 'terminal' }) },
        { id: 'files', label: 'File Explorer', icon: <Files size={15} />, onSelect: () => onOpen({ kind: 'files' }) }
    ]
    if (onVoiceLab) items.push({ id: 'voice', label: 'Voice Lab', icon: <AudioLines size={15} />, onSelect: onVoiceLab })
    return <AppSubmenu label="Accessories" icon={<PackageOpen size={14} />} items={items} />
}
