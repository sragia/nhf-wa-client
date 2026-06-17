import { PUBLIC_EXTERNAL_API_HOST } from '$env/static/public';
import { fetch } from '@tauri-apps/plugin-http';
import { writeTextFile } from './addonService';
import { buildNHFDataLua } from './jsonToLua';
import { NHF_COMPANION_ADDON_NAME, NHF_COMPANION_TOC } from './companionToc';

export interface RostersResponse {
    teamId: string;
    seasonId: string;
    roster: unknown;
    bosses: unknown[];
}

export interface AssignmentNotesResponse {
    teamId: string;
    seasonId: string;
    bosses: unknown[];
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
    fetchedAt: string;
}

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

    const fetchedAt = new Date().toISOString();
    const nhfData = {
        teamId: rosters.teamId,
        seasonId: rosters.seasonId,
        fetchedAt,
        rosters: {
            roster: rosters.roster,
            bosses: rosters.bosses,
        },
        assignmentNotes: {
            bosses: assignmentNotes.bosses,
        },
    };

    const addonDir = getCompanionAddonDir(wowFolder.trim());
    const dataLua = buildNHFDataLua(nhfData);

    await writeTextFile(`${addonDir}/NHFCompanion.toc`, NHF_COMPANION_TOC);
    await writeTextFile(`${addonDir}/Data.lua`, dataLua);

    return {
        teamId: rosters.teamId,
        seasonId: rosters.seasonId,
        bossCount: rosters.bosses?.length ?? 0,
        fetchedAt,
    };
}
