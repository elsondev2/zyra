import { lazy, Suspense } from 'react'
import { SettingsNotice, SettingsPageContainer } from './settings-layout'
import { SettingsPageTabs } from './SettingsPageTabs'
import { ChatGptLimitsLoading } from './providers/ChatGptLimitsLoading'

const ProviderConnections = lazy(() => import('./providers/ProviderConnections'))
const ProviderModelsPage = lazy(() => import('./providers/ProviderModelsPage'))
const ProviderLimits = lazy(() => import('./AccountSettings'))
const ProviderUsage = lazy(() => import('./UsageSettings'))

export default function ProvidersSettings({ view = 'connections' }: { view?: 'connections' | 'models' | 'limits' | 'usage' }) {
    return <SettingsPageContainer title="Providers" description="Connect providers and choose the models Zyra uses." navigation={<SettingsPageTabs family="providers" />}>
        <Suspense key={view} fallback={view === 'limits' ? <ChatGptLimitsLoading /> : <SettingsNotice>Opening provider settings…</SettingsNotice>}>
            {view === 'connections' ? <ProviderConnections /> : view === 'models' ? <ProviderModelsPage /> : view === 'limits' ? <ProviderLimits /> : <ProviderUsage />}
        </Suspense>
    </SettingsPageContainer>
}
