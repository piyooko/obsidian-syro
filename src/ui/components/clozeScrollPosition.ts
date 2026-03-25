export interface ScrollPositionInput {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
    targetTop: number;
    targetHeight: number;
    safeTopInset?: number;
    safeBottomInset?: number;
}

export interface ScrollContainerSafeInsets {
    top: number;
    bottom: number;
}

const EPSILON = 0.5;

function clampScrollTop(value: number, maxScrollTop: number): number {
    return Math.max(0, Math.min(value, maxScrollTop));
}

function getMaxScrollTop(input: ScrollPositionInput): number {
    return Math.max(0, input.scrollHeight - input.clientHeight);
}

function getSafeInsets(input: ScrollPositionInput): ScrollContainerSafeInsets {
    return {
        top: input.safeTopInset ?? 0,
        bottom: input.safeBottomInset ?? 0,
    };
}

function getAvailableViewportHeight(input: ScrollPositionInput): number {
    const { top, bottom } = getSafeInsets(input);
    return Math.max(0, input.clientHeight - top - bottom);
}

export function buildScrollPositionInput(
    target: HTMLElement,
    scrollContainer: HTMLElement,
    safeInsets: ScrollContainerSafeInsets = { top: 0, bottom: 0 },
): ScrollPositionInput {
    const scrollRect = scrollContainer.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    return {
        scrollTop: scrollContainer.scrollTop,
        scrollHeight: scrollContainer.scrollHeight,
        clientHeight: scrollContainer.clientHeight,
        targetTop: targetRect.top - scrollRect.top + scrollContainer.scrollTop,
        targetHeight: targetRect.height,
        safeTopInset: safeInsets.top,
        safeBottomInset: safeInsets.bottom,
    };
}

export function getCenteredScrollTop(input: ScrollPositionInput): number {
    const maxScrollTop = getMaxScrollTop(input);
    if (maxScrollTop <= EPSILON || input.scrollHeight <= input.clientHeight + 1) {
        return clampScrollTop(input.scrollTop, maxScrollTop);
    }

    const desiredScrollTop = input.targetTop + input.targetHeight / 2 - input.clientHeight / 2;
    return clampScrollTop(desiredScrollTop, maxScrollTop);
}

export function getEnsureVisibleScrollTop(input: ScrollPositionInput): number {
    const maxScrollTop = getMaxScrollTop(input);
    if (maxScrollTop <= EPSILON || input.scrollHeight <= input.clientHeight + 1) {
        return clampScrollTop(input.scrollTop, maxScrollTop);
    }

    const { top: safeTopInset, bottom: safeBottomInset } = getSafeInsets(input);
    const targetBottom = input.targetTop + input.targetHeight;
    const visibleTop = input.scrollTop + safeTopInset;
    const visibleBottom = input.scrollTop + input.clientHeight - safeBottomInset;

    if (input.targetTop < visibleTop) {
        return clampScrollTop(input.targetTop - safeTopInset, maxScrollTop);
    }

    if (targetBottom > visibleBottom) {
        return clampScrollTop(targetBottom - input.clientHeight + safeBottomInset, maxScrollTop);
    }

    return clampScrollTop(input.scrollTop, maxScrollTop);
}

export function getMixedCenterScrollTop(input: ScrollPositionInput): number {
    const ensuredScrollTop = getEnsureVisibleScrollTop(input);
    const maxScrollTop = getMaxScrollTop(input);
    const availableViewportHeight = getAvailableViewportHeight(input);
    if (maxScrollTop <= EPSILON || availableViewportHeight <= EPSILON) {
        return ensuredScrollTop;
    }

    const contextThreshold = availableViewportHeight / 3;
    const contextAbove = input.targetTop;
    const contextBelow = Math.max(0, input.scrollHeight - (input.targetTop + input.targetHeight));
    const hasEnoughContext =
        contextAbove >= contextThreshold && contextBelow >= contextThreshold;

    if (!hasEnoughContext) {
        return ensuredScrollTop;
    }

    const { top: safeTopInset } = getSafeInsets(input);
    const desiredCenteredScrollTop =
        input.targetTop + input.targetHeight / 2 - safeTopInset - availableViewportHeight / 2;
    const centeredScrollTop = clampScrollTop(desiredCenteredScrollTop, maxScrollTop);

    if (Math.abs(centeredScrollTop - desiredCenteredScrollTop) > EPSILON) {
        return ensuredScrollTop;
    }

    return centeredScrollTop;
}
