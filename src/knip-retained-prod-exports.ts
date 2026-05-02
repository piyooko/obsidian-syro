import {
    SCHEDULING_INFO_REGEX,
    SR_HTML_COMMENT_BEGIN,
    SR_HTML_COMMENT_END,
    YAML_FRONT_MATTER_REGEX,
    YAML_TAGS_REGEX,
} from "./constants";
import { DEFAULT_SRS_DATA } from "./dataStore/data";
import { locationMap, getLocalizedLocationMap } from "./dataStore/dataLocation";
import { createPersistableSettingsSnapshot } from "./dataStore/deckOptionsStore";
import { createEmptyPendingOverlayFile } from "./dataStore/pendingOverlayStore";
import { DEFAULT_QUEUE_DATA } from "./dataStore/queue";
import type { SharedSettingsField, DeviceStateField } from "./dataStore/syroPluginDataStore";
import { getEquivalentUuidSet } from "./dataStore/syroUuidAlias";
import type { SyroDeviceSelectionRequest } from "./dataStore/syroWorkspace";
import type { CardInfo } from "./dataStore/trackedFile";
import {
    buildIrExtractRenderExtractsForTest,
    clampIrExtractVerticalInsetsForAdjacentBlocks,
    findActiveIrExtractSourceMatch,
    findIrExtractEditingRoot,
    getIrExtractWrappedHeading,
} from "./editor/ir-extract-decoration";
import {
    eventMatchesReviewEditModeHotkey,
    resolveObsidianHotkeys,
} from "./editor/obsidianHotkeyBridge";
import { parseSteps } from "./scheduling";
import { resolveDeckOptionsPresetIndex, updateDeckOptionsPresetStepProxy } from "./settings";
import { ExtractContextEditorView } from "./ui/components/ExtractContextEditorView";
import { LinkRow } from "./ui/components/common/SettingsComponents";
import { getTimelineDurationPrefixSegment } from "./ui/timeline/timelineMessage";
import { resolveClozeReviewContext } from "./util/cloze-review-context";
import { findIrExtractAtOffset } from "./util/irExtractParser";
import { StaticRandomNumberProvider } from "./util/RandomNumberProvider";
import { setSanitizedHtml } from "./util/safeHtml";
import { getRecordProp, isNumberArray, isNumberRecord, isStringArray } from "./util/typeGuards";
import { escapeRegexString, isEqualOrSubPath } from "./util/utils";
import { errorlog, logExecutionTime } from "./util/utils_recall";

void [
    SCHEDULING_INFO_REGEX,
    YAML_FRONT_MATTER_REGEX,
    YAML_TAGS_REGEX,
    SR_HTML_COMMENT_BEGIN,
    SR_HTML_COMMENT_END,
    DEFAULT_SRS_DATA,
    locationMap,
    getLocalizedLocationMap,
    createPersistableSettingsSnapshot,
    createEmptyPendingOverlayFile,
    DEFAULT_QUEUE_DATA,
    getEquivalentUuidSet,
    buildIrExtractRenderExtractsForTest,
    clampIrExtractVerticalInsetsForAdjacentBlocks,
    findActiveIrExtractSourceMatch,
    findIrExtractEditingRoot,
    getIrExtractWrappedHeading,
    eventMatchesReviewEditModeHotkey,
    resolveObsidianHotkeys,
    parseSteps,
    resolveDeckOptionsPresetIndex,
    updateDeckOptionsPresetStepProxy,
    ExtractContextEditorView,
    LinkRow,
    getTimelineDurationPrefixSegment,
    resolveClozeReviewContext,
    findIrExtractAtOffset,
    StaticRandomNumberProvider,
    setSanitizedHtml,
    getRecordProp,
    isNumberArray,
    isNumberRecord,
    isStringArray,
    escapeRegexString,
    isEqualOrSubPath,
    errorlog,
    logExecutionTime,
];

export type { CardInfo, DeviceStateField, SharedSettingsField, SyroDeviceSelectionRequest };
