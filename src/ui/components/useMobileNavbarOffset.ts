import { Platform } from "obsidian";
import { useEffect, useState } from "react";

function getMobileNavbars(): HTMLElement[] {
    if (typeof document === "undefined") {
        return [];
    }

    return Array.from(document.querySelectorAll<HTMLElement>(".mobile-navbar"));
}

function getVisibleNavbarHeight(navbars: HTMLElement[]): number {
    if (typeof window === "undefined") {
        return 0;
    }

    return navbars.reduce((maxHeight, navbar) => {
        const rect = navbar.getBoundingClientRect();
        const style = window.getComputedStyle(navbar);
        const isVisible =
            rect.height > 0 &&
            rect.width > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden";

        return isVisible ? Math.max(maxHeight, Math.ceil(rect.height)) : maxHeight;
    }, 0);
}

export function useMobileNavbarOffset(): number {
    const [offset, setOffset] = useState(0);

    useEffect(() => {
        if (Platform?.isMobile !== true || typeof document === "undefined") {
            setOffset(0);
            return;
        }

        let resizeObserver: ResizeObserver | null = null;
        let mutationObserver: MutationObserver | null = null;
        let observedNavbars: HTMLElement[] = [];
        let animationFrameId = 0;

        const updateOffset = (nextOffset: number) => {
            setOffset((prevOffset) => (prevOffset === nextOffset ? prevOffset : nextOffset));
        };

        const syncObservedNavbars = (navbars: HTMLElement[]) => {
            if (!resizeObserver) {
                return;
            }

            for (const navbar of observedNavbars) {
                resizeObserver.unobserve(navbar);
            }

            observedNavbars = navbars;

            for (const navbar of observedNavbars) {
                resizeObserver.observe(navbar);
            }
        };

        const refresh = () => {
            const navbars = getMobileNavbars();
            syncObservedNavbars(navbars);
            updateOffset(getVisibleNavbarHeight(navbars));
        };

        const scheduleRefresh = () => {
            if (animationFrameId !== 0) {
                return;
            }

            animationFrameId = window.requestAnimationFrame(() => {
                animationFrameId = 0;
                refresh();
            });
        };

        if (typeof ResizeObserver !== "undefined") {
            resizeObserver = new ResizeObserver(() => {
                scheduleRefresh();
            });
        }

        if (typeof MutationObserver !== "undefined") {
            mutationObserver = new MutationObserver(() => {
                scheduleRefresh();
            });

            mutationObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ["class", "style"],
            });
        }

        window.addEventListener("resize", scheduleRefresh);
        refresh();

        return () => {
            window.removeEventListener("resize", scheduleRefresh);
            mutationObserver?.disconnect();

            if (animationFrameId !== 0) {
                window.cancelAnimationFrame(animationFrameId);
            }

            if (resizeObserver) {
                for (const navbar of observedNavbars) {
                    resizeObserver.unobserve(navbar);
                }
                resizeObserver.disconnect();
            }
        };
    }, []);

    return offset;
}
