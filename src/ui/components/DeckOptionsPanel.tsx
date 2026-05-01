/** @jsxImportSource react */
import React, {
    useCallback,
    useEffect,
    useId,
    useMemo,
    useState,
} from "react";
import { Notice } from "obsidian";
import { X } from "lucide-react";
import type SRPlugin from "src/main";
import { t } from "src/lang/helpers";
import { Deck } from "src/Deck";
import {
    createDefaultDeckOptionsPreset,
    createNewDeckOptionsPreset,
    DeckOptionsPreset,
    DEFAULT_DECK_OPTIONS_PRESET_UUID,
    DEFAULT_DECK_OPTIONS_PRESET,
    findDeckOptionsPresetIndexByUuid,
    getDeckOptionsPresetDisplayName,
    normalizeInterleaveFlashcardCount,
    normalizeDeckOptionsPreset,
    parseDeckOptionsStepInput,
    ReviewQueueMode,
    syncFsrsSettingsCompatibilityMirror,
} from "src/settings";
import { BaseComponent, InputRow, Section, SelectRow, ToggleRow } from "./common/SettingsComponents";
import { useMobileNavbarOffset } from "./useMobileNavbarOffset";

interface DeckOptionsPanelProps {
    plugin: SRPlugin;
    deckName: string;
    deckPath: string;
    onClose: () => void;
    onSaved?: () => void;
}

interface DeckOptionsDraft {
    presets: DeckOptionsPreset[];
    assignment: Record<string, string>;
    currentPresetUuid: string;
}

function normalizePreset(
    preset: DeckOptionsPreset | undefined,
    plugin: SRPlugin,
): DeckOptionsPreset {
    return normalizeDeckOptionsPreset(preset, plugin.data.settings.fsrsSettings);
}

function createDraft(plugin: SRPlugin, deckPath: string): DeckOptionsDraft {
    const presets =
        plugin.data.settings.deckOptionsPresets?.length > 0
            ? plugin.data.settings.deckOptionsPresets.map((preset) =>
                  normalizePreset(preset, plugin),
              )
            : [createDefaultDeckOptionsPreset(plugin.data.settings.fsrsSettings)];
    const assignment = { ...plugin.data.settings.deckPresetAssignment };
    const assignedPresetUuid = assignment[deckPath] ?? DEFAULT_DECK_OPTIONS_PRESET_UUID;
    const safePresetUuid = presets.some((preset) => preset.uuid === assignedPresetUuid)
        ? assignedPresetUuid
        : DEFAULT_DECK_OPTIONS_PRESET_UUID;

    return {
        presets,
        assignment,
        currentPresetUuid: safePresetUuid,
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
    onClose,
    onSaved,
}) => {
    const titleId = useId();
    const mobileNavbarOffset = useMobileNavbarOffset();
    const [draft, setDraft] = useState<DeckOptionsDraft>(() => createDraft(plugin, deckPath));

    useEffect(() => {
        setDraft(createDraft(plugin, deckPath));
    }, [plugin, deckPath]);

    const currentPresetIndex = useMemo(
        () => findDeckOptionsPresetIndexByUuid(draft.presets, draft.currentPresetUuid),
        [draft.currentPresetUuid, draft.presets],
    );
    const currentPreset = useMemo(
        () => draft.presets[currentPresetIndex] ?? draft.presets[0],
        [currentPresetIndex, draft.presets],
    );
    const currentPresetDisplayName = useMemo(
        () => getDeckOptionsPresetDisplayName(currentPreset, currentPresetIndex),
        [currentPreset, currentPresetIndex],
    );
    const presetUsageCounts = useMemo(() => {
        const deckPaths = collectDeckPaths(plugin.deckTree);
        return draft.presets.map(
            (_, index) =>
                deckPaths.filter(
                    (path) =>
                        (draft.assignment[path] ?? DEFAULT_DECK_OPTIONS_PRESET_UUID) ===
                        draft.presets[index]?.uuid,
                ).length,
        );
    }, [draft.assignment, draft.presets, plugin.deckTree]);
    const reviewQueueModeOptions = useMemo(
        () => [
            {
                label: t("DECK_OPTIONS_REVIEW_QUEUE_MODE_EXTRACT_FIRST"),
                value: "extract-first",
            },
            {
                label: t("DECK_OPTIONS_REVIEW_QUEUE_MODE_FLASHCARD_FIRST"),
                value: "flashcard-first",
            },
            {
                label: t("DECK_OPTIONS_REVIEW_QUEUE_MODE_INTERLEAVED"),
                value: "interleaved",
            },
        ],
        [],
    );

    const updateCurrentPreset = useCallback(
        (updater: (preset: DeckOptionsPreset) => DeckOptionsPreset) => {
            setDraft((prev) => {
                const presets = [...prev.presets];
                const currentPresetIndex = findDeckOptionsPresetIndexByUuid(
                    presets,
                    prev.currentPresetUuid,
                );
                const currentDraftPreset =
                    presets[currentPresetIndex] ??
                    createDefaultDeckOptionsPreset(plugin.data.settings.fsrsSettings);
                presets[currentPresetIndex] = updater({ ...currentDraftPreset });
                return { ...prev, presets };
            });
        },
        [plugin],
    );

    const updateCurrentPresetSteps = useCallback(
        (field: "learningSteps" | "lapseSteps", value: string) => {
            updateCurrentPreset((preset) => {
                const nextPreset: DeckOptionsPreset = { ...preset, [field]: value };
                const parsedSteps = parseDeckOptionsStepInput(value);
                if (parsedSteps === null) {
                    return nextPreset;
                }

                const nextFsrs = {
                    ...(preset.fsrs ?? normalizePreset(preset, plugin).fsrs),
                };

                if (field === "learningSteps") {
                    nextFsrs.learning_steps = parsedSteps;
                } else {
                    nextFsrs.relearning_steps = parsedSteps;
                }

                return {
                    ...nextPreset,
                    fsrs: nextFsrs,
                };
            });
        },
        [plugin, updateCurrentPreset],
    );

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };

        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [onClose]);

    const handlePresetUuidChange = useCallback(
        (value: string) => {
            setDraft((prev) => ({
                ...prev,
                currentPresetUuid: value || DEFAULT_DECK_OPTIONS_PRESET_UUID,
                assignment:
                    value && value !== DEFAULT_DECK_OPTIONS_PRESET_UUID
                        ? { ...prev.assignment, [deckPath]: value }
                        : Object.fromEntries(
                              Object.entries(prev.assignment).filter(([path]) => path !== deckPath),
                          ),
            }));
        },
        [deckPath],
    );

    const handleCreatePreset = useCallback(() => {
        setDraft((prev) => {
            const nextPreset = createNewDeckOptionsPreset(plugin.data.settings.fsrsSettings, {
                name: `${t("DECK_OPTIONS_DEFAULT_PRESET_NAME")} ${prev.presets.length}`,
            });
            const presets = [...prev.presets, nextPreset];

            return {
                presets,
                currentPresetUuid: nextPreset.uuid,
                assignment: { ...prev.assignment, [deckPath]: nextPreset.uuid },
            };
        });
    }, [deckPath, plugin.data.settings.fsrsSettings]);

    const handleDeletePreset = useCallback(() => {
        setDraft((prev) => {
            if (prev.currentPresetUuid === DEFAULT_DECK_OPTIONS_PRESET_UUID) return prev;

            const presets = prev.presets.filter((preset) => preset.uuid !== prev.currentPresetUuid);
            const assignment = Object.fromEntries(
                Object.entries(prev.assignment).filter(([, presetUuid]) => presetUuid !== prev.currentPresetUuid),
            );

            return {
                presets,
                assignment,
                currentPresetUuid: DEFAULT_DECK_OPTIONS_PRESET_UUID,
            };
        });
    }, []);

    const handleSave = useCallback(async () => {
        const validatedPresets: DeckOptionsPreset[] = [];

        for (const preset of draft.presets) {
            const learningSteps = parseDeckOptionsStepInput(preset.learningSteps);
            const lapseSteps = parseDeckOptionsStepInput(preset.lapseSteps);

            if (learningSteps === null || lapseSteps === null) {
                new Notice(t("DECK_OPTIONS_INVALID_STEP_FORMAT"));
                return;
            }

            const normalizedPreset = normalizePreset(preset, plugin);
            validatedPresets.push(
                normalizePreset(
                    {
                        ...preset,
                        fsrs: {
                            ...(normalizedPreset.fsrs ?? plugin.data.settings.fsrsSettings),
                            learning_steps: [...learningSteps],
                            relearning_steps: [...lapseSteps],
                        },
                    },
                    plugin,
                ),
            );
        }

        plugin.data.settings.deckOptionsPresets = validatedPresets;
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
        syncFsrsSettingsCompatibilityMirror(plugin.data.settings);

        await plugin.saveDeckOptionsAndRequestSync();
        onSaved?.();
        onClose();
    }, [draft.assignment, draft.presets, onClose, onSaved, plugin]);

    return (
        <div
            className="sr-deck-options-overlay"
            style={{ ["--sr-mobile-navbar-offset" as string]: `${mobileNavbarOffset}px` }}
        >
            <div
                className="sr-settings-panel sr-deck-options-anchor-panel is-ready"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
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
                                    value={draft.currentPresetUuid}
                                    onChange={(event) =>
                                        handlePresetUuidChange(event.target.value)
                                    }
                                    className="dropdown"
                                >
                                    {draft.presets.map((preset, index) => {
                                        const usageCount = presetUsageCounts[index] ?? 0;
                                        const usageLabelKey =
                                            usageCount === 1
                                                ? "DECK_OPTIONS_PRESET_USAGE_COUNT_SINGULAR"
                                                : "DECK_OPTIONS_PRESET_USAGE_COUNT_PLURAL";

                                        return (
                                            <option key={preset.uuid} value={preset.uuid}>
                                                {t(usageLabelKey, {
                                                    presetName: getDeckOptionsPresetDisplayName(
                                                        preset,
                                                        index,
                                                    ),
                                                    count: usageCount,
                                                })}
                                            </option>
                                        );
                                    })}
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
                            value={currentPresetDisplayName}
                            onChange={(value) =>
                                updateCurrentPreset((preset) => ({ ...preset, name: value }))
                            }
                        />
                    </Section>

                    <Section title={t("DECK_OPTIONS_SECTION_DAILY_LIMITS")}>
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
                        <InputRow
                            label={t("DECK_OPTIONS_MAX_NEW_EXTRACTS")}
                            desc={t("DECK_OPTIONS_MAX_NEW_EXTRACTS_DESC")}
                            type="number"
                            value={currentPreset.maxNewExtracts}
                            onChange={(value) => {
                                const num = Number(value);
                                if (Number.isNaN(num) || num < 0) return;
                                updateCurrentPreset((preset) => ({
                                    ...preset,
                                    maxNewExtracts: num,
                                }));
                            }}
                        />
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
                        <InputRow
                            label={t("DECK_OPTIONS_MAX_EXTRACT_REVIEWS")}
                            desc={t("DECK_OPTIONS_MAX_EXTRACT_REVIEWS_DESC")}
                            type="number"
                            value={currentPreset.maxExtractReviews}
                            onChange={(value) => {
                                const num = Number(value);
                                if (Number.isNaN(num) || num < 0) return;
                                updateCurrentPreset((preset) => ({
                                    ...preset,
                                    maxExtractReviews: num,
                                }));
                            }}
                        />
                    </Section>

                    <Section title={t("DECK_OPTIONS_SECTION_LEARNING_INTERVALS")}>
                        <InputRow
                            label={t("DECK_OPTIONS_LEARNING_STEPS")}
                            desc={t("DECK_OPTIONS_LEARNING_STEPS_DESC")}
                            value={currentPreset.learningSteps}
                            onChange={(value) => updateCurrentPresetSteps("learningSteps", value)}
                        />
                        <InputRow
                            label={t("DECK_OPTIONS_RELEARNING_STEPS")}
                            desc={t("DECK_OPTIONS_RELEARNING_STEPS_DESC")}
                            value={currentPreset.lapseSteps}
                            onChange={(value) => updateCurrentPresetSteps("lapseSteps", value)}
                        />
                    </Section>

                    <Section title={t("DECK_OPTIONS_SECTION_DISPLAY_ORDER")}>
                        <SelectRow
                            label={t("DECK_OPTIONS_REVIEW_QUEUE_MODE")}
                            desc={t("DECK_OPTIONS_REVIEW_QUEUE_MODE_DESC")}
                            value={currentPreset.reviewQueueMode}
                            options={reviewQueueModeOptions}
                            onChange={(value) =>
                                updateCurrentPreset((preset) => ({
                                    ...preset,
                                    reviewQueueMode: value as ReviewQueueMode,
                                }))
                            }
                        />
                        {currentPreset.reviewQueueMode === "interleaved" && (
                            <InputRow
                                label={t("DECK_OPTIONS_INTERLEAVE_FLASHCARD_COUNT")}
                                desc={t("DECK_OPTIONS_INTERLEAVE_FLASHCARD_COUNT_DESC")}
                                type="number"
                                value={currentPreset.interleaveFlashcardCount}
                                onChange={(value) => {
                                    const num = Number(value);
                                    if (Number.isNaN(num)) return;
                                    updateCurrentPreset((preset) => ({
                                        ...preset,
                                        interleaveFlashcardCount: normalizeInterleaveFlashcardCount(
                                            num,
                                        ),
                                    }));
                                }}
                            />
                        )}
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

                    {draft.currentPresetUuid !== DEFAULT_DECK_OPTIONS_PRESET_UUID && (
                        <Section title={t("DECK_OPTIONS_DELETE_PRESET")}>
                            <BaseComponent
                                label={t("DECK_OPTIONS_DELETE_PRESET")}
                                desc={t("DECK_OPTIONS_DELETE_PRESET_DESC")}
                            >
                                <button
                                    type="button"
                                    className="mod-warning"
                                    onClick={handleDeletePreset}
                                >
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
                    <button type="button" className="mod-cta" onClick={() => void handleSave()}>
                        {t("DECK_OPTIONS_BTN_SAVE")}
                    </button>
                </div>
            </div>
        </div>
    );
};
