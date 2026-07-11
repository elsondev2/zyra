import { Component, type ErrorInfo, type ReactNode } from 'react'

interface PreviewErrorBoundaryProps {
    children: ReactNode
    resetKey: string
}

interface PreviewErrorBoundaryState {
    hasError: boolean
}

export default class PreviewErrorBoundary extends Component<PreviewErrorBoundaryProps, PreviewErrorBoundaryState> {
    state: PreviewErrorBoundaryState = { hasError: false }

    static getDerivedStateFromError() {
        return { hasError: true }
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Preview render crashed:', error, errorInfo)
    }

    componentDidUpdate(prevProps: PreviewErrorBoundaryProps) {
        if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
            this.setState({ hasError: false })
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="w-full max-w-5xl bg-rose-500/10 border border-rose-500/25 rounded-xl p-4 text-sm text-rose-100">
                    Preview failed to render for this file.
                    <div className="text-xs text-rose-200/80 mt-2">Try reopening the preview or opening the file externally.</div>
                </div>
            )
        }

        return this.props.children
    }
}
