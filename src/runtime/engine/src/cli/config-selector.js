// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { ProcessTerminal, TuiMainScreen } from "../../../terminal/src/index.js";
import { ConfigSelectorComponent } from "../modes/interactive/components/config-selector.js";
import { initTheme, stopThemeWatcher } from "../modes/interactive/theme/theme.js";
async function selectConfig(options) {
  initTheme(options.settingsManager.getTheme(), true);
  return new Promise((resolve) => {
    const ui = new TuiMainScreen(new ProcessTerminal(), void 0, options.agentDir);
    let resolved = false;
    const selector = new ConfigSelectorComponent(
      options.resolvedPaths,
      options.settingsManager,
      options.cwd,
      options.agentDir,
      () => {
        if (!resolved) {
          resolved = true;
          ui.stop();
          stopThemeWatcher();
          resolve();
        }
      },
      () => {
        ui.stop();
        stopThemeWatcher();
        process.exit(0);
      },
      () => ui.requestRender(),
      ui.terminal.rows,
      options.writeScope,
      options.projectModeAvailable
    );
    ui.addChild(selector);
    ui.setFocus(selector.getResourceList());
    ui.start();
  });
}
export {
  selectConfig
};
