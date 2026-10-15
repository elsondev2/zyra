import { createContext } from 'react'

/** Exact owning thread, independent of global chat selection and detached windows. */
export const VisualizationThreadContext = createContext<string | null>(null)
