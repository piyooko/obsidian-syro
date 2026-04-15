/**
 * 这个文件主要是干什么的：
 * 这个文件画出了插件的“设置中心”大面板。
 * 用户可以在这里看到五个分类，用来调整各种选项，比如卡片怎么复习、界面长什么样等。
 * 里面还加了一个新机制：当用户是免费版时，它会把支持者专属选项做成轻量标识，避免误触开启。
 *
 * 它在项目中属于：界面层
 *
 * 它会用到哪些文件：
 * 1. src/ui/types/settingsTypes.ts — 说明了系统能存什么偏好设置
 * 2. src/ui/components/common/SettingsComponents.tsx — 画出了各种开关、输入框等小组件
 * 3. src/services/LicenseManager.ts — 用来验证用户的激活码是不是对的
 * 4. src/lang/helpers.ts — 用来显示中国话、外国话等不同的文字
 *
 * 哪些文件会用到它：
 * 1. src/ui/ReactSettingsModal.tsx — 负责把本文件画好的这块面板放进一个弹窗里显示出来
 */
/** @jsxImportSource react */
import { Notice } from "obsidian";
import React, { useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
    ArrowDownToLine,
    Check,
    Cpu,
    FileText,
    Layout,
    Pencil,
    Shield,
    Trash2,
    X,
} from "lucide-react";
import { t } from "src/lang/helpers";
import {
    MAX_CLOZE_CONTEXT_SOFT_LIMIT_LINES,
    MIN_CLOZE_CONTEXT_SOFT_LIMIT_LINES,
} from "src/settings/clozeContext";
import type {
    SyroDeviceCardState,
    SyroDeviceCardStatus,
    SyroDeviceManagementViewState,
    SyroInvalidDeviceCardState,
    SyroInvalidDeviceReason,
} from "src/ui/types/syroDeviceManagement";
import { UISettingsState } from "../types/settingsTypes";
import {
    Section,
    ToggleRow,
    InputRow,
    TextAreaRow,
    SelectRow,
    ColorPickerRow,
    SliderRow,
    ActionRow,
} from "./common/SettingsComponents";
import { useMobileNavbarOffset } from "./useMobileNavbarOffset";

// ==========================================
// 辅助组件：支持者标识
// ==========================================
const SupporterDiamond = () => (
    <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        aria-hidden="true"
        className="sr-supporter-diamond"
    >
        <rect x="2.2" y="2.2" width="5.6" height="5.6" rx="0.9" transform="rotate(45 5 5)" />
    </svg>
);

const LabelWithBadge = ({
    label,
    badgeText,
    badgeAriaLabel,
}: {
    label: string;
    badgeText: string;
    badgeAriaLabel: string;
}) => (
    <span className="sr-supporter-label-wrap">
        <span>{label}</span>
        <span className="sr-supporter-badge" aria-label={badgeAriaLabel}>
            <SupporterDiamond />
            <span>{badgeText}</span>
        </span>
    </span>
);

const LabelWithSupporter = ({ label, isLocked }: { label: string; isLocked: boolean }) =>
    isLocked ? (
        <LabelWithBadge
            label={label}
            badgeText={t("SETTINGS_SUPPORTER_BADGE")}
            badgeAriaLabel={t("SETTINGS_SUPPORTER_BADGE")}
        />
    ) : (
        <span>{label}</span>
    );

const LabelWithLab = ({ label }: { label: string }) => (
    <LabelWithBadge
        label={label}
        badgeText={t("SETTINGS_LAB_BADGE").toUpperCase()}
        badgeAriaLabel={t("SETTINGS_LAB_BADGE_ARIA")}
    />
);

// ==========================================
// 辅助组件：伪 LaTeX 渲染器 (CSS 模拟)
// ==========================================
const MathText: React.FC<{ children: React.ReactNode; block?: boolean }> = ({
    children,
    block,
}) => (
    <span
        style={{
            fontFamily: '"Times New Roman", Times, serif',
            fontSize: "1.1em",
            fontStyle: "normal",
            letterSpacing: "0.02em",
            display: block ? "block" : "inline",
            whiteSpace: "nowrap",
        }}
    >
        {children}
    </span>
);

const MVar: React.FC<{ children: React.ReactNode; highlight?: boolean }> = ({
    children,
    highlight,
}) => (
    <span
        style={{
            fontStyle: "italic",
            marginRight: "1px",
            color: highlight ? "var(--text-accent)" : "inherit",
            transition: "color 0.3s ease",
        }}
    >
        {children}
    </span>
);

const MFunc: React.FC<{ children: string }> = ({ children }) => (
    <span style={{ fontStyle: "normal" }}>{children}</span>
);

const MNum: React.FC<{ children: number | string; highlight?: boolean }> = ({
    children,
    highlight,
}) => (
    <span
        style={{
            color: highlight ? "var(--text-accent)" : "inherit",
            transition: "color 0.3s ease",
        }}
    >
        {children}
    </span>
);

// ==========================================
// 标签页定义
// ==========================================
const SpacedIcon = ({ size = 24, className = "" }: { size?: number; className?: string }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="currentColor"
        className={className}
        style={{ display: "block" }} // 确保 SVG 表现正常
    >
        <path
            fill="currentColor"
            stroke="currentColor"
            d="M 88.960938 17.257812 L 47.457031 17.257812 C 45.679688 17.257812 44.230469 18.703125 44.230469 20.484375 L 44.230469 86.558594 C 44.230469 88.335938 45.679688 89.785156 47.457031 89.785156 L 88.960938 89.785156 C 90.738281 89.785156 92.1875 88.335938 92.1875 86.558594 L 92.1875 20.484375 C 92.1875 18.703125 90.738281 17.257812 88.960938 17.257812 Z M 88.28125 85.878906 L 48.136719 85.878906 L 48.136719 21.164062 L 88.28125 21.164062 Z M 88.28125 85.878906 "
        />
        <path
            fill="currentColor"
            stroke="currentColor"
            d="M 88.960938 9.445312 L 61.667969 9.445312 C 59.925781 3.816406 54.011719 0.515625 48.269531 2.054688 L 8.183594 12.796875 C 2.304688 14.371094 -1.199219 20.4375 0.378906 26.316406 L 17.476562 90.140625 C 18.796875 95.066406 23.269531 98.324219 28.144531 98.324219 C 29.085938 98.324219 30.046875 98.199219 31 97.945312 L 40.765625 95.328125 C 42.625 96.75 44.941406 97.597656 47.457031 97.597656 L 88.960938 97.597656 C 95.046875 97.597656 100 92.644531 100 86.558594 L 100 20.484375 C 100 14.398438 95.046875 9.445312 88.960938 9.445312 Z M 29.988281 94.171875 C 26.1875 95.191406 22.269531 92.925781 21.25 89.128906 L 4.152344 25.304688 C 3.132812 21.507812 5.394531 17.585938 9.195312 16.570312 L 49.28125 5.828125 C 52.578125 4.945312 55.960938 6.53125 57.464844 9.445312 L 47.457031 9.445312 C 41.371094 9.445312 36.417969 14.398438 36.417969 20.484375 L 36.417969 86.558594 C 36.417969 88.558594 36.957031 90.433594 37.890625 92.054688 Z M 96.09375 86.558594 C 96.09375 90.492188 92.894531 93.691406 88.960938 93.691406 L 47.457031 93.691406 C 43.523438 93.691406 40.324219 90.492188 40.324219 86.558594 L 40.324219 20.484375 C 40.324219 16.550781 43.523438 13.351562 47.457031 13.351562 L 88.960938 13.351562 C 92.894531 13.351562 96.09375 16.550781 96.09375 20.484375 Z M 96.09375 86.558594 "
        />
        <path
            fill="currentColor"
            stroke="currentColor"
            d="M 54.101562 53.09375 L 60.070312 57.410156 L 57.789062 64.378906 C 56.90625 67.074219 59.996094 69.320312 62.285156 67.648438 L 68.210938 63.324219 L 74.132812 67.648438 C 76.421875 69.320312 79.511719 67.074219 78.628906 64.378906 L 76.347656 57.410156 L 82.320312 53.09375 C 84.613281 51.433594 83.441406 47.804688 80.605469 47.804688 L 73.242188 47.804688 L 70.988281 40.839844 C 70.117188 38.144531 66.300781 38.144531 65.429688 40.839844 L 63.179688 47.804688 L 55.8125 47.804688 C 52.980469 47.804688 51.804688 51.433594 54.101562 53.09375 Z M 54.101562 53.09375 "
        />
    </svg>
);

const SyncTabIcon = ({ size = 16, className = "" }: { size?: number; className?: string }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={{ display: "block" }}
    >
        <path d="M18.6 8.11A7 7 0 0 0 6.12 9" />
        <path d="M5 5v4h4" />
        <path d="M5.4 15.89A7 7 0 0 0 17.88 15" />
        <path d="M19 19v-4h-4" />
    </svg>
);

// ==========================================
// 标签页定义
// ==========================================
const TABS = [
    { id: "flashcards", label: t("SETTINGS_TAB_FLASHCARDS"), icon: <SpacedIcon size={16} /> },
    { id: "notes", label: t("SETTINGS_TAB_NOTES"), icon: <FileText size={16} /> },
    { id: "algo", label: t("SETTINGS_TAB_ALGORITHM"), icon: <Cpu size={16} /> },
    { id: "ui", label: t("SETTINGS_TAB_INTERFACE"), icon: <Layout size={16} /> },
    { id: "sync", label: t("SETTINGS_TAB_SYNC"), icon: <SyncTabIcon size={16} /> },
    { id: "license", label: t("SETTINGS_TAB_LICENSE"), icon: <Shield size={16} /> },
];

type TabId = (typeof TABS)[number]["id"];

const TAB_IDS: TabId[] = TABS.map((tab) => tab.id);
const TAB_HEADER_DRAG_THRESHOLD = 10;
const TAB_CLICK_SUPPRESS_MS = 250;
const CONTENT_SWIPE_ACTIVATION_THRESHOLD = 24;
const CONTENT_SWIPE_SWITCH_THRESHOLD = 56;
const CONTENT_SWIPE_RATIO = 1.2;
const CONTENT_SWIPE_ANIMATION_MS = 220;
const CONTENT_SWIPE_EDGE_RESISTANCE = 0.18;
const CONTENT_SWIPE_EXCLUDED_SELECTOR =
    'button, .checkbox-container, input[type="checkbox"], input[type="text"], input[type="number"], textarea, select, input[type="range"], input[type="color"]';

function getAdjacentTabId(currentTab: TabId, direction: -1 | 1): TabId {
    const currentIndex = TAB_IDS.indexOf(currentTab);
    if (currentIndex === -1) {
        return currentTab;
    }

    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= TAB_IDS.length) {
        return currentTab;
    }

    return TAB_IDS[nextIndex];
}

function isSwipeGestureExcludedTarget(target: EventTarget | null): boolean {
    return (
        target instanceof Element &&
        (target.closest(CONTENT_SWIPE_EXCLUDED_SELECTOR) !== null ||
            target.closest(".sr-style-setting-header") !== null)
    );
}

function isMobileSettingsLayout(): boolean {
    if (typeof document === "undefined") {
        return false;
    }

    return (
        document.body.classList.contains("is-mobile") ||
        document.documentElement.classList.contains("is-mobile")
    );
}

// ==========================================
// Props 接口
// ==========================================
interface EmbeddedSettingsPanelProps {
    settings: UISettingsState;
    onSettingsChange: (newSettings: UISettingsState) => void;
    loadSyroDeviceManagement?: () => Promise<SyroDeviceManagementViewState>;
    onSyroRenameCurrentDevice?: (deviceName: string) => Promise<void>;
    onSyroPullToCurrentDevice?: (deviceId: string) => Promise<void>;
    onSyroDeleteValidDevice?: (deviceId: string) => Promise<void>;
    onSyroOpenRecovery?: () => Promise<void>;
    onSyroDeleteInvalidDevice?: (deviceFolderName: string) => Promise<void>;
    version?: string;
}

interface TabProps {
    settings: UISettingsState;
    onChange: <K extends keyof UISettingsState>(key: K, value: UISettingsState[K]) => void;
}

interface SyncTabProps extends TabProps {
    deviceManagement: SyroDeviceManagementViewState | null;
    deviceManagementLoading: boolean;
    deviceManagementError: string | null;
    reloadDeviceManagement?: () => Promise<void>;
    onRenameCurrentDevice?: (deviceName: string) => Promise<void>;
    onPullToCurrentDevice?: (deviceId: string) => Promise<void>;
    onDeleteValidDevice?: (deviceId: string) => Promise<void>;
    onOpenRecovery?: () => Promise<void>;
    onDeleteInvalidDevice?: (deviceFolderName: string) => Promise<void>;
}

const getClozeContextModeDesc = (mode: string) => {
    switch (mode) {
        case "double-break":
            return t("SETTINGS_CLOZE_CONTEXT_DOUBLE_BREAK_DESC");
        case "expanded":
            return t("SETTINGS_CLOZE_CONTEXT_EXPANDED_DESC");
        case "full":
            return t("SETTINGS_CLOZE_CONTEXT_FULL_DESC");
        case "single":
        default:
            return t("SETTINGS_CLOZE_CONTEXT_SINGLE_DESC");
    }
};

const getInvalidDeviceReasonLabel = (reason: SyroInvalidDeviceReason): string => {
    switch (reason) {
        case "missing-device-json":
            return t("SETTINGS_SYNC_INVALID_REASON_MISSING_DEVICE_JSON");
        case "invalid-device-json":
            return t("SETTINGS_SYNC_INVALID_REASON_INVALID_DEVICE_JSON");
        case "unreadable-device-json":
        default:
            return t("SETTINGS_SYNC_INVALID_REASON_UNREADABLE_DEVICE_JSON");
    }
};

const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, {
    numeric: "auto",
});
const absoluteTimeFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
});

function formatRelativeTimestamp(isoTime: string | null): string {
    if (!isoTime) {
        return t("SETTINGS_SYNC_DEVICE_NEVER");
    }

    const parsed = Date.parse(isoTime);
    if (!Number.isFinite(parsed)) {
        return t("SETTINGS_SYNC_DEVICE_NEVER");
    }

    const diffSeconds = Math.round((parsed - Date.now()) / 1000);
    const absSeconds = Math.abs(diffSeconds);

    if (absSeconds < 60) {
        return relativeTimeFormatter.format(diffSeconds, "second");
    }
    if (absSeconds < 3600) {
        return relativeTimeFormatter.format(Math.round(diffSeconds / 60), "minute");
    }
    if (absSeconds < 86400) {
        return relativeTimeFormatter.format(Math.round(diffSeconds / 3600), "hour");
    }

    return relativeTimeFormatter.format(Math.round(diffSeconds / 86400), "day");
}

function formatAbsoluteTimestamp(isoTime: string | null): string {
    if (!isoTime) {
        return t("SETTINGS_SYNC_DEVICE_NEVER");
    }

    const parsed = Date.parse(isoTime);
    if (!Number.isFinite(parsed)) {
        return t("SETTINGS_SYNC_DEVICE_NEVER");
    }

    return absoluteTimeFormatter.format(parsed);
}

function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return "0 B";
    }

    if (bytes < 1024) {
        return `${Math.round(bytes)} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
    }
    if (bytes < 1024 * 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
    }

    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatInactiveDays(days: number | null): string {
    if (days === null) {
        return t("SETTINGS_SYNC_DEVICE_NEVER");
    }

    return t("SETTINGS_SYNC_DEVICE_INACTIVE_DAYS_VALUE", {
        days: String(days),
    });
}

function getDeviceStatusLabel(status: SyroDeviceCardStatus): string {
    switch (status) {
        case "current":
            return t("SETTINGS_SYNC_CURRENT_DEVICE_BADGE");
        case "needs-sync":
            return t("SETTINGS_SYNC_DEVICE_STATUS_NEEDS_SYNC");
        case "idle":
            return t("SETTINGS_SYNC_DEVICE_STATUS_IDLE");
        case "no-session":
            return t("SETTINGS_SYNC_DEVICE_STATUS_NO_SESSION");
        case "up-to-date":
        default:
            return t("SETTINGS_SYNC_DEVICE_STATUS_UP_TO_DATE");
    }
}

const InlineMetric: React.FC<{
    label: string;
    value: string;
    title?: string;
}> = ({ label, value, title }) => (
    <span className="sr-device-inline-metric" title={title}>
        <span className="sr-device-inline-metric-label">{label}: </span>
        <span className="sr-device-inline-metric-value">
            {value}
        </span>
    </span>
);

const MetricDivider = () => <span className="sr-device-inline-metric-divider">•</span>;

interface DeviceActionTooltipPosition {
    top: number;
    left: number;
    arrowCenterX: number;
    placement: "above" | "below";
}

const DEVICE_ACTION_TOOLTIP_VIEWPORT_PADDING = 8;
const DEVICE_ACTION_TOOLTIP_GAP = 10;
const DEVICE_ACTION_TOOLTIP_ARROW_SIZE = 8;
const DEVICE_ACTION_TOOLTIP_ARROW_PADDING = 10;

const DeviceActionTooltip: React.FC<{
    anchorEl: HTMLButtonElement | null;
    label: string;
    visible: boolean;
}> = ({ anchorEl, label, visible }) => {
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<DeviceActionTooltipPosition | null>(null);

    const updatePosition = useCallback(() => {
        if (!anchorEl || !tooltipRef.current) {
            return;
        }

        const rect = anchorEl.getBoundingClientRect();
        const tooltipEl = tooltipRef.current;
        const tooltipWidth = tooltipEl.offsetWidth || 0;
        const tooltipHeight = tooltipEl.offsetHeight || 0;
        const unclampedLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
        const left = Math.min(
            Math.max(unclampedLeft, DEVICE_ACTION_TOOLTIP_VIEWPORT_PADDING),
            Math.max(
                DEVICE_ACTION_TOOLTIP_VIEWPORT_PADDING,
                window.innerWidth - DEVICE_ACTION_TOOLTIP_VIEWPORT_PADDING - tooltipWidth,
            ),
        );
        const anchorCenterX = rect.left + rect.width / 2;
        const minArrowCenterX =
            DEVICE_ACTION_TOOLTIP_ARROW_PADDING + DEVICE_ACTION_TOOLTIP_ARROW_SIZE / 2;
        const maxArrowCenterX = Math.max(
            minArrowCenterX,
            tooltipWidth -
                DEVICE_ACTION_TOOLTIP_ARROW_PADDING -
                DEVICE_ACTION_TOOLTIP_ARROW_SIZE / 2,
        );
        const arrowCenterX = Math.min(
            Math.max(anchorCenterX - left, minArrowCenterX),
            maxArrowCenterX,
        );
        const aboveTop = rect.top - tooltipHeight - DEVICE_ACTION_TOOLTIP_GAP;
        const belowTop = rect.bottom + DEVICE_ACTION_TOOLTIP_GAP;
        const placeAbove =
            aboveTop >= DEVICE_ACTION_TOOLTIP_VIEWPORT_PADDING ||
            belowTop + tooltipHeight >
                window.innerHeight - DEVICE_ACTION_TOOLTIP_VIEWPORT_PADDING;
        const top = placeAbove
            ? Math.max(DEVICE_ACTION_TOOLTIP_VIEWPORT_PADDING, aboveTop)
            : Math.min(
                  window.innerHeight -
                      DEVICE_ACTION_TOOLTIP_VIEWPORT_PADDING -
                      tooltipHeight,
                  belowTop,
              );

        setPosition({
            top,
            left,
            arrowCenterX,
            placement: placeAbove ? "above" : "below",
        });
    }, [anchorEl]);

    useLayoutEffect(() => {
        if (!visible || !anchorEl) {
            setPosition(null);
            return;
        }

        const syncPosition = () => {
            window.requestAnimationFrame(updatePosition);
        };

        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);

        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
        };
    }, [anchorEl, updatePosition, visible]);

    if (!visible || !anchorEl) {
        return null;
    }

    return createPortal(
        <div
            ref={tooltipRef}
            className={`sr-device-action-tooltip ${position?.placement === "below" ? "is-below" : "is-above"}`}
            role="tooltip"
            style={{
                position: "fixed",
                top: position ? `${position.top}px` : "0px",
                left: position ? `${position.left}px` : "0px",
                opacity: position ? 1 : 0,
                ["--sr-device-action-tooltip-arrow-center-x" as string]: position
                    ? `${position.arrowCenterX}px`
                    : undefined,
            }}
        >
            {label}
            <div className="sr-device-action-tooltip-arrow" />
        </div>,
        document.body,
    );
};

const IconActionButton: React.FC<{
    icon: React.ElementType;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    destructive?: boolean;
}> = ({ icon: Icon, label, onClick, disabled, destructive }) => {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [isTooltipVisible, setIsTooltipVisible] = useState(false);

    const showTooltip = useCallback(() => {
        if (!disabled) {
            setIsTooltipVisible(true);
        }
    }, [disabled]);

    const hideTooltip = useCallback(() => {
        setIsTooltipVisible(false);
    }, []);

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                className={[
                    "sr-device-action-button",
                    destructive ? "is-destructive" : "",
                ]
                    .filter(Boolean)
                    .join(" ")}
                onClick={onClick}
                onMouseEnter={showTooltip}
                onMouseLeave={hideTooltip}
                onFocus={showTooltip}
                onBlur={hideTooltip}
                disabled={disabled}
            >
                <Icon size={15} aria-hidden="true" />
                <span className="sr-screen-reader-only">{label}</span>
            </button>
            <DeviceActionTooltip
                anchorEl={buttonRef.current}
                label={label}
                visible={isTooltipVisible}
            />
        </>
    );
};

const DeviceCard: React.FC<{
    device: SyroDeviceCardState;
    isReadOnly: boolean;
    isBusy: boolean;
    isEditingName: boolean;
    renameValue: string;
    renameConfirmDisabled: boolean;
    onRenameValueChange: (value: string) => void;
    onStartRename: () => void;
    onCancelRename: () => void;
    onConfirmRename: () => void;
    onPullToCurrent: () => void;
    onDeleteDevice: () => void;
}> = ({
    device,
    isReadOnly,
    isBusy,
    isEditingName,
    renameValue,
    renameConfirmDisabled,
    onRenameValueChange,
    onStartRename,
    onCancelRename,
    onConfirmRename,
    onPullToCurrent,
    onDeleteDevice,
}) => (
    <div className="setting-item sr-device-flat-item">
        <div className="setting-item-info">
            <div className="setting-item-name sr-device-flat-title">
                {device.isCurrent && isEditingName ? (
                    <input
                        className="sr-input-compact sr-device-inline-rename-input"
                        value={renameValue}
                        onChange={(event) => onRenameValueChange(event.target.value)}
                        aria-label={t("SETTINGS_SYNC_INLINE_RENAME")}
                        disabled={isReadOnly || isBusy}
                        autoFocus
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                onConfirmRename();
                            } else if (event.key === "Escape") {
                                event.preventDefault();
                                onCancelRename();
                            }
                        }}
                    />
                ) : (
                    <span>{device.deviceName}</span>
                )}
                <span
                    className={[
                        "sr-supporter-badge",
                        "sr-device-inline-badge",
                        device.isCurrent ? "is-current" : `is-${device.status}`,
                    ].join(" ")}
                >
                    {device.isCurrent
                        ? t("SETTINGS_SYNC_CURRENT_DEVICE_BADGE")
                        : getDeviceStatusLabel(device.status)}
                </span>
            </div>
            <div className="setting-item-description sr-device-inline-metrics">
                <InlineMetric
                    label={t("SETTINGS_SYNC_DEVICE_SIZE")}
                    value={formatBytes(device.footprintBytes)}
                    title={`${device.footprintBytes} B`}
                />
                <MetricDivider />
                <InlineMetric
                    label={t("SETTINGS_SYNC_DEVICE_LAST_SEEN")}
                    value={formatRelativeTimestamp(device.lastSeenAt)}
                    title={formatAbsoluteTimestamp(device.lastSeenAt)}
                />
                <MetricDivider />
                <InlineMetric
                    label={t("SETTINGS_SYNC_DEVICE_LATEST_SESSION")}
                    value={formatRelativeTimestamp(device.latestSessionAt)}
                    title={formatAbsoluteTimestamp(device.latestSessionAt)}
                />
                {!device.isCurrent ? (
                    <>
                        <MetricDivider />
                        <InlineMetric
                            label={t("SETTINGS_SYNC_DEVICE_LAST_PULL")}
                            value={formatRelativeTimestamp(device.lastPulledIntoCurrentAt)}
                            title={formatAbsoluteTimestamp(device.lastPulledIntoCurrentAt)}
                        />
                    </>
                ) : null}
                <MetricDivider />
                <InlineMetric
                    label={t("SETTINGS_SYNC_DEVICE_INACTIVE_DAYS")}
                    value={formatInactiveDays(device.inactiveDays)}
                />
            </div>
        </div>
        <div className="setting-item-control">
            {device.canRename ? (
                isEditingName ? (
                    <>
                        <IconActionButton
                            icon={Check}
                            label={t("SETTINGS_SYNC_SAVE_DEVICE_NAME")}
                            onClick={onConfirmRename}
                            disabled={isReadOnly || isBusy || renameConfirmDisabled}
                        />
                        <IconActionButton
                            icon={X}
                            label={t("SETTINGS_SYNC_CANCEL_RENAME")}
                            onClick={onCancelRename}
                            disabled={isBusy}
                        />
                    </>
                ) : (
                    <IconActionButton
                        icon={Pencil}
                        label={t("SETTINGS_SYNC_INLINE_RENAME")}
                        onClick={onStartRename}
                        disabled={isReadOnly || isBusy}
                    />
                )
            ) : null}
            {device.canPullToCurrent ? (
                <IconActionButton
                    icon={ArrowDownToLine}
                    label={t("SETTINGS_SYNC_PULL_TO_CURRENT")}
                    onClick={onPullToCurrent}
                    disabled={isReadOnly || isBusy}
                />
            ) : null}
            {device.canDelete ? (
                <IconActionButton
                    icon={Trash2}
                    label={t("SETTINGS_SYNC_DELETE_DEVICE")}
                    onClick={onDeleteDevice}
                    disabled={isReadOnly || isBusy}
                    destructive
                />
            ) : null}
        </div>
    </div>
);

const InvalidDeviceCard: React.FC<{
    device: SyroInvalidDeviceCardState;
    isReadOnly: boolean;
    isBusy: boolean;
    onDelete: () => void;
}> = ({ device, isReadOnly, isBusy, onDelete }) => (
    <div className="setting-item sr-device-flat-item">
        <div className="setting-item-info">
            <div className="setting-item-name sr-device-flat-title">
                <span>{device.deviceFolderName}</span>
                <span className="sr-supporter-badge sr-device-inline-badge is-invalid">
                    {t("SETTINGS_SYNC_INVALID_DEVICE_BADGE")}
                </span>
            </div>
            <div className="setting-item-description sr-device-inline-metrics">
                <span className="sr-device-inline-alert">
                    {t("SETTINGS_SYNC_INVALID_DEVICE_REASON")}:{" "}
                    {getInvalidDeviceReasonLabel(device.invalidReason)}
                </span>
            </div>
            <div className="setting-item-description sr-device-inline-metrics sr-device-inline-secondary">
                <InlineMetric
                    label={t("SETTINGS_SYNC_DEVICE_SIZE")}
                    value={formatBytes(device.footprintBytes)}
                    title={`${device.footprintBytes} B`}
                />
                <MetricDivider />
                <InlineMetric
                    label={t("SETTINGS_SYNC_INVALID_DEVICE_FILES")}
                    value={[...device.files, ...device.folders.map((name) => `${name}/`)].join(", ") || "-"}
                />
            </div>
        </div>
        <div className="setting-item-control">
            <IconActionButton
                icon={Trash2}
                label={t("SETTINGS_SYNC_DELETE_INVALID_DEVICE")}
                onClick={onDelete}
                disabled={isReadOnly || isBusy}
                destructive
            />
        </div>
    </div>
);

// ==========================================
// Tab Header Component
// ==========================================
interface TabHeaderProps {
    tabs: typeof TABS;
    activeTab: TabId;
    onTabSelect: (id: TabId) => void;
}

const TabHeader: React.FC<TabHeaderProps> = ({ tabs, activeTab, onTabSelect }) => {
    const scrollContainer = useRef<HTMLDivElement>(null);
    const tabRefs = useRef<Partial<Record<TabId, HTMLDivElement | null>>>({});
    const dragStateRef = useRef({
        startX: 0,
        startY: 0,
        scrollLeft: 0,
        isDragging: false,
    });
    const suppressClickUntilRef = useRef(0);

    useEffect(() => {
        const activeTabEl = tabRefs.current[activeTab];
        if (!activeTabEl || typeof activeTabEl.scrollIntoView !== "function") {
            return;
        }

        activeTabEl.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "center",
        });
    }, [activeTab]);

    const handleScroll = (e: React.WheelEvent) => {
        if (scrollContainer.current) {
            scrollContainer.current.scrollLeft += e.deltaY;
        }
    };

    const handleTouchStart = (e: React.TouchEvent<HTMLElement>) => {
        if (e.touches.length !== 1 || !scrollContainer.current) {
            return;
        }

        const touch = e.touches[0];
        dragStateRef.current = {
            startX: touch.clientX,
            startY: touch.clientY,
            scrollLeft: scrollContainer.current.scrollLeft,
            isDragging: false,
        };
    };

    const handleTouchMove = (e: React.TouchEvent<HTMLElement>) => {
        if (e.touches.length !== 1 || !scrollContainer.current) {
            return;
        }

        const touch = e.touches[0];
        const deltaX = touch.clientX - dragStateRef.current.startX;
        const deltaY = touch.clientY - dragStateRef.current.startY;
        const absDeltaX = Math.abs(deltaX);
        const absDeltaY = Math.abs(deltaY);

        if (
            !dragStateRef.current.isDragging &&
            absDeltaX > TAB_HEADER_DRAG_THRESHOLD &&
            absDeltaX > absDeltaY
        ) {
            dragStateRef.current.isDragging = true;
        }

        if (!dragStateRef.current.isDragging) {
            return;
        }

        scrollContainer.current.scrollLeft = dragStateRef.current.scrollLeft - deltaX;
        e.preventDefault();
    };

    const finishTouchDrag = () => {
        if (dragStateRef.current.isDragging) {
            suppressClickUntilRef.current = Date.now() + TAB_CLICK_SUPPRESS_MS;
        }

        dragStateRef.current.isDragging = false;
    };

    const handleTabClick = (id: TabId) => {
        if (Date.now() < suppressClickUntilRef.current) {
            return;
        }

        onTabSelect(id);
    };

    return (
        <nav
            className="sr-style-setting-header"
            onWheel={handleScroll}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={finishTouchDrag}
            onTouchCancel={finishTouchDrag}
            ref={scrollContainer}
        >
            <div className="sr-style-setting-tab-group">
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <div
                            key={tab.id}
                            className={`sr-style-tab ${isActive ? "sr-style-tab-active" : ""}`}
                            onClick={() => handleTabClick(tab.id)}
                            ref={(element) => {
                                tabRefs.current[tab.id] = element;
                            }}
                        >
                            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                {tab.icon}
                                {tab.label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </nav>
    );
};

// ==========================================
// 子页面：Flashcards
// ==========================================
const FlashcardsTab: React.FC<TabProps> = ({ settings, onChange }) => {
    // 检查是否为免费用户
    const isFree = !settings.isPro;

    const handleLockedToggle = (
        key: keyof UISettingsState,
        value: boolean,
        featureName: string,
    ) => {
        if (isFree && value === true) {
            new Notice(t("NOTICE_SUPPORTER_ONLY_FEATURE", { featureName }));
            onChange(key, false);
        } else {
            onChange(key, value);
        }
    };

    return (
        <div className="sr-settings-sections">
            <Section title={t("SETTINGS_SECTION_BEHAVIOR")}>
                <SelectRow
                    label={t("SETTINGS_CARD_ORDER")}
                    desc={t("SETTINGS_CARD_ORDER_DESC")}
                    value={settings.flashcardCardOrder}
                    options={[
                        {
                            label: t("SETTINGS_OPT_DUE_FIRST_SEQUENTIAL"),
                            value: "DueFirstSequential",
                        },
                        { label: t("SETTINGS_OPT_DUE_FIRST_RANDOM"), value: "DueFirstRandom" },
                        {
                            label: t("SETTINGS_OPT_NEW_FIRST_SEQUENTIAL"),
                            value: "NewFirstSequential",
                        },
                        { label: t("SETTINGS_OPT_NEW_FIRST_RANDOM"), value: "NewFirstRandom" },
                    ]}
                    onChange={(v) => onChange("flashcardCardOrder", v)}
                />
            </Section>

            <Section title={t("SETTINGS_SECTION_CLOZE")}>
                <ToggleRow
                    label={t("SETTINGS_HIGHLIGHT_TO_CLOZE")}
                    desc={t("SETTINGS_HIGHLIGHT_TO_CLOZE_DESC")}
                    value={settings.convertHighlightsToClozes}
                    onChange={(v) => onChange("convertHighlightsToClozes", v)}
                />
                <ToggleRow
                    label={t("SETTINGS_BOLD_TO_CLOZE")}
                    desc={t("SETTINGS_BOLD_TO_CLOZE_DESC")}
                    value={settings.convertBoldTextToClozes}
                    onChange={(v) => onChange("convertBoldTextToClozes", v)}
                />
                <ToggleRow
                    label={t("SETTINGS_CURLY_TO_CLOZE")}
                    desc={t("SETTINGS_CURLY_TO_CLOZE_DESC")}
                    value={settings.convertCurlyBracketsToClozes}
                    onChange={(v) => onChange("convertCurlyBracketsToClozes", v)}
                />
                <ToggleRow
                    label={
                        <LabelWithSupporter label={t("SETTINGS_ANKI_CLOZE")} isLocked={isFree} />
                    }
                    desc={t("SETTINGS_ANKI_CLOZE_DESC")}
                    value={settings.convertAnkiClozesToClozes}
                    onChange={(v) =>
                        handleLockedToggle("convertAnkiClozesToClozes", v, t("SETTINGS_ANKI_CLOZE"))
                    }
                />
                <ToggleRow
                    label={
                        <LabelWithSupporter label={t("SETTINGS_CODE_CLOZE")} isLocked={isFree} />
                    }
                    desc={t("SETTINGS_CODE_CLOZE_DESC")}
                    value={settings.parseClozesInCodeBlocks}
                    onChange={(v) =>
                        handleLockedToggle("parseClozesInCodeBlocks", v, t("SETTINGS_CODE_CLOZE"))
                    }
                />
                {settings.parseClozesInCodeBlocks && (
                    <div className="sr-setting-subgroup">
                        <SliderRow
                            label={t("SETTINGS_CODE_CONTEXT_LINES")}
                            desc={t("SETTINGS_CODE_CONTEXT_LINES_DESC")}
                            value={settings.codeContextLines}
                            min={5}
                            max={100}
                            step={5}
                            onChange={(v) => onChange("codeContextLines", v)}
                        />
                    </div>
                )}
                <SelectRow
                    label={t("SETTINGS_CLOZE_CONTEXT_MODE")}
                    desc={getClozeContextModeDesc(settings.clozeContextMode)}
                    value={settings.clozeContextMode}
                    options={[
                        { label: t("SETTINGS_CLOZE_CONTEXT_SINGLE"), value: "single" },
                        { label: t("SETTINGS_CLOZE_CONTEXT_DOUBLE_BREAK"), value: "double-break" },
                        { label: t("SETTINGS_CLOZE_CONTEXT_EXPANDED"), value: "expanded" },
                        { label: t("SETTINGS_CLOZE_CONTEXT_FULL"), value: "full" },
                    ]}
                    onChange={(v) => onChange("clozeContextMode", v)}
                />
                <SelectRow
                    label={t("SETTINGS_CLOZE_CONTEXT_PERFORMANCE")}
                    desc={t("SETTINGS_CLOZE_CONTEXT_PERFORMANCE_DESC")}
                    value={settings.clozeContextPerformanceMode}
                    options={[
                        { label: t("SETTINGS_CLOZE_CONTEXT_PERFORMANCE_OFF"), value: "off" },
                        {
                            label: t("SETTINGS_CLOZE_CONTEXT_PERFORMANCE_SAFE_TRIM"),
                            value: "safe-trim",
                        },
                    ]}
                    onChange={(v) => onChange("clozeContextPerformanceMode", v)}
                />
                {settings.clozeContextPerformanceMode === "safe-trim" && (
                    <div className="sr-setting-subgroup">
                        <SliderRow
                            label={t("SETTINGS_CLOZE_CONTEXT_SOFT_LIMIT")}
                            desc={t("SETTINGS_CLOZE_CONTEXT_SOFT_LIMIT_DESC")}
                            value={settings.clozeContextSoftLimitLines}
                            min={MIN_CLOZE_CONTEXT_SOFT_LIMIT_LINES}
                            max={MAX_CLOZE_CONTEXT_SOFT_LIMIT_LINES}
                            step={1}
                            onChange={(v) =>
                                onChange(
                                    "clozeContextSoftLimitLines",
                                    Math.max(
                                        MIN_CLOZE_CONTEXT_SOFT_LIMIT_LINES,
                                        Math.min(MAX_CLOZE_CONTEXT_SOFT_LIMIT_LINES, v),
                                    ),
                                )
                            }
                        />
                    </div>
                )}
                {settings.convertAnkiClozesToClozes && (
                    <ToggleRow
                        label={t("SETTINGS_SHOW_OTHER_ANKI_CLOZES")}
                        desc={t("SETTINGS_SHOW_OTHER_ANKI_CLOZES_DESC")}
                        value={settings.showOtherAnkiClozeVisual}
                        onChange={(v) => onChange("showOtherAnkiClozeVisual", v)}
                    />
                )}
                {settings.convertHighlightsToClozes && (
                    <ToggleRow
                        label={t("SETTINGS_SHOW_OTHER_HIGHLIGHT_CLOZES")}
                        desc={t("SETTINGS_SHOW_OTHER_HIGHLIGHT_CLOZES_DESC")}
                        value={settings.showOtherHighlightClozeVisual}
                        onChange={(v) => onChange("showOtherHighlightClozeVisual", v)}
                    />
                )}
                {settings.convertBoldTextToClozes && (
                    <ToggleRow
                        label={t("SETTINGS_SHOW_OTHER_BOLD_CLOZES")}
                        desc={t("SETTINGS_SHOW_OTHER_BOLD_CLOZES_DESC")}
                        value={settings.showOtherBoldClozeVisual}
                        onChange={(v) => onChange("showOtherBoldClozeVisual", v)}
                    />
                )}
            </Section>

            <Section title={t("SETTINGS_SECTION_SEPARATORS")}>
                <InputRow
                    className="setting-item--mobile-inline"
                    label={t("SETTINGS_INLINE_SEPARATOR")}
                    value={settings.singleLineCardSeparator}
                    onChange={(v) => onChange("singleLineCardSeparator", v)}
                />
                <InputRow
                    className="setting-item--mobile-inline"
                    label={t("SETTINGS_MULTILINE_SEPARATOR")}
                    value={settings.multilineCardSeparator}
                    onChange={(v) => onChange("multilineCardSeparator", v)}
                />
            </Section>
        </div>
    );
};

// ==========================================
// 子页面：Algorithms (全新)
// ==========================================
const AlgoTab: React.FC<TabProps> = ({ settings, onChange }) => {
    // --- 模拟器状态 ---
    const [simInterval, setSimInterval] = useState(10); // 假设当前间隔 10 天
    const [simPriority, setSimPriority] = useState(3); // 假设优先级 3 (较重要)
    const isMobileLayout = isMobileSettingsLayout();
    const [activeParam, setActiveParam] = useState<string | null>(null);

    // --- 实时计算逻辑 ---
    // 1. 计算重要性因子 F_imp
    // 公式: min + (priority - 1) * (max - min) / 9
    // 注意: 这里要确保数值类型正确
    const wmsImpMin = parseFloat(String(settings.wmsImpMin)) || 1.0;
    const wmsImpMax = parseFloat(String(settings.wmsImpMax)) || 2.5;
    const fImp = wmsImpMin + ((simPriority - 1) * (wmsImpMax - wmsImpMin)) / 9;

    // 2. 计算各个按钮的结果
    // Again: 固定值
    const resAgain = settings.wmsAgainInterval || 1;

    // Hard: I * HardFactor (通常不乘 F_imp，或者根据你的逻辑调整)
    // 根据之前的公式显示：Hard = Round(I * 0.7)
    const resHard = Math.round(simInterval * (settings.wmsHardFactor || 0.7));

    // Good: I * GoodFactor * F_imp
    const resGood = Math.round(simInterval * (settings.wmsGoodFactor || 1.3) * fImp);

    // Easy: I * EasyFactor * F_imp
    const resEasy = Math.round(simInterval * (settings.wmsEasyFactor || 2.0) * fImp);

    return (
        <div className="sr-settings-sections">
            {/* 1. 定位算法部分 (保持不变) */}
            <Section title={t("ALGO_LOCATOR_TITLE")}>
                <div style={{ padding: "12px 20px" }}>
                    <p
                        style={{
                            margin: 0,
                            color: "var(--text-muted)",
                            lineHeight: "1.6",
                            fontSize: "0.9em",
                        }}
                    >
                        {t("ALGO_LOCATOR_DESC_SHORT")}
                    </p>
                </div>
            </Section>

            {/* 2. FSRS 部分 */}
            <Section title={"FSRS (Flashcards)"}>
                <ToggleRow
                    label={t("FUZZING")}
                    desc={t("FUZZING_DESC")}
                    value={settings.fsrsEnableFuzz}
                    onChange={(value) => onChange("fsrsEnableFuzz", value)}
                />
            </Section>

            {/* 3. 笔记复习算法：WMS (带模拟器) */}
            <Section title={t("WMS_ALGORITHM")}>
                <div style={{ padding: "0 4px" }}>
                    {/* --- 模拟器与公式容器 --- */}
                    {!isMobileLayout && (
                        <div className="sr-wms-simulator">
                            {/* A. 模拟器控制栏 (Header) */}
                            <div className="sr-wms-simulator__toolbar">
                                <div className="sr-wms-simulator__title">
                                    {t("WMS_SIMULATOR_TITLE")}
                                </div>

                                {/* 分隔线 */}
                                <div className="sr-wms-simulator__divider" aria-hidden="true"></div>

                                {/* 控制输入容器：右对齐以便与下方数字对齐 */}
                                <div className="sr-wms-simulator__controls">
                                    {/* 控制输入: 假设当前间隔 */}
                                    <div className="sr-wms-simulator__control-group">
                                        <span style={{ color: "var(--text-muted)" }}>
                                            {t("WMS_SIM_CURR_INTERVAL")}
                                        </span>
                                        <input
                                            type="number"
                                            className="sr-input-compact"
                                            value={simInterval}
                                            onChange={(e) =>
                                                setSimInterval(
                                                    Math.max(1, parseInt(e.target.value) || 1),
                                                )
                                            }
                                            onFocus={() => setActiveParam("simInterval")}
                                            onBlur={() => setActiveParam(null)}
                                        />
                                        <span style={{ color: "var(--text-muted)" }}>d</span>
                                    </div>

                                    {/* 控制输入: 假设优先级 */}
                                    <div className="sr-wms-simulator__control-group">
                                        <span style={{ color: "var(--text-muted)" }}>
                                            {t("WMS_SIM_PRIORITY")}
                                        </span>
                                        <input
                                            type="range"
                                            min="1"
                                            max="10"
                                            value={simPriority}
                                            onChange={(e) =>
                                                setSimPriority(parseInt(e.target.value) || 1)
                                            }
                                            onFocus={() => setActiveParam("simPriority")}
                                            onBlur={() => setActiveParam(null)}
                                            style={{ width: "80px", height: "4px" }}
                                        />
                                        <span style={{ minWidth: "1.2em" }}>{simPriority}</span>
                                    </div>
                                </div>
                            </div>

                            {/* B. 动态公式 + 结果展示区 */}
                            <div style={{ padding: "20px", position: "relative" }}>
                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "1fr",
                                        gap: "14px",
                                    }}
                                >
                                    {/* Row: Again */}
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "12px",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    color: "var(--text-muted)",
                                                    fontWeight: "600",
                                                    width: "50px",
                                                }}
                                            >
                                                {t("AGAIN")}
                                            </div>
                                            <MathText>
                                                <MVar>I</MVar>
                                                <sub>next</sub> ={" "}
                                                <MNum
                                                    highlight={activeParam === "wmsAgainInterval"}
                                                >
                                                    {settings.wmsAgainInterval || 1}
                                                </MNum>{" "}
                                                <MFunc>d</MFunc>
                                            </MathText>
                                        </div>
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                opacity: 0.9,
                                            }}
                                        >
                                            <span style={{ color: "var(--color-red)" }}>
                                                {resAgain} d
                                            </span>
                                        </div>
                                    </div>

                                    {/* Row: Hard */}
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "12px",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    color: "var(--text-muted)",
                                                    fontWeight: "600",
                                                    width: "50px",
                                                }}
                                            >
                                                {t("HARD")}
                                            </div>
                                            <MathText>
                                                <MVar>I</MVar>
                                                <sub>next</sub> = <MFunc>Round</MFunc>(
                                                <MVar highlight={activeParam === "simInterval"}>
                                                    I
                                                </MVar>
                                                <sub>curr</sub> ×{" "}
                                                <MNum highlight={activeParam === "wmsHardFactor"}>
                                                    {settings.wmsHardFactor || 0.7}
                                                </MNum>
                                                )
                                            </MathText>
                                        </div>
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                opacity: 0.9,
                                            }}
                                        >
                                            <span style={{ color: "var(--color-orange)" }}>
                                                {resHard} d
                                            </span>
                                        </div>
                                    </div>

                                    {/* Row: Good */}
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "12px",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    color: "var(--text-muted)",
                                                    fontWeight: "600",
                                                    width: "50px",
                                                }}
                                            >
                                                {t("GOOD")}
                                            </div>
                                            <MathText>
                                                <MVar>I</MVar>
                                                <sub>next</sub> = <MFunc>Round</MFunc>(
                                                <MVar highlight={activeParam === "simInterval"}>
                                                    I
                                                </MVar>
                                                <sub>curr</sub> ×{" "}
                                                <MNum highlight={activeParam === "wmsGoodFactor"}>
                                                    {settings.wmsGoodFactor || 1.3}
                                                </MNum>{" "}
                                                ×{" "}
                                                <MVar
                                                    highlight={
                                                        activeParam === "simPriority" ||
                                                        activeParam === "wmsImpMin" ||
                                                        activeParam === "wmsImpMax"
                                                    }
                                                >
                                                    F
                                                </MVar>
                                                <sub>imp</sub>)
                                            </MathText>
                                        </div>
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                opacity: 0.9,
                                            }}
                                        >
                                            <span style={{ color: "var(--color-green)" }}>
                                                {resGood} d
                                            </span>
                                        </div>
                                    </div>

                                    {/* Row: Easy */}
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "12px",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    color: "var(--text-muted)",
                                                    fontWeight: "600",
                                                    width: "50px",
                                                }}
                                            >
                                                {t("EASY")}
                                            </div>
                                            <MathText>
                                                <MVar>I</MVar>
                                                <sub>next</sub> = <MFunc>Round</MFunc>(
                                                <MVar highlight={activeParam === "simInterval"}>
                                                    I
                                                </MVar>
                                                <sub>curr</sub> ×{" "}
                                                <MNum highlight={activeParam === "wmsEasyFactor"}>
                                                    {settings.wmsEasyFactor || 2.0}
                                                </MNum>{" "}
                                                ×{" "}
                                                <MVar
                                                    highlight={
                                                        activeParam === "simPriority" ||
                                                        activeParam === "wmsImpMin" ||
                                                        activeParam === "wmsImpMax"
                                                    }
                                                >
                                                    F
                                                </MVar>
                                                <sub>imp</sub>)
                                            </MathText>
                                        </div>
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                opacity: 0.9,
                                            }}
                                        >
                                            <span style={{ color: "var(--color-cyan)" }}>
                                                {resEasy} d
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Summary Line for F_imp */}
                                <div
                                    style={{
                                        marginTop: "16px",
                                        paddingTop: "12px",
                                        borderTop: "1px dashed var(--background-modifier-border)",
                                        color: "var(--text-muted)",
                                        fontSize: "0.9em",
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                    }}
                                >
                                    <MathText>
                                        <MVar
                                            highlight={
                                                activeParam === "simPriority" ||
                                                activeParam === "wmsImpMin" ||
                                                activeParam === "wmsImpMax"
                                            }
                                        >
                                            F
                                        </MVar>
                                        <sub>imp</sub> ={" "}
                                        <MNum highlight={activeParam === "wmsImpMin"}>
                                            {settings.wmsImpMin}
                                        </MNum>{" "}
                                        + (
                                        <MNum highlight={activeParam === "simPriority"}>
                                            {simPriority}
                                        </MNum>{" "}
                                        - 1) × (
                                        <MNum highlight={activeParam === "wmsImpMax"}>
                                            {settings.wmsImpMax}
                                        </MNum>{" "}
                                        -{" "}
                                        <MNum highlight={activeParam === "wmsImpMin"}>
                                            {settings.wmsImpMin}
                                        </MNum>
                                        ) / 9
                                    </MathText>
                                    <span
                                        style={{
                                            backgroundColor: "var(--background-secondary)",
                                            padding: "2px 8px",
                                            borderRadius: "4px",
                                            fontFamily: "var(--font-monospace)",
                                            color: "var(--text-accent)",
                                        }}
                                    >
                                        = {fImp.toFixed(2)}x
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div style={{ padding: "0 20px" }}>
                        {/* 参数控制面板 (保持 Grid 布局不变) */}
                        <div
                            style={{
                                marginBottom: "8px",
                                fontSize: "0.85em",
                                color: "var(--text-muted)",
                                fontWeight: "600",
                            }}
                        >
                            {t("WMS_PARAMS_BASE")}
                        </div>
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: "12px 24px",
                                marginBottom: "24px",
                            }}
                        >
                            <div>
                                <div
                                    style={{
                                        fontSize: "0.8em",
                                        marginBottom: "4px",
                                        color: "var(--text-muted)",
                                    }}
                                >
                                    {t("WMS_AGAIN_ZERO")}
                                </div>
                                <input
                                    type="number"
                                    className="sr-input-full"
                                    value={settings.wmsAgainInterval ?? 1}
                                    step="0.1"
                                    min="0"
                                    onChange={(e) =>
                                        onChange("wmsAgainInterval", parseFloat(e.target.value))
                                    }
                                    onFocus={() => setActiveParam("wmsAgainInterval")}
                                    onBlur={() => setActiveParam(null)}
                                    style={{ width: "100%" }}
                                />
                            </div>
                            <div>
                                <div
                                    style={{
                                        fontSize: "0.8em",
                                        marginBottom: "4px",
                                        color: "var(--text-muted)",
                                    }}
                                >
                                    {t("WMS_HARD_PENALTY")}
                                </div>
                                <input
                                    type="number"
                                    className="sr-input-full"
                                    value={settings.wmsHardFactor || 0.7}
                                    step="0.05"
                                    onChange={(e) =>
                                        onChange("wmsHardFactor", parseFloat(e.target.value))
                                    }
                                    onFocus={() => setActiveParam("wmsHardFactor")}
                                    onBlur={() => setActiveParam(null)}
                                    style={{ width: "100%" }}
                                />
                            </div>
                            <div>
                                <div
                                    style={{
                                        fontSize: "0.8em",
                                        marginBottom: "4px",
                                        color: "var(--text-muted)",
                                    }}
                                >
                                    {t("WMS_GOOD_BASE")}
                                </div>
                                <input
                                    type="number"
                                    className="sr-input-full"
                                    value={settings.wmsGoodFactor || 1.3}
                                    step="0.1"
                                    onChange={(e) =>
                                        onChange("wmsGoodFactor", parseFloat(e.target.value))
                                    }
                                    onFocus={() => setActiveParam("wmsGoodFactor")}
                                    onBlur={() => setActiveParam(null)}
                                    style={{ width: "100%" }}
                                />
                            </div>
                            <div>
                                <div
                                    style={{
                                        fontSize: "0.8em",
                                        marginBottom: "4px",
                                        color: "var(--text-muted)",
                                    }}
                                >
                                    {t("WMS_EASY_BONUS")}
                                </div>
                                <input
                                    type="number"
                                    className="sr-input-full"
                                    value={settings.wmsEasyFactor || 2.0}
                                    step="0.1"
                                    onChange={(e) =>
                                        onChange("wmsEasyFactor", parseFloat(e.target.value))
                                    }
                                    onFocus={() => setActiveParam("wmsEasyFactor")}
                                    onBlur={() => setActiveParam(null)}
                                    style={{ width: "100%" }}
                                />
                            </div>
                        </div>
                    </div>

                    <div
                        style={{
                            marginBottom: "8px",
                            fontSize: "0.85em",
                            color: "var(--text-muted)",
                            fontWeight: "600",
                            padding: "0 20px",
                        }}
                    >
                        {t("WMS_PARAMS_WEIGHT")}
                    </div>
                    {/* InputRow 保持不变 */}
                    <InputRow
                        label={t("WMS_IMP_MIN")}
                        desc={t("WMS_IMP_MIN_DESC")}
                        value={settings.wmsImpMin}
                        onChange={(v) => onChange("wmsImpMin", v)}
                        onFocus={() => setActiveParam("wmsImpMin")}
                        onBlur={() => setActiveParam(null)}
                    />
                    <InputRow
                        label={t("WMS_IMP_MAX")}
                        desc={t("WMS_IMP_MAX_DESC")}
                        value={settings.wmsImpMax}
                        onChange={(v) => onChange("wmsImpMax", v)}
                        onFocus={() => setActiveParam("wmsImpMax")}
                        onBlur={() => setActiveParam(null)}
                    />

                    <div
                        style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            marginTop: "12px",
                            marginBottom: "16px",
                            padding: "0 20px",
                        }}
                    >
                        <button
                            className="sr-btn-transparent"
                            onClick={() => {
                                onChange("wmsAgainInterval", 1);
                                onChange("wmsHardFactor", 0.7);
                                onChange("wmsGoodFactor", 1.3);
                                onChange("wmsEasyFactor", 2.0);
                                onChange("wmsImpMin", "1.0");
                                onChange("wmsImpMax", "2.5");
                            }}
                        >
                            {t("WMS_RESTORE_DEFAULTS")}
                        </button>
                    </div>
                </div>
            </Section>
        </div>
    );
};

// ==========================================
// 子页面：Notes
// ==========================================
function normalizeSidebarFilePathTooltipDelayDraft(value: string, fallback = 1000): number {
    const trimmed = value.trim();
    if (!trimmed) {
        return fallback;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.max(0, Math.round(parsed));
}

const NotesTab: React.FC<TabProps> = ({ settings, onChange }) => {
    const [tooltipDelayDraft, setTooltipDelayDraft] = useState(
        String(settings.sidebarFilePathTooltipDelayMs),
    );

    useEffect(() => {
        setTooltipDelayDraft(String(settings.sidebarFilePathTooltipDelayMs));
    }, [settings.sidebarFilePathTooltipDelayMs]);

    const commitTooltipDelay = useCallback(() => {
        const normalizedValue = normalizeSidebarFilePathTooltipDelayDraft(tooltipDelayDraft, 1000);
        setTooltipDelayDraft(String(normalizedValue));
        onChange("sidebarFilePathTooltipDelayMs", normalizedValue);
    }, [onChange, tooltipDelayDraft]);

    return (
        <div className="sr-settings-sections">
            <Section title={t("NOTES")}>
                <ToggleRow
                    label={t("REVIEW_PANE_ON_STARTUP")}
                    value={settings.enableNoteReviewPaneOnStartup}
                    onChange={(v) => onChange("enableNoteReviewPaneOnStartup", v)}
                />
            </Section>
            <Section title={t("SETTINGS_SECTION_IGNORED_TAGS")}>
                <TextAreaRow
                    label={t("SETTINGS_SECTION_IGNORED_TAGS")}
                    desc={t("SETTINGS_IGNORED_TAGS_DESC")}
                    value={settings.sidebarIgnoredTags.map((t) => `#${t}`).join("\n")}
                    onChange={(v) =>
                        onChange(
                            "sidebarIgnoredTags",
                            v
                                .split("\n")
                                .map((t) => t.trim().replace(/^#/, ""))
                                .filter(Boolean),
                        )
                    }
                />
            </Section>
            <Section title={t("SETTINGS_SECTION_SIDEBAR")}>
                <ToggleRow
                    label={t("SETTINGS_HIDE_FILTER_BAR")}
                    desc={t("SETTINGS_HIDE_FILTER_BAR_DESC")}
                    value={settings.hideNoteReviewSidebarFilters}
                    onChange={(v) => onChange("hideNoteReviewSidebarFilters", v)}
                />
                <ToggleRow
                    label={t("SETTINGS_SHOW_SIDEBAR_PROGRESS_INDICATOR")}
                    desc={t("SETTINGS_SHOW_SIDEBAR_PROGRESS_INDICATOR_DESC")}
                    value={settings.showSidebarProgressIndicator}
                    onChange={(v) => onChange("showSidebarProgressIndicator", v)}
                />
                <SelectRow
                    label={t("SETTINGS_SIDEBAR_PROGRESS_INDICATOR")}
                    desc={t("SETTINGS_SIDEBAR_PROGRESS_INDICATOR_DESC")}
                    value={settings.sidebarProgressIndicatorMode}
                    options={[
                        {
                            label: t("SETTINGS_SIDEBAR_PROGRESS_INDICATOR_RING"),
                            value: "ring",
                        },
                        {
                            label: t("SETTINGS_SIDEBAR_PROGRESS_INDICATOR_PERCENTAGE"),
                            value: "percentage",
                        },
                    ]}
                    onChange={(v) =>
                        onChange(
                            "sidebarProgressIndicatorMode",
                            v as UISettingsState["sidebarProgressIndicatorMode"],
                        )
                    }
                />
                {settings.showSidebarProgressIndicator && (
                    <>
                        <ColorPickerRow
                            label={t("SETTINGS_SIDEBAR_PROGRESS_RING_COLOR")}
                            desc={t("SETTINGS_SIDEBAR_PROGRESS_RING_COLOR_DESC")}
                            value={settings.sidebarProgressRingColor}
                            onChange={(v) => onChange("sidebarProgressRingColor", v)}
                        />
                        {settings.sidebarProgressIndicatorMode === "ring" && (
                            <SelectRow
                                label={t("SETTINGS_SIDEBAR_PROGRESS_RING_DIRECTION")}
                                desc={t("SETTINGS_SIDEBAR_PROGRESS_RING_DIRECTION_DESC")}
                                value={settings.sidebarProgressRingDirection}
                                options={[
                                    {
                                        label: t(
                                            "SETTINGS_SIDEBAR_PROGRESS_RING_DIRECTION_CLOCKWISE",
                                        ),
                                        value: "clockwise",
                                    },
                                    {
                                        label: t(
                                            "SETTINGS_SIDEBAR_PROGRESS_RING_DIRECTION_COUNTERCLOCKWISE",
                                        ),
                                        value: "counterclockwise",
                                    },
                                ]}
                                onChange={(v) =>
                                    onChange(
                                        "sidebarProgressRingDirection",
                                        v as UISettingsState["sidebarProgressRingDirection"],
                                    )
                                }
                            />
                        )}
                    </>
                )}
                <ToggleRow
                    label={t("SETTINGS_SIDEBAR_FILE_PATH_TOOLTIP")}
                    desc={t("SETTINGS_SIDEBAR_FILE_PATH_TOOLTIP_DESC")}
                    value={settings.sidebarFilePathTooltipEnabled}
                    onChange={(v) => onChange("sidebarFilePathTooltipEnabled", v)}
                />
                <InputRow
                    label={t("SETTINGS_SIDEBAR_FILE_PATH_TOOLTIP_DELAY")}
                    desc={t("SETTINGS_SIDEBAR_FILE_PATH_TOOLTIP_DELAY_DESC")}
                    type="number"
                    value={tooltipDelayDraft}
                    onChange={(v) => setTooltipDelayDraft(v)}
                    onBlur={() => commitTooltipDelay()}
                />
            </Section>
            <Section title={t("SETTINGS_SECTION_TIMELINE")}>
                <ToggleRow
                    label={t("SETTINGS_TIMELINE_SCROLL")}
                    desc={t("SETTINGS_TIMELINE_SCROLL_DESC")}
                    value={settings.showScrollPercentage}
                    onChange={(v) => onChange("showScrollPercentage", v)}
                />
                <ToggleRow
                    label={t("SETTINGS_TIMELINE_AUTO_EXPAND")}
                    desc={t("SETTINGS_TIMELINE_AUTO_EXPAND_DESC")}
                    value={settings.autoExpandTimeline}
                    onChange={(v) => onChange("autoExpandTimeline", v)}
                />
                <ToggleRow
                    label={<LabelWithLab label={t("SETTINGS_TIMELINE_ALLOW_UNTRACKED_NOTES")} />}
                    desc={t("SETTINGS_TIMELINE_ALLOW_UNTRACKED_NOTES_DESC")}
                    value={settings.timelineAllowUntrackedNotes}
                    onChange={(v) => onChange("timelineAllowUntrackedNotes", v)}
                />
                <ToggleRow
                    label={<LabelWithLab label={t("SETTINGS_TIMELINE_AUTO_FOLLOW_REVIEW_CARD")} />}
                    desc={t("SETTINGS_TIMELINE_AUTO_FOLLOW_REVIEW_CARD_DESC")}
                    value={settings.timelineAutoFollowReviewCards}
                    onChange={(v) => onChange("timelineAutoFollowReviewCards", v)}
                />
                <ToggleRow
                    label={t("SETTINGS_TIMELINE_AUTO_COMMIT_REVIEW")}
                    desc={t("SETTINGS_TIMELINE_AUTO_COMMIT_REVIEW_DESC")}
                    value={settings.timelineAutoCommitReviewSelection}
                    onChange={(v) => onChange("timelineAutoCommitReviewSelection", v)}
                />
                <ToggleRow
                    label={t("SETTINGS_TIMELINE_ENABLE_DURATION_PREFIX")}
                    desc={t("SETTINGS_TIMELINE_ENABLE_DURATION_PREFIX_DESC")}
                    value={settings.timelineEnableDurationPrefixSyntax}
                    onChange={(v) => onChange("timelineEnableDurationPrefixSyntax", v)}
                />
            </Section>
        </div>
    );
};

const SyncTab: React.FC<SyncTabProps> = ({
    settings,
    onChange,
    deviceManagement,
    deviceManagementLoading,
    deviceManagementError,
    reloadDeviceManagement,
    onRenameCurrentDevice,
    onPullToCurrentDevice,
    onDeleteValidDevice,
    onOpenRecovery,
    onDeleteInvalidDevice,
}) => {
    const [renameValue, setRenameValue] = useState("");
    const [isRenamingCurrent, setIsRenamingCurrent] = useState(false);
    const [actionKey, setActionKey] = useState<string | null>(null);

    useEffect(() => {
        setRenameValue(deviceManagement?.currentDevice?.deviceName ?? "");
        setIsRenamingCurrent(false);
    }, [deviceManagement?.currentDevice?.deviceId, deviceManagement?.currentDevice?.deviceName]);

    const runAction = useCallback(
        async (
            nextActionKey: string,
            task: (() => Promise<void> | void) | undefined,
        ): Promise<boolean> => {
            if (!task) {
                return false;
            }

            setActionKey(nextActionKey);
            try {
                await task();
                return true;
            } catch (error) {
                console.error("[SR-Settings] Syro device management action failed", error);
                new Notice(
                    error instanceof Error && error.message
                        ? error.message
                        : t("SETTINGS_SYNC_DEVICE_LOAD_ERROR"),
                );
                return false;
            } finally {
                setActionKey(null);
            }
        },
        [],
    );

    const runDeviceManagementAction = useCallback(
        async (
            nextActionKey: string,
            task: (() => Promise<void> | void) | undefined,
        ): Promise<boolean> => {
            if (!task) {
                return false;
            }

            return runAction(nextActionKey, async () => {
                await task();
                await reloadDeviceManagement?.();
            });
        },
        [reloadDeviceManagement, runAction],
    );

    const currentDevice = deviceManagement?.currentDevice ?? null;
    const otherDevices = deviceManagement?.devices ?? [];
    const invalidDevices = deviceManagement?.invalidDevices ?? [];
    const isReadOnly = Boolean(deviceManagement?.readOnlyReason);
    const showRecoveryRow = Boolean(
        deviceManagement?.hasPendingAction || deviceManagement?.readOnlyReason,
    );
    const hasDeviceManagementMeta = Boolean(
        showRecoveryRow || deviceManagementLoading || deviceManagementError,
    );

    return (
        <div className="sr-settings-sections">
            <Section title={t("SETTINGS_SECTION_SYNC")}>
                <ToggleRow
                    label={t("SETTINGS_AUTO_INCREMENTAL_SYNC")}
                    desc={t("SETTINGS_AUTO_INCREMENTAL_SYNC_DESC")}
                    value={settings.autoIncrementalSync}
                    onChange={(v) => onChange("autoIncrementalSync", v)}
                />
                <ToggleRow
                    label={t("SETTINGS_NOTE_CACHE_PERSISTENCE")}
                    desc={t("SETTINGS_NOTE_CACHE_PERSISTENCE_DESC")}
                    value={settings.enableNoteCachePersistence}
                    onChange={(v) => onChange("enableNoteCachePersistence", v)}
                />
                <SelectRow
                    label={t("SETTINGS_SYNC_PROGRESS_DISPLAY")}
                    desc={t("SETTINGS_SYNC_PROGRESS_DISPLAY_DESC")}
                    value={settings.syncProgressDisplayMode}
                    options={[
                        { label: t("SETTINGS_SYNC_PROGRESS_DISPLAY_ALWAYS"), value: "always" },
                        {
                            label: t("SETTINGS_SYNC_PROGRESS_DISPLAY_FULL_ONLY"),
                            value: "full-only",
                        },
                        { label: t("SETTINGS_SYNC_PROGRESS_DISPLAY_NEVER"), value: "never" },
                    ]}
                    onChange={(v) =>
                        onChange(
                            "syncProgressDisplayMode",
                            v as UISettingsState["syncProgressDisplayMode"],
                        )
                    }
                />
            </Section>

            <Section className="sr-device-management-section" wrapChildren={false}>
                {hasDeviceManagementMeta ? (
                    <div className="setting-items sr-device-management-list">
                        {showRecoveryRow ? (
                            <ActionRow
                                label={t("SETTINGS_SYNC_OPEN_RECOVERY")}
                                desc={
                                    deviceManagement?.hasPendingAction
                                        ? t("SETTINGS_SYNC_OPEN_RECOVERY_DESC")
                                        : deviceManagement?.readOnlyReason
                                          ? deviceManagement.readOnlyReason
                                          : t("SETTINGS_SYNC_OPEN_RECOVERY_DESC")
                                }
                            >
                                <button
                                    disabled={actionKey === "open-recovery"}
                                    onClick={() =>
                                        void runDeviceManagementAction("open-recovery", () =>
                                            onOpenRecovery?.()
                                        )
                                    }
                                >
                                    {t("OPEN")}
                                </button>
                            </ActionRow>
                        ) : null}
                        {deviceManagementLoading ? (
                            <div className="setting-item">
                                <div className="setting-item-info">
                                    <div className="setting-item-description">
                                        {t("SETTINGS_SYNC_DEVICE_LOADING")}
                                    </div>
                                </div>
                            </div>
                        ) : null}
                        {deviceManagementError ? (
                            <div className="setting-item">
                                <div className="setting-item-info">
                                    <div className="setting-item-description">
                                        {deviceManagementError}
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : null}
                <div className="setting-item setting-item-heading sr-device-group-heading">
                    <div className="setting-item-info">
                        <div className="setting-item-name">{t("SETTINGS_SYNC_THIS_DEVICE")}</div>
                    </div>
                </div>
                <div className="setting-items sr-device-management-list">
                    {currentDevice ? (
                        <DeviceCard
                            device={currentDevice}
                            isReadOnly={isReadOnly}
                            isBusy={actionKey !== null}
                            isEditingName={isRenamingCurrent}
                            renameValue={renameValue}
                            renameConfirmDisabled={
                                renameValue.trim().length === 0 ||
                                renameValue.trim() === currentDevice.deviceName
                            }
                            onRenameValueChange={setRenameValue}
                            onStartRename={() => setIsRenamingCurrent(true)}
                            onCancelRename={() => {
                                setRenameValue(currentDevice.deviceName);
                                setIsRenamingCurrent(false);
                            }}
                            onConfirmRename={() => {
                                const nextDeviceName = renameValue.trim();
                                if (!nextDeviceName) {
                                    return;
                                }

                                void runDeviceManagementAction("rename-device", () =>
                                    onRenameCurrentDevice?.(nextDeviceName),
                                ).then((completed) => {
                                    if (completed) {
                                        setIsRenamingCurrent(false);
                                    }
                                });
                            }}
                            onPullToCurrent={() => undefined}
                            onDeleteDevice={() => undefined}
                        />
                    ) : (
                        <div className="setting-item">
                            <div className="setting-item-info">
                                <div className="setting-item-description">
                                    {t("SETTINGS_SYNC_NO_CURRENT_DEVICE")}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <div className="setting-item setting-item-heading sr-device-group-heading">
                    <div className="setting-item-info">
                        <div className="setting-item-name">{t("SETTINGS_SYNC_OTHER_DEVICES")}</div>
                    </div>
                </div>
                <div className="setting-items sr-device-management-list">
                    {otherDevices.length > 0 ? (
                        otherDevices.map((device) => (
                            <DeviceCard
                                key={device.deviceId}
                                device={device}
                                isReadOnly={isReadOnly}
                                isBusy={actionKey !== null}
                                isEditingName={false}
                                renameValue=""
                                renameConfirmDisabled
                                onRenameValueChange={() => undefined}
                                onStartRename={() => undefined}
                                onCancelRename={() => undefined}
                                onConfirmRename={() => undefined}
                                onPullToCurrent={() =>
                                    void runDeviceManagementAction(`pull:${device.deviceId}`, () =>
                                        onPullToCurrentDevice?.(device.deviceId),
                                    )
                                }
                                onDeleteDevice={() =>
                                    void runDeviceManagementAction(
                                        `delete-valid:${device.deviceId}`,
                                        () => onDeleteValidDevice?.(device.deviceId),
                                    )
                                }
                            />
                        ))
                    ) : (
                        <div className="setting-item">
                            <div className="setting-item-info">
                                <div className="setting-item-description">
                                    {t("SETTINGS_SYNC_VALID_DEVICE_EMPTY")}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                {invalidDevices.length ? (
                    <>
                        <div className="setting-item setting-item-heading sr-device-group-heading">
                            <div className="setting-item-info">
                                <div className="setting-item-name">
                                    {t("SETTINGS_SYNC_INVALID_DEVICES")}
                                </div>
                            </div>
                        </div>
                        <div className="setting-items sr-device-management-list">
                            {invalidDevices.map((entry) => (
                                <InvalidDeviceCard
                                    key={entry.deviceFolderName}
                                    device={entry}
                                    isReadOnly={isReadOnly}
                                    isBusy={actionKey !== null}
                                    onDelete={() =>
                                        void runDeviceManagementAction(
                                            `delete-invalid:${entry.deviceFolderName}`,
                                            () => onDeleteInvalidDevice?.(entry.deviceFolderName),
                                        )
                                    }
                                />
                            ))}
                        </div>
                    </>
                ) : null}
            </Section>
        </div>
    );
};

// ==========================================
// UI Tab
// ==========================================
const UITab: React.FC<TabProps> = ({ settings, onChange }) => (
    <div className="sr-settings-sections">
        <Section title={t("SETTINGS_SECTION_GENERAL")}>
            <ToggleRow
                label={t("SETTINGS_SHOW_STATUS_BAR")}
                desc={t("SETTINGS_SHOW_STATUS_BAR_DESC")}
                value={settings.showStatusBar}
                onChange={(v) => onChange("showStatusBar", v)}
            />
        </Section>
        <Section title={t("SETTINGS_SECTION_STATUS_BAR_ANIM")}>
            <ToggleRow
                label={t("SETTINGS_SHOW_DUE_NOTIF")}
                desc={t("SETTINGS_SHOW_DUE_NOTIF_DESC")}
                value={settings.showStatusBarDueNotification}
                onChange={(v) => onChange("showStatusBarDueNotification", v)}
            />
            <ColorPickerRow
                label={t("SETTINGS_NOTE_DUE_COLOR")}
                desc={t("SETTINGS_NOTE_DUE_COLOR_DESC")}
                value={settings.noteStatusBarColor}
                onChange={(v) => onChange("noteStatusBarColor", v)}
            />
            <SelectRow
                label={t("SETTINGS_NOTE_ANIM")}
                desc={t("SETTINGS_NOTE_ANIM_DESC")}
                value={settings.noteStatusBarAnimation}
                options={[
                    { label: t("SETTINGS_OPT_NO_ANIM"), value: "None" },
                    { label: t("SETTINGS_OPT_BREATHING"), value: "Breathing" },
                ]}
                onChange={(v) => onChange("noteStatusBarAnimation", v)}
            />
            <SliderRow
                label={t("SETTINGS_NOTE_PERIOD")}
                desc={t("SETTINGS_NOTE_PERIOD_DESC")}
                value={settings.noteStatusBarPeriod}
                min={0.1}
                max={20}
                step={0.1}
                onChange={(v) => onChange("noteStatusBarPeriod", v)}
            />
            <ColorPickerRow
                label={t("SETTINGS_CARD_DUE_COLOR")}
                desc={t("SETTINGS_CARD_DUE_COLOR_DESC")}
                value={settings.flashcardStatusBarColor}
                onChange={(v) => onChange("flashcardStatusBarColor", v)}
            />
            <SelectRow
                label={t("SETTINGS_CARD_ANIM")}
                desc={t("SETTINGS_CARD_ANIM_DESC")}
                value={settings.flashcardStatusBarAnimation}
                options={[
                    { label: t("SETTINGS_OPT_NO_ANIM"), value: "None" },
                    { label: t("SETTINGS_OPT_BREATHING"), value: "Breathing" },
                ]}
                onChange={(v) =>
                    onChange(
                        "flashcardStatusBarAnimation",
                        v as UISettingsState["flashcardStatusBarAnimation"],
                    )
                }
            />
            <SliderRow
                label={t("SETTINGS_CARD_PERIOD")}
                desc={t("SETTINGS_CARD_PERIOD_DESC")}
                value={settings.flashcardStatusBarPeriod}
                min={0.1}
                max={20}
                step={0.1}
                onChange={(v) => onChange("flashcardStatusBarPeriod", v)}
            />
        </Section>

        <Section title={t("SETTINGS_SECTION_PROGRESS_BAR")}>
            <ColorPickerRow
                label={t("SETTINGS_PROGRESS_BAR_COLOR")}
                desc={t("SETTINGS_PROGRESS_BAR_COLOR_DESC")}
                value={settings.progressBarStyle.color}
                onChange={(v) =>
                    onChange("progressBarStyle", { ...settings.progressBarStyle, color: v })
                }
            />
            <ColorPickerRow
                label={t("SETTINGS_PROGRESS_WARNING_COLOR")}
                desc={t("SETTINGS_PROGRESS_WARNING_COLOR_DESC")}
                value={settings.progressBarStyle.warningColor}
                onChange={(v) =>
                    onChange("progressBarStyle", { ...settings.progressBarStyle, warningColor: v })
                }
            />
            <ToggleRow
                label={t("SETTINGS_PROGRESS_RTL")}
                desc={t("SETTINGS_PROGRESS_RTL_DESC")}
                value={settings.progressBarStyle.rightToLeft}
                onChange={(v) =>
                    onChange("progressBarStyle", { ...settings.progressBarStyle, rightToLeft: v })
                }
            />
        </Section>

        <Section title={t("SETTINGS_SECTION_DEBUG")}>
            <ToggleRow
                label={t("SETTINGS_RUNTIME_DEBUG_MESSAGES")}
                desc={t("SETTINGS_RUNTIME_DEBUG_MESSAGES_DESC")}
                value={settings.showRuntimeDebugMessages}
                onChange={(v) => onChange("showRuntimeDebugMessages", v)}
            />
        </Section>
    </div>
);

// ==========================================
// 子页面：Help
// ==========================================
// (Removed as requested)

// ==========================================
// 子页面：License
// ==========================================
interface LicenseTabProps {
    settings: UISettingsState;
    onChange: <K extends keyof UISettingsState>(key: K, value: UISettingsState[K]) => void;
}

const LicenseTab: React.FC<LicenseTabProps> = ({ settings, onChange }) => {
    const [inputKey, setInputKey] = useState(settings.licenseKey || "");
    const [loading, setLoading] = useState(false);

    const handleActivate = useCallback(async () => {
        if (!inputKey.trim()) {
            new Notice(t("SETTINGS_MSG_ENTER_KEY"));
            return;
        }
        setLoading(true);
        try {
            // 动态导入 LicenseManager，避免循环依赖
            const { LicenseManager } = await import("src/services/LicenseManager");
            const mgr = LicenseManager.getInstance();
            const success = await mgr.activateLicense(inputKey.trim(), settings);
            onChange("licenseInstallationId", settings.licenseInstallationId);
            onChange("licenseState", settings.licenseState);
            if (success) {
                onChange("isPro", true);
                onChange("licenseKey", inputKey.trim());
                new Notice(t("SETTINGS_MSG_VERIFY_SUCCESS"));
            } else {
                new Notice(t("SETTINGS_MSG_VERIFY_FAIL"));
            }
        } catch {
            new Notice(t("SETTINGS_MSG_NET_ERROR"));
        }
        setLoading(false);
    }, [inputKey, settings, onChange]);

    const handleDeactivate = useCallback(async () => {
        try {
            const { LicenseManager } = await import("src/services/LicenseManager");
            const mgr = LicenseManager.getInstance();
            mgr.deactivateLicense(settings);
            onChange("licenseInstallationId", settings.licenseInstallationId);
            onChange("licenseState", settings.licenseState);
            onChange("isPro", false);
            onChange("licenseKey", "");
            setInputKey("");
            new Notice(t("SETTINGS_MSG_DEACTIVATE_SUCCESS"));
        } catch {
            new Notice(t("SETTINGS_MSG_DEACTIVATE_FAIL"));
        }
    }, [settings, onChange]);

    return (
        <div className="sr-settings-sections">
            {/* 状态卡片 */}
            <p className="sr-settings-license-note">
                {settings.isPro
                    ? t("SETTINGS_SUPPORTER_DESC_PRO")
                    : t("SETTINGS_SUPPORTER_DESC_FREE")}
            </p>

            <Section title={t("SETTINGS_SECTION_LICENSE")}>
                {!settings.isPro ? (
                    <>
                        <InputRow
                            label={t("SETTINGS_LICENSE_KEY")}
                            desc={t("SETTINGS_LICENSE_KEY_DESC")}
                            value={inputKey}
                            onChange={setInputKey}
                            inputClassName="sr-license-key-input"
                            placeholder={t("SETTINGS_LICENSE_PLACEHOLDER")}
                            disabled={loading}
                        />
                        <ActionRow label={t("SETTINGS_VERIFY")} desc={t("SETTINGS_VERIFY_DESC")}>
                            <button
                                onClick={() => {
                                    void handleActivate();
                                }}
                                disabled={loading || !inputKey.trim()}
                            >
                                {loading ? t("SETTINGS_BTN_VERIFYING") : t("SETTINGS_BTN_ACTIVATE")}
                            </button>
                        </ActionRow>
                    </>
                ) : (
                    <ActionRow
                        label={t("SETTINGS_DEACTIVATE_LICENSE")}
                        desc={t("SETTINGS_DEACTIVATE_LICENSE_DESC")}
                    >
                        <button
                            onClick={() => {
                                void handleDeactivate();
                            }}
                        >
                            {t("SETTINGS_BTN_DEACTIVATE")}
                        </button>
                    </ActionRow>
                )}
            </Section>

            {/* 页脚文字 - 移出 Section 确保没有背景包裹 */}
            {!settings.isPro && (
                <div
                    style={{
                        marginTop: "24px",
                        textAlign: "center",
                        color: "var(--text-faint)",
                        fontSize: "0.82em",
                        fontStyle: "italic",
                        opacity: 0.8,
                    }}
                >
                    {t("SETTINGS_FOOTER_TEXT")}
                </div>
            )}
        </div>
    );
};

// ==========================================
// 主组件
// ==========================================
export const EmbeddedSettingsPanel: React.FC<EmbeddedSettingsPanelProps> = ({
    settings: initialSettings,
    onSettingsChange,
    loadSyroDeviceManagement,
    onSyroRenameCurrentDevice,
    onSyroPullToCurrentDevice,
    onSyroDeleteValidDevice,
    onSyroOpenRecovery,
    onSyroDeleteInvalidDevice,
    version: _version = "0.0.1",
}) => {
    const mobileNavbarOffset = useMobileNavbarOffset();
    const [activeTab, setActiveTab] = useState<TabId>("flashcards");
    const [headerActiveTab, setHeaderActiveTab] = useState<TabId>("flashcards");
    const [settings, setSettings] = useState<UISettingsState>(initialSettings);
    const [deviceManagement, setDeviceManagement] = useState<SyroDeviceManagementViewState | null>(
        null,
    );
    const [deviceManagementLoading, setDeviceManagementLoading] = useState(false);
    const [deviceManagementError, setDeviceManagementError] = useState<string | null>(null);
    const [isSwipeAnimating, setIsSwipeAnimating] = useState(false);
    const contentViewportRef = useRef<HTMLDivElement>(null);
    const contentTrackRef = useRef<HTMLDivElement>(null);
    const currentContentScrollRef = useRef<HTMLDivElement>(null);
    const contentSwipeAnimationTimerRef = useRef<number | null>(null);
    const contentSwipeStateRef = useRef({
        startX: 0,
        startY: 0,
        excluded: false,
        isSwiping: false,
    });

    // 当设置变化时通知父组件
    useEffect(() => {
        onSettingsChange(settings);
    }, [settings, onSettingsChange]);

    useEffect(() => {
        setHeaderActiveTab(activeTab);
    }, [activeTab]);

    const reloadDeviceManagement = useCallback(async () => {
        if (!loadSyroDeviceManagement) {
            setDeviceManagement(null);
            setDeviceManagementError(null);
            setDeviceManagementLoading(false);
            return;
        }

        setDeviceManagementLoading(true);
        try {
            const nextState = await loadSyroDeviceManagement();
            setDeviceManagement(nextState);
            setDeviceManagementError(null);
        } catch (error) {
            console.error("[SR-Settings] Failed to load Syro device management state", error);
            setDeviceManagementError(t("SETTINGS_SYNC_DEVICE_LOAD_ERROR"));
        } finally {
            setDeviceManagementLoading(false);
        }
    }, [loadSyroDeviceManagement]);

    useEffect(() => {
        void reloadDeviceManagement();
    }, [reloadDeviceManagement]);

    const handleChange = useCallback(
        <K extends keyof UISettingsState>(key: K, value: UISettingsState[K]) => {
            setSettings((prev) => ({ ...prev, [key]: value }));
        },
        [],
    );

    const clearContentSwipeAnimationTimer = useCallback(() => {
        if (contentSwipeAnimationTimerRef.current !== null) {
            window.clearTimeout(contentSwipeAnimationTimerRef.current);
            contentSwipeAnimationTimerRef.current = null;
        }
    }, []);

    useEffect(() => clearContentSwipeAnimationTimer, [clearContentSwipeAnimationTimer]);

    const setContentTrackOffset = useCallback((offset: number) => {
        if (!contentTrackRef.current) {
            return;
        }

        contentTrackRef.current.style.setProperty("--sr-swipe-offset", `${offset}px`);
    }, []);

    const getContentWidth = useCallback(
        () => Math.max(contentViewportRef.current?.clientWidth ?? 0, 320),
        [],
    );

    const previousTab = getAdjacentTabId(activeTab, -1);
    const nextTab = getAdjacentTabId(activeTab, 1);
    const previousTabId = previousTab === activeTab ? null : previousTab;
    const nextTabId = nextTab === activeTab ? null : nextTab;

    const resetSwipePresentation = useCallback(() => {
        setIsSwipeAnimating(false);
        setContentTrackOffset(0);
    }, [setContentTrackOffset]);

    const animateSwipeTrack = useCallback(
        (offset: number, onComplete: () => void) => {
            clearContentSwipeAnimationTimer();
            setIsSwipeAnimating(true);
            setContentTrackOffset(offset);
            contentSwipeAnimationTimerRef.current = window.setTimeout(() => {
                contentSwipeAnimationTimerRef.current = null;
                onComplete();
            }, CONTENT_SWIPE_ANIMATION_MS);
        },
        [clearContentSwipeAnimationTimer, setContentTrackOffset],
    );

    const renderTabContent = useCallback(
        (tabId: TabId) => {
            switch (tabId) {
                case "flashcards":
                    return <FlashcardsTab settings={settings} onChange={handleChange} />;
                case "notes":
                    return <NotesTab settings={settings} onChange={handleChange} />;
                case "algo":
                    return <AlgoTab settings={settings} onChange={handleChange} />;
                case "ui":
                    return <UITab settings={settings} onChange={handleChange} />;
                case "sync":
                    return (
                        <SyncTab
                            settings={settings}
                            onChange={handleChange}
                            deviceManagement={deviceManagement}
                            deviceManagementLoading={deviceManagementLoading}
                            deviceManagementError={deviceManagementError}
                            reloadDeviceManagement={reloadDeviceManagement}
                            onRenameCurrentDevice={onSyroRenameCurrentDevice}
                            onPullToCurrentDevice={onSyroPullToCurrentDevice}
                            onDeleteValidDevice={onSyroDeleteValidDevice}
                            onOpenRecovery={onSyroOpenRecovery}
                            onDeleteInvalidDevice={onSyroDeleteInvalidDevice}
                        />
                    );
                case "license":
                    return <LicenseTab settings={settings} onChange={handleChange} />;
                default:
                    return null;
            }
        },
        [
            deviceManagement,
            deviceManagementError,
            deviceManagementLoading,
            handleChange,
            reloadDeviceManagement,
            onSyroDeleteInvalidDevice,
            onSyroDeleteValidDevice,
            onSyroOpenRecovery,
            onSyroPullToCurrentDevice,
            onSyroRenameCurrentDevice,
            settings,
        ],
    );

    useLayoutEffect(() => {
        if (contentViewportRef.current) {
            contentViewportRef.current.scrollTop = 0;
            contentViewportRef.current.scrollLeft = 0;
        }
        currentContentScrollRef.current?.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
        if (currentContentScrollRef.current) {
            currentContentScrollRef.current.scrollTop = 0;
            currentContentScrollRef.current.scrollLeft = 0;
        }
        resetSwipePresentation();
    }, [activeTab, resetSwipePresentation]);

    const resetContentSwipeState = useCallback(() => {
        contentSwipeStateRef.current = {
            startX: 0,
            startY: 0,
            excluded: false,
            isSwiping: false,
        };
    }, []);

    const handleTabSelect = useCallback(
        (tabId: TabId) => {
            clearContentSwipeAnimationTimer();
            setHeaderActiveTab(tabId);
            setActiveTab(tabId);
            resetSwipePresentation();
            resetContentSwipeState();
        },
        [clearContentSwipeAnimationTimer, resetContentSwipeState, resetSwipePresentation],
    );

    const handleContentTouchStart = useCallback(
        (e: React.TouchEvent<HTMLDivElement>) => {
            if (e.touches.length !== 1) {
                resetContentSwipeState();
                return;
            }

            clearContentSwipeAnimationTimer();
            setIsSwipeAnimating(false);
            setContentTrackOffset(0);
            setHeaderActiveTab(activeTab);

            const touch = e.touches[0];
            contentSwipeStateRef.current = {
                startX: touch.clientX,
                startY: touch.clientY,
                excluded: isSwipeGestureExcludedTarget(e.target),
                isSwiping: false,
            };
        },
        [activeTab, clearContentSwipeAnimationTimer, resetContentSwipeState, setContentTrackOffset],
    );

    const handleContentTouchMove = useCallback(
        (e: React.TouchEvent<HTMLDivElement>) => {
            if (e.touches.length !== 1) {
                return;
            }

            const swipeState = contentSwipeStateRef.current;
            if (swipeState.excluded) {
                return;
            }

            const touch = e.touches[0];
            const deltaX = touch.clientX - swipeState.startX;
            const deltaY = touch.clientY - swipeState.startY;
            const absDeltaX = Math.abs(deltaX);
            const absDeltaY = Math.abs(deltaY);

            if (!swipeState.isSwiping) {
                if (
                    absDeltaX >= CONTENT_SWIPE_ACTIVATION_THRESHOLD &&
                    absDeltaX > absDeltaY * CONTENT_SWIPE_RATIO
                ) {
                    swipeState.isSwiping = true;
                } else if (absDeltaY > absDeltaX) {
                    swipeState.excluded = true;
                    return;
                }
            }

            if (!swipeState.isSwiping) {
                return;
            }

            const contentWidth = getContentWidth();
            const hasTargetTab = deltaX < 0 ? nextTabId !== null : previousTabId !== null;
            if (hasTargetTab) {
                setContentTrackOffset(Math.max(-contentWidth, Math.min(contentWidth, deltaX)));
            } else {
                setContentTrackOffset(deltaX * CONTENT_SWIPE_EDGE_RESISTANCE);
            }

            e.preventDefault();
        },
        [getContentWidth, nextTabId, previousTabId, setContentTrackOffset],
    );

    const handleContentTouchEnd = useCallback(
        (e: React.TouchEvent<HTMLDivElement>) => {
            const swipeState = contentSwipeStateRef.current;
            const touch = e.changedTouches[0];

            if (!touch || swipeState.excluded) {
                resetSwipePresentation();
                resetContentSwipeState();
                return;
            }

            const deltaX = touch.clientX - swipeState.startX;
            const deltaY = touch.clientY - swipeState.startY;
            const absDeltaX = Math.abs(deltaX);
            const absDeltaY = Math.abs(deltaY);
            const targetTabId = deltaX < 0 ? nextTabId : previousTabId;

            if (
                swipeState.isSwiping &&
                targetTabId &&
                absDeltaX >= CONTENT_SWIPE_SWITCH_THRESHOLD &&
                absDeltaX > absDeltaY * CONTENT_SWIPE_RATIO
            ) {
                const finalOffset = deltaX < 0 ? -getContentWidth() : getContentWidth();
                setHeaderActiveTab(targetTabId);
                animateSwipeTrack(finalOffset, () => {
                    setActiveTab(targetTabId);
                });
                e.preventDefault();
            } else if (swipeState.isSwiping) {
                animateSwipeTrack(0, resetSwipePresentation);
            } else {
                resetSwipePresentation();
            }

            resetContentSwipeState();
        },
        [
            animateSwipeTrack,
            getContentWidth,
            nextTabId,
            previousTabId,
            resetContentSwipeState,
            resetSwipePresentation,
        ],
    );

    return (
        <div
            className="sr-settings-panel"
            style={{ ["--sr-mobile-navbar-offset" as string]: `${mobileNavbarOffset}px` }}
        >
            {/* Horizontal Header */}
            <TabHeader tabs={TABS} activeTab={headerActiveTab} onTabSelect={handleTabSelect} />

            {/* Scrollable Content Area */}
            <div
                className="sr-style-setting-content"
                onTouchStart={handleContentTouchStart}
                onTouchMove={handleContentTouchMove}
                onTouchEnd={handleContentTouchEnd}
                onTouchCancel={() => {
                    resetSwipePresentation();
                    resetContentSwipeState();
                }}
                ref={contentViewportRef}
            >
                <div
                    className={`sr-style-setting-content-track ${
                        isSwipeAnimating ? "is-swipe-transitioning" : ""
                    }`}
                    ref={contentTrackRef}
                >
                    <div
                        className={`sr-style-setting-content-pane is-prev ${
                            previousTabId ? "" : "is-placeholder"
                        }`}
                        data-pane-role="prev"
                        data-tab-id={previousTabId ?? ""}
                        aria-hidden="true"
                    >
                        <div className="sr-style-setting-content-pane-body">
                            <div
                                className="sr-style-setting-content-pane-scroll"
                                key={`prev-${previousTabId ?? "placeholder"}`}
                            >
                                <div className="sr-style-setting-content-pane-inner">
                                    {previousTabId ? renderTabContent(previousTabId) : null}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div
                        className="sr-style-setting-content-pane is-current"
                        data-pane-role="current"
                        data-tab-id={activeTab}
                    >
                        <div className="sr-style-setting-content-pane-body">
                            <div
                                className="sr-style-setting-content-pane-scroll"
                                key={`current-${activeTab}`}
                                ref={currentContentScrollRef}
                            >
                                <div className="sr-style-setting-content-pane-inner">
                                    {renderTabContent(activeTab)}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div
                        className={`sr-style-setting-content-pane is-next ${
                            nextTabId ? "" : "is-placeholder"
                        }`}
                        data-pane-role="next"
                        data-tab-id={nextTabId ?? ""}
                        aria-hidden="true"
                    >
                        <div className="sr-style-setting-content-pane-body">
                            <div
                                className="sr-style-setting-content-pane-scroll"
                                key={`next-${nextTabId ?? "placeholder"}`}
                            >
                                <div className="sr-style-setting-content-pane-inner">
                                    {nextTabId ? renderTabContent(nextTabId) : null}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
