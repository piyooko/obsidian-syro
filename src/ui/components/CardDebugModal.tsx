/** @jsxImportSource react */
/**
 * 这个文件主要是干什么的：
 * 这个文件画出了卡片的调试弹窗。就像是卡片的“体检报告单”，
 * 负责把卡片里面各种复杂的复习数据、下次待复习的时间、还有它在这个系统里经历的一切流程记录（生命周期追踪），
 * 用一个好看弹出窗口展示出来，方便我们开发者或者排查问题时直观地看到这卡到底经历了什么。
 *
 * 它在项目中属于：界面层
 *
 * 它会用到哪些文件：
 * 1. src/lang/helpers.ts — 负责多语言翻译（显示中文或其他语言）
 *
 * 哪些文件会用到它：
 * 1. src/ui/components/LinearCard.tsx — 卡片复习界面，用户在那里点击“详情”就会弹出这个窗口
 */

import React from "react";
import type { FC } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Save } from "lucide-react";
import { t } from "src/lang/helpers";

interface CardDebugModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: any;
}

export const CardDebugModal: FC<CardDebugModalProps> = ({ isOpen, onClose, data }) => {
    if (!data) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="sr-debug-modal-overlay">
                    {/* 遮罩层 */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="sr-debug-modal-backdrop"
                    />

                    {/* 模态框本体 */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="sr-debug-modal"
                    >
                        {/* Header */}
                        <div className="sr-debug-modal-header">
                            <div className="sr-debug-modal-title">
                                <span>{t("DEBUG_TITLE")}</span>
                                {data.basic?.ID && (
                                    <span className="sr-debug-id">ID: {data.basic.ID}</span>
                                )}
                            </div>
                        </div>

                        {/* Content */}
                        <div className="sr-debug-modal-content">
                            {/* Section 1: Identity */}
                            {data.basic && (
                                <Section title={t("DEBUG_SECTION_IDENTITY")}>
                                    <div className="sr-debug-grid">
                                        <DebugField
                                            label={t("DEBUG_FILE_ID")}
                                            value={data.basic.fileID}
                                        />
                                        <DebugField
                                            label={t("DEBUG_ITEM_TYPE")}
                                            value={data.basic.itemType}
                                        />
                                        <DebugField
                                            label={t("DEBUG_DECK_NAME")}
                                            value={data.basic.deckName}
                                            isBadge
                                        />
                                        <DebugField
                                            label={t("DEBUG_PRIORITY")}
                                            value={data.basic.priority}
                                        />
                                    </div>
                                </Section>
                            )}

                            {/* Section 2: Statistics */}
                            {data.basic && (
                                <>
                                    <div className="sr-debug-divider" />
                                    <Section title={t("DEBUG_SECTION_STATS")}>
                                        <div className="sr-debug-stats">
                                            <StatBox
                                                label={t("DEBUG_REVIEWED")}
                                                value={data.basic.timesReviewed}
                                            />
                                            <StatBox
                                                label={t("DEBUG_CORRECT")}
                                                value={data.basic.timesCorrect}
                                                color="success"
                                            />
                                            <StatBox
                                                label={t("DEBUG_STREAK")}
                                                value={data.basic.errorStreak}
                                                color="warning"
                                            />
                                        </div>
                                    </Section>
                                </>
                            )}

                            {/* Section 3: Algorithm Data */}
                            {data.data && (
                                <>
                                    <div className="sr-debug-divider" />
                                    <Section
                                        title={t("DEBUG_SECTION_ALGO") || "Algorithm Data (FSRS)"}
                                    >
                                        <div className="sr-debug-algo-section">
                                            <div className="sr-debug-field-full">
                                                <label className="sr-debug-label">
                                                    {t("DEBUG_NEXT_REVIEW")}
                                                </label>
                                                <input
                                                    type="text"
                                                    className="sr-debug-input"
                                                    defaultValue={data.data.due || "N/A"}
                                                    readOnly
                                                />
                                            </div>
                                            <div className="sr-debug-grid-compact">
                                                <DebugInput
                                                    label={t("DEBUG_STABILITY")}
                                                    value={data.data.stability}
                                                />
                                                <DebugInput
                                                    label={t("DEBUG_DIFFICULTY")}
                                                    value={data.data.difficulty}
                                                />
                                                <DebugInput
                                                    label={t("DEBUG_REPS")}
                                                    value={data.data.reps}
                                                />
                                                <DebugInput
                                                    label={t("DEBUG_LAPSES")}
                                                    value={data.data.lapses}
                                                    intent="danger"
                                                />
                                                <DebugInput
                                                    label={t("DEBUG_STATE")}
                                                    value={data.data.state}
                                                />
                                                <DebugInput
                                                    label={t("DEBUG_ELAPSED_DAYS")}
                                                    value={
                                                        data.data.elapsed_days +
                                                        t("DEBUG_DAYS_SUFFIX")
                                                    }
                                                    readOnly
                                                />
                                            </div>
                                        </div>
                                    </Section>
                                </>
                            )}

                            {/* Section 4: Object Lifecycle Trace (Debug logs) */}
                            {data.trace && data.trace.length > 0 && (
                                <>
                                    <div className="sr-debug-divider" />
                                    <Section title="生命周期追踪 (Object Trace)">
                                        <div className="sr-debug-trace-timeline">
                                            {data.trace.map((entry: any, i: number) => (
                                                <div key={i} className="sr-debug-trace-item">
                                                    <div className="sr-trace-point"></div>
                                                    <div className="sr-trace-content">
                                                        <div className="sr-trace-header">
                                                            <span className="sr-trace-phase">
                                                                {entry.phase}
                                                            </span>
                                                            <span className="sr-trace-time">
                                                                {new Date(entry.timestamp)
                                                                    .toISOString()
                                                                    .split("T")[1]
                                                                    .slice(0, 12)}
                                                            </span>
                                                        </div>
                                                        <div className="sr-trace-action">
                                                            {entry.action}
                                                        </div>
                                                        <div className="sr-trace-details">
                                                            <pre>
                                                                {JSON.stringify(
                                                                    entry.details,
                                                                    null,
                                                                    2,
                                                                )}
                                                            </pre>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            <style>{`
                                            .sr-debug-trace-timeline {
                                                display: flex;
                                                flex-direction: column;
                                                gap: 12px;
                                                margin-top: 8px;
                                                position: relative;
                                            }
                                            .sr-debug-trace-timeline::before {
                                                content: '';
                                                position: absolute;
                                                top: 6px;
                                                bottom: 6px;
                                                left: 5px;
                                                width: 2px;
                                                background: var(--background-modifier-border);
                                                border-radius: 2px;
                                            }
                                            .sr-debug-trace-item {
                                                position: relative;
                                                padding-left: 20px;
                                            }
                                            .sr-trace-point {
                                                position: absolute;
                                                left: 1px;
                                                top: 4px;
                                                width: 10px;
                                                height: 10px;
                                                border-radius: 50%;
                                                background: var(--text-accent);
                                                border: 2px solid var(--background-primary-alt);
                                            }
                                            .sr-trace-header {
                                                display: flex;
                                                justify-content: space-between;
                                                align-items: center;
                                                font-size: 0.8em;
                                                color: var(--text-muted);
                                            }
                                            .sr-trace-phase {
                                                font-weight: 600;
                                            }
                                            .sr-trace-action {
                                                font-size: 0.9em;
                                                color: var(--text-normal);
                                                margin: 2px 0 4px;
                                            }
                                            .sr-trace-details pre {
                                                margin: 0;
                                                padding: 6px;
                                                background: var(--background-primary);
                                                border: 1px solid var(--background-modifier-border);
                                                border-radius: 4px;
                                                font-size: 0.75em;
                                                color: var(--text-muted);
                                                white-space: pre-wrap;
                                                word-break: break-all;
                                                max-height: 120px;
                                                overflow-y: auto;
                                            }
                                            `}</style>
                                        </div>
                                    </Section>
                                </>
                            )}

                            {/* Raw JSON Preview */}
                            <div className="sr-debug-raw">
                                <div className="sr-debug-raw-title">{t("DEBUG_SECTION_RAW")}</div>
                                <pre className="sr-debug-raw-content">
                                    {JSON.stringify(data.data || data, null, 2)}
                                </pre>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="sr-debug-modal-footer">
                            <div className="sr-debug-warning">
                                <AlertCircle size={12} />
                                <span>{t("DEBUG_WARNING")}</span>
                            </div>
                            <div className="sr-debug-footer-actions">
                                <button onClick={onClose} className="sr-debug-btn-cancel">
                                    {t("CANCEL")}
                                </button>
                                <button onClick={onClose} className="sr-debug-btn-save">
                                    <Save size={12} /> {t("DEBUG_BUTTON_SAVE")}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

// --- Sub Components ---

const Section = ({ title, children }: any) => (
    <div className="sr-debug-section">
        <div className="sr-debug-section-header">
            <h3 className="sr-debug-section-title">{title}</h3>
        </div>
        {children}
    </div>
);

const DebugField = ({ label, value, isBadge }: any) => (
    <div className="sr-debug-field">
        <span className="sr-debug-field-label">{label}</span>
        {isBadge ? (
            <div className="sr-debug-badge">{value}</div>
        ) : (
            <div className="sr-debug-field-value">{value}</div>
        )}
    </div>
);

const StatBox = ({ label, value, color }: any) => (
    <div className="sr-debug-stat-box">
        <span className="sr-debug-stat-label">{label}</span>
        <span className={`sr-debug-stat-value ${color || ""}`}>{value}</span>
    </div>
);

const DebugInput = ({ label, value, readOnly, intent }: any) => (
    <div className="sr-debug-input-field">
        <span className={`sr-debug-input-label ${intent || ""}`}>{label}</span>
        <input
            type="text"
            defaultValue={value}
            readOnly={readOnly}
            className={`sr-debug-input-small ${intent || ""} ${readOnly ? "readonly" : ""}`}
        />
    </div>
);
