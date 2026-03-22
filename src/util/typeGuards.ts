export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === "object" && value !== null;
}

export function hasOwn(record: object, key: PropertyKey): boolean {
    return Reflect.ownKeys(record).some((existingKey) => existingKey === key);
}

export function parseJsonUnknown(raw: string): unknown {
    return JSON.parse(raw) as unknown;
}

export function getStringProp(record: UnknownRecord, key: string): string | undefined {
    const value = record[key];
    return typeof value === "string" ? value : undefined;
}

export function getNumberProp(record: UnknownRecord, key: string): number | undefined {
    const value = record[key];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function getBooleanProp(record: UnknownRecord, key: string): boolean | undefined {
    const value = record[key];
    return typeof value === "boolean" ? value : undefined;
}

export function getArrayProp(record: UnknownRecord, key: string): unknown[] | undefined {
    const value = record[key];
    return Array.isArray(value) ? value : undefined;
}

export function getRecordProp(record: UnknownRecord, key: string): UnknownRecord | undefined {
    const value = record[key];
    return isRecord(value) ? value : undefined;
}

export function isNumberRecord(value: unknown): value is Record<string, number> {
    return (
        isRecord(value) &&
        Object.values(value).every((entry) => typeof entry === "number" && Number.isFinite(entry))
    );
}

export function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

export function isNumberArray(value: unknown): value is number[] {
    return Array.isArray(value) && value.every((entry) => typeof entry === "number");
}
