import { Notice, Platform, Plugin, requestUrl } from "obsidian";
import type { LicensePlan, LicenseState, SRSettings } from "src/settings";
import { hasSupporterLicenseState } from "src/settings";
import {
    getArrayProp,
    getBooleanProp,
    getRecordProp,
    getStringProp,
    isRecord,
} from "src/util/typeGuards";

type FileSystemAdapterLike = {
    basePath: string;
};

type LicenseSettingsLike = Pick<
    SRSettings,
    "licenseKey" | "isPro" | "licenseInstallationId" | "licenseState"
>;

type LicenseVerificationPayload = {
    valid: boolean;
    token?: string;
    plan?: LicensePlan;
    features?: string[];
    error?: string;
};

type LicenseDiagnostics = {
    clientPlatform: string;
    clientVaultName: string;
    clientVaultPathHash: string | null;
};

function normalizeLicenseKey(input: string): string {
    return input.trim().toUpperCase();
}

function normalizeFeatureList(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return Array.from(
        new Set(
            value
                .filter((entry): entry is string => typeof entry === "string")
                .map((entry) => entry.trim())
                .filter((entry) => entry.length > 0),
        ),
    );
}

function parseLicenseVerificationPayload(value: unknown): LicenseVerificationPayload | null {
    if (!isRecord(value)) {
        return null;
    }

    const valid = getBooleanProp(value, "valid");
    if (valid === undefined) {
        return null;
    }

    const plan = getStringProp(value, "plan");

    return {
        valid,
        token: getStringProp(value, "token"),
        plan: plan === "supporter" ? "supporter" : undefined,
        features: normalizeFeatureList(getArrayProp(value, "features")),
        error: getStringProp(value, "error"),
    };
}

function parsePersistedSupporterAccess(pluginData: unknown): boolean {
    if (!isRecord(pluginData)) {
        return false;
    }

    const pluginSettings = getRecordProp(pluginData, "settings");
    if (!pluginSettings) {
        return false;
    }

    const licenseStateRecord = getRecordProp(pluginSettings, "licenseState");
    if (licenseStateRecord) {
        const token = getStringProp(licenseStateRecord, "token");
        const plan = getStringProp(licenseStateRecord, "plan");
        const features = normalizeFeatureList(getArrayProp(licenseStateRecord, "features"));
        if (token && (plan === "supporter" || features.includes("supporter"))) {
            return true;
        }
    }

    return getBooleanProp(pluginSettings, "isPro") === true;
}

function getClientPlatform(): string {
    if (Platform.isWin) return "Win32";
    if (Platform.isMacOS) return "MacIntel";
    if (Platform.isLinux) return "Linux";
    if (Platform.isMobile) return "Mobile";
    return "Unknown";
}

function createInstallationId(): string {
    if (typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32),
    ].join("-");
}

async function sha256Hex(value: string): Promise<string> {
    const encoded = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
        "",
    );
}

function createLicenseState(
    licenseKey: string,
    deviceId: string,
    payload: LicenseVerificationPayload,
    existingState: LicenseState | null,
): LicenseState {
    const timestamp = Date.now();
    const plan = payload.plan === "supporter" ? "supporter" : "supporter";
    const features = payload.features && payload.features.length > 0 ? payload.features : [plan];

    return {
        licenseKey,
        deviceId,
        token: payload.token ?? existingState?.token ?? "",
        plan,
        features,
        lastVerifiedAt: timestamp,
        activatedAt:
            existingState &&
            existingState.licenseKey === licenseKey &&
            existingState.deviceId === deviceId
                ? existingState.activatedAt
                : timestamp,
    };
}

export class LicenseManager {
    private static instance: LicenseManager | null = null;
    private plugin: Plugin;

    private readonly API_URL = "https://ob-syro.vercel.app";
    private readonly VERIFICATION_INTERVAL_DAYS = 7;

    private constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    static getInstance(plugin?: Plugin): LicenseManager {
        if (!LicenseManager.instance) {
            if (!plugin) {
                throw new Error(
                    "[LicenseManager] First initialization requires the plugin instance.",
                );
            }
            LicenseManager.instance = new LicenseManager(plugin);
        }
        return LicenseManager.instance;
    }

    private ensureInstallationId(
        settings: Pick<LicenseSettingsLike, "licenseInstallationId">,
    ): string {
        if (settings.licenseInstallationId) {
            return settings.licenseInstallationId;
        }

        const installationId = createInstallationId();
        settings.licenseInstallationId = installationId;
        return installationId;
    }

    private async collectDiagnostics(): Promise<LicenseDiagnostics> {
        const adapter = this.plugin.app.vault.adapter;
        const vaultName = this.plugin.app.vault.getName();
        let vaultPath = vaultName;

        if (adapter && "basePath" in adapter) {
            vaultPath = `${(adapter as FileSystemAdapterLike).basePath}/${vaultName}`;
        }

        return {
            clientPlatform: getClientPlatform(),
            clientVaultName: vaultName,
            clientVaultPathHash: vaultPath ? await sha256Hex(vaultPath) : null,
        };
    }

    private applyVerifiedLicense(
        settings: LicenseSettingsLike,
        licenseKey: string,
        deviceId: string,
        payload: LicenseVerificationPayload,
    ): void {
        const normalizedKey = normalizeLicenseKey(licenseKey);
        settings.licenseKey = normalizedKey;
        settings.licenseInstallationId = deviceId;
        settings.licenseState = createLicenseState(
            normalizedKey,
            deviceId,
            payload,
            settings.licenseState,
        );
        settings.isPro = hasSupporterLicenseState(settings.licenseState);
    }

    private clearLicenseState(
        settings: LicenseSettingsLike,
        options: { clearEnteredKey?: boolean } = {},
    ): void {
        settings.licenseState = null;
        settings.isPro = false;

        if (options.clearEnteredKey === true) {
            settings.licenseKey = "";
        }
    }

    private shouldVerify(state: LicenseState | null | undefined): boolean {
        if (!state?.lastVerifiedAt) {
            return true;
        }

        const daysSince = (Date.now() - state.lastVerifiedAt) / (1000 * 60 * 60 * 24);
        return daysSince >= this.VERIFICATION_INTERVAL_DAYS;
    }

    private async postVerificationRequest(
        licenseKey: string,
        deviceId: string,
        licenseState: LicenseState | null,
    ): Promise<LicenseVerificationPayload | null> {
        const diagnostics = await this.collectDiagnostics();
        const response = await requestUrl({
            url: `${this.API_URL}/api/verify`,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                ...(licenseState?.token ? { Authorization: `Bearer ${licenseState.token}` } : {}),
            },
            body: JSON.stringify({
                licenseKey,
                deviceId,
                isDeviceChanged: licenseState != null ? licenseState.deviceId !== deviceId : false,
                clientPlatform: diagnostics.clientPlatform,
                clientVaultName: diagnostics.clientVaultName,
                clientVaultPathHash: diagnostics.clientVaultPathHash,
            }),
        });

        return parseLicenseVerificationPayload(response.json as unknown);
    }

    async activateLicense(key: string, settings: LicenseSettingsLike): Promise<boolean> {
        try {
            const normalizedKey = normalizeLicenseKey(key);
            const deviceId = this.ensureInstallationId(settings);
            const payload = await this.postVerificationRequest(normalizedKey, deviceId, null);

            if (!payload?.valid || !payload.token) {
                return false;
            }

            this.applyVerifiedLicense(settings, normalizedKey, deviceId, payload);
            return true;
        } catch (error) {
            console.error("[LicenseManager] Failed to activate license:", error);
            return false;
        }
    }

    deactivateLicense(settings: LicenseSettingsLike): void {
        this.clearLicenseState(settings, { clearEnteredKey: true });
    }

    private async verifyWithServer(settings: LicenseSettingsLike): Promise<boolean> {
        const licenseState = settings.licenseState;
        const licenseKey = normalizeLicenseKey(
            licenseState?.licenseKey || settings.licenseKey || "",
        );

        if (!licenseState?.token || !licenseKey) {
            return false;
        }

        const deviceId = this.ensureInstallationId(settings);

        try {
            const payload = await this.postVerificationRequest(licenseKey, deviceId, licenseState);

            if (!payload?.valid || !payload.token) {
                this.clearLicenseState(settings, { clearEnteredKey: false });
                return false;
            }

            this.applyVerifiedLicense(settings, licenseKey, deviceId, payload);
            return true;
        } catch (error) {
            console.warn(
                "[LicenseManager] License verification is offline, keeping cached access.",
                error,
            );
            return hasSupporterLicenseState(settings.licenseState);
        }
    }

    async backgroundCheck(settings: LicenseSettingsLike): Promise<boolean> {
        if (!settings.licenseState?.token) {
            settings.isPro = false;
            return false;
        }

        if (!this.shouldVerify(settings.licenseState)) {
            settings.isPro = hasSupporterLicenseState(settings.licenseState);
            return settings.isPro;
        }

        return this.verifyWithServer(settings);
    }

    async checkFeatureAccess(featureName: string): Promise<boolean> {
        try {
            const pluginData = (await this.plugin.loadData()) as unknown;

            if (parsePersistedSupporterAccess(pluginData)) {
                return true;
            }

            new Notice(`🔒 「${featureName}」仅限 Supporter 使用`);
            return false;
        } catch {
            return false;
        }
    }
}
