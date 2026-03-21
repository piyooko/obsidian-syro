let applyDebounceTimer = 0;

export function applySettingsUpdate(callback: () => void): void {
    clearTimeout(applyDebounceTimer);
    applyDebounceTimer = window.setTimeout(callback, 512);
}
