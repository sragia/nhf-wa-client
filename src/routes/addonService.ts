import { invoke } from "@tauri-apps/api/core";
import { load as loadStore } from '@tauri-apps/plugin-store';
import { compareVersions, extractVersionFromToc } from './versionUtils';

export async function getCurrentAddonVersion(): Promise<string | false> {
    const store = await loadStore('store.json');
    try {
        if (store) {
            const storedFolder = await store.get('wow_folder');
            if (storedFolder) {
                const file = await invoke('read_file', { filePath: storedFolder + '/Interface/Addons/NHFAuraManager/NHFAuraManager.toc' });
                return extractVersionFromToc(file);
            }
        }
    } catch (error) {
        console.error(error);
    }
    return false;
}

export async function getCurrentNSRaidToolsVersion(): Promise<string | false> {
    const store = await loadStore('store.json');
    try {
        if (store) {
            const storedFolder = await store.get('wow_folder');
            if (storedFolder) {
                const file = await invoke('read_file', { filePath: storedFolder + '/Interface/Addons/NorthernSkyRaidTools/NorthernSkyRaidTools.toc' });
                return extractVersionFromToc(file);
            }
        }
    } catch (error) {
        console.error(error);
    }
    return false;
}

export async function getZipInfo(filePath: string): Promise<any> {
    try {
        return await invoke('get_zip_info', { filePath });
    } catch (error) {
        return `Error getting ZIP info: ${error}`;
    }
}

export async function validateAndExtractZip(filePath: string, destination: string): Promise<void> {
    try {
        await invoke('validate_zip', { filePath });
    } catch (validationError: any) {
        const zipInfo = await getZipInfo(filePath);
        let message = `ZIP validation failed: ${validationError}`;
        if (typeof validationError === 'string') {
            if (validationError.includes('Could not find EOCD')) {
                message = 'ZIP file is corrupted or incomplete. Please try downloading again.';
            } else if (validationError.includes('Invalid ZIP file')) {
                message = 'ZIP file appears to be corrupted. Please try downloading again.';
            }
        }
        throw new Error(message);
    }
    await invoke('extract_zip', { filePath, destination });
}

export { compareVersions };
