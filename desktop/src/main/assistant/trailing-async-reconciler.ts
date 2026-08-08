export class TrailingAsyncReconciler {
    private requested = false
    private running: Promise<void> | null = null

    constructor(private readonly reconcile: () => Promise<void>) {}

    request(): Promise<void> {
        this.requested = true
        if (!this.running) {
            const task = this.drain()
            this.running = task
            const finalize = () => {
                if (this.running !== task) return
                this.running = null
                if (this.requested) void this.request()
            }
            void task.then(finalize, finalize)
        }
        return this.running!
    }

    private async drain(): Promise<void> {
        while (this.requested) {
            this.requested = false
            await this.reconcile()
        }
    }
}
