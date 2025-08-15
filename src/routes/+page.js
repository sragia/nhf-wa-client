import { PUBLIC_SERVER_HOST } from "$env/static/public";
import { getVersion } from '@tauri-apps/api/app';
import { load as loadStore } from '@tauri-apps/plugin-store';
import { getCurrentAddonVersion, getCurrentNSRaidToolsVersion, compareVersions } from './addonService';

/**
 * @param {{ fetch: typeof window.fetch }} param0
 */
export const load = async ({ fetch }) => {
    const store = await loadStore('store.json');
    const apiKey = await store?.get('api_key');
    const latestClient = fetch(PUBLIC_SERVER_HOST + "/getLatestClient", {
        headers: {
            "Authorization": apiKey
        }
    })
        .then(response => response.json());
    const latestAddon = fetch(PUBLIC_SERVER_HOST + "/getLatestAddon", {
        headers: {
            "Authorization": apiKey
        }
    })
        .then(response => response.json());
    return {
        isServerUp: new Promise((resolve) => {
            fetch(PUBLIC_SERVER_HOST + "/ping", {
                headers: {
                    "Authorization": apiKey
                }
            })
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
        nsRaidTools: new Promise((resolve) => {
            fetch('https://api.github.com/repos/Reloe/NorthernSkyRaidTools/releases/latest')
            .then(response => response.json())
            .then((data) => {
                const resolvedData = {isCurrent: false, currentVersion: 'N/A', isActive: true};
                getCurrentNSRaidToolsVersion().then((currentVersion) => {
                    if (!currentVersion) {
                        resolvedData.isCurrent = false;
                        resolvedData.currentVersion = 'N/A';
                    } else {
                        resolvedData.currentVersion = currentVersion;
                        resolvedData.isCurrent = compareVersions(data.tag_name, currentVersion) === 0;
                    }
                    resolve(resolvedData);
                }).catch((error) => {
                    console.error(error);
                    getCurrentNSRaidToolsVersion().then((currentVersion) => {
                        resolve({
                            isActive: false,
                            isCurrent: false,
                            currentVersion: currentVersion || 'N/A'
                        })
                    })
                })
            })
        })
    };
}