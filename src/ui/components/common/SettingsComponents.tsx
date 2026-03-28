/** @jsxImportSource react */
import React from "react";
import { t } from "src/lang/helpers";

// ==========================================
// Base Component (Standard Obsidian Setting Item)
// ==========================================
interface BaseComponentProps {
    label: React.ReactNode;
    desc?: React.ReactNode;
    tooltip?: string;
    children: React.ReactNode;
    className?: string;
    controlClassName?: string;
}

export const BaseComponent: React.FC<BaseComponentProps> = ({
    label,
    desc,
    tooltip,
    children,
    className = "",
    controlClassName = "",
}) => (
    <div className={["setting-item", className].filter(Boolean).join(" ")}>
        <div className="setting-item-info" title={tooltip}>
            <div className="setting-item-name">{label}</div>
            {desc && <div className="setting-item-description">{desc}</div>}
        </div>
        <div className={["setting-item-control", controlClassName].filter(Boolean).join(" ")}>
            {children}
        </div>
    </div>
);

// ==========================================
// Section Interface (Native Obsidian Grouping)
// ==========================================
interface SectionProps {
    title?: string;
    children: React.ReactNode;
}

// Keep layout styling in CSS so sections stay aligned with the Obsidian theme.
export const Section: React.FC<SectionProps> = ({ title, children }) => (
    <div className="setting-group sr-setting-section">
        {title && (
            <div className="setting-item setting-item-heading">
                <div className="setting-item-name">{title}</div>
                <div className="setting-item-control" />
            </div>
        )}
        <div className="setting-items">{children}</div>
    </div>
);

// ==========================================
// Toggle Row
// ==========================================
interface ToggleRowProps {
    label: React.ReactNode;
    desc?: string;
    tooltip?: string;
    value: boolean;
    onChange: (v: boolean) => void;
}

export const ToggleRow: React.FC<ToggleRowProps> = ({ label, desc, tooltip, value, onChange }) => (
    <BaseComponent label={label} desc={desc} tooltip={tooltip} className="mod-toggle">
        <label className={`checkbox-container ${value ? "is-enabled" : ""}`} tabIndex={0}>
            <input
                type="checkbox"
                tabIndex={0}
                checked={value}
                onChange={(e) => onChange(e.target.checked)}
            />
        </label>
    </BaseComponent>
);

// ==========================================
// Input Row
// ==========================================
interface InputRowProps {
    label: React.ReactNode;
    desc?: string;
    tooltip?: string;
    value: string | number;
    onChange: (v: string) => void;
    onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
    onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
    type?: string;
    className?: string;
    inputClassName?: string;
    placeholder?: string;
    disabled?: boolean;
}

export const InputRow: React.FC<InputRowProps> = ({
    label,
    desc,
    tooltip,
    value,
    onChange,
    onFocus,
    onBlur,
    type = "text",
    className = "",
    inputClassName = "",
    placeholder,
    disabled,
}) => (
    <BaseComponent label={label} desc={desc} tooltip={tooltip} className={className}>
        <input
            type={type}
            className={inputClassName}
            spellCheck={type === "text" ? false : undefined}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder={placeholder}
            disabled={disabled}
        />
    </BaseComponent>
);

// ==========================================
// TextArea Row
// ==========================================
interface TextAreaRowProps {
    label: React.ReactNode;
    desc?: string;
    tooltip?: string;
    value: string;
    onChange: (v: string) => void;
    rows?: number;
}

export const TextAreaRow: React.FC<TextAreaRowProps> = ({
    label,
    desc,
    tooltip,
    value,
    onChange,
    rows = 3,
}) => (
    <BaseComponent label={label} desc={desc} tooltip={tooltip} className="setting-item--textarea">
        <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            spellCheck={false}
        />
    </BaseComponent>
);

// ==========================================
// Select Row
// ==========================================
interface SelectOption {
    label: string;
    value: string;
}

interface SelectRowProps {
    label: React.ReactNode;
    desc?: string;
    tooltip?: string;
    value: string;
    options: SelectOption[];
    onChange: (v: string) => void;
    disabled?: boolean;
}

export const SelectRow: React.FC<SelectRowProps> = ({
    label,
    desc,
    tooltip,
    value,
    options,
    onChange,
    disabled,
}) => (
    <BaseComponent label={label} desc={desc} tooltip={tooltip}>
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="dropdown"
            disabled={disabled}
        >
            {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                    {opt.label}
                </option>
            ))}
        </select>
    </BaseComponent>
);

// ==========================================
// Color Picker Row
// ==========================================
interface ColorPickerRowProps {
    label: React.ReactNode;
    desc?: string;
    tooltip?: string;
    value: string;
    onChange: (v: string) => void;
}

export const ColorPickerRow: React.FC<ColorPickerRowProps> = ({
    label,
    desc,
    tooltip,
    value,
    onChange,
}) => (
    <BaseComponent label={label} desc={desc} tooltip={tooltip} className="setting-item--color">
        <label className="sr-color-input-shell">
            <input
                type="color"
                className="sr-color-input"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
            <span
                className="sr-color-input-swatch"
                style={{ backgroundColor: value }}
                aria-hidden="true"
            />
        </label>
    </BaseComponent>
);

// ==========================================
// Slider Row
// ==========================================
interface SliderRowProps {
    label: React.ReactNode;
    desc?: string;
    tooltip?: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
}

export const SliderRow: React.FC<SliderRowProps> = ({
    label,
    desc,
    tooltip,
    value,
    min,
    max,
    step,
    onChange,
}) => (
    <BaseComponent label={label} desc={desc} tooltip={tooltip} className="cmdr-slider">
        <div style={{ display: "flex", alignItems: "center", width: "100%", gap: "8px" }}>
            <input
                type="range"
                className="slider"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                style={{ flexGrow: 1 }}
            />
            <span
                style={{
                    minWidth: "30px",
                    textAlign: "right",
                    fontSize: "12px",
                    color: "var(--text-muted)",
                }}
            >
                {value}
            </span>
        </div>
    </BaseComponent>
);

// ==========================================
// Action Row
// ==========================================
interface ActionRowProps {
    label: React.ReactNode;
    desc?: React.ReactNode;
    tooltip?: string;
    children: React.ReactNode;
    className?: string;
}

export const ActionRow: React.FC<ActionRowProps> = ({
    label,
    desc,
    tooltip,
    children,
    className = "",
}) => (
    <BaseComponent
        label={label}
        desc={desc}
        tooltip={tooltip}
        className={["setting-item--action", className].filter(Boolean).join(" ")}
    >
        {children}
    </BaseComponent>
);

// ==========================================
// Link Row
// ==========================================
interface LinkRowProps {
    label: React.ReactNode;
    onClick?: () => void;
}

export const LinkRow: React.FC<LinkRowProps> = ({ label, onClick }) => (
    <ActionRow label={label}>
        <button onClick={onClick} style={{ cursor: "pointer" }}>
            {t("OPEN")}
        </button>
    </ActionRow>
);
