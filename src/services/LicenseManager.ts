/**
 * 这个文件主要是干什么的：
 * 管理插件的"会员激活"功能。就像一个门禁系统的总控制台。
 * 它负责：生成设备唯一标识（指纹）、把用户输入的激活码发到服务器验证、
 * 定期检查会员是否还有效、以及提供一个"门禁检查"的方法给未来的付费功能使用。
 *
 * 它在项目中属于：逻辑层 / 服务 (Services)
 *
 * 它会用到哪些文件：
 * 1. src/settings.ts（读取和写入激活状态相关的设置）
 * 2. obsidian 的 Plugin、Notice、requestUrl（插件基础能力）
 *
 * 哪些文件会用到它：
 * 1. src/main.ts（插件启动时初始化和执行后台检测）
 * 2. src/ui/components/EmbeddedSettingsPanel.tsx（设置界面的激活操作）
 */

import { Notice, Plugin, requestUrl } from "obsidian";
import type { SRSettings } from "src/settings";

/**
 * License 管理器 —— 单例模式
 * 负责激活码验证、设备指纹生成、后台静默校验等核心逻辑
 */
export class LicenseManager {
    private static instance: LicenseManager | null = null;
    private plugin: Plugin;

    /** Vercel 后端地址（后续替换为你自己的部署地址） */
    private readonly API_URL = "https://plugin-auth-api.vercel.app";

    /** 联网验证间隔（天） */
    private readonly VERIFICATION_INTERVAL_DAYS = 7;

    private constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    /**
     * 获取单例实例
     * @param plugin 插件实例（仅首次调用时必须传入）
     */
    static getInstance(plugin?: Plugin): LicenseManager {
        if (!LicenseManager.instance) {
            if (!plugin) {
                throw new Error("[LicenseManager] 首次调用必须传入 plugin 实例");
            }
            LicenseManager.instance = new LicenseManager(plugin);
        }
        return LicenseManager.instance;
    }

    // ========================================
    // 设备指纹
    // ========================================

    /**
     * 生成设备唯一标识（Vault ID）
     * 基于笔记库路径 + 平台信息的 SHA-256 哈希
     * 首次生成后保存到 settings，后续直接读取
     */
    async generateVaultId(settings: SRSettings): Promise<string> {
        // 如果之前已经生成过，直接返回
        if (settings.vaultId) {
            return settings.vaultId;
        }

        try {
            // 获取笔记库路径信息
            const adapter = this.plugin.app.vault.adapter;
            let vaultPath = this.plugin.app.vault.getName();
            if (adapter && "basePath" in adapter) {
                vaultPath = (adapter as any).basePath + "/" + vaultPath;
            }
            const platform = navigator.platform || "";

            // 组合因素并做 SHA-256 哈希
            const vaultInfo = [vaultPath, platform].join("|");
            const encoder = new TextEncoder();
            const data = encoder.encode(vaultInfo);
            const hashBuffer = await crypto.subtle.digest("SHA-256", data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const vaultId = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

            return vaultId;
        } catch (error) {
            // 出错时回退到简单哈希
            console.warn("[LicenseManager] generateVaultId 出错，使用回退方案", error);
            const vaultPath = this.plugin.app.vault.getName();
            const encoder = new TextEncoder();
            const data = encoder.encode(vaultPath);
            const hashBuffer = await crypto.subtle.digest("SHA-256", data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
        }
    }

    // ========================================
    // 激活 / 解绑
    // ========================================

    /**
     * 激活 License
     * 将用户输入的 Key 和设备指纹发给服务器验证
     * @returns 是否激活成功
     */
    async activateLicense(key: string, settings: SRSettings): Promise<boolean> {
        try {
            const vaultId = await this.generateVaultId(settings);

            const response = await requestUrl({
                url: `${this.API_URL}/api/verify`,
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({
                    licenseKey: key,
                    deviceId: vaultId,
                }),
            });

            const data = response.json;

            if (data.valid) {
                // 激活成功，更新本地设置
                settings.licenseKey = key;
                settings.isPro = true;
                settings.vaultId = vaultId;
                settings.licenseToken = data.token || "";
                settings.lastVerification = Date.now();
                return true;
            }

            return false;
        } catch (error) {
            console.error("[LicenseManager] activateLicense 失败:", error);
            return false;
        }
    }

    /**
     * 解绑 License
     * 清除本地所有激活凭证，恢复为免费版
     */
    deactivateLicense(settings: SRSettings): void {
        settings.licenseKey = "";
        settings.isPro = false;
        settings.licenseToken = "";
        settings.lastVerification = 0;
        // 注意：vaultId 不清除，因为它是设备指纹，下次激活还会用到
    }

    // ========================================
    // 验证
    // ========================================

    /**
     * 联网验证当前 License 是否仍然有效
     * @returns 是否有效
     */
    private async verifyWithServer(settings: SRSettings): Promise<boolean> {
        try {
            const vaultId = await this.generateVaultId(settings);

            const response = await requestUrl({
                url: `${this.API_URL}/api/verify`,
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    Authorization: `Bearer ${settings.licenseToken}`,
                },
                body: JSON.stringify({
                    licenseKey: settings.licenseKey,
                    deviceId: vaultId,
                }),
            });

            const result = response.json;

            if (result && result.valid) {
                // 刷新验证时间和 token
                settings.licenseToken = result.token || settings.licenseToken;
                settings.vaultId = vaultId;
                settings.lastVerification = Date.now();
                return true;
            }

            return false;
        } catch (error) {
            // 网络错误时，如果本地有 token，宽容处理（不立即降级）
            console.warn("[LicenseManager] verifyWithServer 网络错误，保持当前状态", error);
            return !!settings.licenseToken;
        }
    }

    /**
     * 判断是否需要重新联网验证
     */
    private shouldVerify(settings: SRSettings): boolean {
        if (!settings.lastVerification) return true;
        const daysSince = (Date.now() - settings.lastVerification) / (1000 * 60 * 60 * 24);
        return daysSince >= this.VERIFICATION_INTERVAL_DAYS;
    }

    /**
     * 后台静默检测
     * 用于插件启动时偷偷验一下，失效就悄悄降级，不弹窗打扰用户
     * @returns 是否仍然有效
     */
    async backgroundCheck(settings: SRSettings): Promise<boolean> {
        // 没有 token 就不需要检测
        if (!settings.licenseToken) {
            return false;
        }

        // 不到验证周期就不联网
        if (!this.shouldVerify(settings)) {
            return settings.isPro;
        }

        // 联网验证
        const isValid = await this.verifyWithServer(settings);
        if (!isValid && settings.isPro) {
            // 服务器明确拒绝（非网络错误），悄悄降级
            settings.isPro = false;
        }
        return isValid;
    }

    /**
     * 校验 vaultId 是否与本机指纹匹配
     * 用于防止用户复制别人的 data.json 来破解
     * 如果不匹配，强制降级
     */
    async verifyVaultId(settings: SRSettings): Promise<void> {
        if (!settings.isPro || !settings.vaultId) return;

        try {
            // 重新生成当前机器的指纹
            const adapter = this.plugin.app.vault.adapter;
            let vaultPath = this.plugin.app.vault.getName();
            if (adapter && "basePath" in adapter) {
                vaultPath = (adapter as any).basePath + "/" + vaultPath;
            }
            const platform = navigator.platform || "";
            const vaultInfo = [vaultPath, platform].join("|");

            const encoder = new TextEncoder();
            const data = encoder.encode(vaultInfo);
            const hashBuffer = await crypto.subtle.digest("SHA-256", data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const currentVaultId = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

            // 与保存的指纹比对
            if (currentVaultId !== settings.vaultId) {
                console.warn("[LicenseManager] vaultId 不匹配，强制降级");
                settings.isPro = false;
                settings.licenseToken = "";
                settings.lastVerification = 0;
            }
        } catch {
            // 校验出错不做处理，避免误伤
        }
    }

    // ========================================
    // 门禁（预留给未来功能）
    // ========================================

    /**
     * 通用门禁检查方法
     * 未来给新付费功能用的。目前不被任何现有功能调用。
     *
     * 用法示例（未来）：
     *   if (!await LicenseManager.getInstance().checkFeatureAccess('AI 助手')) return;
     *
     * @param featureName 功能名称（用于提示信息）
     * @returns 是否有权限使用该功能
     */
    async checkFeatureAccess(featureName: string): Promise<boolean> {
        try {
            // 通过 plugin 拿到最新的 settings
            const pluginData = await this.plugin.loadData();
            const isPro = pluginData?.settings?.isPro ?? false;

            if (isPro) {
                return true;
            }

            // 没有权限，弹出友好提示
            new Notice(`🔒 「${featureName}」仅限 Supporter 使用`);
            return false;
        } catch {
            return false;
        }
    }
}
