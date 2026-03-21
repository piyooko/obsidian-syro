/** @jsxImportSource react */
import React, { useState, useEffect, useMemo, useRef } from "react";
import { App, MarkdownRenderer, Component } from "obsidian";
import { transformLatex, extractClozeIds, getActiveClozeId } from "../../utils/latexTransformer";

interface LatexPopoverProps {
    app: App;
    source: string; // 完整的 LaTeX 源码（不含 $ 符号）
    cursorPos: number; // 相对源码的偏移量
    component: Component; // Obsidian 组件用于渲染
}

/**
 * LaTeX Cloze 预览 Popover
 * 极简直角设计
 */
export const LatexPopover: React.FC<LatexPopoverProps> = ({
    app,
    source,
    cursorPos,
    component,
}) => {
    // 计算初始 Active ID
    const initialId = useMemo(() => getActiveClozeId(source, cursorPos), [source, cursorPos]);

    const [activeId, setActiveId] = useState<string | null>(initialId ?? null);
    const [showAnswer, setShowAnswer] = useState(false);
    const clozeIds = useMemo(() => extractClozeIds(source), [source]);

    const renderRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // 同步 activeId
    useEffect(() => {
        if (clozeIds.length === 0) {
            setActiveId(null);
            return;
        }

        if (initialId && clozeIds.includes(initialId)) {
            setActiveId(initialId);
        } else {
            setActiveId(clozeIds[0]);
        }
        setShowAnswer(false);
    }, [source, cursorPos, clozeIds, initialId]);

    // 生成预览 LaTeX
    const previewLatex = useMemo(() => {
        if (showAnswer) {
            return transformLatex(source, "highlight", activeId);
        }
        return transformLatex(source, "mask", activeId);
    }, [source, activeId, showAnswer]);

    // 渲染 MathJax
    useEffect(() => {
        if (renderRef.current) {
            renderRef.current.innerHTML = "";
            MarkdownRenderer.render(app, `$$${previewLatex}$$`, renderRef.current, "", component);
        }
    }, [previewLatex, app, component]);

    // 监听来自拖动管理器的点击事件
    useEffect(() => {
        const container = containerRef.current?.parentElement;
        if (!container) return;

        const handlePopoverClick = () => {
            setShowAnswer((prev) => !prev);
        };

        container.addEventListener("sr-popover-click", handlePopoverClick);
        return () => {
            container.removeEventListener("sr-popover-click", handlePopoverClick);
        };
    }, []);

    // 切换 Tab 的处理函数
    const handleTabClick = (id: string) => {
        setActiveId(id);
        setShowAnswer(false); // 问题4：切换时重置为正面
    };

    if (clozeIds.length === 0) return null;

    return (
        <div
            ref={containerRef}
            className="sr-latex-popover-sharp"
            // 问题2：阻止 mousedown 冒泡到编辑器，保持公式为代码状态
            onMouseDown={(e) => {
                e.stopPropagation();
            }}
        >
            {/* Tabs Bar - 只在有多个 cloze 时显示 */}
            {clozeIds.length > 1 && (
                <div className="sr-latex-tabs-bar">
                    {clozeIds.map((id) => (
                        <button
                            key={id}
                            className={`sr-latex-tab-btn ${activeId === id ? "active" : ""}`}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleTabClick(id);
                            }}
                        >
                            C{id}
                        </button>
                    ))}
                </div>
            )}

            {/* 预览内容区 */}
            <div
                className="sr-latex-preview-content"
                ref={renderRef}
                title="点击切换显示/隐藏，拖动移动位置"
            />
        </div>
    );
};
