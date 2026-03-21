import { Platform } from "obsidian";

export function getPlatformFingerprint(): string {
    if (Platform.isIosApp) {
        return "ios";
    }

    if (Platform.isAndroidApp) {
        return "android";
    }

    if (Platform.isMobileApp) {
        return "mobile-app";
    }

    if (Platform.isMobile) {
        return "mobile";
    }

    if (Platform.isDesktopApp) {
        return "desktop";
    }

    return "unknown";
}

export function isCompactMobilePlatform(): boolean {
    return Platform.isMobile || Platform.isMobileApp || Platform.isIosApp || Platform.isAndroidApp;
}
