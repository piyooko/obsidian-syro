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
import React, { useState, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
    Layers,
    FileText,
    Calendar,
    Layout,
    HelpCircle,
    Shield,
    PieChart,
    ChevronDown,
    ChevronRight,
    Search,
    X,
    Cpu,
} from "lucide-react";
import { t } from "src/lang/helpers";
import { UISettingsState } from "../types/settingsTypes";
import {
    Section,
    ToggleRow,
    InputRow,
    TextAreaRow,
    SelectRow,
    ColorPickerRow,
    SliderRow,
    LinkRow,
} from "./common/SettingsComponents";

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

const LabelWithSupporter = ({ label, isLocked }: { label: string; isLocked: boolean }) => (
    <span className="sr-supporter-label-wrap">
        <span>{label}</span>
        {isLocked && (
            <span className="sr-supporter-badge" aria-label="支持者功能">
                <SupporterDiamond />
                <span>支持者功能</span>
            </span>
        )}
    </span>
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

// ==========================================
// Props 接口
// ==========================================
interface EmbeddedSettingsPanelProps {
    settings: UISettingsState;
    onSettingsChange: (newSettings: UISettingsState) => void;
    version?: string;
}

interface TabProps {
    settings: UISettingsState;
    onChange: <K extends keyof UISettingsState>(key: K, value: UISettingsState[K]) => void;
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

// ==========================================
// Tab Header Component
// ==========================================
interface TabHeaderProps {
    tabs: typeof TABS;
    activeTab: string;
    setActiveTab: (id: string) => void;
}

const TabHeader: React.FC<TabHeaderProps> = ({ tabs, activeTab, setActiveTab }) => {
    const scrollContainer = useRef<HTMLDivElement>(null);

    const handleScroll = (e: React.WheelEvent) => {
        if (scrollContainer.current) {
            scrollContainer.current.scrollLeft += e.deltaY;
        }
    };

    return (
        <nav className="sr-style-setting-header" onWheel={handleScroll} ref={scrollContainer}>
            <div className="sr-style-setting-tab-group">
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <div
                            key={tab.id}
                            className={`sr-style-tab ${isActive ? "sr-style-tab-active" : ""}`}
                            onClick={() => setActiveTab(tab.id)}
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
            new Notice(`「${featureName}」为支持者版功能`);
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
                        (
                            <LabelWithSupporter
                                label={t("SETTINGS_ANKI_CLOZE")}
                                isLocked={isFree}
                            />
                        )
                    }
                    desc={t("SETTINGS_ANKI_CLOZE_DESC")}
                    value={settings.convertAnkiClozesToClozes}
                    onChange={(v) =>
                        handleLockedToggle("convertAnkiClozesToClozes", v, "Anki 挖空")
                    }
                />
                <ToggleRow
                    label={
                        (
                            <LabelWithSupporter
                                label={t("SETTINGS_CODE_CLOZE")}
                                isLocked={isFree}
                            />
                        )
                    }
                    desc={t("SETTINGS_CODE_CLOZE_DESC")}
                    value={settings.parseClozesInCodeBlocks}
                    onChange={(v) => handleLockedToggle("parseClozesInCodeBlocks", v, "代码块挖空")}
                />
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
                <SliderRow
                    label={t("SETTINGS_CLOZE_CONTEXT_SOFT_LIMIT")}
                    desc={t("SETTINGS_CLOZE_CONTEXT_SOFT_LIMIT_DESC")}
                    value={settings.clozeContextSoftLimitLines}
                    min={1}
                    max={1000}
                    step={1}
                    onChange={(v) =>
                        onChange("clozeContextSoftLimitLines", Math.max(1, Math.min(1000, v)))
                    }
                />
                {settings.parseClozesInCodeBlocks && (
                    <div
                        style={{
                            paddingLeft: "20px",
                            borderLeft: "2px solid var(--background-modifier-border)",
                        }}
                    >
                        <SliderRow
                            label="代码上下文行数"
                            desc="生成卡片时，保留挖空处上下多少行代码。防止卡片内容过长。"
                            value={settings.codeContextLines}
                            min={5}
                            max={100}
                            step={5}
                            onChange={(v) => onChange("codeContextLines", v)}
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
                    label={t("SETTINGS_INLINE_SEPARATOR")}
                    value={settings.singleLineCardSeparator}
                    onChange={(v) => onChange("singleLineCardSeparator", v)}
                />
                <InputRow
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
            <Section title={t("ALGO_LOCATOR_TITLE") || "Locator"}>
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

            {/* 2. FSRS 部分 (保持不变) */}
            <Section title={"FSRS (Flashcards)"}>
                {/* ... */}
                <div
                    style={{
                        padding: "12px 20px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        opacity: 0.8,
                    }}
                >
                    <div style={{ fontSize: "0.9em" }}>{t("FSRS_DESC")}</div>
                </div>
            </Section>

            {/* 3. 笔记复习算法：WMS (带模拟器) */}
            <Section title={t("WMS_ALGORITHM")}>
                <div style={{ padding: "0 4px" }}>
                    {/* --- 模拟器与公式容器 --- */}
                    <div
                        style={{
                            backgroundColor: "var(--background-primary-alt)",
                            border: "1px solid var(--background-modifier-border)",
                            borderRadius: "8px",
                            marginBottom: "24px",
                            overflow: "hidden",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                        }}
                    >
                        {/* A. 模拟器控制栏 (Header) */}
                        <div
                            style={{
                                backgroundColor: "var(--background-secondary)",
                                borderBottom: "1px solid var(--background-modifier-border)",
                                padding: "10px 16px",
                                display: "flex",
                                alignItems: "center",
                                gap: "20px",
                                fontSize: "0.85em",
                                flexWrap: "wrap",
                            }}
                        >
                            <div
                                style={{
                                    fontWeight: "bold",
                                    color: "var(--text-normal)",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                }}
                            >
                                {t("WMS_SIMULATOR_TITLE")}
                            </div>

                            {/* 分隔线 */}
                            <div
                                style={{
                                    width: "1px",
                                    height: "16px",
                                    background: "var(--background-modifier-border)",
                                }}
                            ></div>

                            {/* 控制输入容器：右对齐以便与下方数字对齐 */}
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "20px",
                                    marginLeft: "auto",
                                }}
                            >
                                {/* 控制输入: 假设当前间隔 */}
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <span style={{ color: "var(--text-muted)" }}>
                                        {t("WMS_SIM_CURR_INTERVAL")}
                                    </span>
                                    <input
                                        type="number"
                                        value={simInterval}
                                        onChange={(e) =>
                                            setSimInterval(
                                                Math.max(1, parseInt(e.target.value) || 1),
                                            )
                                        }
                                        onFocus={() => setActiveParam("simInterval")}
                                        onBlur={() => setActiveParam(null)}
                                        style={{
                                            width: "50px",
                                            padding: "2px 4px",
                                            textAlign: "center",
                                            background: "var(--background-primary)",
                                        }}
                                    />
                                    <span style={{ color: "var(--text-muted)" }}>d</span>
                                </div>

                                {/* 控制输入: 假设优先级 */}
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <span style={{ color: "var(--text-muted)" }}>
                                        {t("WMS_SIM_PRIORITY")}
                                    </span>
                                    <input
                                        type="range"
                                        min="1"
                                        max="10"
                                        value={simPriority}
                                        onChange={(e) => setSimPriority(parseInt(e.target.value))}
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
                                style={{ display: "grid", gridTemplateColumns: "1fr", gap: "14px" }}
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
                                            <MNum highlight={activeParam === "wmsAgainInterval"}>
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
                                            <MVar highlight={activeParam === "simInterval"}>I</MVar>
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
                                            <MVar highlight={activeParam === "simInterval"}>I</MVar>
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
                                            <MVar highlight={activeParam === "simInterval"}>I</MVar>
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
const NotesTab: React.FC<TabProps> = ({ settings, onChange }) => (
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

const SyncTab: React.FC<TabProps> = ({ settings, onChange }) => (
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
                onChange={(v) => onChange("syncProgressDisplayMode", v as UISettingsState["syncProgressDisplayMode"])}
            />
        </Section>
    </div>
);

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
                onChange={(v) => onChange("flashcardStatusBarAnimation", v as UISettingsState["flashcardStatusBarAnimation"])}
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

        <Section title={t("SETTINGS_SECTION_DEBUG") || "高级选项与调试"}>
            <ToggleRow
                label={t("SETTINGS_RUNTIME_DEBUG_MESSAGES") || "Debug 调试输出"}
                desc={
                    t("SETTINGS_RUNTIME_DEBUG_MESSAGES_DESC") ||
                    "在开发者控制台显示运行期调试日志，例如同步流程、牌组树刷新和复习会话状态变化。"
                }
                value={settings.showRuntimeDebugMessages}
                onChange={(v) => onChange("showRuntimeDebugMessages", v)}
            />
            <ToggleRow
                label={t("SETTINGS_ENABLE_CARD_TRACE") || "对象级调试追踪 (开发者)"}
                desc={
                    t("SETTINGS_ENABLE_CARD_TRACE_DESC") ||
                    "开启后，将在卡片对象本体内收集追踪生命数据流向。"
                }
                value={settings.enableCardLevelTrace}
                onChange={(v) => onChange("enableCardLevelTrace", v)}
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
            if (success) {
                onChange("isPro", true);
                onChange("licenseKey", inputKey.trim());
                new Notice(t("SETTINGS_MSG_VERIFY_SUCCESS"));
            } else {
                new Notice(t("SETTINGS_MSG_VERIFY_FAIL"));
            }
        } catch (err) {
            new Notice(t("SETTINGS_MSG_NET_ERROR"));
        }
        setLoading(false);
    }, [inputKey, settings, onChange]);

    const handleDeactivate = useCallback(async () => {
        try {
            const { LicenseManager } = await import("src/services/LicenseManager");
            const mgr = LicenseManager.getInstance();
            mgr.deactivateLicense(settings);
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
            <div className="sr-settings-support-card" style={{ textAlign: "center" }}>
                <p style={{ opacity: 0.7, fontSize: "0.85em", whiteSpace: "pre-line" }}>
                    {settings.isPro
                        ? t("SETTINGS_SUPPORTER_DESC_PRO")
                        : t("SETTINGS_SUPPORTER_DESC_FREE")}
                </p>
            </div>

            <Section title={t("SETTINGS_SECTION_LICENSE")}>
                {!settings.isPro ? (
                    <>
                        <div className="setting-item">
                            <div className="setting-item-info">
                                <div className="setting-item-name">{t("SETTINGS_LICENSE_KEY")}</div>
                                <div className="setting-item-description">
                                    {t("SETTINGS_LICENSE_KEY_DESC")}
                                </div>
                            </div>
                            <div className="setting-item-control">
                                <input
                                    type="text"
                                    value={inputKey}
                                    onChange={(e) => setInputKey(e.target.value)}
                                    placeholder={t("SETTINGS_LICENSE_PLACEHOLDER")}
                                    style={{ width: "220px" }}
                                    disabled={loading}
                                />
                            </div>
                        </div>
                        <div className="setting-item">
                            <div className="setting-item-info">
                                <div className="setting-item-name">{t("SETTINGS_VERIFY")}</div>
                                <div className="setting-item-description">
                                    {t("SETTINGS_VERIFY_DESC")}
                                </div>
                            </div>
                            <div className="setting-item-control">
                                <button
                                    onClick={() => {
                                        void handleActivate();
                                    }}
                                    disabled={loading || !inputKey.trim()}
                                >
                                    {loading
                                        ? t("SETTINGS_BTN_VERIFYING")
                                        : t("SETTINGS_BTN_ACTIVATE")}
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="setting-item">
                        <div className="setting-item-info">
                            <div className="setting-item-name">
                                {t("SETTINGS_DEACTIVATE_LICENSE")}
                            </div>
                            <div className="setting-item-description">
                                {t("SETTINGS_DEACTIVATE_LICENSE_DESC")}
                            </div>
                        </div>
                        <div className="setting-item-control">
                            <button
                                onClick={() => {
                                    void handleDeactivate();
                                }}
                            >
                                {t("SETTINGS_BTN_DEACTIVATE")}
                            </button>
                        </div>
                    </div>
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
    version = "0.0.1",
}) => {
    const [activeTab, setActiveTab] = useState("flashcards");
    const [settings, setSettings] = useState<UISettingsState>(initialSettings);

    // 当设置变化时通知父组件
    useEffect(() => {
        onSettingsChange(settings);
    }, [settings, onSettingsChange]);

    const handleChange = useCallback(
        <K extends keyof UISettingsState>(key: K, value: UISettingsState[K]) => {
            setSettings((prev) => ({ ...prev, [key]: value }));
        },
        [],
    );

    return (
        <div className="sr-settings-panel">
            {/* Horizontal Header */}
            <TabHeader tabs={TABS} activeTab={activeTab} setActiveTab={setActiveTab} />

            {/* Scrollable Content Area */}
            <div className="sr-style-setting-content">
                {activeTab === "flashcards" && (
                    <FlashcardsTab settings={settings} onChange={handleChange} />
                )}
                {activeTab === "notes" && <NotesTab settings={settings} onChange={handleChange} />}
                {activeTab === "algo" && <AlgoTab settings={settings} onChange={handleChange} />}
                {activeTab === "ui" && <UITab settings={settings} onChange={handleChange} />}
                {activeTab === "sync" && <SyncTab settings={settings} onChange={handleChange} />}
                {activeTab === "license" && (
                    <LicenseTab settings={settings} onChange={handleChange} />
                )}
            </div>
        </div>
    );
};
