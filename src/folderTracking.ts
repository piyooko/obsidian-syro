import { parseObsidianFrontmatterTag } from "src/util/utils";

export interface FolderTrackingRule {
    track: boolean;
    autoTag: boolean;
    tags: string[];
    ownedTagsByPath: Record<string, string[]>;
    excludedPaths: string[];
}

export interface ResolvedFolderTrackingRule {
    folderPath: string;
    rule: FolderTrackingRule;
}

export const DEFAULT_FOLDER_TRACKING_RULE: FolderTrackingRule = {
    track: false,
    autoTag: false,
    tags: [],
    ownedTagsByPath: {},
    excludedPaths: [],
};

export function isPathInsideFolder(folderPath: string, path: string): boolean {
    if (!folderPath) {
        return true;
    }

    return path === folderPath || path.startsWith(`${folderPath}/`);
}

export function normalizeFolderTrackingTag(tag: string): string | null {
    const trimmed = String(tag ?? "").trim();
    if (!trimmed) {
        return null;
    }

    const cleaned = trimmed.replace(/^#+/, "");
    if (!cleaned) {
        return null;
    }

    return `#${cleaned}`;
}

export function normalizeFolderTrackingTags(tags: Iterable<string>): string[] {
    const normalized: string[] = [];

    for (const tag of tags) {
        const canonical = normalizeFolderTrackingTag(tag);
        if (!canonical || normalized.includes(canonical)) {
            continue;
        }
        normalized.push(canonical);
    }

    return normalized;
}

export function parseFolderTrackingTagInput(raw: string): string[] {
    return normalizeFolderTrackingTags(
        String(raw ?? "")
            .split(/[\s,]+/g)
            .map((tag) => tag.trim())
            .filter(Boolean),
    );
}

export function formatFolderTrackingTagInput(tags: string[]): string {
    return normalizeFolderTrackingTags(tags).join("\n");
}

export function toFrontmatterTagValue(tag: string): string {
    return tag.replace(/^#/, "");
}

export function normalizeFrontmatterTags(value: unknown): string[] {
    if (Array.isArray(value)) {
        return normalizeFolderTrackingTags(
            value.filter((entry): entry is string => typeof entry === "string"),
        );
    }

    if (typeof value === "string") {
        return normalizeFolderTrackingTags(parseObsidianFrontmatterTag(value));
    }

    return [];
}

export function cloneFolderTrackingRule(
    rule?: Partial<FolderTrackingRule> | null,
): FolderTrackingRule {
    return {
        track: rule?.track === true,
        autoTag: rule?.autoTag === true,
        tags: normalizeFolderTrackingTags(rule?.tags ?? []),
        ownedTagsByPath: Object.fromEntries(
            Object.entries(rule?.ownedTagsByPath ?? {}).map(([path, tags]) => [
                path,
                normalizeFolderTrackingTags(tags),
            ]),
        ),
        excludedPaths: Array.from(
            new Set((rule?.excludedPaths ?? []).filter((path) => typeof path === "string")),
        ),
    };
}

export function resolveFolderTrackingRule(
    rules: Record<string, FolderTrackingRule>,
    notePath: string,
): ResolvedFolderTrackingRule | null {
    let bestMatch: ResolvedFolderTrackingRule | null = null;

    for (const [folderPath, rule] of Object.entries(rules ?? {})) {
        if (!isPathInsideFolder(folderPath, notePath)) {
            continue;
        }

        if (bestMatch === null || folderPath.length > bestMatch.folderPath.length) {
            bestMatch = {
                folderPath,
                rule: cloneFolderTrackingRule(rule),
            };
        }
    }

    return bestMatch;
}

export function renamePathPrefix(path: string, oldPath: string, newPath: string): string {
    if (path === oldPath) {
        return newPath;
    }

    if (!path.startsWith(`${oldPath}/`)) {
        return path;
    }

    return `${newPath}${path.slice(oldPath.length)}`;
}
