import { createRoot } from 'react-dom/client'
import { checkVoiceRecorderInput } from './voice-recorder-input'
const root = createRoot(document.getElementById('root')!)
;(window as any).sidebarContinuityCheck = checkVoiceRecorderInput(root)
