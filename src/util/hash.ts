function encodeUtf8(value: string): Uint8Array {
    if (typeof TextEncoder !== "undefined") {
        return new TextEncoder().encode(value);
    }

    const encoded = encodeURIComponent(value);
    const bytes: number[] = [];
    for (let index = 0; index < encoded.length; ) {
        const char = encoded[index];
        if (char === "%") {
            bytes.push(Number.parseInt(encoded.slice(index + 1, index + 3), 16));
            index += 3;
            continue;
        }

        bytes.push(char.charCodeAt(0));
        index += 1;
    }

    return Uint8Array.from(bytes);
}

export async function sha256Hex(value: string): Promise<string> {
    const encoded = encodeUtf8(value);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
        "",
    );
}
