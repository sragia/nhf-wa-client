<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";
  import { load } from "@tauri-apps/plugin-store";
  import { download } from "@tauri-apps/plugin-upload";
  import { PUBLIC_SERVER_HOST } from "$env/static/public";
  import { check as clientCheck } from "@tauri-apps/plugin-updater";
  import { relaunch } from "@tauri-apps/plugin-process";
  import { getZipInfo, validateAndExtractZip } from "./addonService";
  import { invoke } from "@tauri-apps/api/core";
  import { open as openShell } from "@tauri-apps/plugin-shell";
  import { listen } from "@tauri-apps/api/event";

  let wowFolder = $state("");
  let apiKey = $state("");
  let isInstalling = $state(false);
  let isNSInstalling = $state(false);
  let isLRInstalling = $state(false);
  let isUpdateAvailable = $state(false);
  let isNSUpdateAvailable = $state(false);
  let isLRUpdateAvailable = $state(false);
  let store: any = null;
  let notification = $state({ show: false, message: "", type: "error" });

  // Backup functionality
  let backupEnabled = $state(false);
  let backupOnStartup = $state(false);
  let backupAllData = $state(false);
  let isBackingUp = $state(false);
  let backupProgress = $state(0);
  let backupStatus = $state("");
  let lastBackupTime = $state("");
  let lastAppStartTime = $state("");

  function showNotification(
    message: string,
    type: "error" | "success" = "error",
  ) {
    notification = { show: true, message, type };
    setTimeout(() => {
      notification.show = false;
    }, 5000);
  }

  function getAddonButtonText() {
    return !wowFolder
      ? "Set Folder"
      : !apiKey
        ? "Set API Key"
        : isInstalling
          ? "Downloading..."
          : isUpdateAvailable
            ? "Update"
            : "Re-Install";
  }

  function getNSButtonText() {
    return !wowFolder
      ? "Set Folder"
      : !apiKey
        ? "Set API Key"
        : isNSInstalling
          ? "Downloading..."
          : isNSUpdateAvailable
            ? "Update"
            : "Re-Install";
  }

  function getLRButtonText() {
    return !wowFolder
      ? "Set Folder"
      : !apiKey
        ? "Set API Key"
        : isLRInstalling
          ? "Downloading..."
          : isLRUpdateAvailable
            ? "Update"
            : "Re-Install";
  }

  const check = async () => {
    const addon = await data.addon;
    const nsRaidTools = await data.nsRaidTools;
    const liquidReminders = await data.liquidReminders;
    isUpdateAvailable = !addon.isCurrent;
    isNSUpdateAvailable = !nsRaidTools.isCurrent;
    isLRUpdateAvailable = !liquidReminders.isCurrent;
  };
  check();

  const setupStore = async () => {
    store = await load("store.json");
    if (store) {
      const storedFolder = await store.get("wow_folder");
      const storedApiKey = await store.get("api_key");
      const storedBackupEnabled = await store.get("backup_enabled");
      const storedBackupOnStartup = await store.get("backup_on_startup");
      const storedBackupAllData = await store.get("backup_all_data");
      const storedLastBackupTime = await store.get("last_backup_time");
      const storedLastAppStartTime = await store.get("last_app_start_time");

      if (storedFolder) {
        wowFolder = storedFolder;
      }
      if (storedApiKey) {
        apiKey = storedApiKey;
      }
      if (storedBackupEnabled !== undefined) {
        backupEnabled = storedBackupEnabled;
      }
      if (storedBackupOnStartup !== undefined) {
        backupOnStartup = storedBackupOnStartup;
      }
      if (storedBackupAllData !== undefined) {
        backupAllData = storedBackupAllData;
      }
      if (storedLastBackupTime) {
        lastBackupTime = storedLastBackupTime;
      }
      if (storedLastAppStartTime) {
        lastAppStartTime = storedLastAppStartTime;
      }
    }
  };
  setupStore();

  // Set up backup progress event listener
  let unlistenBackupProgress: (() => void) | null = null;

  const setupBackupProgressListener = async () => {
    unlistenBackupProgress = await listen("backup-progress", (event: any) => {
      const progressData = event.payload;
      backupProgress = progressData.progress;
      backupStatus = progressData.status;

      // Don't show file count to user - just show the status message
    });
  };

  setupBackupProgressListener();

  // Run backup on startup if enabled (only when app is actually opened, not on reloads)
  const runStartupBackup = async () => {
    if (backupEnabled && backupOnStartup && wowFolder) {
      const currentTime = new Date().toISOString();
      const timeDiff = lastAppStartTime
        ? new Date(currentTime).getTime() - new Date(lastAppStartTime).getTime()
        : Infinity;

      // Only run backup if it's been more than 6 hours since last app start
      // This prevents backup from running on page reloads but allows it on actual app opens
      if (timeDiff > 6 * 60 * 60 * 1000) {
        if (store) {
          await store.set("last_app_start_time", currentTime);
        }
        lastAppStartTime = currentTime;
        await backupWeakAuras();
      }
    }
  };

  // Run startup backup after a short delay to ensure everything is loaded
  setTimeout(runStartupBackup, 1000);

  let { data } = $props();

  // Cleanup event listener on component destroy
  $effect(() => {
    return () => {
      if (unlistenBackupProgress) {
        unlistenBackupProgress();
      }
    };
  });

  const openFolder = async () => {
    if (!store) return;
    const folder = await open({
      directory: true,
      multiple: false,
    });
    if (folder) {
      store.set("wow_folder", folder);
      wowFolder = folder;
      window.location.reload();
    }
  };

  const resetInstallBtnText = (failed = false) => {
    setTimeout(() => {
      isInstalling = false;
      isUpdateAvailable = failed;
    }, 4000);
  };

  const resetNSInstallBtnText = (failed = false) => {
    setTimeout(() => {
      isNSInstalling = false;
      isNSUpdateAvailable = failed;
    }, 4000);
  };

  const resetLRInstallBtnText = (failed = false) => {
    setTimeout(() => {
      isLRInstalling = false;
      isLRUpdateAvailable = failed;
    }, 4000);
  };

  // --- Addon ZIP update logic ---
  const update = async () => {
    if (!wowFolder || !apiKey || isInstalling) return;
    try {
      isInstalling = true;
      let timer: number | null = null;
      await download(
        PUBLIC_SERVER_HOST + "/assets/addon.zip",
        "./addon.zip",
        (progress) => {
          if (timer) {
            clearTimeout(timer);
          }
          timer = setTimeout(() => {
            extractAddonZip();
          }, 1000);
          console.log(
            progress.progress,
            progress.progressTotal,
            progress.transferSpeed,
            progress,
          );
        },
        new Map([["Authorization", apiKey]]),
      );
    } catch (error) {
      isInstalling = false;
      resetInstallBtnText(true);
      showNotification(
        "Failed to download NHF Addon. Please check your connection and try again.",
      );
    }
  };

  async function extractAddonZip() {
    try {
      await validateAndExtractZip(
        "./addon.zip",
        wowFolder + "/Interface/Addons",
      );
      resetInstallBtnText();
      window.location.reload();
    } catch (error: any) {
      resetInstallBtnText(true);
      showNotification(
        "Failed to extract NHF Addon. Please check your WoW folder path and try again.",
      );
      console.error(error);
    }
  }

  // --- NS Raid Tools ZIP update logic ---
  const updateNSRaidTools = async () => {
    if (!wowFolder || !apiKey || isNSInstalling) return;
    try {
      isNSInstalling = true;
      const response = await fetch(
        "https://api.github.com/repos/Reloe/NorthernSkyRaidTools/releases/latest",
      );
      const nsData = await response.json();
      const asset = nsData.assets.find(
        (asset: any) => asset.content_type === "application/zip",
      );
      const downloadUrl = asset.browser_download_url;
      let timer: number | null = null;
      await download(downloadUrl, "./nsRaidTools.zip", (progress) => {
        if (timer) {
          clearTimeout(timer);
        }
        timer = setTimeout(() => {
          extractNSRaidToolsZip();
        }, 1000);
        console.log(
          progress.progress,
          progress.progressTotal,
          progress.transferSpeed,
          progress,
        );
      });
    } catch (error) {
      isNSInstalling = false;
      resetNSInstallBtnText(true);
      showNotification(
        "Failed to download NS Raid Tools. Please check your connection and try again.",
      );
    }
  };

  async function extractNSRaidToolsZip() {
    try {
      await validateAndExtractZip(
        "./nsRaidTools.zip",
        wowFolder + "/Interface/Addons",
      );
      resetNSInstallBtnText();
      window.location.reload();
    } catch (error: any) {
      resetNSInstallBtnText(true);
      showNotification(
        "Failed to extract NS Raid Tools. Please check your WoW folder path and try again.",
      );
      console.error(error);
    }
  }

  // --- Liquid Reminders ZIP update logic ---
  const updateLiquidReminders = async () => {
    if (!wowFolder || !apiKey || isLRInstalling) return;
    try {
      isLRInstalling = true;
      let timer: number | null = null;
      await download(
        PUBLIC_SERVER_HOST + "/assets/liquidReminders.zip",
        "./liquidReminders.zip",
        (progress) => {
          if (timer) {
            clearTimeout(timer);
          }
          timer = setTimeout(() => {
            extractLiquidRemindersZip();
          }, 1000);
          console.log(
            progress.progress,
            progress.progressTotal,
            progress.transferSpeed,
            progress,
          );
        },
        new Map([["Authorization", apiKey]]),
      );
    } catch (error) {
      isLRInstalling = false;
      resetLRInstallBtnText(true);
      showNotification(
        "Failed to download Liquid Reminders. Please check your connection and try again.",
      );
    }
  };

  async function extractLiquidRemindersZip() {
    try {
      await validateAndExtractZip(
        "./liquidReminders.zip",
        wowFolder + "/Interface/Addons",
      );
      resetLRInstallBtnText();
      window.location.reload();
    } catch (error: any) {
      resetLRInstallBtnText(true);
      showNotification(
        "Failed to extract Liquid Reminders. Please check your WoW folder path and try again.",
      );
      console.error(error);
    }
  }

  const updateKey = async () => {
    if (!store) return;
    await store.set("api_key", apiKey);
    window.location.reload();
  };

  const updateClient = async () => {
    const update = await clientCheck({
      headers: {
        Authorization: apiKey,
      },
    });
    if (update) {
      await update.downloadAndInstall();
      console.log("update installed");
      await relaunch();
    }
  };

  // Backup functionality
  const updateBackupSettings = async () => {
    if (!store) return;
    await store.set("backup_enabled", backupEnabled);
    await store.set("backup_on_startup", backupOnStartup);
    await store.set("backup_all_data", backupAllData);
  };

  const openBackupFolder = async () => {
    if (!wowFolder) {
      showNotification("Please set your WoW folder first", "error");
      return;
    }

    try {
      const backupPath = `${wowFolder}\\NHF-Backup`;
      await openShell(backupPath);
    } catch (error: any) {
      showNotification(`Failed to open backup folder: ${error}`, "error");
    }
  };

  const backupWeakAuras = async () => {
    if (!wowFolder || isBackingUp) return;

    try {
      isBackingUp = true;
      backupProgress = 0;
      backupStatus = "Starting backup...";

      const result = (await invoke("backup_weakauras", {
        wowFolder,
        backupAllData,
      })) as any;

      if (result.error) {
        showNotification(result.error, "error");
        backupStatus = "Backup failed";
      } else {
        backupProgress = result.progress;
        backupStatus = result.status;
        if (result.completed) {
          // Save the backup timestamp
          const now = new Date();
          lastBackupTime = now.toLocaleString();
          if (store) {
            await store.set("last_backup_time", lastBackupTime);
          }
          showNotification("Backup completed successfully!", "success");
        }
      }
    } catch (error: any) {
      console.error("Backup error:", error);
      showNotification(`Backup failed: ${error}`, "error");
      backupStatus = "Backup failed";
    } finally {
      isBackingUp = false;
      setTimeout(() => {
        backupProgress = 0;
        backupStatus = "";
      }, 3000);
    }
  };
</script>

<meta http-equiv="refresh" content="900" />
<main>
  {#if notification.show}
    <div
      class="notification"
      class:error={notification.type === "error"}
      class:success={notification.type === "success"}
    >
      <span class="notification-message">{notification.message}</span>
      <button
        class="notification-close"
        onclick={() => (notification.show = false)}>×</button
      >
    </div>
  {/if}

  <div class="header">
    <img src="/icon.png" alt="NHF Logo" class="header-icon" />
    <h1>NHF Aura Manager</h1>
  </div>
  <div class="main-content">
    <div class="left-panel">
      <div class="input">
        <label for="wow_folder"
          >WoW Folder (i.e. .../World of Warcraft/_retail_)</label
        >
        <input
          onclick={openFolder}
          name="folder"
          id="wow_folder"
          bind:value={wowFolder}
        />
      </div>
      <div class="input">
        <label for="api_key">API Key (Get From Discord)</label>
        <input
          name="api_key"
          id="api_key"
          bind:value={apiKey}
          onchange={updateKey}
        />
      </div>

      <div class="backup-section">
        <h3>Backup WeakAuras</h3>
        <div class="checkbox-group">
          <input
            type="checkbox"
            id="backup_enabled"
            bind:checked={backupEnabled}
            onchange={updateBackupSettings}
          />
          <label for="backup_enabled">Enable Backup</label>
        </div>

        {#if backupEnabled}
          <div class="checkbox-group">
            <input
              type="checkbox"
              id="backup_on_startup"
              bind:checked={backupOnStartup}
              onchange={updateBackupSettings}
            />
            <label for="backup_on_startup">Backup on App Start</label>
          </div>

          <div class="checkbox-group">
            <input
              type="checkbox"
              id="backup_all_data"
              bind:checked={backupAllData}
              onchange={updateBackupSettings}
            />
            <label for="backup_all_data">Backup All Addons</label>
          </div>

          {#if lastBackupTime}
            <div class="last-backup-info">
              <div class="last-backup-text">
                <span class="last-backup-label">Last backup:</span>
                <span class="last-backup-time">{lastBackupTime}</span>
              </div>
              <button
                type="button"
                class="folder-button"
                onclick={openBackupFolder}
                title="Open backup folder"
              >
                📁 Open
              </button>
            </div>
          {/if}

          <button
            type="button"
            class="backup-button"
            disabled={!wowFolder || isBackingUp}
            onclick={backupWeakAuras}
          >
            {isBackingUp ? "Backing Up..." : "Backup Now"}
          </button>

          {#if isBackingUp || backupStatus}
            <div class="progress-container">
              <div class="progress-bar">
                <div
                  class="progress-fill"
                  style="width: {backupProgress}%"
                ></div>
              </div>
              <div class="progress-text">{backupStatus}</div>
            </div>
          {/if}
        {/if}
      </div>
    </div>

    <div class="right-panel">
      <div class="action-buttons">
        <div class="button-group">
          <label for="nhf-addon-btn">NHF Addon</label>
          <button
            id="nhf-addon-btn"
            type="button"
            disabled={!wowFolder || !apiKey || isInstalling}
            class:glowing={isUpdateAvailable}
            class:disabled-btn={!wowFolder || !apiKey}
            onclick={update}>{getAddonButtonText()}</button
          >
        </div>

        <div class="button-group">
          <label for="ns-raid-tools-btn">NS Raid Tools</label>
          <button
            id="ns-raid-tools-btn"
            type="button"
            disabled={!wowFolder || !apiKey || isNSInstalling}
            class:glowing={isNSUpdateAvailable}
            class:disabled-btn={!wowFolder || !apiKey}
            onclick={updateNSRaidTools}>{getNSButtonText()}</button
          >
        </div>

        <div class="button-group">
          <label for="liquid-reminders-btn">Liquid Reminders</label>
          <button
            id="liquid-reminders-btn"
            type="button"
            disabled={!wowFolder || !apiKey || isLRInstalling}
            class:glowing={isLRUpdateAvailable}
            class:disabled-btn={!wowFolder || !apiKey}
            onclick={updateLiquidReminders}>{getLRButtonText()}</button
          >
        </div>

        <div class="button-group">
          <label for="client-update-btn">Client Update</label>
          {#await data.client}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              ><path
                fill="currentColor"
                d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z"
                ><animateTransform
                  attributeName="transform"
                  dur="0.75s"
                  repeatCount="indefinite"
                  type="rotate"
                  values="0 12 12;360 12 12"
                /></path
              ></svg
            >
          {:then client}
            {#if !client.isCurrent}
              <button
                id="client-update-btn"
                class="clientupdate glowing"
                onclick={updateClient}>Update</button
              >
            {:else}
              <button
                id="client-update-btn"
                class="clientupdate noanim"
                disabled>Up To Date</button
              >
            {/if}
          {/await}
        </div>
      </div>
    </div>
  </div>

  <div class="status-panel">
    {#if !apiKey || !wowFolder}
      <div class="indicator">
        <div class="dot gray"></div>
        <div>
          <span>Set folder and API key to see addon status.</span>
        </div>
      </div>
    {:else}
      {#await data.addon}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          ><path
            fill="currentColor"
            d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z"
            ><animateTransform
              attributeName="transform"
              dur="0.75s"
              repeatCount="indefinite"
              type="rotate"
              values="0 12 12;360 12 12"
            /></path
          ></svg
        >
      {:then addon}
        <div class="indicator">
          <div
            class="dot"
            class:gray={!addon.isActive}
            class:green={addon.isCurrent}
          ></div>
          <div>
            <span>Addon</span>
            <span>Version: {addon.currentVersion}</span>
          </div>
        </div>
      {/await}
      {#await data.nsRaidTools}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          ><path
            fill="currentColor"
            d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z"
            ><animateTransform
              attributeName="transform"
              dur="0.75s"
              repeatCount="indefinite"
              type="rotate"
              values="0 12 12;360 12 12"
            /></path
          ></svg
        >
      {:then addon}
        <div class="indicator">
          <div
            class="dot"
            class:gray={!addon.isActive}
            class:green={addon.isCurrent}
          ></div>
          <div>
            <span>NS Raid Tools</span>
            <span>Version: {addon.currentVersion}</span>
          </div>
        </div>
      {/await}
      {#await data.liquidReminders}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          ><path
            fill="currentColor"
            d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z"
            ><animateTransform
              attributeName="transform"
              dur="0.75s"
              repeatCount="indefinite"
              type="rotate"
              values="0 12 12;360 12 12"
            /></path
          ></svg
        >
      {:then addon}
        <div class="indicator">
          <div
            class="dot"
            class:gray={!addon.isActive}
            class:green={addon.isCurrent}
          ></div>
          <div>
            <span>Liquid Reminders</span>
            <span>Version: {addon.currentVersion}</span>
          </div>
        </div>
      {/await}
    {/if}
    {#await data.client}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        ><path
          fill="currentColor"
          d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z"
          ><animateTransform
            attributeName="transform"
            dur="0.75s"
            repeatCount="indefinite"
            type="rotate"
            values="0 12 12;360 12 12"
          /></path
        ></svg
      >
    {:then client}
      <div class="indicator">
        <div
          class="dot"
          class:gray={!client.isActive}
          class:green={client.isCurrent}
        ></div>
        <div>
          <span>Client</span>
          <span>Version: {client.currentVersion}</span>
        </div>
      </div>
    {/await}
    {#await data.isServerUp}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        ><path
          fill="currentColor"
          d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z"
          ><animateTransform
            attributeName="transform"
            dur="0.75s"
            repeatCount="indefinite"
            type="rotate"
            values="0 12 12;360 12 12"
          /></path
        ></svg
      >
    {:then isServerUp}
      <div class="indicator">
        <div class="dot" class:green={isServerUp}></div>
        <span>Server</span>
      </div>
    {/await}
  </div>
</main>

<style>
  @import url("https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&display=swap");
  main {
    color: #ebebd3;
    font-family: "Poppins", sans-serif;
    font-optical-sizing: auto;
    font-weight: 400;
    font-style: normal;
    height: 96vh;
    display: flex;
    flex-direction: column;
    padding: 8px 20px;
    box-sizing: border-box;
    position: relative;
    overflow: hidden;
  }

  .notification {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    padding: 12px 20px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 300px;
    max-width: 500px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    animation: slideInFromTop 0.3s ease-out;
  }

  .notification.error {
    background: #dc3545;
    color: white;
    border: 1px solid #c82333;
  }

  .notification.success {
    background: #28a745;
    color: white;
    border: 1px solid #1e7e34;
  }

  .notification-message {
    flex: 1;
    font-size: 14px;
    font-weight: 500;
  }

  .notification-close {
    background: none;
    border: none;
    color: white;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    padding: 0;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: background-color 0.2s ease;
    flex: 0;
    padding: 16px;
    margin-left: 4px;
  }

  .notification-close:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  @keyframes slideInFromTop {
    from {
      transform: translateX(-50%) translateY(-100%);
      opacity: 0;
    }
    to {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
  }

  .header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 5px;
  }

  .header-icon {
    width: 32px;
    height: 32px;
  }

  h1 {
    margin: 0;
    color: #fefefe;
    text-align: left;
    font-size: 20px;
    font-weight: 600;
  }

  .main-content {
    display: flex;
    gap: 20px;
    margin: 8px 0 0 0;
    flex: 1;
    min-height: 0;
  }

  .left-panel,
  .right-panel {
    flex: 1;
    background: #2a2a2a;
    border-radius: 12px;
    padding: 20px;
    border: 1px solid #3a3a3a;
    min-height: 0;
    overflow: hidden;
  }

  .action-buttons {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .button-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .button-group label {
    font-size: 12px;
    font-weight: 600;
    color: #ccc;
    min-width: 120px;
    text-align: left;
  }

  .input {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 4px 0 0;
  }

  .input input {
    padding: 4px 8px;
    font-weight: 600;
  }

  .status-panel {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    background: #1a1a1a;
    border-radius: 8px;
    padding: 8px 12px;
    gap: 12px;
    border: 1px solid #3a3a3a;
    margin-top: 8px;
    flex-shrink: 0;
  }

  .dot {
    width: 8px;
    height: 8px;
    background: #b5001b;
    border-radius: 100%;
  }

  .dot.green {
    background: #008c15;
  }

  .dot.gray {
    background: #4d4d4d;
  }

  .indicator {
    font-size: 11px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 6px;
  }

  input {
    border-radius: 8px;
    border: 1px solid #3a3a3a;
    background: #1a1a1a;
    color: #fefefe;
    padding: 10px 12px;
    transition: border-color 0.2s ease;
  }

  input:focus {
    outline: none;
    border-color: #5899e2;
  }

  .input label {
    font-size: 11px;
    font-weight: 500;
  }

  .backup-section {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #3a3a3a;
  }

  .backup-section h3 {
    margin: 0 0 16px 0;
    color: #fefefe;
    font-size: 16px;
    font-weight: 600;
  }

  .checkbox-group {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  .checkbox-group input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: #5899e2;
  }

  .checkbox-group label {
    font-size: 12px;
    font-weight: 500;
    color: #ccc;
    cursor: pointer;
  }

  .backup-button {
    width: 100%;
    margin-top: 8px;
    background: #28a745;
    color: white;
    border: none;
    border-radius: 5px;
    padding: 8px 16px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .backup-button:hover:not(:disabled) {
    background: #218838;
  }

  .backup-button:disabled {
    background: #444;
    color: #bbb;
    cursor: not-allowed;
  }

  .progress-container {
    margin-top: 12px;
  }

  .progress-bar {
    width: 100%;
    height: 8px;
    background: #333;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 4px;
  }

  .progress-fill {
    height: 100%;
    background: #5899e2;
    transition: width 0.3s ease;
  }

  .progress-text {
    font-size: 11px;
    color: #ccc;
    text-align: center;
  }

  .last-backup-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 8px 0;
    padding: 8px 12px;
    background: #1a1a1a;
    border-radius: 6px;
    border: 1px solid #3a3a3a;
  }

  .last-backup-text {
    display: flex;
    gap: 2px;
  }

  .last-backup-label {
    font-size: 11px;
    color: #999;
    font-weight: 500;
  }

  .last-backup-time {
    font-size: 11px;
    color: #5899e2;
    font-weight: 600;
  }

  .folder-button {
    background: #3a3a3a;
    border: 1px solid #4a4a4a;
    border-radius: 4px;
    color: #ccc;
    cursor: pointer;
    font-size: 10px;
    padding: 2px 4px;
    transition: all 0.2s ease;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    flex: 0;
    white-space: nowrap;
  }

  .folder-button:hover {
    background: #4a4a4a;
    border-color: #5899e2;
    color: #5899e2;
  }

  button {
    font-family: "Poppins", sans-serif;
    font-optical-sizing: auto;
    font-weight: 400;
    font-style: normal;
    background: #5899e2;
    color: #fefefe;
    position: relative;
    padding: 8px 16px;
    font-weight: 600;
    margin: 0;
    border: transparent;
    border-radius: 5px;
    cursor: pointer;
    flex: 1;
  }

  button.glowing,
  button:not(.noanim):disabled {
    background: #fefefe;
    color: #1e1e1e;
  }

  button:before {
    content: "";
    background: linear-gradient(
      45deg,
      #ff0000,
      #ff7300,
      #fffb00,
      #48ff00,
      #00ffd5,
      #002bff,
      #7a00ff,
      #ff00c8,
      #ff0000
    );
    position: absolute;
    top: -2px;
    left: -2px;
    background-size: 400%;
    z-index: -1;
    filter: blur(5px);
    width: calc(100% + 4px);
    height: calc(100% + 4px);
    animation: glowing 20s linear infinite;
    opacity: 0;
    transition: opacity 0.3s ease-in-out;
    border-radius: 10px;
  }

  button:after {
    z-index: -1;
    content: "";
    position: absolute;
    width: 100%;
    height: 100%;
    background: #111;
    left: 0;
    top: 0;
    border-radius: 10px;
  }

  @keyframes glowing {
    0% {
      background-position: 0 0;
    }
    50% {
      background-position: 400% 0;
    }
    100% {
      background-position: 0 0;
    }
  }

  button.glowing:before,
  button:not(.noanim):disabled:before {
    opacity: 1;
  }

  button.noanim:disabled {
    background: #009632;
  }
  button.disabled-btn,
  button:disabled {
    background: #444 !important;
    color: #bbb !important;
    cursor: not-allowed !important;
    box-shadow: none !important;
    border: none !important;
    opacity: 1 !important;
    filter: grayscale(0.5);
  }
  button.clientupdate.noanim:disabled {
    background: #009632 !important;
    color: #fff !important;
    border: none !important;
    filter: none !important;
    box-shadow: none !important;
    opacity: 1 !important;
    cursor: not-allowed !important;
  }
</style>
