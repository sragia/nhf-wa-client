<script lang="ts">
  import { open } from '@tauri-apps/plugin-dialog';
  import { load } from '@tauri-apps/plugin-store';
  import { download } from '@tauri-apps/plugin-upload';
  import { PUBLIC_SERVER_HOST } from "$env/static/public";
  import { invoke } from '@tauri-apps/api/core';
  import { check as clientCheck } from '@tauri-apps/plugin-updater';
  import { relaunch } from '@tauri-apps/plugin-process';

  let wowFolder = $state('');
  let installStateText = $state('Re-Install Addon');
  let isInstalling = $state(false);
  let isUpdateAvailable = $state(false);
  let store: any = null;

  const check = async () => {
    const addon = await data.addon;
    if ( !addon.isCurrent && installStateText !== 'Set WoW Folder' ) {
      installStateText = 'Update Addon';
      isUpdateAvailable = true;
    }
  }
  check();

  const setupStore = async () => {
    store = await load('store.json');
    if (store) {
      const storedFolder = await store.get('wow_folder');
      if (storedFolder) {
        wowFolder = storedFolder
      } else {
        installStateText = 'Set WoW Folder';
      }
    } 
  }
  setupStore()

  let {data} = $props();
  const openFolder = async () => {
    if (!store) return; 
    const folder = await open({
      directory: true,
      multiple: false,
    });
    if (folder) {
      store.set('wow_folder', folder);
      wowFolder = folder
      installStateText = 'Re-Install Addon';
      window.location.reload();
    }
  }

  const resetInstallBtnText = () => {
    setTimeout(() => {
        installStateText = 'Re-Install Addon';
        isInstalling = false;
        isUpdateAvailable = false;
      }, 4000)
  }

  const extract = async () => {
    try {
      installStateText = 'Extracting...';
      await invoke ('extract_zip', {
        filePath: './addon.zip',
        destination: wowFolder + '/Interface/Addons'
      });
      installStateText = 'Done';
      resetInstallBtnText();
      window.location.reload();
    } catch (error) {
      installStateText = 'Failed Extracting';
      resetInstallBtnText();
      console.error(error);
    }
  }

  const update = async () => {
    if (!wowFolder || isInstalling) return;
    try {
      isInstalling = true
      installStateText = 'Downloading...';
      let timer: number|null = null;
      await download(
        PUBLIC_SERVER_HOST + "/assets/addon.zip", 
      './addon.zip', 
      (progress) => {
        if (timer) {
          clearTimeout(timer);
        }
        timer = setTimeout(() => { extract() }, 1000)
        console.log(progress.progress, progress.progressTotal, progress.transferSpeed, progress)
      })
    } catch (error) {
      isInstalling = false
      installStateText = 'Failed Downloading';
      resetInstallBtnText();
    }
  }

  const updateClient = async () => {
    const update = await clientCheck();
    if (update) {
      let downloaded = 0;
      let contentLength = 0;
      // alternatively we could also call update.download() and update.install() separately
      await update.downloadAndInstall();

      console.log('update installed');
      await relaunch();
    }    
  }

</script>

<meta http-equiv="refresh" content="900">
<main>
  <h1>NHF Aura Manager</h1>
  <div class="container">
    <div class="input">
      <label for="wow_folder">WoW Folder (i.e. .../World of Warcraft/_retail_)</label>
      <input onclick={openFolder} name="folder" id="wow_folder" bind:value={wowFolder} />
    </div>
    <button type="button" disabled={!wowFolder || isInstalling} class:glowing={isUpdateAvailable} onclick={update}>{installStateText}</button>
    {#await data.client}
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"><path fill="currentColor" d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z"><animateTransform attributeName="transform" dur="0.75s" repeatCount="indefinite" type="rotate" values="0 12 12;360 12 12"/></path></svg>
    {:then client}
      {#if !client.isCurrent}
        <button class="clientupdate glowing" onclick={updateClient}>Update Client</button>
      {:else}
        <button class="clientupdate noanim" disabled>Client Up To Date</button>
      {/if}
    {/await}
    <div class="bottom">
      {#await data.addon}
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"><path fill="currentColor" d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z"><animateTransform attributeName="transform" dur="0.75s" repeatCount="indefinite" type="rotate" values="0 12 12;360 12 12"/></path></svg>
      {:then addon}
        <div class="indicator">
          <div class="dot" class:gray={!addon.isActive} class:green={addon.isCurrent}></div>
          <div>
            <span>Addon</span>
            <span>Version: {addon.currentVersion}</span>
          </div>
        </div>
      {/await}
      {#await data.client}
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"><path fill="currentColor" d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z"><animateTransform attributeName="transform" dur="0.75s" repeatCount="indefinite" type="rotate" values="0 12 12;360 12 12"/></path></svg>
      {:then client}
        <div class="indicator">
          <div class="dot" class:gray={!client.isActive} class:green={client.isCurrent}></div>
          <div>
            <span>Client</span>
            <span>Version: {client.currentVersion}</span>
          </div>
        </div>
      {/await}
      {#await data.isServerUp}
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"><path fill="currentColor" d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z"><animateTransform attributeName="transform" dur="0.75s" repeatCount="indefinite" type="rotate" values="0 12 12;360 12 12"/></path></svg>
      {:then isServerUp}
        <div class="indicator">
          <div class="dot" class:green={isServerUp}></div>
          <span>Server</span>
        </div>
      {/await}
    </div>
  </div>
</main>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&display=swap');
  main {
    color: #ebebd3;
    font-family: "Poppins", sans-serif;
    font-optical-sizing: auto;
    font-weight: 400;
    font-style: normal;
  }

  h1 {
    margin: 0;
    color: #fefefe;
    text-align: center;
    font-size: 24px;
  }

  .container {
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
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

  .bottom {
    display: flex;
    gap: 14px;
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
    font-size: 12px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
  }

  input {
    border-radius: 5px;
    border: transparent;
  }

  .input label {
    font-size: 11px;
    font-weight: 500;
  }

  button {
    font-family: "Poppins", sans-serif;
    font-optical-sizing: auto;
    font-weight: 400;
    font-style: normal;
    background: #5899E2;
    color: #fefefe;
    position: relative;
    padding: 8px 16px;
    font-weight: 600;
    margin: 8px 0 0;
    border: transparent;
    border-radius: 5px;
  }

  button.clientupdate {
    margin-bottom: 8px;
  }

  button.glowing,
  button:not(.noanim):disabled {
    background: #fefefe;
    color: #1e1e1e;
  }

  button:before {
    content: '';
    background: linear-gradient(45deg, #ff0000, #ff7300, #fffb00, #48ff00, #00ffd5, #002bff, #7a00ff, #ff00c8, #ff0000);
    position: absolute;
    top: -2px;
    left:-2px;
    background-size: 400%;
    z-index: -1;
    filter: blur(5px);
    width: calc(100% + 4px);
    height: calc(100% + 4px);
    animation: glowing 20s linear infinite;
    opacity: 0;
    transition: opacity .3s ease-in-out;
    border-radius: 10px;
  }

  button:after {
    z-index: -1;
    content: '';
    position: absolute;
    width: 100%;
    height: 100%;
    background: #111;
    left: 0;
    top: 0;
    border-radius: 10px;
  }

  @keyframes glowing {
    0% { background-position: 0 0; }
    50% { background-position: 400% 0; }
    100% { background-position: 0 0; }
  }

  button.glowing:before, 
  button:not(.noanim):disabled:before {
      opacity: 1;
  }

  button.noanim:disabled {
    background: #009632;
  }
</style>
