export interface ImageSize {
    w: number;
    h: number;
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
    return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
    return (
        (bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]
    ) >>> 0;
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
    return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
    return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function getPngSize(bytes: Uint8Array): ImageSize | null {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (bytes.length < 24 || !signature.every((byte, index) => bytes[index] === byte)) {
        return null;
    }

    const width = readUint32BE(bytes, 16);
    const height = readUint32BE(bytes, 20);
    return width > 0 && height > 0 ? { w: width, h: height } : null;
}

function getGifSize(bytes: Uint8Array): ImageSize | null {
    if (bytes.length < 10) {
        return null;
    }

    const header = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
    if (header !== 'GIF87a' && header !== 'GIF89a') {
        return null;
    }

    const width = readUint16LE(bytes, 6);
    const height = readUint16LE(bytes, 8);
    return width > 0 && height > 0 ? { w: width, h: height } : null;
}

function getJpegSize(bytes: Uint8Array): ImageSize | null {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
        return null;
    }

    let offset = 2;
    while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) {
            offset += 1;
            continue;
        }

        const marker = bytes[offset + 1];
        if (marker === 0xd8 || marker === 0xd9) {
            offset += 2;
            continue;
        }

        const segmentLength = readUint16BE(bytes, offset + 2);
        if (segmentLength < 2) {
            return null;
        }

        const isStartOfFrame =
            marker === 0xc0 ||
            marker === 0xc1 ||
            marker === 0xc2 ||
            marker === 0xc3 ||
            marker === 0xc5 ||
            marker === 0xc6 ||
            marker === 0xc7 ||
            marker === 0xc9 ||
            marker === 0xca ||
            marker === 0xcb ||
            marker === 0xcd ||
            marker === 0xce ||
            marker === 0xcf;

        if (isStartOfFrame) {
            const height = readUint16BE(bytes, offset + 5);
            const width = readUint16BE(bytes, offset + 7);
            return width > 0 && height > 0 ? { w: width, h: height } : null;
        }

        offset += 2 + segmentLength;
    }

    return null;
}

function getWebpSize(bytes: Uint8Array): ImageSize | null {
    if (bytes.length < 30) {
        return null;
    }

    const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (riff !== 'RIFF' || webp !== 'WEBP') {
        return null;
    }

    const chunkType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (chunkType === 'VP8X' && bytes.length >= 30) {
        const width = readUint24LE(bytes, 24) + 1;
        const height = readUint24LE(bytes, 27) + 1;
        return width > 0 && height > 0 ? { w: width, h: height } : null;
    }

    if (chunkType === 'VP8L' && bytes.length >= 25) {
        const bits = readUint32LE(bytes, 21);
        const width = (bits & 0x3fff) + 1;
        const height = ((bits >> 14) & 0x3fff) + 1;
        return width > 0 && height > 0 ? { w: width, h: height } : null;
    }

    if (chunkType === 'VP8 ' && bytes.length >= 30) {
        if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
            return null;
        }

        const width = readUint16LE(bytes, 26) & 0x3fff;
        const height = readUint16LE(bytes, 28) & 0x3fff;
        return width > 0 && height > 0 ? { w: width, h: height } : null;
    }

    return null;
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
    return (
        bytes[offset] |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)
    ) >>> 0;
}

export function getImageSize(bytes: Uint8Array): ImageSize | null {
    return (
        getPngSize(bytes) ??
        getJpegSize(bytes) ??
        getGifSize(bytes) ??
        getWebpSize(bytes)
    );
}
