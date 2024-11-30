<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  let name = $state("");
  let greetMsg = $state("");

  async function greet(event: Event) {
    event.preventDefault();
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    greetMsg = await invoke("greet", { name });
  }
</script>

<main>
  <h1>NHF WeakAuras</h1>
  <div class="container">
    <div class="input">
      <label for="user_key">User Key</label>
      <input name="user_key" id="user_key" />
    </div>
    <div class="input">
      <label for="admin_key">Admin Key</label>
      <input name="admin_key" id="admin_key" />
    </div>
    <button>Refresh</button>
    <div class="bottom">
      <div class="indicator">
        <div class="dot green"></div>
        <div>
          <span>Addon</span>
          <span>Version: 0.1</span>
        </div>
      </div>
      <div class="indicator">
        <div class="dot green"></div>
        <div>
          <span>Client</span>
          <span>Version: 0.1</span>
        </div>
      </div>
      <div class="indicator">
        <div class="dot"></div>
        <span>Server</span>
      </div>
    </div>
  </div>
</main>

<style>
  @import url("https://fonts.googleapis.com/css2?family=Lexend:wght@100..900&display=swap");
  main {
    color: #ebebd3;
    font-family: "Lexend", sans-serif;
    font-optical-sizing: auto;
    font-weight: 400;
    font-style: normal;
  }

  h1 {
    margin: 0;
    color: #EBEBD3;
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
    gap: 8px;
    margin: 4px 0;
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

  button {
    background: #5899E2;
    color: #ebebd3;
    padding: 8px 16px;
    font-weight: 600;
    margin: 16px 0;
    border: transparent;
    border-radius: 5px;
  }

  button:hover,
  button:active {
    background: #65AFFF;
  }
</style>
