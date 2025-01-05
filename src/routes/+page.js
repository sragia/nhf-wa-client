import { PUBLIC_SERVER_HOST } from "$env/static/public";
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from "@tauri-apps/api/core";
import { load as loadStore } from '@tauri-apps/plugin-store';

const compareVersions = (version1, version2) => {
    const parseVersion = (version) => version.split('.').map(Number);

    const [major1, minor1, patch1] = parseVersion(version1);
    const [major2, minor2, patch2] = parseVersion(version2);

    // Compare major, minor, and patch versions
    if (major1 !== major2) {
        return major1 > major2 ? 1 : -1;
    }
    if (minor1 !== minor2) {
        return minor1 > minor2 ? 1 : -1;
    }
    if (patch1 !== patch2) {
        return patch1 > patch2 ? 1 : -1;
    }

    return 0; // Versions are equal
}

const getCurrentAddonVersion = async () => {
    const store = await loadStore('store.json');
    try {
        if (store) {
            const storedFolder = await store.get('wow_folder');
            if (storedFolder) {
                const file = await invoke('read_file', { filePath: storedFolder + '/Interface/Addons/NHFAuraManager/NHFAuraManager.toc' });
                const versionMatch = file.match(/## Version:\s*(\S+)/);
                if (versionMatch) {
                    return versionMatch[1];
                }
            }
        }
    } catch (error) {
        console.error(error)
    }

    return false;
}

export const load = async ({ fetch }) => {
    const latestClient = fetch(PUBLIC_SERVER_HOST + "/getLatestClient")
        .then(response => response.json())
    const latestAddon = fetch(PUBLIC_SERVER_HOST + "/getLatestAddon")
        .then(response => response.json())
    return {
        isServerUp: new Promise((resolve) => {
            fetch(PUBLIC_SERVER_HOST + "/ping")
            .then(() => resolve(true))
            .catch(() => resolve(false));
        }),
        client: new Promise((resolve) => {
            latestClient.then((data) => {
                data.semVersion = data.semVersion.replace("v", "");
                data.isActive = true;
                getVersion().then((currentVersion) => {
                    data.isCurrent = data.semVersion === currentVersion;
                    data.currentVersion = currentVersion;
                    resolve(data);
                })
            }).catch((error) => {
                console.error(error);
                getVersion().then((currentVersion) => {
                    resolve({
                        isActive: false,
                        isCurrent: false,
                        currentVersion: currentVersion,
                    });
                });
            })
        }),
        addon: new Promise((resolve) => {
            latestAddon.then((data) => {
                data.semVersion = data.semVersion;
                data.isActive = true;
                getCurrentAddonVersion().then((currentVersion) => {
                    if (!currentVersion) {
                        data.isCurrent = false;
                        data.currentVersion = 'N/A';
                    } else {
                        data.currentVersion = currentVersion;
                        data.isCurrent = compareVersions(data.semVersion, currentVersion) === 0;
                    }

                    resolve(data);
                })
            }).catch((error) => {
                console.error(error);
                getCurrentAddonVersion().then((currentVersion) => {
                    resolve({
                        isActive: false,
                        isCurrent: false,
                        currentVersion: currentVersion || 'N/A'
                    });
                })
            })
        }),
    };
}