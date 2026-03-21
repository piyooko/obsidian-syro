/** @jsxImportSource react */
import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type SRPlugin from "src/main";
import { t } from "src/lang/helpers";
import { Deck } from "src/Deck";
import { DeckOptionsPreset, DEFAULT_DECK_OPTIONS_PRESET } from "src/settings";
import { BaseComponent, InputRow, Section, ToggleRow } from "./common/SettingsComponents";

interface DeckOptionsPanelProps {
    plugin: SRPlugin;
    deckName: string;
    deckPath: string;
    containerElement: HTMLElement | null;
    preferredWidth: number;
    onClose: () => void;
    onSaved?: () => void;
}

interface DeckOptionsDraft {
    presets: DeckOptionsPreset[];
    assignment: Record<string, number>;
    currentPresetIndex: number;
}

interface PanelLayout {
    width: number;
    maxHeight: number;
    ready: boolean;
}

function normalizePreset(preset?: DeckOptionsPreset): DeckOptionsPreset {
    return {
        ...DEFAULT_DECK_OPTIONS_PRESET,
        ...preset,
    };
}

function createDraft(plugin: SRPlugin, deckPath: string): DeckOptionsDraft {
    const presets =
        plugin.data.settings.deckOptionsPresets?.length > 0
            ? plugin.data.settings.deckOptionsPresets.map((preset) => normalizePreset(preset))
            : [{ ...DEFAULT_DECK_OPTIONS_PRESET }];
    const assignment = { ...plugin.data.settings.deckPresetAssignment };
    const currentPresetIndex = assignment[deckPath] ?? 0;
    const safePresetIndex =
        currentPresetIndex >= 0 && currentPresetIndex < presets.length ? currentPresetIndex : 0;

    return {
        presets,
        assignment,
        currentPresetIndex: safePresetIndex,
    };
}

function collectDeckPaths(root: Deck | null | undefined): string[] {
    if (!root) return [];

    const paths: string[] = [];
    const visit = (deck: Deck, parentPath = "") => {
        const currentPath = parentPath ? `${parentPath}/${deck.deckName}` : deck.deckName;
        if (deck.parent) {
            paths.push(currentPath);
        }
        for (const subdeck of deck.subdecks) {
            visit(subdeck, currentPath);
        }
    };

    visit(root);
    return paths;
}

export const DeckOptionsPanel: React.FC<DeckOptionsPanelProps> = ({
    plugin,
    deckName,
    deckPath,
    containerElement,
    preferredWidth,
    onClose,
    onSaved,
}) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const titleId = useId();
    const [draft, setDraft] = useState<DeckOptionsDraft>(() => createDraft(plugin, deckPath));
    const [layout, setLayout] = useState<PanelLayout>({
        width: 680,
        maxHeight: 640,
        ready: false,
    });

    useEffect(() => {
        setDraft(createDraft(plugin, deckPath));
    }, [plugin, deckPath]);

    const currentPreset = useMemo(
        () => draft.presets[draft.currentPresetIndex] ?? draft.presets[0],
        [draft.currentPresetIndex, draft.presets],
    );
    const presetUsageCounts = useMemo(() => {
        const deckPaths = collectDeckPaths(plugin.deckTree);
        return draft.presets.map((_, index) =>
            deckPaths.filter((path) => (draft.assignment[path] ?? 0) === index).length,
        );
    }, [draft.assignment, draft.currentPresetIndex, plugin.deckTree]);

    const updateCurrentPreset = useCallback(
        (updater: (preset: DeckOptionsPreset) => DeckOptionsPreset) => {
            setDraft((prev) => {
                const presets = [...prev.presets];
                presets[prev.currentPresetIndex] = updater({ ...presets[prev.currentPresetIndex] });
                return { ...prev, presets };
            });
        },
        [],
    );

    const recalculateLayout = useCallback(() => {
        if (!containerElement) return;

        const horizontalPadding = 48;
        const verticalPadding = 40;
        const availableWidth = Math.max(320, containerElement.clientWidth - horizontalPadding);
        const width = Math.max(320, Math.min(preferredWidth, availableWidth));
        const maxHeight = Math.max(360, containerElement.clientHeight - verticalPadding);

        setLayout({
            width,
            maxHeight,
            ready: true,
        });
    }, [containerElement, preferredWidth]);

    useLayoutEffect(() => {
        recalculateLayout();
    }, [recalculateLayout, draft.currentPresetIndex, currentPreset.autoAdvance]);

    useEffect(() => {
        if (!containerElement) return;

        const handleResize = () => recalculateLayout();
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };

        const resizeObserver = new ResizeObserver(() => {
            recalculateLayout();
        });
        resizeObserver.observe(containerElement);

        window.addEventListener("resize", handleResize);
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener("resize", handleResize);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [containerElement, onClose, recalculateLayout]);

    const handlePresetIndexChange = useCallback(
        (value: string) => {
            const nextIndex = Number(value);
            setDraft((prev) => ({
                ...prev,
                currentPresetIndex: nextIndex,
                assignment: { ...prev.assignment, [deckPath]: nextIndex },
            }));
        },
        [deckPath],
    );

    const handleCreatePreset = useCallback(() => {
        setDraft((prev) => {
            const nextPreset: DeckOptionsPreset = {
                ...DEFAULT_DECK_OPTIONS_PRESET,
                name: `${t("DECK_OPTIONS_DEFAULT_PRESET_NAME")} ${prev.presets.length}`,
            };
            const presets = [...prev.presets, nextPreset];
            const currentPresetIndex = presets.length - 1;

            return {
                presets,
                currentPresetIndex,
                assignment: { ...prev.assignment, [deckPath]: currentPresetIndex },
            };
        });
    }, [deckPath]);

    const handleDeletePreset = useCallback(() => {
        setDraft((prev) => {
            if (prev.currentPresetIndex <= 0) return prev;

            const deletedIndex = prev.currentPresetIndex;
            const presets = prev.presets.filter((_, index) => index !== deletedIndex);
            const assignment = { ...prev.assignment };

            Object.keys(assignment).forEach((path) => {
                if (assignment[path] === deletedIndex) {
                    delete assignment[path];
                } else if (assignment[path] > deletedIndex) {
                    assignment[path]--;
                }
            });

            return {
                presets,
                assignment,
                currentPresetIndex: 0,
            };
        });
    }, []);

    const handleSave = useCallback(async () => {
        plugin.data.settings.deckOptionsPresets = draft.presets.map((preset) => normalizePreset(preset));
        plugin.data.settings.deckOptionsPresets = plugin.data.settings.deckOptionsPresets.map(
            (preset, index) => ({
                ...preset,
                name:
                    preset.name.trim() ||
                    (index === 0
                        ? DEFAULT_DECK_OPTIONS_PRESET.name
                        : `${t("DECK_OPTIONS_DEFAULT_PRESET_NAME")} ${index}`),
            }),
        );
        plugin.data.settings.deckPresetAssignment = { ...draft.assignment };

        if ((plugin.data.settings.deckPresetAssignment[deckPath] ?? 0) === 0) {
            delete plugin.data.settings.deckPresetAssignment[deckPath];
        }

        await plugin.savePluginData();
        await plugin.sync();
        onSaved?.();
        onClose();
    }, [deckPath, draft.assignment, draft.presets, onClose, onSaved, plugin]);

    return (
        <div className="sr-deck-options-overlay" onMouseDown={onClose}>
            <div
                ref={panelRef}
                className={`sr-settings-panel sr-deck-options-anchor-panel ${layout.ready ? "is-ready" : ""}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                style={{
                    width: `${layout.width}px`,
                    maxHeight: `${layout.maxHeight}px`,
                }}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <div className="sr-style-setting-header sr-deck-options-toolbar">
                    <div className="sr-style-setting-tab-group">
                        <div id={titleId} className="sr-deck-options-title-text">
                            {deckName}
                        </div>
                        <div className="sr-deck-options-toolbar-spacer" />
                        <button
                            type="button"
                            className="sr-deck-options-close-btn"
                            onClick={onClose}
                            aria-label={t("CANCEL")}
                        >
                            <X size={15} />
                        </button>
                    </div>
                </div>

                <div className="sr-style-setting-content sr-deck-options-scroll">
                    <Section title={t("DECK_OPTIONS_PRESET_SELECT")}>
                        <BaseComponent
                            label={t("DECK_OPTIONS_PRESET_SELECT")}
                            desc={t("DECK_OPTIONS_PRESET_SELECT_DESC")}
                        >
                            <div className="sr-deck-options-select-control">
                                <select
                                    value={String(draft.currentPresetIndex)}
                                    onChange={(event) => handlePresetIndexChange(event.target.value)}
                                    className="dropdown"
                                >
                                    {draft.presets.map((preset, index) => (
                                        <option key={`${preset.name}-${index}`} value={index}>
                                            {`${preset.name} (已有${presetUsageCounts[index] ?? 0}个牌组使用)`}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    className="clickable-icon"
                                    onClick={handleCreatePreset}
                                >
                                    +
                                </button>
                            </div>
                        </BaseComponent>
                        <InputRow
                            label={t("DECK_OPTIONS_PRESET_NAME")}
                            value={currentPreset.name}
                            onChange={(value) =>
                                updateCurrentPreset((preset) => ({ ...preset, name: value }))
                            }
                        />
                    </Section>

                    <Section title={t("DECK_OPTIONS_SECTION_NEW_CARDS")}>
                        <InputRow
                            label={t("DECK_OPTIONS_LEARNING_STEPS")}
                            desc={t("DECK_OPTIONS_LEARNING_STEPS_DESC")}
                            value={currentPreset.learningSteps}
                            onChange={(value) =>
                                updateCurrentPreset((preset) => ({ ...preset, learningSteps: value }))
                            }
                        />
                        <InputRow
                            label={t("DECK_OPTIONS_MAX_NEW_CARDS")}
                            desc={t("DECK_OPTIONS_MAX_NEW_CARDS_DESC")}
                            type="number"
                            value={currentPreset.maxNewCards}
                            onChange={(value) => {
                                const num = Number(value);
                                if (Number.isNaN(num) || num < 0) return;
                                updateCurrentPreset((preset) => ({ ...preset, maxNewCards: num }));
                            }}
                        />
                    </Section>

                    <Section title={t("DECK_OPTIONS_SECTION_LAPSES")}>
                        <InputRow
                            label={t("DECK_OPTIONS_RELEARNING_STEPS")}
                            desc={t("DECK_OPTIONS_RELEARNING_STEPS_DESC")}
                            value={currentPreset.lapseSteps}
                            onChange={(value) =>
                                updateCurrentPreset((preset) => ({ ...preset, lapseSteps: value }))
                            }
                        />
                    </Section>

                    <Section title={t("DECK_OPTIONS_SECTION_REVIEWS")}>
                        <InputRow
                            label={t("DECK_OPTIONS_MAX_REVIEWS")}
                            desc={t("DECK_OPTIONS_MAX_REVIEWS_DESC")}
                            type="number"
                            value={currentPreset.maxReviews}
                            onChange={(value) => {
                                const num = Number(value);
                                if (Number.isNaN(num) || num < 0) return;
                                updateCurrentPreset((preset) => ({ ...preset, maxReviews: num }));
                            }}
                        />
                    </Section>

                    <Section title={t("DECK_OPTIONS_SECTION_AUTO_ADVANCE")}>
                        <ToggleRow
                            label={t("DECK_OPTIONS_AUTO_ADVANCE")}
                            desc={t("DECK_OPTIONS_AUTO_ADVANCE_DESC")}
                            value={currentPreset.autoAdvance}
                            onChange={(value) =>
                                updateCurrentPreset((preset) => ({ ...preset, autoAdvance: value }))
                            }
                        />
                        {currentPreset.autoAdvance && (
                            <>
                                <InputRow
                                    label={t("DECK_OPTIONS_AUTO_ADVANCE_SECONDS")}
                                    desc={t("DECK_OPTIONS_AUTO_ADVANCE_SECONDS_DESC")}
                                    type="number"
                                    value={currentPreset.autoAdvanceSeconds}
                                    onChange={(value) => {
                                        const num = Number(value);
                                        if (Number.isNaN(num) || num <= 0) return;
                                        updateCurrentPreset((preset) => ({
                                            ...preset,
                                            autoAdvanceSeconds: num,
                                        }));
                                    }}
                                />
                                <ToggleRow
                                    label={t("DECK_OPTIONS_SHOW_PROGRESS_BAR")}
                                    desc={t("DECK_OPTIONS_SHOW_PROGRESS_BAR_DESC")}
                                    value={currentPreset.showProgressBar}
                                    onChange={(value) =>
                                        updateCurrentPreset((preset) => ({
                                            ...preset,
                                            showProgressBar: value,
                                        }))
                                    }
                                />
                            </>
                        )}
                    </Section>

                    {draft.currentPresetIndex > 0 && (
                        <Section title={t("DECK_OPTIONS_DELETE_PRESET")}>
                            <BaseComponent
                                label={t("DECK_OPTIONS_DELETE_PRESET")}
                                desc={t("DECK_OPTIONS_DELETE_PRESET_DESC")}
                            >
                                <button type="button" className="mod-warning" onClick={handleDeletePreset}>
                                    {t("DECK_OPTIONS_BTN_DELETE_PRESET")}
                                </button>
                            </BaseComponent>
                        </Section>
                    )}
                </div>

                <div className="sr-deck-options-footer-bar">
                    <button type="button" className="mod-muted" onClick={onClose}>
                        {t("CANCEL")}
                    </button>
                    <button type="button" className="mod-cta" onClick={handleSave}>
                        {t("DECK_OPTIONS_BTN_SAVE")}
                    </button>
                </div>
            </div>
        </div>
    );
};
