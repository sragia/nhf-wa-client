import { PUBLIC_EXTERNAL_API_HOST } from '$env/static/public';
import { fetch } from '@tauri-apps/plugin-http';
import { clearDirectory, writeBinaryFile, writeTextFile } from './addonService';
import { buildNHFDataLua } from './jsonToLua';
import { NHF_COMPANION_ADDON_NAME, NHF_COMPANION_TOC } from './companionToc';
import { getImageSize, type ImageSize } from './imageSize';

export interface RosterBoss {
    bossId: string;
    bossName: string;
    journalEncounterId?: number;
    imageUrl?: string;
    imagePath?: string;
    imageSize?: ImageSize;
    slots?: unknown[];
    bench?: unknown[];
    piAssignments?: unknown[];
    groupSetup?: unknown;
    assignmentId?: string;
    [key: string]: unknown;
}

export interface AssignmentNotesBoss {
    bossId: string;
    bossName: string;
    journalEncounterId?: number;
    imagePath?: string;
    imageSize?: ImageSize;
    assignments?: unknown[];
    [key: string]: unknown;
}

export interface RostersResponse {
    teamId: string;
    seasonId: string;
    roster: unknown;
    bosses: RosterBoss[];
}

export interface AssignmentNotesResponse {
    teamId: string;
    seasonId: string;
    bosses: AssignmentNotesBoss[];
}

export interface CompanionSeason {
    id: string;
    name: string;
    shortLabel: string;
    expansion: string;
    expansionLogo?: string;
    journalPath?: string;
}

export interface SeasonsResponse {
    teamId: string;
    currentSeasonId: string;
    currentSeason: CompanionSeason | null;
    defaultSeasonId: string;
    seasons: CompanionSeason[];
}

export interface CompanionFetchResult {
    teamId: string;
    seasonId: string;
    bossCount: number;
    imageCount: number;
    fetchedAt: string;
}

const COMPANION_INTERFACE_PATH = `Interface/Addons/${NHF_COMPANION_ADDON_NAME}`;

function buildExternalUrl(path: string, seasonId?: string): string {
    const url = new URL(path, PUBLIC_EXTERNAL_API_HOST);
    if (seasonId?.trim()) {
        url.searchParams.set('seasonId', seasonId.trim());
    }
    return url.toString();
}

async function fetchExternalJson<T>(url: string, apiKey: string): Promise<T> {
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${apiKey}`,
        },
    });

    if (response.status === 401) {
        throw new Error('Invalid or revoked API key. Generate a new key in Settings → External API.');
    }

    if (!response.ok) {
        let message = `Request failed (${response.status})`;
        try {
            const body = await response.json();
            if (body?.error) {
                message = body.error;
            }
        } catch {
            // ignore parse errors
        }
        throw new Error(message);
    }

    return response.json() as Promise<T>;
}

function getCompanionAddonDir(wowFolder: string): string {
    return `${wowFolder}/Interface/AddOns/${NHF_COMPANION_ADDON_NAME}`;
}

function sanitizePathSegment(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getImageExtension(imageUrl: string): string {
    try {
        const pathname = new URL(imageUrl).pathname;
        const match = pathname.match(/(\.[a-zA-Z0-9]+)$/);
        if (match) {
            const ext = match[1].toLowerCase();
            if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.blp'].includes(ext)) {
                return ext;
            }
        }
    } catch {
        // ignore invalid URLs
    }
    return '.png';
}

function getBossImageFilename(bossId: string, imageUrl: string): string {
    try {
        const pathname = new URL(imageUrl).pathname;
        const baseName = pathname.split('/').pop();
        if (baseName) {
            const sanitized = sanitizePathSegment(baseName);
            if (sanitized.length > 0) {
                return sanitized;
            }
        }
    } catch {
        // ignore invalid URLs
    }

    return `${sanitizePathSegment(bossId)}${getImageExtension(imageUrl)}`;
}

function toCompanionImagePath(filename: string): string {
    return `${COMPANION_INTERFACE_PATH}/Images/${filename}`;
}

interface BossImageInfo {
    path: string;
    size?: ImageSize;
}

async function downloadBossImage(imageUrl: string): Promise<Uint8Array | null> {
    try {
        const response = await fetch(imageUrl, { method: 'GET' });
        if (!response.ok) {
            return null;
        }

        return new Uint8Array(await response.arrayBuffer());
    } catch {
        return null;
    }
}

async function downloadBossImages(
    addonDir: string,
    bosses: RosterBoss[],
): Promise<Map<string, BossImageInfo>> {
    const imagesDir = `${addonDir}/Images`;
    await clearDirectory(imagesDir);

    const imageInfoByBossId = new Map<string, BossImageInfo>();
    const usedFilenames = new Set<string>();

    const downloads = bosses.map(async (boss) => {
        const imageUrl = boss.imageUrl?.trim();
        if (!imageUrl) {
            return;
        }

        let filename = getBossImageFilename(boss.bossId, imageUrl);
        if (usedFilenames.has(filename)) {
            const extension = getImageExtension(imageUrl);
            const stem = filename.replace(/\.[^.]+$/, '');
            filename = `${stem}-${sanitizePathSegment(boss.bossId)}${extension}`;
        }

        const imageBytes = await downloadBossImage(imageUrl);
        if (!imageBytes || imageBytes.length === 0) {
            return;
        }

        const size = getImageSize(imageBytes);

        await writeBinaryFile(`${imagesDir}/${filename}`, imageBytes);
        usedFilenames.add(filename);
        imageInfoByBossId.set(boss.bossId, {
            path: toCompanionImagePath(filename),
            ...(size ? { size } : {}),
        });
    });

    await Promise.all(downloads);
    return imageInfoByBossId;
}

function withImageInfo<T extends { bossId: string; imageUrl?: string }>(
    boss: T,
    imageInfoByBossId: Map<string, BossImageInfo>,
): Omit<T, 'imageUrl'> & { imagePath?: string; imageSize?: ImageSize } {
    const { imageUrl: _imageUrl, ...rest } = boss;
    const imageInfo = imageInfoByBossId.get(boss.bossId);
    return imageInfo
        ? {
              ...rest,
              imagePath: imageInfo.path,
              ...(imageInfo.size ? { imageSize: imageInfo.size } : {}),
          }
        : rest;
}

export async function fetchCompanionSeasons(
    externalApiKey: string,
): Promise<SeasonsResponse> {
    const trimmedKey = externalApiKey.trim();
    if (!trimmedKey) {
        throw new Error('External API key is required.');
    }

    return fetchExternalJson<SeasonsResponse>(
        buildExternalUrl('/api/external/v1/seasons'),
        trimmedKey,
    );
}

export async function fetchAndWriteCompanionAddon(
    wowFolder: string,
    externalApiKey: string,
    seasonId?: string,
): Promise<CompanionFetchResult> {
    const trimmedKey = externalApiKey.trim();
    if (!trimmedKey) {
        throw new Error('External API key is required.');
    }

    if (!wowFolder?.trim()) {
        throw new Error('Set WoW folder in Addon Manager first.');
    }

    const [rosters, assignmentNotes] = await Promise.all([
        fetchExternalJson<RostersResponse>(
            buildExternalUrl('/api/external/v1/rosters', seasonId),
            trimmedKey,
        ),
        fetchExternalJson<AssignmentNotesResponse>(
            buildExternalUrl('/api/external/v1/assignment-notes', seasonId),
            trimmedKey,
        ),
    ]);

    const addonDir = getCompanionAddonDir(wowFolder.trim());
    const imageInfoByBossId = await downloadBossImages(addonDir, rosters.bosses ?? []);

    const rosterBosses = (rosters.bosses ?? []).map((boss) =>
        withImageInfo(boss, imageInfoByBossId),
    );
    const assignmentBosses = (assignmentNotes.bosses ?? []).map((boss) =>
        withImageInfo(boss, imageInfoByBossId),
    );

    const fetchedAt = new Date().toISOString();
    const nhfData = {
        teamId: rosters.teamId,
        seasonId: rosters.seasonId,
        fetchedAt,
        rosters: {
            roster: rosters.roster,
            bosses: rosterBosses,
        },
        assignmentNotes: {
            bosses: assignmentBosses,
        },
    };

    const dataLua = buildNHFDataLua(nhfData);

    await writeTextFile(`${addonDir}/NHFCompanion.toc`, NHF_COMPANION_TOC);
    await writeTextFile(`${addonDir}/Data.lua`, dataLua);

    return {
        teamId: rosters.teamId,
        seasonId: rosters.seasonId,
        bossCount: rosterBosses.length,
        imageCount: imageInfoByBossId.size,
        fetchedAt,
    };
}
