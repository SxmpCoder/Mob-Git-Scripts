// ==UserScript==
// @name         MWC - Easter Egg Alert
// @namespace    http://tampermonkey.net/
// @version      1.6.0
// @description  Alerts when an Easter egg spawns on the page + SPECIAL egg detection
// @author       MountainDewd
// @match        *://mobwarscity.com/*
// @match        *://www.mobwarscity.com/*
// @run-at       document-idle
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  console.log("[MWC-Easter] Easter Egg Alert v1.6.0 loaded");

  // Settings
  const STORAGE_KEY_FLASH = "mwc_easter_flash_enabled";
  const STORAGE_KEY_HUNT_FOUND = "mwc_easter_hunt_found_date"; // Track if hunt egg found today
  const STORAGE_KEY_HUNT_INDEX = "mwc_easter_hunt_index"; // Current page in hunt mode
  const STORAGE_KEY_MENU_OPEN = "mwc_easter_menu_open"; // Keep menu open across navigations
  let flashEnabled = localStorage.getItem(STORAGE_KEY_FLASH) === "true"; // Default: false
  
  let alertedEggs = new Set();
  let huntEggAlerted = false;
  let audioCtx = null;
  let bannerEl = null;
  let huntBannerEl = null;
  let currentEggEl = null;
  let huntModeActive = false;
  
  // Pages to scan for rare eggs (sorted alphabetically)
  const HUNT_PAGES = [
    '/auction.php',
    '/bank.php',
    '/blackjack.php',
    '/boss.php',
    '/careers.php',
    '/citizens.php',
    '/city.php',
    '/coin_flip_dollars.php',
    '/coin_flip_silver.php',
    '/crack_safe.php',
    '/crew.php',
    '/crime.php',
    '/easter_leaderboard.php',
    '/education.php',
    '/estateagent.php',
    '/events.php',
    '/gym.php',
    '/halloffame.php',
    '/heist.php',
    '/hitlist.php',
    '/hospital.php',
    '/house.php',
    '/index.php',
    '/inventory.php',
    '/itemguide.php',
    '/jail.php',
    '/lottery.php',
    '/mafia.php',
    '/mafiaWars.php',
    '/mafia_list.php',
    '/market.php',
    '/mentors.php',
    '/mymuglog.php',
    '/online.php',
    '/operations.php',
    '/organized_crime.php',
    '/peeps.php',
    '/pms.php',
    '/preferences.php',
    '/raid_boss.php',
    '/refer.php',
    '/roulette.php',
    '/rules.php',
    '/search.php',
    '/silverlottery.php',
    '/slots.php',
    '/spylog.php',
    '/suggestion.php',
    '/travel.php',
    '/upgrade.php',
    '/userads.php'
  ];

  // ====== STYLES ======
  function injectStyles() {
    if (document.getElementById("mwc-egg-styles")) return;
    
    const style = document.createElement("style");
    style.id = "mwc-egg-styles";
    style.textContent = `
      @keyframes mwc-egg-pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.3); opacity: 0.6; }
      }
      @keyframes mwc-egg-banner-glow {
        0%, 100% { box-shadow: 0 0 10px rgba(255,215,0,0.5), inset 0 0 20px rgba(255,215,0,0.1); }
        50% { box-shadow: 0 0 25px rgba(255,215,0,0.8), inset 0 0 30px rgba(255,215,0,0.2); }
      }
      @keyframes mwc-egg-bounce {
        0%, 100% { transform: translateY(0) scale(1); }
        50% { transform: translateY(-3px) scale(1.1); }
      }
      @keyframes mwc-egg-flash {
        0% { opacity: 0; }
        10% { opacity: 0.7; }
        20% { opacity: 0; }
        30% { opacity: 0.5; }
        40% { opacity: 0; }
        50% { opacity: 0.3; }
        100% { opacity: 0; }
      }
      #mwc-egg-banner {
        display: none;
        background: linear-gradient(90deg, #1a0a2e 0%, #2d1b4e 25%, #1a0a2e 50%, #2d1b4e 75%, #1a0a2e 100%);
        background-size: 200% 100%;
        animation: mwc-egg-banner-glow 1.5s ease-in-out infinite;
        border: 2px solid #ffd700;
        border-radius: 8px;
        padding: 12px 20px;
        margin: 10px 0;
        position: relative;
        overflow: hidden;
      }
      #mwc-egg-banner.visible {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 15px;
      }
      #mwc-egg-banner::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255,215,0,0.2), transparent);
        animation: mwc-shimmer 2s infinite;
      }
      @keyframes mwc-shimmer {
        0% { left: -100%; }
        100% { left: 100%; }
      }
      .mwc-egg-banner-content {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
      }
      .mwc-egg-banner-text {
        text-align: center;
      }
      .mwc-egg-banner-icon {
        font-size: 32px;
        animation: mwc-egg-bounce 0.6s ease-in-out infinite;
      }
      .mwc-egg-banner-text-inner {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .mwc-egg-banner-title {
        font-size: 18px;
        font-weight: 700;
        color: #ffd700;
        text-shadow: 0 0 10px rgba(255,215,0,0.5);
        letter-spacing: 1px;
      }
      .mwc-egg-banner-subtitle {
        font-size: 12px;
        color: #a0a0a0;
      }

      .mwc-egg-setting-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 6px 0;
      }
      .mwc-egg-setting-label {
        color: #ccc;
        font-size: 12px;
      }
      .mwc-egg-toggle {
        position: relative;
        width: 36px;
        height: 20px;
        background: #333;
        border-radius: 10px;
        cursor: pointer;
        transition: background 0.2s;
      }
      .mwc-egg-toggle.active {
        background: #ffd700;
      }
      .mwc-egg-toggle::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 2px;
        width: 16px;
        height: 16px;
        background: #fff;
        border-radius: 50%;
        transition: left 0.2s;
      }
      .mwc-egg-toggle.active::after {
        left: 18px;
      }
      #mwc-egg-flash-overlay {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: radial-gradient(circle, rgba(255,215,0,0.8) 0%, rgba(255,215,0,0) 70%);
        pointer-events: none;
        z-index: 999998;
      }
      #mwc-egg-flash-overlay.flash {
        display: block;
        animation: mwc-egg-flash 1s ease-out forwards;
      }
      #mwc-egg-indicator {
        position: fixed;
        width: 120px;
        height: 120px;
        margin-left: -60px;
        margin-top: -60px;
        border: 4px solid #ffd700;
        border-radius: 50%;
        pointer-events: none;
        z-index: 999999;
        animation: mwc-egg-pulse 0.8s ease-in-out infinite;
        box-shadow: 0 0 20px rgba(255, 215, 0, 0.6), inset 0 0 20px rgba(255, 215, 0, 0.3);
      }
      #mwc-egg-settings-float {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 99999;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
      }
      #mwc-egg-settings-toggle {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: linear-gradient(180deg, rgba(30,40,50,0.95) 0%, rgba(20,28,38,0.98) 100%);
        border: 2px solid rgba(255,215,0,0.4);
        color: #ffd700;
        font-size: 18px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      }
      #mwc-egg-settings-toggle:hover {
        border-color: #ffd700;
        box-shadow: 0 0 15px rgba(255,215,0,0.4);
        transform: scale(1.05);
      }
      #mwc-egg-settings-dropdown {
        display: none;
        background: linear-gradient(180deg, rgba(30,40,50,0.98) 0%, rgba(20,28,38,0.99) 100%);
        border: 1px solid rgba(255,215,0,0.3);
        border-radius: 8px;
        padding: 12px 15px;
        min-width: 200px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.4);
      }
      #mwc-egg-settings-dropdown.visible {
        display: block;
      }
      .mwc-egg-settings-header {
        color: #ffd700;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        margin-bottom: 10px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(255,215,0,0.2);
      }

      /* ====== SPECIAL HUNT EGG STYLES ====== */
      @keyframes mwc-hunt-rainbow {
        0% { border-color: #ff0000; box-shadow: 0 0 30px #ff0000, inset 0 0 20px rgba(255,0,0,0.3); }
        16% { border-color: #ff8800; box-shadow: 0 0 30px #ff8800, inset 0 0 20px rgba(255,136,0,0.3); }
        33% { border-color: #ffff00; box-shadow: 0 0 30px #ffff00, inset 0 0 20px rgba(255,255,0,0.3); }
        50% { border-color: #00ff00; box-shadow: 0 0 30px #00ff00, inset 0 0 20px rgba(0,255,0,0.3); }
        66% { border-color: #0088ff; box-shadow: 0 0 30px #0088ff, inset 0 0 20px rgba(0,136,255,0.3); }
        83% { border-color: #8800ff; box-shadow: 0 0 30px #8800ff, inset 0 0 20px rgba(136,0,255,0.3); }
        100% { border-color: #ff0000; box-shadow: 0 0 30px #ff0000, inset 0 0 20px rgba(255,0,0,0.3); }
      }
      @keyframes mwc-hunt-shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
        20%, 40%, 60%, 80% { transform: translateX(2px); }
      }
      #mwc-hunt-banner {
        display: none;
        background: linear-gradient(90deg, #1a0a2e 0%, #2d1b4e 25%, #1a0a2e 50%, #2d1b4e 75%, #1a0a2e 100%);
        background-size: 200% 100%;
        border: 3px solid;
        border-radius: 8px;
        padding: 12px 20px;
        margin: 10px 0;
        position: relative;
        overflow: hidden;
        animation: mwc-hunt-rainbow 2s linear infinite;
      }
      #mwc-hunt-banner.visible {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 15px;
      }
      #mwc-hunt-banner::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255,215,0,0.3), transparent);
        animation: mwc-shimmer 1.5s infinite;
      }
      .mwc-hunt-banner-content {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
      }
      .mwc-hunt-banner-icon {
        font-size: 32px;
        animation: mwc-egg-bounce 0.4s ease-in-out infinite;
      }
      .mwc-hunt-banner-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        text-align: center;
      }
      .mwc-hunt-title {
        font-size: 18px;
        font-weight: 700;
        color: #fff;
        text-shadow: 0 0 10px #ffd700, 0 0 20px #ff8800;
        letter-spacing: 1px;
      }
      .mwc-hunt-subtitle {
        font-size: 12px;
        color: #ffd700;
      }
      #mwc-hunt-indicator {
        position: fixed;
        width: 150px;
        height: 150px;
        margin-left: -75px;
        margin-top: -75px;
        border: 6px solid;
        border-radius: 50%;
        pointer-events: none;
        z-index: 999998;
        animation: mwc-hunt-rainbow 1s linear infinite, mwc-egg-pulse 0.5s ease-in-out infinite;
      }
      
      /* ====== HUNT MODE STYLES ====== */
      #mwc-hunt-mode-btn {
        width: 100%;
        padding: 8px 12px;
        margin-top: 8px;
        background: linear-gradient(180deg, #2d4a1c 0%, #1a2e10 100%);
        border: 1px solid #4a7c23;
        border-radius: 6px;
        color: #8fd44a;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      #mwc-hunt-mode-btn:hover {
        background: linear-gradient(180deg, #3d5a2c 0%, #2a3e20 100%);
        border-color: #6a9c43;
      }
      #mwc-hunt-mode-btn.active {
        background: linear-gradient(180deg, #1c3a4a 0%, #102a3e 100%);
        border-color: #4a9cc4;
        color: #8ad4ff;
      }
      #mwc-hunt-reset-btn {
        width: 100%;
        padding: 6px 10px;
        margin-top: 4px;
        background: linear-gradient(180deg, #4a3a1c 0%, #2e2410 100%);
        border: 1px solid #7c6a23;
        border-radius: 4px;
        color: #d4c44a;
        font-size: 10px;
        cursor: pointer;
        transition: all 0.2s;
      }
      #mwc-hunt-reset-btn:hover {
        background: linear-gradient(180deg, #5a4a2c 0%, #3e3420 100%);
      }
      #mwc-hunt-progress {
        display: none;
        margin-top: 8px;
        padding: 6px 10px;
        background: rgba(0,0,0,0.3);
        border-radius: 4px;
        font-size: 11px;
        color: #8ad4ff;
        text-align: center;
      }
      #mwc-hunt-progress.visible {
        display: block;
      }
      #mwc-hunt-progress-bar {
        height: 4px;
        background: #333;
        border-radius: 2px;
        margin-top: 4px;
        overflow: hidden;
      }
      #mwc-hunt-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #4a7c23, #8fd44a);
        transition: width 0.3s;
      }
      #mwc-hints-link {
        display: block;
        margin-top: 8px;
        padding: 6px 10px;
        background: rgba(255,215,0,0.1);
        border: 1px solid rgba(255,215,0,0.3);
        border-radius: 4px;
        color: #ffd700;
        font-size: 11px;
        text-align: center;
        text-decoration: none;
        transition: all 0.2s;
      }
      #mwc-hints-link:hover {
        background: rgba(255,215,0,0.2);
        border-color: #ffd700;
      }
    `;
    document.head.appendChild(style);
  }

  // ====== AUDIO ======
  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function playEggAlert() {
    try {
      const ctx = getAudioContext();
      // Resume audio context if suspended (browser autoplay policy)
      const doPlay = () => {
        const now = ctx.currentTime;

        const notes = [523.25, 659.25, 783.99, 1046.50];
        
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          
          osc.connect(gain);
          gain.connect(ctx.destination);
          
          osc.type = "sine";
          osc.frequency.value = freq;
          
          const startTime = now + i * 0.12;
          gain.gain.setValueAtTime(0, startTime);
          gain.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
          gain.gain.linearRampToValueAtTime(0, startTime + 0.25);
          
          osc.start(startTime);
          osc.stop(startTime + 0.3);
        });

        console.log("[MWC-Easter] 🔔 Alert sound played");
      };
      
      if (ctx.state === 'suspended') {
        ctx.resume().then(doPlay);
      } else {
        doPlay();
      }
    } catch (e) {
      console.error("[MWC-Easter] Audio error:", e);
    }
  }

  // Special fanfare for hunt egg - louder and more dramatic
  function playHuntEggAlert() {
    try {
      const ctx = getAudioContext();
      
      const doPlay = () => {
        const now = ctx.currentTime;

        // Dramatic fanfare: ascending arpeggio then victory chord
        const fanfare = [
          { freq: 523.25, time: 0, dur: 0.15 },     // C5
          { freq: 659.25, time: 0.12, dur: 0.15 },  // E5
          { freq: 783.99, time: 0.24, dur: 0.15 },  // G5
          { freq: 1046.50, time: 0.36, dur: 0.3 },  // C6
          // Victory chord
          { freq: 523.25, time: 0.5, dur: 0.5 },    // C5
          { freq: 659.25, time: 0.5, dur: 0.5 },    // E5
          { freq: 783.99, time: 0.5, dur: 0.5 },    // G5
          { freq: 1046.50, time: 0.5, dur: 0.5 },   // C6
        ];

        fanfare.forEach(({ freq, time, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          
          osc.connect(gain);
          gain.connect(ctx.destination);
          
          osc.type = "square"; // Richer sound
          osc.frequency.value = freq;
          
          const startTime = now + time;
          gain.gain.setValueAtTime(0, startTime);
          gain.gain.linearRampToValueAtTime(0.25, startTime + 0.03);
          gain.gain.linearRampToValueAtTime(0.15, startTime + dur * 0.5);
          gain.gain.linearRampToValueAtTime(0, startTime + dur);
          
          osc.start(startTime);
          osc.stop(startTime + dur + 0.1);
        });

        console.log("[MWC-Easter] 🎺 HUNT EGG fanfare played!");
      };
      
      if (ctx.state === 'suspended') {
        ctx.resume().then(doPlay);
      } else {
        doPlay();
      }
    } catch (e) {
      console.error("[MWC-Easter] Hunt audio error:", e);
    }
  }

  // ====== BANNER ======
  function createBanner() {
    if (bannerEl) return bannerEl;
    
    bannerEl = document.createElement("div");
    bannerEl.id = "mwc-egg-banner";
    bannerEl.innerHTML = `
      <div class="mwc-egg-banner-content">
        <div class="mwc-egg-banner-icon">🥚</div>
        <div class="mwc-egg-banner-text">
          <div class="mwc-egg-banner-title">EASTER EGG SPOTTED!</div>
          <div class="mwc-egg-banner-subtitle">An egg has appeared somewhere on this page — look for the golden ring!</div>
        </div>
        <div class="mwc-egg-banner-icon">🥚</div>
      </div>
    `;
    
    // Inject into page
    insertBanner();
    
    return bannerEl;
  }

  // ====== PERSISTENT SETTINGS BUTTON ======
  function createSettingsButton() {
    const container = document.createElement("div");
    container.id = "mwc-egg-settings-float";
    container.innerHTML = `
      <div id="mwc-egg-settings-dropdown">
        <div class="mwc-egg-settings-header">🥚 Easter Egg Alert</div>
        <div class="mwc-egg-setting-row">
          <span class="mwc-egg-setting-label">Screen Flash</span>
          <div class="mwc-egg-toggle ${flashEnabled ? 'active' : ''}" id="mwc-egg-flash-toggle"></div>
        </div>
        <a id="mwc-hints-link" href="/easter_egg_hints" target="_blank">💡 View Egg Hints</a>
        <button id="mwc-hunt-mode-btn">➡️ Next Page (0/${HUNT_PAGES.length})</button>
        <button id="mwc-hunt-reset-btn">🔄 Reset to Page 1</button>
        <div id="mwc-hunt-progress">
          <span id="mwc-hunt-status">Ready</span>
          <div id="mwc-hunt-progress-bar">
            <div id="mwc-hunt-progress-fill" style="width: 0%"></div>
          </div>
        </div>
      </div>
      <button id="mwc-egg-settings-toggle" title="Easter Egg Settings">
        🥚
      </button>
    `;
    document.body.appendChild(container);
    
    // Toggle dropdown
    const toggleBtn = document.getElementById("mwc-egg-settings-toggle");
    const dropdown = document.getElementById("mwc-egg-settings-dropdown");
    
    // Restore menu state from storage
    if (localStorage.getItem(STORAGE_KEY_MENU_OPEN) === "true") {
      dropdown.classList.add("visible");
    }
    
    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.toggle("visible");
      localStorage.setItem(STORAGE_KEY_MENU_OPEN, isOpen);
    });
    
    document.addEventListener("click", () => {
      dropdown.classList.remove("visible");
      localStorage.setItem(STORAGE_KEY_MENU_OPEN, "false");
    });
    
    dropdown.addEventListener("click", (e) => {
      e.stopPropagation();
    });
    
    // Flash toggle
    document.getElementById("mwc-egg-flash-toggle").addEventListener("click", (e) => {
      flashEnabled = !flashEnabled;
      localStorage.setItem(STORAGE_KEY_FLASH, flashEnabled);
      e.target.classList.toggle("active", flashEnabled);
      console.log("[MWC-Easter] Flash effect:", flashEnabled ? "ON" : "OFF");
    });
    
    // Hunt mode - next page button (manual)
    document.getElementById("mwc-hunt-mode-btn").addEventListener("click", (e) => {
      goToNextHuntPage();
    });
    
    // Reset button
    document.getElementById("mwc-hunt-reset-btn").addEventListener("click", (e) => {
      resetHuntMode();
    });
    
    // Initialize hunt mode UI
    initHuntModeUI();
  }
  
  // ====== MANUAL HUNT MODE ======
  function initHuntModeUI() {
    const currentIndex = parseInt(localStorage.getItem(STORAGE_KEY_HUNT_INDEX) || '0', 10);
    updateHuntModeUI(currentIndex);
    
    // Show progress panel
    const progress = document.getElementById('mwc-hunt-progress');
    if (progress) progress.classList.add('visible');
  }
  
  function goToNextHuntPage() {
    let currentIndex = parseInt(localStorage.getItem(STORAGE_KEY_HUNT_INDEX) || '0', 10);
    
    // If we've gone through all pages, wrap to 0
    if (currentIndex >= HUNT_PAGES.length) {
      currentIndex = 0;
    }
    
    const page = HUNT_PAGES[currentIndex];
    console.log(`[MWC-Easter] ➡️ Manual navigation to page ${currentIndex + 1}/${HUNT_PAGES.length}: ${page}`);
    
    // Increment for next time
    localStorage.setItem(STORAGE_KEY_HUNT_INDEX, (currentIndex + 1).toString());
    
    // Navigate
    window.location.href = page;
  }
  
  function resetHuntMode() {
    localStorage.setItem(STORAGE_KEY_HUNT_INDEX, '0');
    updateHuntModeUI(0);
    console.log('[MWC-Easter] 🔄 Hunt Mode reset to page 1');
  }
  
  function updateHuntModeUI(index) {
    const btn = document.getElementById('mwc-hunt-mode-btn');
    const status = document.getElementById('mwc-hunt-status');
    const fill = document.getElementById('mwc-hunt-progress-fill');
    
    // Show next page info
    const nextIndex = index >= HUNT_PAGES.length ? 0 : index;
    const nextPage = HUNT_PAGES[nextIndex] || HUNT_PAGES[0];
    const pageName = nextPage.replace(/^\//, '').replace(/\.php.*$/, '');
    
    if (btn) {
      if (index >= HUNT_PAGES.length) {
        btn.textContent = `✅ Done! Click to restart`;
        btn.classList.add('active');
      } else {
        btn.textContent = `➡️ ${pageName} (${index + 1}/${HUNT_PAGES.length})`;
        btn.classList.remove('active');
      }
    }
    
    if (status) {
      if (index >= HUNT_PAGES.length) {
        status.textContent = `Checked all ${HUNT_PAGES.length} pages — try another city!`;
      } else if (index === 0) {
        status.textContent = `Ready — click to start checking pages`;
      } else {
        status.textContent = `Checked ${index}/${HUNT_PAGES.length} pages`;
      }
    }
    
    if (fill) {
      fill.style.width = `${(index / HUNT_PAGES.length) * 100}%`;
    }
  }

  function insertBanner() {
    if (!bannerEl) return;
    
    // Target: inside .inner-content_wrap, at the top (before other content)
    // Fallback chain: inner-content_wrap > inner-content_top > inner-content > body
    const innerContentWrap = document.querySelector(".inner-content_wrap");
    const innerContentTop = document.querySelector(".inner-content_top");
    const innerContent = document.querySelector(".inner-content");
    
    let target = innerContentWrap || innerContentTop || innerContent;
    
    if (target) {
      // Insert at the beginning of the content area
      target.insertBefore(bannerEl, target.firstChild);
      console.log("[MWC-Easter] Banner inserted into:", target.className);
    } else {
      // Fallback: prepend to body
      document.body.prepend(bannerEl);
      console.log("[MWC-Easter] Banner inserted at body start (fallback)");
    }
  }

  function showBanner() {
    if (!bannerEl) createBanner();
    bannerEl.classList.add("visible");
  }

  function hideBanner() {
    if (bannerEl) {
      bannerEl.classList.remove("visible");
    }
  }

  // ====== HUNT EGG BANNER ======
  const EGG_EMOJIS = {
    'black': '⚫',
    'blue': '🔵',
    'gold': '🟡',
    'golden': '🟡',
    'multicolor': '🌈',
    'rainbow': '🌈',
    'purple': '🟣',
    'default': '🥚'
  };

  function getEggEmoji(imgSrc) {
    if (!imgSrc) return EGG_EMOJIS.default;
    const lower = imgSrc.toLowerCase();
    for (const [key, emoji] of Object.entries(EGG_EMOJIS)) {
      if (lower.includes(key)) return emoji;
    }
    return EGG_EMOJIS.default;
  }

  function getEggColorName(imgSrc) {
    if (!imgSrc) return 'Rare';
    const lower = imgSrc.toLowerCase();
    if (lower.includes('black')) return 'Black';
    if (lower.includes('blue')) return 'Blue';
    if (lower.includes('gold')) return 'Golden';
    if (lower.includes('multicolor') || lower.includes('rainbow')) return 'Multicolor';
    if (lower.includes('purple')) return 'Purple';
    return 'Rare';
  }

  function createHuntBanner(eggType = '🥚', colorName = 'Special') {
    if (huntBannerEl) {
      // Update the subtitle
      const subtitle = huntBannerEl.querySelector('.mwc-hunt-subtitle');
      if (subtitle) subtitle.textContent = `${colorName} Egg — Click to claim!`;
      return huntBannerEl;
    }
    
    huntBannerEl = document.createElement("div");
    huntBannerEl.id = "mwc-hunt-banner";
    huntBannerEl.innerHTML = `
      <div class="mwc-hunt-banner-content">
        <div class="mwc-hunt-banner-text">
          <div class="mwc-hunt-title">🏆 RARE EGG FOUND! 🏆</div>
          <div class="mwc-hunt-subtitle">${colorName} Egg — Click to claim!</div>
        </div>
      </div>
    `;
    
    // Insert as banner (like regular egg banner)
    insertHuntBanner();
    
    return huntBannerEl;
  }

  function insertHuntBanner() {
    if (!huntBannerEl) return;
    
    const innerContentWrap = document.querySelector(".inner-content_wrap");
    const innerContentTop = document.querySelector(".inner-content_top");
    const innerContent = document.querySelector(".inner-content");
    
    let target = innerContentWrap || innerContentTop || innerContent;
    
    if (target) {
      // Insert after regular banner if it exists, otherwise at start
      const regularBanner = document.getElementById('mwc-egg-banner');
      if (regularBanner && regularBanner.parentElement === target) {
        regularBanner.insertAdjacentElement('afterend', huntBannerEl);
      } else {
        target.insertBefore(huntBannerEl, target.firstChild);
      }
      console.log("[MWC-Easter] Hunt banner inserted into:", target.className);
    } else {
      document.body.prepend(huntBannerEl);
      console.log("[MWC-Easter] Hunt banner inserted at body start (fallback)");
    }
  }

  function showHuntBanner(imgSrc) {
    const colorName = getEggColorName(imgSrc);
    if (!huntBannerEl) createHuntBanner(null, colorName);
    else {
      const subtitle = huntBannerEl.querySelector('.mwc-hunt-subtitle');
      if (subtitle) subtitle.textContent = `${colorName} Egg — Click to claim!`;
    }
    huntBannerEl.classList.add("visible");
  }

  function hideHuntBanner() {
    if (huntBannerEl) {
      huntBannerEl.classList.remove("visible");
    }
  }

  function showHuntIndicator(eggEl) {
    hideHuntIndicator();

    const rect = eggEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const indicator = document.createElement("div");
    indicator.id = "mwc-hunt-indicator";
    indicator.style.left = centerX + "px";
    indicator.style.top = centerY + "px";
    document.body.appendChild(indicator);
  }

  function hideHuntIndicator() {
    const indicator = document.getElementById("mwc-hunt-indicator");
    if (indicator) indicator.remove();
  }

  // ====== FLASH EFFECT ======
  function triggerFlash() {
    if (!flashEnabled) return;
    
    let overlay = document.getElementById("mwc-egg-flash-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "mwc-egg-flash-overlay";
      document.body.appendChild(overlay);
    }
    
    overlay.classList.remove("flash");
    void overlay.offsetWidth; // Force reflow
    overlay.classList.add("flash");
    
    setTimeout(() => overlay.classList.remove("flash"), 1000);
  }

  // ====== EGG INDICATOR ======
  function showEggIndicator(eggEl) {
    hideEggIndicator();

    const rect = eggEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const indicator = document.createElement("div");
    indicator.id = "mwc-egg-indicator";
    indicator.style.left = centerX + "px";
    indicator.style.top = centerY + "px";
    document.body.appendChild(indicator);

    setTimeout(hideEggIndicator, 60000);
  }

  function hideEggIndicator() {
    const indicator = document.getElementById("mwc-egg-indicator");
    if (indicator) indicator.remove();
  }

  // ====== EGG DETECTION ======
  function isHoneypotOrModal(el) {
    if (!el || !el.id) return true;
    const id = el.id.toLowerCase();
    
    if (id === "easter-egg-float") return true;
    if (id.startsWith("ef-")) return true;
    if (el.classList.contains("easter-reward-message")) return true;
    if (el.classList.contains("easter-reward-drops")) return true;
    if (el.closest('[class*="reward"]')) return true;
    if (el.closest('[class*="modal"]')) return true;
    if (el.textContent.trim().length > 0) return true;
    if (el.children.length > 0) return true;
    
    return false;
  }

  function isRealEgg(el) {
    if (!el) return false;
    if (isHoneypotOrModal(el)) return false;
    
    const style = el.style;
    const computed = window.getComputedStyle(el);
    
    if (computed.display === 'none') return false;
    if (computed.visibility === 'hidden') return false;
    
    const hasLeftPx = style.left && style.left.includes('px');
    const hasTopPx = style.top && style.top.includes('px');
    if (!hasLeftPx || !hasTopPx) return false;
    
    if (!style.animation && !computed.animation) return false;
    
    const id = el.id;
    if (!id) return false;
    if (!/^[a-z0-9]+$/i.test(id)) return false;
    if (id.length < 6) return false;
    
    return true;
  }

  function findRealEgg() {
    const allDivs = document.querySelectorAll('div[style*="left:"][style*="top:"]');
    
    for (const div of allDivs) {
      if (isRealEgg(div)) {
        console.log("[MWC-Easter] Candidate egg:", div.id, div.outerHTML.substring(0, 200));
        return div;
      }
    }
    
    return null;
  }

  // ====== SPECIAL HUNT EGG DETECTION ======
  function findHuntEgg() {
    // Look for the special daily hunt egg
    // MUST have data-token attribute (this is the key identifier for claimable eggs)
    // Has class "easter-hunt-egg" or id "easterHuntEgg"
    // Contains an <img> with egg image
    
    // Primary: element with data-token that contains an egg image (the clickable hunt egg)
    let huntEgg = document.querySelector('[data-token] img[src*="egg" i]')?.closest('[data-token]');
    
    // Fallback: specific class/id with data-token
    if (!huntEgg) huntEgg = document.querySelector('.easter-hunt-egg[data-token]');
    if (!huntEgg) huntEgg = document.querySelector('#easterHuntEgg[data-token]');
    
    // Last resort: any element with both data-token and easter in class/id
    if (!huntEgg) huntEgg = document.querySelector('[data-token][class*="easter" i]');
    if (!huntEgg) huntEgg = document.querySelector('[data-token][id*="easter" i]');
    
    if (!huntEgg) {
      // Debug: log data-token elements if any exist
      const dataTokenEls = document.querySelectorAll('[data-token]');
      if (dataTokenEls.length > 0 && !window._tokenDebugLogged) {
        console.log("[MWC-Easter] DEBUG: Found", dataTokenEls.length, "data-token elements:");
        dataTokenEls.forEach((el, i) => {
          console.log(`  [${i}]`, el.tagName, el.className, el.id, el.outerHTML?.substring(0, 150));
        });
        window._tokenDebugLogged = true;
      }
      return null;
    }
    
    console.log("[MWC-Easter] DEBUG: Found hunt egg element:", huntEgg.outerHTML?.substring(0, 300));
    
    // Check visibility
    const computed = window.getComputedStyle(huntEgg);
    if (computed.display === 'none' || computed.visibility === 'hidden') {
      console.log("[MWC-Easter] DEBUG: Hunt egg is hidden");
      return null;
    }
    
    // Get the egg image for color detection
    const img = huntEgg.querySelector('img');
    const imgSrc = img ? img.getAttribute('src') : null;
    
    return { element: huntEgg, imgSrc };
  }

  function scanForEggs() {
    // ===== PRIORITY: Check for RARE Hunt Egg first =====
    const huntEgg = findHuntEgg();
    if (huntEgg) {
      // Use element reference to track if we've alerted for THIS specific egg
      if (!huntEgg.element._mwcAlerted) {
        console.log("[MWC-Easter] 🏆🏆🏆 RARE HUNT EGG FOUND! 🏆🏆🏆");
        console.log("[MWC-Easter] Egg image:", huntEgg.imgSrc);
        huntEgg.element._mwcAlerted = true;
        
        // Dramatic alert
        playHuntEggAlert();
        showHuntBanner(huntEgg.imgSrc);
        showHuntIndicator(huntEgg.element);
        triggerFlash();
        
        // Also hide regular banner if showing
        hideBanner();
        
        // Watch for hunt egg being collected
        const checkHuntHidden = setInterval(() => {
          const el = document.querySelector('.easter-hunt-egg, #easterHuntEgg, [data-token] img[src*="egg" i]');
          if (!el || !document.body.contains(el)) {
            console.log("[MWC-Easter] Hunt egg collected or page changed!");
            hideHuntIndicator();
            hideHuntBanner();
            clearInterval(checkHuntHidden);
          }
        }, 500);
      }
      // Continue to also check for regular eggs (both can appear at once)
    }
    
    // ===== Regular egg detection =====
    const egg = findRealEgg();
    
    if (egg && !alertedEggs.has(egg.id)) {
      console.log("[MWC-Easter] 🎉 REAL EGG DETECTED! ID:", egg.id);
      alertedEggs.add(egg.id);
      currentEggEl = egg;
      
      playEggAlert();
      showBanner();
      showEggIndicator(egg);
      triggerFlash();
      
      // Watch for this egg being hidden
      const checkHidden = setInterval(() => {
        const style = window.getComputedStyle(egg);
        if (style.display === 'none' || !document.body.contains(egg)) {
          console.log("[MWC-Easter] Egg collected or hidden");
          hideEggIndicator();
          hideBanner();
          currentEggEl = null;
          clearInterval(checkHidden);
        }
      }, 500);
    }
  }

  // ====== PAGE DISCOVERY ======
  function discoverGamePages() {
    const links = new Set();
    const baseUrl = window.location.origin;
    
    // Find all links in menu areas
    const menuSelectors = [
      '.mwc-menu a',
      '#mwc-menu a', 
      '[class*="menu"] a',
      '.sidebar a',
      '#sidebar a',
      'nav a',
      '.quick_use a',
      'a[href*="/"]'
    ];
    
    menuSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(a => {
        const href = a.getAttribute('href');
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
          // Normalize the URL
          let url = href;
          if (href.startsWith('/')) {
            url = baseUrl + href;
          } else if (!href.startsWith('http')) {
            url = baseUrl + '/' + href;
          }
          // Only include same-domain links
          if (url.startsWith(baseUrl)) {
            const path = url.replace(baseUrl, '');
            if (path && path !== '/') {
              links.add(path);
            }
          }
        }
      });
    });
    
    const sorted = [...links].sort();
    console.log('[MWC-Easter] ====== DISCOVERED GAME PAGES ======');
    console.log('[MWC-Easter] Found', sorted.length, 'unique pages:');
    sorted.forEach((path, i) => {
      console.log(`  ${i + 1}. ${path}`);
    });
    console.log('[MWC-Easter] =====================================');
    console.log('[MWC-Easter] Copy this list to use for hunt mode!');
    
    return sorted;
  }
  
  // Expose to window for manual use
  window.mwcDiscoverPages = discoverGamePages;

  // ====== INIT ======
  function setupEggDetection() {
    console.log("[MWC-Easter] Setting up egg detection (v1.6.0 - hunt mode)...");
    
    injectStyles();
    createSettingsButton(); // Always visible settings button
    
    // Discover pages on first load (run once)
    if (!sessionStorage.getItem('mwc_pages_discovered')) {
      setTimeout(() => {
        discoverGamePages();
        sessionStorage.setItem('mwc_pages_discovered', 'true');
      }, 2000);
    }
    
    // Immediate scan
    scanForEggs();
    
    // Also scan after a short delay (in case elements load late)
    setTimeout(scanForEggs, 500);
    setTimeout(scanForEggs, 1500);
    
    const observer = new MutationObserver((mutations) => {
      clearTimeout(observer._scanTimeout);
      observer._scanTimeout = setTimeout(scanForEggs, 100);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"]
    });

    setInterval(scanForEggs, 2000);

    console.log("[MWC-Easter] ✓ Detection active - regular AND hunt egg alerts enabled");
  }

  if (document.readyState === "complete") {
    setupEggDetection();
  } else {
    window.addEventListener("load", setupEggDetection);
  }

})();
