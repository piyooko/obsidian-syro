/** @jsxImportSource react */
import React from "react";

// ==========================================
// Base Component (Standard Obsidian Setting Item)
// ==========================================
interface BaseComponentProps {
    label: React.ReactNode;
    desc?: React.ReactNode;
    tooltip?: string;
    children: React.ReactNode;
    className?: string;
    subSettings?: React.ReactNode;
}

export const BaseComponent: React.FC<BaseComponentProps> = ({
    label,
    desc,
    tooltip,
    children,
    className = "",
    subSettings,
}) => (
    <div className={`setting-item ${className} ${subSettings ? "has-sub-settings" : ""}`.trim()}>
        <div className="sr-setting-item-main">
            <div className="setting-item-info" title={tooltip}>
                <div className="setting-item-name">{label}</div>
                {desc && <div className="setting-item-description">{desc}</div>}
            </div>
            <div className="setting-item-control">{children}</div>
        </div>
        {subSettings && <div className="sr-setting-subsettings">{subSettings}</div>}
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
    <div className="sr-setting-section">
        {title && <div className="setting-item-heading">{title}</div>}
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
    subSettings?: React.ReactNode;
}

export const ToggleRow: React.FC<ToggleRowProps> = ({
    label,
    desc,
    tooltip,
    value,
    onChange,
    subSettings,
}) => (
    <BaseComponent
        label={label}
        desc={desc}
        tooltip={tooltip}
        className="mod-toggle"
        subSettings={subSettings}
    >
        <div
            className={`checkbox-container ${value ? "is-enabled" : ""}`}
            onClick={() => onChange(!value)}
        >
            <input type="checkbox" tabIndex={0} />
        </div>
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
    subSettings?: React.ReactNode;
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
    subSettings,
}) => (
    <BaseComponent label={label} desc={desc} tooltip={tooltip} subSettings={subSettings}>
        <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
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
    subSettings?: React.ReactNode;
}

export const TextAreaRow: React.FC<TextAreaRowProps> = ({
    label,
    desc,
    tooltip,
    value,
    onChange,
    rows = 3,
    subSettings,
}) => (
    <BaseComponent label={label} desc={desc} tooltip={tooltip} subSettings={subSettings}>
        <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            style={{ width: "100%", minWidth: "200px", resize: "vertical" }}
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
    subSettings?: React.ReactNode;
}

export const SelectRow: React.FC<SelectRowProps> = ({
    label,
    desc,
    tooltip,
    value,
    options,
    onChange,
    disabled,
    subSettings,
}) => (
    <BaseComponent label={label} desc={desc} tooltip={tooltip} subSettings={subSettings}>
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
    subSettings?: React.ReactNode;
}

export const ColorPickerRow: React.FC<ColorPickerRowProps> = ({
    label,
    desc,
    tooltip,
    value,
    onChange,
    subSettings,
}) => (
    <BaseComponent label={label} desc={desc} tooltip={tooltip} subSettings={subSettings}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
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
    subSettings?: React.ReactNode;
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
    subSettings,
}) => (
    <BaseComponent
        label={label}
        desc={desc}
        tooltip={tooltip}
        className="cmdr-slider"
        subSettings={subSettings}
    >
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
// Link Row
// ==========================================
interface LinkRowProps {
    label: React.ReactNode;
    onClick?: () => void;
}

export const LinkRow: React.FC<LinkRowProps> = ({ label, onClick }) => (
    <div className="setting-item">
        <div className="setting-item-info">
            <div className="setting-item-name">{label}</div>
        </div>
        <div className="setting-item-control">
            <button onClick={onClick} style={{ cursor: "pointer" }}>
                Open
            </button>
        </div>
    </div>
);
