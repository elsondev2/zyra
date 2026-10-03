import type { TUI } from "../../../../../terminal/src/index.js";
import type { SettingsManager } from "../../../core/settings-manager.js";
import { type TerminalTheme, type Theme } from "./theme.js";
type ThemeResult = {
    success: boolean;
    error?: string;
};
export declare class InteractiveThemeController {
    private readonly ui;
    private readonly getSettingsManager;
    private readonly showError;
    private readonly onChanged;
    private currentThemeSetting;
    private terminalTheme;
    private activeThemeName;
    private autoSyncEnabled;
    private terminalColorSchemeUnsubscribe;
    constructor(ui: TUI, options: {
        getSettingsManager: () => SettingsManager;
        showError: (message: string) => void;
        onChanged: () => void;
        initialThemeSetting?: string;
    });
    rebindTui(): void;
    applyFromSettings(): Promise<void>;
    getThemeSelection(): string | undefined;
    setThemeName(themeName: string, showError?: boolean): ThemeResult;
    setThemeSetting(themeSetting: string): Promise<void>;
    setThemeInstance(themeInstance: Theme): ThemeResult;
    preview(themeSettingOrName: string): void;
    disableAutoSync(): void;
    getTerminalTheme(): TerminalTheme;
    private applyThemeName;
    private notifyChanged;
    private setAutoSync;
    private bindTerminalColorSchemeListener;
    private applyTerminalTheme;
}
export {};
