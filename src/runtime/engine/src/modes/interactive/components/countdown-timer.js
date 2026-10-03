// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
class CountdownTimer {
  intervalId;
  remainingSeconds;
  tui;
  onTick;
  onExpire;
  constructor(timeoutMs, tui, onTick, onExpire) {
    this.tui = tui;
    this.onTick = onTick;
    this.onExpire = onExpire;
    this.remainingSeconds = Math.ceil(timeoutMs / 1e3);
    this.onTick(this.remainingSeconds);
    this.intervalId = setInterval(() => {
      this.remainingSeconds--;
      this.onTick(this.remainingSeconds);
      this.tui?.requestRender();
      if (this.remainingSeconds <= 0) {
        this.dispose();
        this.onExpire();
      }
    }, 1e3);
  }
  dispose() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = void 0;
    }
  }
}
export {
  CountdownTimer
};
