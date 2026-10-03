import assert from 'node:assert/strict';
import { createManagedBashState, createManagedBashTool } from '../src/managed-bash-tool.mjs';

const state = createManagedBashState();
const otherState = createManagedBashState();
const tool = createManagedBashTool({ state });
const otherTool = createManagedBashTool({ state: otherState });
const events = [];
state.subscribe(event => events.push(event));
const signal = new AbortController();
const command = 'node -e "console.log(\'started\');setInterval(()=>{},1000)"';
try {
    const running = await tool.execute('call:background', { command, wait: 0.01 }, signal.signal);
    const job = state.jobs.get(running.details.jobId);
    assert(job && !job.completedAt);
    signal.abort();
    assert(!job.abortController.signal.aborted, 'a completed tool call can leave a tracked background job running');
    const other = await otherTool.execute('call:other-chat', { command, wait: 0.01 });
    const otherJob = otherState.jobs.get(other.details.jobId);
    const deadline = Date.now() + 5000;
    while (!job.output.includes('started') || !otherJob.output.includes('started')) {
        if (Date.now() > deadline) throw new Error('Fixture background jobs did not start');
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    state.abortAll('Root turn stopped');
    await job.done;
    assert(job.completedAt, 'root stop waits for owned background execution to finish');
    assert(!otherJob.abortController.signal.aborted && !otherJob.completedAt, 'stopping one chat preserves another chat\'s background job');
    const update = events.findLast(event => event.status === 'stopped');
    assert.equal(update.jobId, job.id);
    assert.equal(update.toolCallId, 'call:background');
    const status = await tool.execute('call:status', { action: 'status', jobId: job.id });
    assert.match(status.content[0].text, /stopped/i, 'completed jobs remain queryable after Force Stop');
    console.log('Managed background lifecycle: caller detachment, per-chat stop, completion observer and retained status: ok');
} finally {
    state.abortAll('Fixture cleanup');
    otherState.abortAll('Fixture cleanup');
    await Promise.all([...state.jobs.values(), ...otherState.jobs.values()].map(job => job.done));
}
