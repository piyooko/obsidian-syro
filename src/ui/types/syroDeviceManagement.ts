export type SyroDeviceCardStatus = "current" | "needs-sync" | "up-to-date" | "idle" | "no-session";

export type SyroInvalidDeviceReason =
    | "missing-device-json"
    | "invalid-device-json"
    | "unreadable-device-json";

export interface SyroDeviceCardState {
    deviceId: string;
    deviceName: string;
    isCurrent: boolean;
    footprintBytes: number;
    reviewCount: number;
    lastSeenAt: string | null;
    latestSessionAt: string | null;
    lastPulledIntoCurrentAt: string | null;
    inactiveDays: number | null;
    status: SyroDeviceCardStatus;
    canRename: boolean;
    canPullToCurrent: boolean;
    canDelete: boolean;
}

export interface SyroInvalidDeviceCardState {
    deviceFolderName: string;
    footprintBytes: number;
    reviewCount: number;
    lastSeenAt: string | null;
    invalidReason: SyroInvalidDeviceReason;
    files: string[];
    folders: string[];
    canDelete: boolean;
}

export interface SyroDeviceManagementViewState {
    currentDevice: SyroDeviceCardState | null;
    devices: SyroDeviceCardState[];
    invalidDevices: SyroInvalidDeviceCardState[];
    hasPendingAction: boolean;
    readOnlyReason: string | null;
}
