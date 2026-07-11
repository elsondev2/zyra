export const piEditFixture = {
    toolCallId: 'pi-edit-42',
    path: 'src/example.ts',
    start: {
        type: 'tool_execution_start',
        toolCallId: 'pi-edit-42',
        toolName: 'edit',
        args: {
            path: 'src/example.ts',
            oldText: 'const answer = 41\n',
            newText: 'const answer = 42\n'
        }
    },
    update: {
        type: 'tool_execution_update',
        toolCallId: 'pi-edit-42',
        toolName: 'edit',
        args: {
            path: 'src/example.ts',
            oldText: 'const answer = 41\n',
            newText: 'const answer = 42\n'
        }
    },
    end: {
        type: 'tool_execution_end',
        toolCallId: 'pi-edit-42',
        toolName: 'edit',
        result: {
            content: [{ type: 'text', text: 'Successfully replaced 1 block(s) in src/example.ts.' }],
            details: {
                diff: '  const answer = 40\n- const answer = 41\n+ const answer = 42',
                patch: '--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1 +1 @@\n-const answer = 41\n+const answer = 42\n'
            }
        },
        isError: false
    }
} as const

export const piWriteNewFixture = {
    toolCallId: 'pi-write-new',
    path: 'src/new-file.ts',
    content: 'export const created = true\n',
    expectedPatch: '--- /dev/null\n+++ b/src/new-file.ts\n@@ -0,0 +1 @@\n+export const created = true\n'
} as const

export const piWriteExistingFixture = {
    toolCallId: 'pi-write-existing',
    path: 'src/existing.ts',
    before: 'export const version = 1\n',
    after: 'export const version = 2\n'
} as const

export const piWriteFailureFixture = {
    toolCallId: 'pi-write-failed',
    path: 'src/blocked.ts',
    args: { path: 'src/blocked.ts', content: 'uncommitted\n' },
    result: { content: [{ type: 'text', text: 'Permission denied' }] },
    isError: true
} as const

export const codexFileChangeFixture = {
    threadId: 'codex-thread-1',
    turnId: 'codex-turn-1',
    itemId: 'codex-file-change-1',
    started: {
        method: 'item/started',
        params: {
            threadId: 'codex-thread-1',
            turnId: 'codex-turn-1',
            item: {
                id: 'codex-file-change-1',
                type: 'fileChange',
                status: 'inProgress',
                changes: []
            }
        }
    },
    firstPatchUpdated: {
        method: 'item/fileChange/patchUpdated',
        params: {
            threadId: 'codex-thread-1',
            turnId: 'codex-turn-1',
            itemId: 'codex-file-change-1',
            changes: [{
                path: 'src/a.ts',
                kind: { type: 'update', move_path: null },
                diff: '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n'
            }]
        }
    },
    secondPatchUpdated: {
        method: 'item/fileChange/patchUpdated',
        params: {
            threadId: 'codex-thread-1',
            turnId: 'codex-turn-1',
            itemId: 'codex-file-change-1',
            changes: [
                {
                    path: 'src/a.ts',
                    kind: { type: 'update', move_path: null },
                    diff: '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+newer\n'
                },
                {
                    path: 'src/new.ts',
                    kind: { type: 'add' },
                    diff: '--- /dev/null\n+++ b/src/new.ts\n@@ -0,0 +1 @@\n+created\n'
                }
            ]
        }
    },
    completed: {
        method: 'item/completed',
        params: {
            threadId: 'codex-thread-1',
            turnId: 'codex-turn-1',
            item: {
                id: 'codex-file-change-1',
                type: 'fileChange',
                status: 'completed',
                changes: [
                    {
                        path: 'src/a.ts',
                        kind: { type: 'update', move_path: null },
                        diff: '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+newer\n'
                    },
                    {
                        path: 'src/new.ts',
                        kind: { type: 'add' },
                        diff: '--- /dev/null\n+++ b/src/new.ts\n@@ -0,0 +1 @@\n+created\n'
                    }
                ]
            }
        }
    },
    finalTurnDiff: {
        method: 'turn/diff/updated',
        params: {
            threadId: 'codex-thread-1',
            turnId: 'codex-turn-1',
            diff: '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+newer\n\n--- /dev/null\n+++ b/src/new.ts\n@@ -0,0 +1 @@\n+created\n'
        }
    }
} as const

export const codexMoveDeleteFixture = {
    itemId: 'codex-file-change-move-delete',
    changes: [
        {
            path: 'src/old-name.ts',
            kind: { type: 'update', move_path: 'src/new-name.ts' },
            diff: '--- a/src/old-name.ts\n+++ b/src/new-name.ts\n@@ -1 +1 @@\n-before\n+after\n'
        },
        {
            path: 'src/deleted.ts',
            kind: { type: 'delete' },
            diff: '--- a/src/deleted.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-gone\n'
        }
    ]
} as const

export const outOfOrderLifecycleFixture = {
    startedAt: '2026-07-11T10:00:00.000Z',
    completedAt: '2026-07-11T10:00:02.000Z',
    lowRevision: 1,
    highRevision: 4
} as const
