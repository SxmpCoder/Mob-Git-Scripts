// ==UserScript==
// @name         MWC - Smart Hub
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  Boss panel with auto-synced respawn timers from game, smart Join All alerts, auto-confirm dialogs, toggleable auto-public, Quick Ops tracker.
// @author       MountainDewd
// @match        https://mobwarscity.com/*
// @match        https://www.mobwarscity.com/*
// @run-at       document-end
// @grant        GM_notification
// @grant        GM_getValue
// @grant        GM_setValue
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/570089/MWC%20-%20Smart%20Hub.user.js
// @updateURL https://update.greasyfork.org/scripts/570089/MWC%20-%20Smart%20Hub.meta.js
// ==/UserScript==

(function () {
  "use strict";

  // Prevent script running in the outer frame
  if (window.top === window.self) return;

  // ====== SETTINGS ======
  const AUTO_MAKE_PUBLIC_DEFAULT = true; // Default value for auto-make-public (user can toggle)
  const AUTO_CONFIRM = true; // Auto-confirm "Join All" and "Accept All & Start" dialogs
  const Z_INDEX = 999999;
  const COMPACT_MODE = true; // true = compact layout for half-screen

  const API_URL = "https://mobwarscity.com/api_notifications.php";
  const POLL_MS = 4000;
  const NOTIFY_COOLDOWN_MS = 5000;
  const ENABLE_NOTIFICATIONS = true;

  const BOSSES = [
    { id: 2, name: "JOHNNY", displayName: "JOHNNY", shortName: "J", respawnMins: 30 },
    { id: 4, name: "VINNY", displayName: "VINNY", shortName: "V", respawnMins: 60 },
    { id: 5, name: "TONY", displayName: "TONY", shortName: "T", respawnMins: 360 },
    { id: 6, name: "TIMID TIM", displayName: "TIMID TIM", shortName: "TT", respawnMins: 1440 },
    { id: 23, name: "EASTER BUNNY", displayName: "EASTER BUNNY", shortName: "EB", respawnMins: 30 },
    { id: 24, name: "THE DEALER", displayName: "THE DEALER", shortName: "420", respawnMins: 30 },
    // { id: 22, name: "LUCKY LEPRECHAUN", displayName: "LUCKY LEPRECHAUN", shortName: "LL", respawnMins: 30 },
    // { id: 20, name: "PLUMBER", displayName: "THE PLUMBER", shortName: "P", respawnMins: 30 }, // Temp disabled for St. Patty's event
  ];

  const VIEW_PUBLIC_URL = "https://mobwarscity.com/boss"; // Main boss page has public fights table
  const BOSS_PAGE_URL = "https://mobwarscity.com/boss";
  const JOIN_CHECK_MS = 10000; // Check join status every 10 seconds

  // ====== QUICK OPS INTEGRATION ======
  const K_QOPS_LAST_CLAIM = 'mwc_quickops_last_claim'; // timestamp when last claimed
  const QOPS_COOLDOWN_MS = 100 * 60 * 1000; // 100 minutes cooldown

  // ====== LOTTERY INTEGRATION ======
  const LOTTERY_URL = "https://mobwarscity.com/amenity_lottery";
  const GAME_UTC_OFFSET = -5; // MWC game time is UTC-5 (daily reset at 00:00 game time = 05:00 UTC)

  // ====== STORAGE KEYS ======
  const K_LAST_COUNT = "mw_bf_last_count";
  const K_LAST_ACTIVE = "mw_bf_last_active";
  const K_LAST_NOTIFY = "mw_bf_last_notify";

  const K_BOSS_TIMER_PREFIX = "mw_boss_timer_"; // + bossId = timestamp when fight started
  const K_JOINED_FIGHTS = "mw_joined_fights"; // array of fight IDs user has joined
  const K_SEEN_FIGHTS = "mw_seen_fights"; // array of fight IDs user has seen
  const K_CACHED_UNJOINED = "mw_cached_unjoined"; // cached count of unjoined fights from last DOM read
  const K_CACHED_TOTAL = "mw_cached_total"; // cached total fights from last DOM read
  const K_LAST_API_COUNT = "mw_last_api_count"; // last API boss fight count for change detection
  const K_PENDING_ALERT = "mw_pending_alert"; // true if we detected new fights but haven't visited /boss yet
  const K_PENDING_ALERT_COUNT = "mw_pending_alert_count"; // estimated unjoined count for pending alert
  const K_AUTO_PUBLIC_ENABLED = "mwc_auto_public_enabled"; // user setting for auto-make-public
  const K_PANEL_COLLAPSED = "mwc_panel_collapsed"; // user setting for panel collapsed state
  const K_LOTTERY_CLAIMED_DATE = "mwc_lottery_claimed_date"; // date string (YYYY-MM-DD game time) when last claimed
  const K_NOTES_TEXT = "mwc_notes_text"; // Plain text notepad content
  const K_NOTES_COLLAPSED = "mwc_notes_collapsed"; // user setting for notes panel collapsed state
  const K_PROFILE_NOTES_PREFIX = "mwc_profile_notes_"; // + userId = notes for that player

  // ====== USER SETTINGS SYSTEM ======
  const K_SETTINGS = "mwc_settings"; // All user settings stored as JSON object

  const DEFAULT_SETTINGS = {
    // Panel Features (show/hide sections)
    showBossSection: true,          // Boss fights, SYNC, PUB, timers
    showQuickOps: true,             // Quick Ops timer + button
    showLottery: true,              // Lottery timer + button
    showSidebarNotes: true,         // Notes sidebar panel
    enableProfileNotes: true,       // Notes on player profile popups

    // Boss Fight Settings
    autoMakePublic: AUTO_MAKE_PUBLIC_DEFAULT,
    autoConfirmDialogs: AUTO_CONFIRM,
    browserNotifications: ENABLE_NOTIFICATIONS,
    notificationCooldown: NOTIFY_COOLDOWN_MS / 1000, // in seconds (5)

    // Display Preferences
    compactMode: COMPACT_MODE,
    panelSide: 'left',              // 'left', 'right', or 'draggable'
    panelPosition: null,            // {x, y} for draggable mode, null = auto

    // Advanced
    apiPollInterval: POLL_MS / 1000, // in seconds (4)
    debugLogging: false,
  };

  // ====== HELPERS ======
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    for (const c of children) {
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  }

  function absUrl(path) {
    return new URL(path, window.location.origin).toString();
  }

  function safeOnce(key, ttlMs = 15000) {
    const now = Date.now();
    const prev = Number(sessionStorage.getItem(key) || "0");
    if (prev && now - prev < ttlMs) return false;
    sessionStorage.setItem(key, String(now));
    return true;
  }

  // ====== SETTINGS FUNCTIONS ======
  function getSettings() {
    const stored = GM_getValue(K_SETTINGS, null);
    if (!stored) return { ...DEFAULT_SETTINGS };
    // Merge with defaults to handle new settings added in updates
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  function saveSettings(settings) {
    GM_setValue(K_SETTINGS, settings);
  }

  function getSetting(key) {
    const settings = getSettings();
    return settings[key] !== undefined ? settings[key] : DEFAULT_SETTINGS[key];
  }

  function setSetting(key, value) {
    const settings = getSettings();
    settings[key] = value;
    saveSettings(settings);
  }

  function resetSettings() {
    GM_setValue(K_SETTINGS, { ...DEFAULT_SETTINGS });
  }

  function debugLog(...args) {
    if (getSetting('debugLogging')) {
      console.log('[MWC Smart Hub]', ...args);
    }
  }

  function currentFightIdFromUrl() {
    // Match both /attack/fight/ID and /fight/fight/ID patterns
    const m1 = location.pathname.match(/\/(?:attack|fight)\/fight\/(\d+)/i);
    if (m1) return m1[1];
    return null;
  }

  function currentBossIdFromUrl() {
    // Check for create group URL: /attack.php?bossFight=ID or /attack/fight/X with boss context
    const params = new URLSearchParams(location.search);
    const bossFight = params.get("bossFight");
    if (bossFight) return Number(bossFight);
    return null;
  }

  // ====== AUTO-PUBLIC SETTING ======
  function isAutoPublicEnabled() {
    const val = GM_getValue(K_AUTO_PUBLIC_ENABLED, null);
    // Default to AUTO_MAKE_PUBLIC_DEFAULT if not set
    return val === null ? AUTO_MAKE_PUBLIC_DEFAULT : val;
  }

  function setAutoPublicEnabled(enabled) {
    GM_setValue(K_AUTO_PUBLIC_ENABLED, enabled);
  }

  // ====== PANEL COLLAPSE HELPERS ======
  function isPanelCollapsed() {
    return GM_getValue(K_PANEL_COLLAPSED, false);
  }

  function setPanelCollapsed(collapsed) {
    GM_setValue(K_PANEL_COLLAPSED, collapsed);
  }

  // ====== QUICK OPS HELPERS ======
  function getQopsLastClaimTime() {
    return GM_getValue(K_QOPS_LAST_CLAIM, 0);
  }

  function setQopsLastClaimTime(timestamp = Date.now()) {
    GM_setValue(K_QOPS_LAST_CLAIM, timestamp);
  }

  function getQopsTimeRemaining() {
    const lastClaim = getQopsLastClaimTime();
    if (!lastClaim) return 0; // No timer set = ready
    const elapsed = Date.now() - lastClaim;
    const remaining = QOPS_COOLDOWN_MS - elapsed;
    return Math.max(0, remaining);
  }

  function getQopsPercent() {
    const lastClaim = getQopsLastClaimTime();
    if (!lastClaim) return 100; // No timer = 100% ready
    const elapsed = Date.now() - lastClaim;
    return Math.min(100, (elapsed / QOPS_COOLDOWN_MS) * 100);
  }

  function isQopsReady() {
    return getQopsTimeRemaining() === 0;
  }

  // ====== LOTTERY HELPERS ======
  function getGameDate() {
    // Get current date in game timezone (UTC-5)
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const gameTime = new Date(utc + (GAME_UTC_OFFSET * 3600000));
    const year = gameTime.getFullYear();
    const month = String(gameTime.getMonth() + 1).padStart(2, '0');
    const day = String(gameTime.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getNextGameReset() {
    // Calculate ms until next 00:00:00 game time
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const gameTime = new Date(utc + (GAME_UTC_OFFSET * 3600000));

    // Next reset is at 00:00:00 game time tomorrow (or today if it's exactly midnight)
    const nextReset = new Date(gameTime);
    nextReset.setHours(24, 0, 0, 0); // Midnight tomorrow game time

    // Convert back to local time for comparison
    const nextResetUtc = nextReset.getTime() - (GAME_UTC_OFFSET * 3600000);
    const nextResetLocal = nextResetUtc - (now.getTimezoneOffset() * 60000);

    return Math.max(0, nextResetLocal - now.getTime());
  }

  function getLotteryClaimedDate() {
    return GM_getValue(K_LOTTERY_CLAIMED_DATE, "");
  }

  function setLotteryClaimedDate(dateStr = null) {
    if (dateStr === null) {
      dateStr = getGameDate();
    }
    GM_setValue(K_LOTTERY_CLAIMED_DATE, dateStr);
  }

  function isLotteryReady() {
    const claimedDate = getLotteryClaimedDate();
    if (!claimedDate) return true; // Never claimed = ready
    const currentDate = getGameDate();
    return currentDate > claimedDate; // Ready if current game date is after claimed date
  }

  function getLotteryTimeRemaining() {
    if (isLotteryReady()) return 0;
    return getNextGameReset();
  }



  // ====== TIMER HELPERS ======
  function getBossTimerKey(bossId) {
    return K_BOSS_TIMER_PREFIX + bossId;
  }

  function getBossLastFightTime(bossId) {
    return GM_getValue(getBossTimerKey(bossId), 0);
  }

  function setBossLastFightTime(bossId, timestamp = Date.now()) {
    GM_setValue(getBossTimerKey(bossId), timestamp);
  }

  function getBossRespawnMs(bossId) {
    const boss = BOSSES.find(b => b.id === bossId);
    return boss ? boss.respawnMins * 60 * 1000 : 0;
  }

  function getBossTimeRemaining(bossId) {
    const lastFight = getBossLastFightTime(bossId);
    if (!lastFight) return 0; // No timer set, ready to fight

    const respawnMs = getBossRespawnMs(bossId);
    const elapsed = Date.now() - lastFight;
    const remaining = respawnMs - elapsed;

    return Math.max(0, remaining);
  }

  function isBossReady(bossId) {
    return getBossTimeRemaining(bossId) === 0;
  }

  function formatTimeRemaining(ms) {
    if (ms <= 0) return "";

    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    if (hours > 0) {
      return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  // ====== JOIN STATUS HELPERS ======
  function getJoinedFights() {
    return GM_getValue(K_JOINED_FIGHTS, []);
  }

  function setJoinedFights(arr) {
    GM_setValue(K_JOINED_FIGHTS, arr);
  }

  function getSeenFights() {
    return GM_getValue(K_SEEN_FIGHTS, []);
  }

  function setSeenFights(arr) {
    GM_setValue(K_SEEN_FIGHTS, arr);
  }

  // Parse the viewPublic page to get fight info
  async function fetchPublicFightsStatus() {
    try {
      let doc;

      // If we're currently on the /boss page, read DOM directly (content is already loaded)
      const isOnBossPage = location.pathname.toLowerCase().includes("/boss");

      if (isOnBossPage) {
        doc = document;
      } else {

        const res = await fetch(VIEW_PUBLIC_URL, {
          credentials: "include",
          cache: "no-store"
        });

        if (!res.ok) {
          console.error("[MWC-BossPanel] Public fights fetch failed:", res.status);
          return null;
        }

        const html = await res.text();
        const parser = new DOMParser();
        doc = parser.parseFromString(html, "text/html");
      }

      const fights = [];

      // Look for the public fights table - has headers: Status, Team, Target, Actions
      // Try multiple selectors for the fight rows
      let rows = doc.querySelectorAll("table tr");

      rows.forEach((row, idx) => {
        const cells = row.querySelectorAll("td");
        if (cells.length < 4) return; // Need Status, Team, Target, Actions (skip header row with th)

        // Actions is the last cell (index 3), has class .actionsCell
        const actionsCell = row.querySelector(".actionsCell") || cells[3];
        const actionsText = actionsCell?.textContent?.trim() || "";

        // Target is the 3rd cell (index 2)
        const targetCell = cells[2];
        const targetText = targetCell?.textContent?.trim() || "";

        // Team cell (index 1) - get user ID for unique fight identification
        const teamCell = cells[1];
        const userIdMatch = teamCell?.innerHTML?.match(/data-userid="(\d+)"/);
        const oderserId = userIdMatch ? userIdMatch[1] : null;

        // Create a composite ID from username + target boss
        const usernameEl = teamCell?.querySelector(".usernameText");
        const username = usernameEl?.textContent?.trim() || "unknown";
        const fightId = `${username}_${targetText}`.replace(/\s+/g, "_");

        // Check status from Actions cell
        // "You are already in this fight!" = you posted it OR you've been accepted
        // "Invite Status: Sent" = you've requested, waiting for acceptance
        // "Request to Join" button = you haven't joined yet
        const isAlreadyIn = actionsText.includes("already in this fight");
        const isInviteSent = actionsText.includes("Invite Status: Sent");

        // User is considered "handled" if they're already in OR have sent an invite
        // These are fights that require no action from the user
        const isJoined = isAlreadyIn || isInviteSent;

        if (targetText) {
          fights.push({
            id: fightId,
            oderserId,
            target: targetText,
            isAlreadyIn,
            isInviteSent,
            isJoined // true = no action needed
          });
        }
      });

      return fights;
    } catch (e) {
      console.error("[MWC-BossPanel] Error fetching public fights:", e);
      return null;
    }
  }

  // Parse cooldown time string like "6 minutes remaining until available" or "4 hours remaining until available"
  function parseRemainingTime(text) {
    if (!text) return 0;

    const lower = text.toLowerCase();

    // Match patterns like "6 minutes remaining", "4 hours remaining", "45 seconds remaining"
    const hourMatch = lower.match(/(\d+)\s*hours?\s*remaining/);
    const minMatch = lower.match(/(\d+)\s*minutes?\s*remaining/);
    const secMatch = lower.match(/(\d+)\s*seconds?\s*remaining/);

    let totalMs = 0;

    if (hourMatch) {
      totalMs += parseInt(hourMatch[1], 10) * 60 * 60 * 1000;
    }
    if (minMatch) {
      totalMs += parseInt(minMatch[1], 10) * 60 * 1000;
    }
    if (secMatch) {
      totalMs += parseInt(secMatch[1], 10) * 1000;
    }

    return totalMs;
  }

  // Map boss names to IDs for lookup
  function getBossIdByName(name) {
    const lower = name.toLowerCase().trim();
    for (const boss of BOSSES) {
      if (boss.name.toLowerCase() === lower) {
        return boss.id;
      }
    }
    // Partial match fallback
    for (const boss of BOSSES) {
      if (lower.includes(boss.name.toLowerCase()) || boss.name.toLowerCase().includes(lower)) {
        return boss.id;
      }
    }
    return null;
  }

  // Scrape the /boss page to get actual cooldown times
  // Only works when on /boss page - fetched HTML doesn't have dynamic content
  async function fetchBossCooldowns() {
    try {
      // Only read cooldowns when on /boss page (content is dynamic/JS-loaded)
      const isOnBossPage = location.pathname.toLowerCase().includes("/boss");

      if (!isOnBossPage) {
        return null;
      }

      const doc = document;

      const cooldowns = {};

      // Find all boss sections using the .split structure within .bossList
      const bossSections = doc.querySelectorAll(".bossList .split, .split");

      bossSections.forEach(section => {
        // Get boss name from .splitHeading
        const headingEl = section.querySelector(".splitHeading");
        if (!headingEl) return;

        const bossName = headingEl.textContent.trim();
        const bossId = getBossIdByName(bossName);

        if (!bossId) {
          return;
        }

        // Look for .timeLeftBoss for cooldown time
        const timeLeftEl = section.querySelector(".timeLeftBoss");

        if (timeLeftEl) {
          const timeText = timeLeftEl.textContent || "";
          const remainingMs = parseRemainingTime(timeText);

          if (remainingMs > 0) {
            cooldowns[bossId] = {
              remainingMs,
              isReady: false
            };
          } else {
            // Has timeLeftBoss element but couldn't parse time - might be ready
            cooldowns[bossId] = {
              remainingMs: 0,
              isReady: true
            };
          }
        } else {
          // No timeLeftBoss means boss is ready
          cooldowns[bossId] = {
            remainingMs: 0,
            isReady: true
          };
        }
      });

      return cooldowns;
    } catch (e) {
      console.error("[MWC-BossPanel] Error fetching boss cooldowns:", e);
      return null;
    }
  }

  // Sync our local timers with actual game cooldowns
  async function syncBossTimers() {
    const cooldowns = await fetchBossCooldowns();
    if (!cooldowns) {
      return;
    }

    if (Object.keys(cooldowns).length === 0) {
      return;
    }

    let updated = 0;
    BOSSES.forEach(boss => {
      const cd = cooldowns[boss.id];
      if (cd) {
        if (cd.isReady) {
          // Boss is ready - clear our timer
          GM_setValue(getBossTimerKey(boss.id), 0);
          updated++;
        } else if (cd.remainingMs > 0) {
          // Set timer based on remaining time from game
          // Calculate what the start time would have been
          const newStartTime = Date.now() - (getBossRespawnMs(boss.id) - cd.remainingMs);
          GM_setValue(getBossTimerKey(boss.id), newStartTime);
          updated++;
        }
      }
    });

    updateBossButtonStates();
  }

  // ====== FIGHT DETECTION ======
  const K_ACTIVE_FIGHT_BOSS = "mwc_active_fight_boss"; // Store boss ID when entering a fight
  const K_ACTIVE_FIGHT_PATH = "mwc_active_fight_path"; // Store the fight URL
  const K_ACTIVE_FIGHT_TIME = "mwc_active_fight_time"; // Store when we entered the fight

  // Use localStorage for speed - GM_setValue may be too slow for fast page transitions
  // localStorage is synchronous and shared across same-origin pages
  function getActiveFightBoss() {
    const val = localStorage.getItem(K_ACTIVE_FIGHT_BOSS);
    return val ? Number(val) : null;
  }
  function getActiveFightPath() {
    return localStorage.getItem(K_ACTIVE_FIGHT_PATH);
  }
  function getActiveFightTime() {
    const val = localStorage.getItem(K_ACTIVE_FIGHT_TIME);
    return val ? Number(val) : 0;
  }
  function setActiveFight(bossId, path) {
    localStorage.setItem(K_ACTIVE_FIGHT_BOSS, String(bossId));
    localStorage.setItem(K_ACTIVE_FIGHT_PATH, path);
    localStorage.setItem(K_ACTIVE_FIGHT_TIME, String(Date.now()));
  }
  function clearActiveFight() {
    localStorage.removeItem(K_ACTIVE_FIGHT_BOSS);
    localStorage.removeItem(K_ACTIVE_FIGHT_PATH);
    localStorage.removeItem(K_ACTIVE_FIGHT_TIME);
  }

  // Detect when a boss fight has started/completed
  function detectFightStart() {
    // Look for indicators that a fight has started or completed
    // EXCLUDE our panel from the text to avoid false positives
    const panel = document.getElementById("mwcBossPanel");
    let pageText = document.body?.textContent || "";
    let pageHtml = document.body?.innerHTML || "";

    // Remove panel text from detection
    if (panel) {
      const panelText = panel.textContent || "";
      const panelHtml = panel.innerHTML || "";
      pageText = pageText.replace(panelText, "");
      pageHtml = pageHtml.replace(panelHtml, "");
    }

    const path = location.pathname.toLowerCase();

    // Patterns that indicate a fight is in progress or completed
    const fightIndicators = [
      "battle complete",
      "fight complete",
      "fight finished",
      "fight started",
      "victory!",
      "defeated",
      "rewards received",
      "you won",
      "boss defeated",
      "winner",
      "your rewards",
      "group rewards"
    ];

    const lowerText = pageText.toLowerCase();
    const hasFightIndicator = fightIndicators.some(ind => lowerText.includes(ind));

    // Check if we're on an active fight page (/attack/fight/ID)
    const isOnActiveFightPage = /\/attack\/fight\/\d+/i.test(path);

    // Check if we're on a completed fight page (/fight/fight/ID)
    const isCompletedFightPage = /\/fight\/fight\/\d+/i.test(path);

    // Either active or completed fight page
    const isOnFightPage = isOnActiveFightPage || isCompletedFightPage;

    // Get the boss being fought (if detectable)
    let detectedBossId = null;
    let detectedBossName = null;

    // Check URL for boss ID (from ?bossFight=X param)
    const urlBossId = currentBossIdFromUrl();
    if (urlBossId) {
      detectedBossId = urlBossId;
      detectedBossName = BOSSES.find(b => b.id === urlBossId)?.displayName || "URL param";
    }

    // Try to detect from page content - look for "vs" followed by boss name
    if (!detectedBossId) {
      for (const boss of BOSSES) {
        // Match "vs" followed by optional whitespace/punctuation and the boss name
        // Allow up to 50 chars between VS and boss name (e.g., "VS 100/100 Vinny")
        const vsPattern = new RegExp(`vs\\.?[\\s\\S]{0,50}?\\b${boss.name}\\b`, "i");
        if (vsPattern.test(pageText)) {
          detectedBossId = boss.id;
          detectedBossName = boss.displayName + " (vs pattern)";
          break;
        }
      }
    }

    // Fallback: look for boss name anywhere on fight-related pages
    // Attack pages include setup (/attack/fight/ID) and create (/attack.php)
    const isOnAttackPage = /\/attack/i.test(path);
    if (!detectedBossId && (isOnFightPage || isOnAttackPage)) {
      for (const boss of BOSSES) {
        const namePattern = new RegExp(`\\b${boss.name}\\b`, "i");
        if (namePattern.test(pageText)) {
          detectedBossId = boss.id;
          detectedBossName = boss.displayName + " (name match)";
          break;
        }
      }
    }

    // Also check HTML for boss images or data attributes
    if (!detectedBossId && (isOnFightPage || isOnAttackPage)) {
      for (const boss of BOSSES) {
        // Look for boss name in image alts, titles, or data attributes
        const htmlPattern = new RegExp(`(?:alt|title|data-[^=]*)=["'][^"']*${boss.name}[^"']*["']`, "i");
        if (htmlPattern.test(pageHtml)) {
          detectedBossId = boss.id;
          detectedBossName = boss.displayName + " (html attr)";
          break;
        }
      }
    }

    return {
      hasFightIndicator,
      isOnFightPage,
      isOnActiveFightPage,
      isCompletedFightPage,
      detectedBossId,
      detectedBossName
    };
  }

  // Track active fight for timer purposes
  let lastMonitorPath = null;
  let lastDetectedBossId = null; // Track last detected boss for beforeunload save

  function monitorFightStatus() {
    const detection = detectFightStart();
    const path = location.pathname.toLowerCase();

    // Get stored fight info (using localStorage for reliability)
    const storedBossId = getActiveFightBoss();
    const storedFightPath = getActiveFightPath();
    const storedFightTime = getActiveFightTime();

    // CASE 0: We're on the boss setup page (/attack.php?bossFight=ID)
    // Store the boss ID here BEFORE the fight starts - this is the most reliable place
    const urlBossId = currentBossIdFromUrl();
    if (urlBossId && /\/attack\.php/i.test(path)) {
      if (storedBossId !== urlBossId) {
        setActiveFight(urlBossId, path);
      }
    }

    // CASE 1: We're on an ACTIVE fight page (/attack/fight/ID) or detect a boss
    // Store the boss we're fighting so we can start timer when we leave
    // SAVE IMMEDIATELY whenever we detect a boss on a fight-related page
    const isOnAttackPage = /\/attack/i.test(path);
    if (detection.detectedBossId && isOnAttackPage) {
      lastDetectedBossId = detection.detectedBossId; // Track for beforeunload

      // Always save when we detect (storage is fast, no harm in re-saving)
      if (storedBossId !== detection.detectedBossId || storedFightPath !== path) {
        setActiveFight(detection.detectedBossId, path);
      }
    }

    // CASE 2: We LEFT a fight/setup page and arrived elsewhere
    // If we have stored boss data and we're now on a different page type, the fight likely completed
    const isOnBossRelatedPage = /\/attack/i.test(path) || detection.isOnFightPage;
    const timeSinceStored = Date.now() - storedFightTime;

    if (storedBossId && !isOnBossRelatedPage && timeSinceStored < 300000) { // Within 5 minutes
      const bossId = Number(storedBossId);

      // Clear stored fight immediately to prevent duplicate triggers
      clearActiveFight();

      const key = `fight_timer_set_${bossId}_${Math.floor(Date.now() / 60000)}`;
      if (safeOnce(key, 30000)) {
        setBossLastFightTime(bossId);
        updateBossButtonStates();
      }
    }

    // CASE 3: We're on a COMPLETED fight page (/fight/fight/ID) with detection
    if (detection.isCompletedFightPage && detection.detectedBossId) {
      clearActiveFight(); // Clear any stored data
      const key = `fight_timer_set_${detection.detectedBossId}_${Math.floor(Date.now() / 60000)}`;
      if (safeOnce(key, 30000)) {
        setBossLastFightTime(detection.detectedBossId);
        updateBossButtonStates();
      }
    }

    // CASE 4: Fight completion detected by text indicators (fallback)
    if (detection.hasFightIndicator && detection.detectedBossId && !detection.isOnActiveFightPage) {
      clearActiveFight();
      const key = `fight_timer_set_${detection.detectedBossId}_${Math.floor(Date.now() / 60000)}`;
      if (safeOnce(key, 30000)) {
        setBossLastFightTime(detection.detectedBossId);
        updateBossButtonStates();
      }
    }

    lastMonitorPath = path;
  }

  // Save boss data right before page unloads (catches fast redirects)
  window.addEventListener('beforeunload', () => {
    if (lastDetectedBossId) {
      const path = location.pathname.toLowerCase();
      localStorage.setItem(K_ACTIVE_FIGHT_BOSS, String(lastDetectedBossId));
      localStorage.setItem(K_ACTIVE_FIGHT_PATH, path);
      localStorage.setItem(K_ACTIVE_FIGHT_TIME, String(Date.now()));
    }
  });

  function cooldownOk() {
    const last = GM_getValue(K_LAST_NOTIFY, 0);
    const cooldownMs = getSetting('notificationCooldown') * 1000;
    return (Date.now() - last) > cooldownMs;
  }

  function doNotify(text) {
    if (!getSetting('browserNotifications')) return;
    if (!cooldownOk()) return;

    GM_setValue(K_LAST_NOTIFY, Date.now());

    try {
      GM_notification({
        title: "MobWarsCity",
        text,
        timeout: 4000
      });
    } catch {
      alert(text);
    }
  }

  function getJoinAllBtn() {
    return document.querySelector("#mwcBossPanel .joinAllBtn");
  }

  function setJoinAllState(mode, count = 0) {
    const btn = getJoinAllBtn();
    if (!btn) return;

    btn.classList.remove("mwc-alert", "mwc-active", "mwc-idle");

    // Update badge
    const badge = btn.querySelector(".alertBadge");
    if (badge) {
      if (count > 0 && (mode === "alert" || mode === "active")) {
        badge.textContent = count;
        badge.style.display = "";
      } else {
        badge.style.display = "none";
      }
    }

    if (mode === "alert") {
      btn.classList.add("mwc-alert");
      btn.title = count > 0
        ? `Boss activity detected. ${count} boss fight(s) available. Click to join all public fights.`
        : "Boss activity detected. Click to join all public fights.";
      return;
    }

    if (mode === "active") {
      btn.classList.add("mwc-active");
      btn.title = count > 0
        ? `${count} boss fight(s) available. Click to join all public fights.`
        : "Boss fights available. Click to join all public fights.";
      return;
    }

    btn.classList.add("mwc-idle");
    btn.title = "Request to join all public boss fights";
  }

  // ====== BOSS BUTTON STATE UPDATES ======
  function updateBossButtonStates() {
    const panel = document.getElementById("mwcBossPanel");
    if (!panel) return;

    BOSSES.forEach(boss => {
      const btn = panel.querySelector(`a.bossBtn[data-boss-id="${boss.id}"]`);
      if (!btn) return;

      const isReady = isBossReady(boss.id);
      const timeRemaining = getBossTimeRemaining(boss.id);

      btn.classList.remove("mwc-ready", "mwc-cooldown");
      btn.classList.add(isReady ? "mwc-ready" : "mwc-cooldown");

      btn.title = isReady
        ? `Create Group: ${boss.displayName} (Ready!)`
        : `Create Group: ${boss.displayName} (Cooldown: ${formatTimeRemaining(timeRemaining)})`;

      const timerSpan = btn.querySelector(".timer");
      if (timerSpan) {
        timerSpan.textContent = isReady ? "" : formatTimeRemaining(timeRemaining);
      }
    });
  }

  function startBossTimerUpdates() {
    // Update every second for smooth countdown
    setInterval(updateBossButtonStates, 1000);
  }

  // ====== PANEL POSITIONING ======
  function positionPanel(panel) {
    const panelSide = getSetting('panelSide');
    
    // Draggable mode - use saved position or default to left
    if (panelSide === 'draggable') {
      const savedPos = getSetting('panelPosition');
      if (savedPos && savedPos.x !== null && savedPos.y !== null) {
        panel.style.left = savedPos.x + 'px';
        panel.style.top = savedPos.y + 'px';
        panel.style.right = 'auto';
        panel.style.width = 'auto';
        return;
      }
      // No saved position - fall through to default left positioning
    }

    const isRight = panelSide === 'right';
    const isCompact = getSetting('compactMode');

    // Right side: anchor to .inner-content_wrap right edge
    if (isRight) {
      const contentWrap = document.querySelector(".inner-content_wrap");
      if (!contentWrap) {
        setTimeout(() => positionPanel(panel), 200);
        return;
      }
      const cr = contentWrap.getBoundingClientRect();
      panel.style.right = 'auto';
      panel.style.left = Math.round(cr.right + 5) + 'px';
      panel.style.top = Math.round(cr.top) + 'px';
      panel.style.width = 'auto';
      return;
    }

    // Left side: anchor to menu wrap left edge
    const menuWrap = document.querySelector(".inner-body_menu-box_wrap.visible-desktop");
    if (!menuWrap) {
      setTimeout(() => positionPanel(panel), 200);
      return;
    }

    const r = menuWrap.getBoundingClientRect();

    if (isCompact) {
      panel.style.right = 'auto';
      panel.style.left = Math.max(5, Math.round(r.left - panel.offsetWidth - 5)) + "px";
      panel.style.top = Math.round(r.top + 40) + "px";
      panel.style.width = "auto";
      return;
    }

    const spaceLeft = r.left - 10;
    const minW = 120;
    const maxW = 200;

    const w = Math.max(minW, Math.min(maxW, spaceLeft - 10));
    panel.style.width = w + "px";
    panel.style.right = 'auto';
    panel.style.left = Math.max(10, Math.round(r.left - w - 10)) + "px";
    
    const top = Math.max(10, Math.round(r.top + 40));
    panel.style.top = top + "px";
  }

  function makePanelDraggable(panel) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;
    
    // Only enable dragging in draggable mode
    if (getSetting('panelSide') !== 'draggable') return;
    
    // Add a visible drag handle bar at the top
    const dragHandle = el('div', { className: 'mwc-drag-handle' });
    dragHandle.style.cssText = 'height:10px;background:rgba(39,214,210,0.25);border-radius:10px 10px 0 0;cursor:move;display:flex;align-items:center;justify-content:center;';
    const grip = el('div');
    grip.style.cssText = 'width:30px;height:3px;background:rgba(255,255,255,0.3);border-radius:2px;';
    dragHandle.appendChild(grip);
    panel.insertBefore(dragHandle, panel.firstChild);
    
    function startDrag(clientX, clientY) {
      if (getSetting('panelSide') !== 'draggable') return;
      isDragging = true;
      startX = clientX;
      startY = clientY;
      startLeft = panel.offsetLeft;
      startTop = panel.offsetTop;
    }
    
    function moveDrag(clientX, clientY) {
      if (!isDragging) return;
      const dx = clientX - startX;
      const dy = clientY - startY;
      const newLeft = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, startLeft + dx));
      const newTop = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, startTop + dy));
      panel.style.left = newLeft + 'px';
      panel.style.top = newTop + 'px';
      panel.style.right = 'auto';
    }
    
    function endDrag() {
      if (!isDragging) return;
      isDragging = false;
      setSetting('panelPosition', { x: panel.offsetLeft, y: panel.offsetTop });
    }
    
    // Mouse events - only on drag handle
    dragHandle.addEventListener('mousedown', (e) => {
      startDrag(e.clientX, e.clientY);
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
    document.addEventListener('mouseup', endDrag);
    
    // Touch events - only on drag handle
    dragHandle.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      startDrag(t.clientX, t.clientY);
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      const t = e.touches[0];
      moveDrag(t.clientX, t.clientY);
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('touchend', endDrag);
  }

  function startResponsivePositioning(panel) {
  const reflow = () => positionPanel(panel);

  window.addEventListener("resize", reflow, { passive: true });
  window.addEventListener("orientationchange", reflow, { passive: true });

  reflow();
}

  // ====== PANEL ======
  function injectPanel() {
    if (document.getElementById("mwcBossPanel")) return;

    const isCompact = getSetting('compactMode');
    const compactStyles = isCompact ? `
        #mwcBossPanel{
          width: auto;
          min-width: 70px;
        }

        #mwcBossPanel .card{
          padding: 6px 8px;
        }

        #mwcBossPanel .title{
          display: none;
        }

        #mwcBossPanel .bossGrid{
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        #mwcBossPanel a.bossBtn{
          padding: 6px 10px;
          margin: 0;
          font-size: 11px;
          gap: 4px;
          justify-content: space-between;
        }

        #mwcBossPanel a.bossBtn .icon{
          display: none;
        }

        #mwcBossPanel a.bossBtn .timer{
          font-size: 10px;
          margin-left: 6px;
        }

        #mwcBossPanel a.joinAllBtn{
          justify-content: center;
          margin-bottom: 2px;
        }

        #mwcBossPanel a.syncBtn{
          margin-top: 2px;
          padding: 4px 6px;
          font-size: 10px;
        }

        #mwcBossPanel a.autoPublicBtn{
          margin-top: 2px;
          padding: 4px 6px;
          font-size: 10px;
        }

        #mwcBossPanel .sub{
          display: none;
        }

        #mwcBossPanel .alertBadge{
          background: rgba(255, 60, 60, 0.9);
          color: white;
          font-size: 10px;
          font-weight: bold;
          padding: 1px 5px;
          border-radius: 10px;
          margin-left: 4px;
        }
    ` : '';

    const style = el("style", {
      textContent: `
        #mwcBossPanel{
          position: fixed;
          left: 5px;
          top: 120px;
          width: 200px;
          z-index: ${Z_INDEX};
          font-family: inherit;
        }

        #mwcBossPanel .card{
          background: rgba(8,12,18,0.85);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          padding: 10px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.35);
        }

        #mwcBossPanel .title{
          font-size: 12px;
          letter-spacing: 0.08em;
          opacity: 0.85;
          margin-bottom: 8px;
          text-transform: uppercase;
        }

        #mwcBossPanel a.bossBtn{
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          text-decoration: none;
          margin: 7px 0;
          padding: 9px 10px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(39, 214, 210, 0.12);
          color: #dff9f7;
          font-size: 13px;
          cursor: pointer;
          user-select: none;
          transition: background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
        }

        #mwcBossPanel a.bossBtn:hover{
          background: rgba(39, 214, 210, 0.18);
        }

        #mwcBossPanel a.bossBtn.mwc-ready{
          background: rgba(39, 214, 210, 0.20);
          border-color: rgba(39, 214, 210, 0.5);
          box-shadow: 0 0 10px rgba(39, 214, 210, 0.30);
        }

        #mwcBossPanel a.bossBtn.mwc-cooldown{
          background: rgba(80, 80, 80, 0.25);
          border-color: rgba(100, 100, 100, 0.3);
          color: rgba(180, 180, 180, 0.7);
        }

        #mwcBossPanel a.bossBtn .timer{
          font-size: 10px;
          font-weight: 600;
          color: rgba(255, 200, 100, 0.9);
          margin-left: 4px;
        }

        #mwcBossPanel a.bossBtn.mwc-ready .timer{
          display: none;
        }

        #mwcBossPanel a.syncBtn{
          background: rgba(100, 100, 100, 0.2);
          border-color: rgba(150, 150, 150, 0.3);
          font-size: 11px;
          padding: 6px 8px;
          margin-top: 10px;
        }

        #mwcBossPanel a.syncBtn:hover{
          background: rgba(100, 100, 100, 0.35);
        }

        #mwcBossPanel a.autoPublicBtn{
          background: rgba(100, 100, 100, 0.2);
          border-color: rgba(150, 150, 150, 0.3);
          font-size: 11px;
          padding: 6px 8px;
          margin-top: 6px;
        }

        #mwcBossPanel a.autoPublicBtn:hover{
          background: rgba(100, 100, 100, 0.35);
        }

        #mwcBossPanel a.autoPublicBtn .status.on{
          color: rgba(100, 220, 100, 0.95);
          font-weight: 600;
        }

        #mwcBossPanel a.autoPublicBtn .status.off{
          color: rgba(255, 100, 100, 0.95);
          font-weight: 600;
        }

        #mwcBossPanel a.lotteryBtn {
          margin-top: 6px;
          font-weight: 700;
          letter-spacing: 0.04em;
          transition: all 0.3s ease;
        }

        #mwcBossPanel a.lotteryBtn.mwc-cooldown {
          background: rgba(80, 80, 80, 0.25);
          border-color: rgba(100, 100, 100, 0.3);
          color: rgba(180, 180, 180, 0.7);
        }

        #mwcBossPanel a.lotteryBtn.mwc-cooldown .timer {
          color: rgba(255, 200, 100, 0.9);
        }

        #mwcBossPanel a.lotteryBtn.mwc-ready {
          background: rgba(0, 150, 255, 0.20);
          border-color: rgba(0, 150, 255, 0.5);
          box-shadow: 0 0 10px rgba(0, 150, 255, 0.30);
          animation: mwcLotteryPulse 1.5s infinite alternate;
        }

        #mwcBossPanel a.lotteryBtn.mwc-ready .label {
          color: #7fbfff;
        }

        @keyframes mwcLotteryPulse {
          from {
            box-shadow: 0 0 10px rgba(0, 150, 255, 0.30);
            transform: scale(1);
          }
          to {
            box-shadow: 0 0 20px rgba(0, 150, 255, 0.6);
            transform: scale(1.02);
          }
        }

        #mwcBossPanel .sub{
          margin-top: 8px;
          font-size: 11px;
          opacity: 0.75;
          line-height: 1.25;
        }

        #mwcBossPanel a.joinAllBtn{
          font-weight: 700;
          letter-spacing: 0.04em;
        }

        #mwcBossPanel a.joinAllBtn.mwc-idle{
          background: rgba(39, 214, 210, 0.12);
          border-color: rgba(255,255,255,0.10);
          box-shadow: none;
        }

        #mwcBossPanel a.joinAllBtn.mwc-active{
          background: rgba(255, 166, 0, 0.22);
          border-color: rgba(255, 191, 0, 0.7);
          box-shadow: 0 0 16px rgba(255, 191, 0, 0.35);
        }

        #mwcBossPanel a.joinAllBtn.mwc-alert{
          background: rgba(255, 60, 60, 0.22);
          border-color: rgba(255, 90, 90, 0.85);
          box-shadow: 0 0 20px rgba(255, 70, 70, 0.55);
          animation: mwcJoinAllPulse 1s infinite alternate;
        }

        #mwcBossPanel .alertBadge{
          background: rgba(255, 60, 60, 0.9);
          color: white;
          font-size: 10px;
          font-weight: bold;
          padding: 1px 5px;
          border-radius: 10px;
          margin-left: 4px;
        }

        #mwcBossPanel a.opsClaimBtn {
          margin-top: 6px;
          font-weight: 700;
          letter-spacing: 0.04em;
          transition: all 0.3s ease;
        }

        #mwcBossPanel a.opsClaimBtn.mwc-cooldown {
          background: rgba(80, 80, 80, 0.25);
          border-color: rgba(100, 100, 100, 0.3);
          color: rgba(180, 180, 180, 0.7);
        }

        #mwcBossPanel a.opsClaimBtn.mwc-cooldown .timer {
          color: rgba(255, 200, 100, 0.9);
        }

        #mwcBossPanel a.opsClaimBtn.mwc-ready {
          background: rgba(39, 214, 210, 0.20);
          border-color: rgba(39, 214, 210, 0.5);
          box-shadow: 0 0 10px rgba(39, 214, 210, 0.30);
          animation: mwcOpsPulse 1.5s infinite alternate;
        }

        #mwcBossPanel a.opsClaimBtn.mwc-ready .label {
          color: #6fdfff;
        }

        @keyframes mwcOpsPulse {
          from {
            box-shadow: 0 0 10px rgba(39, 214, 210, 0.30);
            transform: scale(1);
          }
          to {
            box-shadow: 0 0 20px rgba(39, 214, 210, 0.6);
            transform: scale(1.02);
          }
        }

        @keyframes mwcJoinAllPulse {
          from {
            transform: scale(1);
            box-shadow: 0 0 12px rgba(255, 70, 70, 0.35);
          }
          to {
            transform: scale(1.03);
            box-shadow: 0 0 24px rgba(255, 70, 70, 0.75);
          }
        }

        /* ====== COLLAPSE STYLES ====== */
        #mwcBossPanel.collapsed{
          display: none;
        }

        /* Style game's Menu title when we've made it clickable */
        .inner-body_title[data-mwc-bound]{
          transition: color 0.2s ease, text-shadow 0.2s ease;
        }

        .inner-body_title[data-mwc-bound]:hover{
          color: #6fdfff !important;
          text-shadow: 0 0 8px rgba(39, 214, 210, 0.5);
        }

        ${compactStyles}

        /* ====== SMALL SCREEN AUTO-COMPACT ====== */
        @media (max-height: 700px) {
          #mwcBossPanel {
            top: 10px !important;
            max-height: calc(100vh - 20px);
            overflow-y: auto;
            overflow-x: hidden;
          }

          #mwcBossPanel .card {
            padding: 4px 6px !important;
          }

          #mwcBossPanel a.bossBtn {
            padding: 4px 8px !important;
            margin: 2px 0 !important;
            font-size: 10px !important;
            gap: 3px !important;
          }

          #mwcBossPanel a.bossBtn .timer {
            font-size: 9px !important;
          }

          #mwcBossPanel a.joinAllBtn {
            margin-bottom: 1px !important;
          }

          #mwcBossPanel a.syncBtn,
          #mwcBossPanel a.autoPublicBtn {
            padding: 3px 5px !important;
            font-size: 9px !important;
            margin-top: 1px !important;
          }

          #mwcBossPanel .bossGrid {
            gap: 2px !important;
          }

          #mwcBossPanel .alertBadge {
            font-size: 9px !important;
            padding: 0 4px !important;
          }

          /* Scrollbar styling for small screens */
          #mwcBossPanel::-webkit-scrollbar {
            width: 4px;
          }

          #mwcBossPanel::-webkit-scrollbar-track {
            background: rgba(0,0,0,0.2);
            border-radius: 2px;
          }

          #mwcBossPanel::-webkit-scrollbar-thumb {
            background: rgba(39, 214, 210, 0.4);
            border-radius: 2px;
          }

          #mwcBossPanel::-webkit-scrollbar-thumb:hover {
            background: rgba(39, 214, 210, 0.6);
          }
        }

        /* Even smaller screens - extra tight */
        @media (max-height: 550px) {
          #mwcBossPanel a.bossBtn {
            padding: 3px 6px !important;
            font-size: 9px !important;
          }

          #mwcBossPanel a.syncBtn,
          #mwcBossPanel a.autoPublicBtn {
            padding: 2px 4px !important;
            font-size: 8px !important;
          }
        }
      `
    });

    // Build boss buttons
    const bossButtons = BOSSES.map(b => {
      const url = absUrl(`/attack.php?bossFight=${b.id}`);
      const isReady = isBossReady(b.id);
      const timeRemaining = getBossTimeRemaining(b.id);
      const displayName = isCompact ? b.shortName : b.displayName;

      const a = el("a", {
        className: `bossBtn ${isReady ? 'mwc-ready' : 'mwc-cooldown'}`,
        href: url,
        title: isReady
          ? `Create Group: ${b.displayName} (Ready!)`
          : `Create Group: ${b.displayName} (Cooldown: ${formatTimeRemaining(timeRemaining)})`,
      }, [
        el("span", { className: "icon", textContent: "👥" }),
        el("span", { textContent: displayName }),
        el("span", { className: "timer", textContent: isReady ? "" : formatTimeRemaining(timeRemaining) }),
      ]);

      a.dataset.bossId = b.id;

      a.addEventListener("click", (e) => {
        e.preventDefault();
        window.top.location.href = url;
      });

      // Right-click to manually start timer
      a.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (confirm(`Start cooldown timer for ${b.displayName}? (${b.respawnMins} minutes)`)) {
          setBossLastFightTime(b.id);
          updateBossButtonStates();
        }
      });

      return a;
    });

    // Build Join All button
    const joinAllBtn = (() => {
      const url = absUrl("/boss/action/requestJoinAll/viewPublic/1");
      const a = el("a", {
        className: "bossBtn joinAllBtn mwc-idle",
        href: url,
        title: "Request to join all public boss fights",
      }, [
        el("span", { className: "icon", textContent: "🧲" }),
        el("span", { textContent: "JOIN ALL" }),
        el("span", { className: "alertBadge", style: "display:none" }),
      ]);

      a.addEventListener("click", (e) => {
        e.preventDefault();
        window.top.location.href = url;
      });

      return a;
    })();

    // Build Sync button - navigates to /boss to sync timers
    const syncBtn = (() => {
      const btn = el("a", {
        className: "bossBtn syncBtn",
        href: BOSS_PAGE_URL,
        title: "Go to Boss page to sync timers",
      }, [
        el("span", { className: "icon", textContent: "🔄" }),
        el("span", { textContent: isCompact ? "SYNC" : "SYNC TIMERS" }),
      ]);

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        window.top.location.href = BOSS_PAGE_URL;
      });

      return btn;
    })();

    // Build Auto-Public toggle button
    const autoPublicBtn = (() => {
      const isEnabled = getSetting('autoMakePublic');
      const btn = el("a", {
        className: "bossBtn autoPublicBtn",
        href: "#",
        title: isEnabled ? "Auto-Public: ON - Click to disable" : "Auto-Public: OFF - Click to enable",
      }, [
        el("span", { className: "label", textContent: isCompact ? "PUB" : "AUTO PUBLIC" }),
        el("span", { className: `status ${isEnabled ? 'on' : 'off'}`, textContent: isEnabled ? "ON" : "OFF" }),
      ]);

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const currentState = getSetting('autoMakePublic');
        const newState = !currentState;
        setSetting('autoMakePublic', newState);

        // Update button appearance
        const statusEl = btn.querySelector('.status');
        statusEl.classList.remove('on', 'off');
        statusEl.classList.add(newState ? 'on' : 'off');
        statusEl.textContent = newState ? "ON" : "OFF";
        btn.title = newState ? "Auto-Public: ON - Click to disable" : "Auto-Public: OFF - Click to enable";
      });

      return btn;
    })();

    // Build OPS CLAIM button (Quick Ops integration)
    const opsClaimBtn = (() => {
      const btn = el("a", {
        className: "bossBtn opsClaimBtn",
        href: "#",
        title: "Claim Quick Operations reward",
      }, [
        el("span", { className: "label", textContent: "OPS" }),
        el("span", { className: "timer", textContent: "--:--" }),
      ]);

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        // Just navigate to operations page - user will click claim button themselves
        window.top.location.href = 'https://mobwarscity.com/operations';
      });

      return btn;
    })();

    // Update OPS CLAIM button from internal Quick Ops state
    function updateOpsClaimBtn() {
      try {
        const percent = getQopsPercent();
        const remainingMs = getQopsTimeRemaining();
        const isReady = isQopsReady();

        // Format time as HH:MM:SS
        const formatOpsTime = (ms) => {
          if (ms <= 0) return 'READY';
          const totalSec = Math.ceil(ms / 1000);
          const h = Math.floor(totalSec / 3600);
          const m = Math.floor((totalSec % 3600) / 60);
          const s = totalSec % 60;
          return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        };

        const labelSpan = opsClaimBtn.querySelector('.label');
        const timerSpan = opsClaimBtn.querySelector('.timer');

        labelSpan.textContent = isReady ? 'CLAIM' : 'OPS';
        timerSpan.textContent = formatOpsTime(remainingMs);

        // Clear inline styles (use CSS classes instead)
        opsClaimBtn.style.background = '';
        opsClaimBtn.style.borderColor = '';
        opsClaimBtn.style.color = '';

        // Toggle classes like boss buttons
        opsClaimBtn.classList.remove('mwc-ready', 'mwc-cooldown');
        opsClaimBtn.classList.add(isReady ? 'mwc-ready' : 'mwc-cooldown');

        opsClaimBtn.title = isReady ? 'Quick Ops ready to claim!' : `Quick Ops: ${formatOpsTime(remainingMs)} remaining`;
      } catch (e) {
        console.error('[BossPanel] Error updating OPS button:', e);
      }
    }

    // Start OPS button update loop
    setInterval(updateOpsClaimBtn, 1000);
    updateOpsClaimBtn();

    // Build Lottery button
    const lotteryBtn = (() => {
      const isReady = isLotteryReady();
      const timeRemaining = getLotteryTimeRemaining();

      const btn = el("a", {
        className: `bossBtn lotteryBtn ${isReady ? 'mwc-ready' : 'mwc-cooldown'}`,
        href: "#",
        title: isReady ? "Daily lottery entry available!" : `Lottery: ${formatTimeRemaining(timeRemaining)} until reset`,
      }, [
        el("span", { className: "label", textContent: "🎰" }),
        el("span", { className: "timer", textContent: isReady ? "FREE" : formatTimeRemaining(timeRemaining) }),
      ]);

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        window.top.location.href = LOTTERY_URL;
      });

      return btn;
    })();

    // Update Lottery button timer
    function updateLotteryBtn() {
      const isReady = isLotteryReady();
      const timeRemaining = getLotteryTimeRemaining();

      const labelSpan = lotteryBtn.querySelector('.label');
      const timerSpan = lotteryBtn.querySelector('.timer');

      timerSpan.textContent = isReady ? "FREE" : formatTimeRemaining(timeRemaining);

      lotteryBtn.classList.remove('mwc-ready', 'mwc-cooldown');
      lotteryBtn.classList.add(isReady ? 'mwc-ready' : 'mwc-cooldown');

      lotteryBtn.title = isReady ? "Daily lottery entry available!" : `Lottery: ${formatTimeRemaining(timeRemaining)} until reset`;
    }

    // Start Lottery button update loop
    setInterval(updateLotteryBtn, 1000);
    updateLotteryBtn();

    // Build card content based on mode and settings
    const showBoss = getSetting('showBossSection');
    const showOps = getSetting('showQuickOps');
    const showLotto = getSetting('showLottery');
    
    let cardContent;
    if (isCompact) {
      const gridChildren = [];
      if (showBoss) {
        gridChildren.push(joinAllBtn, ...bossButtons, syncBtn, autoPublicBtn);
      }
      if (showOps) gridChildren.push(opsClaimBtn);
      if (showLotto) gridChildren.push(lotteryBtn);
      
      const grid = el("div", { className: "bossGrid" }, gridChildren);
      cardContent = [grid];
    } else {
      const elements = [];
      if (showBoss) {
        elements.push(
          el("div", { className: "title" }, ["Boss fights"]),
          joinAllBtn,
          ...bossButtons,
          syncBtn,
          autoPublicBtn
        );
      }
      if (showOps) elements.push(opsClaimBtn);
      if (showLotto) elements.push(lotteryBtn);
      if (showBoss) {
        elements.push(el("div", { className: "sub" }, [
          "Timers sync when visiting /boss. Right-click boss to manual set."
        ]));
      }
      cardContent = elements;
    }

    const card = el("div", { className: "card" }, cardContent);
    const panel = el("div", { id: "mwcBossPanel" }, [card]);

    // Apply initial collapsed state
    if (isPanelCollapsed()) {
      panel.classList.add("collapsed");
    }

    document.documentElement.appendChild(style);
    document.documentElement.appendChild(panel);

    startResponsivePositioning(panel);
    makePanelDraggable(panel);
  }

  // ====== SIDEBAR NOTES ======
  const K_NOTES_HEIGHT = "mwc_notes_height"; // saved textarea height

  function getNotesText() {
    return GM_getValue(K_NOTES_TEXT, "");
  }

  function setNotesText(text) {
    GM_setValue(K_NOTES_TEXT, text);
  }

  function getNotesCollapsed() {
    return GM_getValue(K_NOTES_COLLAPSED, false);
  }

  function setNotesCollapsed(val) {
    GM_setValue(K_NOTES_COLLAPSED, val);
  }

  function getNotesHeight() {
    return GM_getValue(K_NOTES_HEIGHT, 120);
  }

  function setNotesHeight(h) {
    GM_setValue(K_NOTES_HEIGHT, h);
  }

  function injectSidebarNotes() {
    // Check if sidebar notes are enabled
    if (!getSetting('showSidebarNotes')) return;
    
    // Already injected?
    if (document.getElementById('mwcSidebarNotes')) return;

    // Find injection point: between .quickbar-wrap and .inner-body_menu-box_wrap
    const sidebar = document.querySelector('.sidebar.inner-body_sidebar');
    if (!sidebar) return;

    const quickbar = sidebar.querySelector('.quickbar-wrap');
    const menuWrap = sidebar.querySelector('.inner-body_menu-box_wrap.visible-desktop');
    if (!quickbar || !menuWrap) return;

    // Inject styles
    if (!document.getElementById('mwcSidebarNotesStyles')) {
      const style = el('style', {
        id: 'mwcSidebarNotesStyles',
        textContent: `
          #mwcSidebarNotes {
            margin: 8px 0;
            font-family: inherit;
          }

          #mwcSidebarNotes .notes-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            background: linear-gradient(135deg, rgba(39, 214, 210, 0.12), rgba(39, 214, 210, 0.05));
            border: 1px solid rgba(39, 214, 210, 0.25);
            border-radius: 6px;
            cursor: pointer;
            user-select: none;
            transition: background 0.2s;
          }

          #mwcSidebarNotes .notes-header:hover {
            background: linear-gradient(135deg, rgba(39, 214, 210, 0.18), rgba(39, 214, 210, 0.08));
          }

          #mwcSidebarNotes .notes-title {
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #27d6d2;
            display: flex;
            align-items: center;
            gap: 6px;
          }

          #mwcSidebarNotes .notes-arrow {
            font-size: 10px;
            color: rgba(39, 214, 210, 0.7);
            transition: transform 0.2s;
          }

          #mwcSidebarNotes.collapsed .notes-arrow {
            transform: rotate(-90deg);
          }

          #mwcSidebarNotes .notes-body {
            margin-top: 6px;
            overflow: hidden;
            transition: max-height 0.25s ease-out, opacity 0.2s;
          }

          #mwcSidebarNotes.collapsed .notes-body {
            max-height: 0 !important;
            opacity: 0;
            margin-top: 0;
          }

          #mwcSidebarNotes .notes-textarea {
            width: 100%;
            min-height: 60px;
            max-height: 400px;
            background: rgba(8,12,18,0.6);
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 6px;
            padding: 10px;
            font-size: 12px;
            font-family: inherit;
            color: #dff9f7;
            line-height: 1.5;
            resize: vertical;
            outline: none;
            box-sizing: border-box;
          }

          #mwcSidebarNotes .notes-textarea:focus {
            border-color: rgba(39, 214, 210, 0.5);
            background: rgba(8,12,18,0.8);
          }

          #mwcSidebarNotes .notes-textarea::placeholder {
            color: rgba(255,255,255,0.3);
          }
        `
      });
      document.documentElement.appendChild(style);
    }

    // Build notes section
    const isCollapsed = getNotesCollapsed();
    const savedHeight = getNotesHeight();

    const arrow = el('span', { className: 'notes-arrow', textContent: '▼' });
    const header = el('div', { className: 'notes-header' }, [
      el('span', { className: 'notes-title' }, [' NOTES']),
      arrow
    ]);

    const textarea = el('textarea', {
      className: 'notes-textarea',
      placeholder: 'Type your notes here...',
      value: getNotesText()
    });
    textarea.style.height = savedHeight + 'px';

    const body = el('div', { className: 'notes-body' }, [textarea]);
    if (!isCollapsed) {
      body.style.maxHeight = (savedHeight + 30) + 'px';
      body.style.opacity = '1';
    }

    const container = el('div', {
      id: 'mwcSidebarNotes',
      className: isCollapsed ? 'collapsed' : ''
    }, [header, body]);

    // Toggle collapse
    header.addEventListener('click', () => {
      const nowCollapsed = container.classList.toggle('collapsed');
      setNotesCollapsed(nowCollapsed);
      if (!nowCollapsed) {
        body.style.maxHeight = (textarea.offsetHeight + 30) + 'px';
        body.style.opacity = '1';
      }
    });

    // Auto-save on input
    let saveTimeout;
    textarea.addEventListener('input', () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        setNotesText(textarea.value);
      }, 500);
    });

    // Save immediately on blur
    textarea.addEventListener('blur', () => {
      clearTimeout(saveTimeout);
      setNotesText(textarea.value);
    });

    // Save height on resize
    const resizeObserver = new ResizeObserver(() => {
      const h = textarea.offsetHeight;
      if (h > 0) {
        setNotesHeight(h);
        if (!container.classList.contains('collapsed')) {
          body.style.maxHeight = (h + 30) + 'px';
        }
      }
    });
    resizeObserver.observe(textarea);

    // Insert between quickbar and menu
    sidebar.insertBefore(container, menuWrap);
  }

  // ====== SETTINGS MODAL ======
  function injectSettingsStyles() {
    if (document.getElementById('mwcSettingsStyles')) return;
    
    const style = el('style', {
      id: 'mwcSettingsStyles',
      textContent: `
        #mwcSettingsOverlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.85);
          z-index: ${Z_INDEX + 100};
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: inherit;
        }

        #mwcSettingsModal {
          background: linear-gradient(145deg, rgba(15, 20, 30, 0.98), rgba(8, 12, 18, 0.98));
          border: 1px solid rgba(39, 214, 210, 0.3);
          border-radius: 12px;
          width: 90%;
          max-width: 500px;
          max-height: 85vh;
          overflow: hidden;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 30px rgba(39, 214, 210, 0.15);
        }

        #mwcSettingsModal .settings-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: linear-gradient(135deg, rgba(39, 214, 210, 0.15), rgba(39, 214, 210, 0.05));
          border-bottom: 1px solid rgba(39, 214, 210, 0.2);
        }

        #mwcSettingsModal .settings-header h2 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #6fdfff;
          letter-spacing: 0.05em;
        }

        #mwcSettingsModal .settings-close {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          font-size: 24px;
          cursor: pointer;
          padding: 0;
          line-height: 1;
          transition: color 0.2s;
        }

        #mwcSettingsModal .settings-close:hover {
          color: #ff6b6b;
        }

        #mwcSettingsModal .settings-body {
          padding: 16px 20px;
          max-height: calc(85vh - 130px);
          overflow-y: auto;
        }

        #mwcSettingsModal .settings-body::-webkit-scrollbar {
          width: 6px;
        }

        #mwcSettingsModal .settings-body::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 3px;
        }

        #mwcSettingsModal .settings-body::-webkit-scrollbar-thumb {
          background: rgba(39, 214, 210, 0.4);
          border-radius: 3px;
        }

        #mwcSettingsModal .settings-section {
          margin-bottom: 20px;
        }

        #mwcSettingsModal .settings-section:last-child {
          margin-bottom: 0;
        }

        #mwcSettingsModal .section-title {
          font-size: 12px;
          font-weight: 600;
          color: rgba(39, 214, 210, 0.9);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 12px;
          padding-bottom: 6px;
          border-bottom: 1px solid rgba(39, 214, 210, 0.2);
        }

        #mwcSettingsModal .setting-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        #mwcSettingsModal .setting-row:last-child {
          border-bottom: none;
        }

        #mwcSettingsModal .setting-label {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.85);
        }

        #mwcSettingsModal .setting-label small {
          display: block;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          margin-top: 2px;
        }

        /* Toggle Switch */
        #mwcSettingsModal .toggle-switch {
          position: relative;
          width: 44px;
          height: 24px;
          flex-shrink: 0;
        }

        #mwcSettingsModal .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        #mwcSettingsModal .toggle-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(80, 80, 80, 0.5);
          border-radius: 24px;
          transition: background 0.3s;
        }

        #mwcSettingsModal .toggle-slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background: white;
          border-radius: 50%;
          transition: transform 0.3s;
        }

        #mwcSettingsModal .toggle-switch input:checked + .toggle-slider {
          background: rgba(39, 214, 210, 0.7);
        }

        #mwcSettingsModal .toggle-switch input:checked + .toggle-slider:before {
          transform: translateX(20px);
        }

        #mwcSettingsModal .toggle-switch input:disabled + .toggle-slider {
          opacity: 0.4;
          cursor: not-allowed;
        }

        /* Slider Input */
        #mwcSettingsModal .slider-container {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        #mwcSettingsModal .slider-input {
          width: 100px;
          height: 6px;
          -webkit-appearance: none;
          appearance: none;
          background: rgba(80, 80, 80, 0.5);
          border-radius: 3px;
          outline: none;
        }

        #mwcSettingsModal .slider-input::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          background: #6fdfff;
          border-radius: 50%;
          cursor: pointer;
          transition: background 0.2s;
        }

        #mwcSettingsModal .slider-input::-webkit-slider-thumb:hover {
          background: #9fefff;
        }

        #mwcSettingsModal .slider-value {
          font-size: 12px;
          color: rgba(39, 214, 210, 0.9);
          min-width: 35px;
          text-align: right;
        }

        /* Select Dropdown */
        #mwcSettingsModal .setting-select {
          background: rgba(30, 40, 50, 0.8);
          border: 1px solid rgba(39, 214, 210, 0.3);
          border-radius: 6px;
          color: rgba(255, 255, 255, 0.9);
          padding: 6px 10px;
          font-size: 12px;
          cursor: pointer;
          outline: none;
        }

        #mwcSettingsModal .setting-select:focus {
          border-color: rgba(39, 214, 210, 0.6);
        }

        /* Footer */
        #mwcSettingsModal .settings-footer {
          padding: 12px 20px;
          border-top: 1px solid rgba(39, 214, 210, 0.2);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        #mwcSettingsModal .reset-btn {
          background: rgba(255, 100, 100, 0.15);
          border: 1px solid rgba(255, 100, 100, 0.4);
          color: rgba(255, 150, 150, 0.9);
          padding: 8px 14px;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        #mwcSettingsModal .reset-btn:hover {
          background: rgba(255, 100, 100, 0.25);
          border-color: rgba(255, 100, 100, 0.6);
        }

        #mwcSettingsModal .save-btn {
          background: rgba(39, 214, 210, 0.2);
          border: 1px solid rgba(39, 214, 210, 0.5);
          color: #6fdfff;
          padding: 8px 20px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        #mwcSettingsModal .save-btn:hover {
          background: rgba(39, 214, 210, 0.3);
          border-color: rgba(39, 214, 210, 0.7);
        }

        /* Settings gear icon in menu */
        .mwc-settings-gear {
          cursor: pointer;
          opacity: 0.6;
          transition: opacity 0.2s, transform 0.3s;
          font-size: 14px;
          margin-left: 8px;
        }

        .mwc-settings-gear:hover {
          opacity: 1;
          transform: rotate(90deg);
        }
      `
    });
    document.head.appendChild(style);
  }

  function openSettingsModal() {
    // Remove existing modal if present
    const existing = document.getElementById('mwcSettingsOverlay');
    if (existing) existing.remove();

    injectSettingsStyles();

    const settings = getSettings();

    // Create toggle switch helper
    function createToggle(key, disabled = false) {
      const label = el('label', { className: 'toggle-switch' });
      const input = el('input', { 
        type: 'checkbox', 
        checked: settings[key],
        disabled: disabled
      });
      input.dataset.key = key;
      const slider = el('span', { className: 'toggle-slider' });
      label.appendChild(input);
      label.appendChild(slider);
      return label;
    }

    // Create slider helper
    function createSlider(key, min, max, step, suffix = '') {
      const container = el('div', { className: 'slider-container' });
      const input = el('input', {
        type: 'range',
        className: 'slider-input',
        min: min,
        max: max,
        step: step,
        value: settings[key]
      });
      input.dataset.key = key;
      const valueDisplay = el('span', { 
        className: 'slider-value',
        textContent: settings[key] + suffix
      });
      input.addEventListener('input', () => {
        valueDisplay.textContent = input.value + suffix;
      });
      container.appendChild(input);
      container.appendChild(valueDisplay);
      return container;
    }

    // Create select helper
    function createSelect(key, options) {
      const select = el('select', { className: 'setting-select' });
      select.dataset.key = key;
      options.forEach(opt => {
        const option = el('option', { 
          value: opt.value, 
          textContent: opt.label,
          selected: settings[key] === opt.value
        });
        select.appendChild(option);
      });
      return select;
    }

    // Create setting row helper
    function createRow(labelText, control, description = '') {
      const row = el('div', { className: 'setting-row' });
      const labelDiv = el('div', { className: 'setting-label' });
      labelDiv.textContent = labelText;
      if (description) {
        const small = el('small', { textContent: description });
        labelDiv.appendChild(small);
      }
      row.appendChild(labelDiv);
      row.appendChild(control);
      return row;
    }

    // Build modal content
    const overlay = el('div', { id: 'mwcSettingsOverlay' });
    const modal = el('div', { id: 'mwcSettingsModal' });

    // Header
    const header = el('div', { className: 'settings-header' });
    const title = el('h2', { textContent: '⚙️ Smart Hub Settings' });
    const closeBtn = el('button', { className: 'settings-close', textContent: '×' });
    closeBtn.addEventListener('click', () => overlay.remove());
    header.appendChild(title);
    header.appendChild(closeBtn);

    // Body with sections
    const body = el('div', { className: 'settings-body' });

    // Panel Features Section
    const panelSection = el('div', { className: 'settings-section' });
    panelSection.appendChild(el('div', { className: 'section-title', textContent: 'Panel Features' }));
    panelSection.appendChild(createRow('Boss Section', createToggle('showBossSection'), 'Timers, SYNC, PUB buttons'));
    panelSection.appendChild(createRow('Quick Ops', createToggle('showQuickOps'), 'Timer and claim button'));
    panelSection.appendChild(createRow('Lottery', createToggle('showLottery'), 'Timer and claim button'));
    panelSection.appendChild(createRow('Sidebar Notes', createToggle('showSidebarNotes'), 'Notepad in sidebar'));
    panelSection.appendChild(createRow('Profile Notes', createToggle('enableProfileNotes'), 'Notes on player popups'));
    body.appendChild(panelSection);

    // Boss Fight Settings Section
    const bossSection = el('div', { className: 'settings-section' });
    bossSection.appendChild(el('div', { className: 'section-title', textContent: 'Boss Fight Settings' }));
    bossSection.appendChild(createRow('Auto Make Public', createToggle('autoMakePublic'), 'Automatically make fights public'));
    bossSection.appendChild(createRow('Auto Confirm Dialogs', createToggle('autoConfirmDialogs'), 'Auto-click Join All confirmations'));
    
    const notifToggle = createToggle('browserNotifications');
    bossSection.appendChild(createRow('Browser Notifications', notifToggle, 'Alert when new fights appear'));
    
    const cooldownSlider = createSlider('notificationCooldown', 5, 30, 1, 's');
    const cooldownRow = createRow('Notification Cooldown', cooldownSlider);
    // Disable cooldown if notifications are off
    if (!settings.browserNotifications) {
      cooldownRow.style.opacity = '0.4';
      cooldownRow.querySelector('.slider-input').disabled = true;
    }
    // Wire up toggle to enable/disable cooldown
    notifToggle.querySelector('input').addEventListener('change', (e) => {
      const slider = cooldownRow.querySelector('.slider-input');
      if (e.target.checked) {
        cooldownRow.style.opacity = '1';
        slider.disabled = false;
      } else {
        cooldownRow.style.opacity = '0.4';
        slider.disabled = true;
      }
    });
    bossSection.appendChild(cooldownRow);
    body.appendChild(bossSection);

    // Display Preferences Section
    const displaySection = el('div', { className: 'settings-section' });
    displaySection.appendChild(el('div', { className: 'section-title', textContent: 'Display Preferences' }));
    displaySection.appendChild(createRow('Compact Mode', createToggle('compactMode'), 'Smaller buttons and text'));
    displaySection.appendChild(createRow('Panel Side', createSelect('panelSide', [
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' },
      { value: 'draggable', label: 'Draggable' }
    ]), 'Draggable: drag panel anywhere'));
    body.appendChild(displaySection);

    // Advanced Section
    const advancedSection = el('div', { className: 'settings-section' });
    advancedSection.appendChild(el('div', { className: 'section-title', textContent: 'Advanced' }));
    advancedSection.appendChild(createRow('API Poll Interval', createSlider('apiPollInterval', 2, 15, 1, 's'), 'How often to check for boss fights'));
    advancedSection.appendChild(createRow('Debug Logging', createToggle('debugLogging'), 'Log details to console'));
    body.appendChild(advancedSection);

    // Footer
    const footer = el('div', { className: 'settings-footer' });
    const resetBtn = el('button', { className: 'reset-btn', textContent: 'Reset to Defaults' });
    const saveBtn = el('button', { className: 'save-btn', textContent: 'Save & Reload' });

    resetBtn.addEventListener('click', () => {
      if (confirm('Reset all settings to defaults?')) {
        resetSettings();
        location.reload();
      }
    });

    saveBtn.addEventListener('click', () => {
      // Gather all values
      const newSettings = { ...settings };
      
      // Toggles
      modal.querySelectorAll('.toggle-switch input[data-key]').forEach(input => {
        newSettings[input.dataset.key] = input.checked;
      });
      
      // Sliders
      modal.querySelectorAll('.slider-input[data-key]').forEach(input => {
        newSettings[input.dataset.key] = Number(input.value);
      });
      
      // Selects
      modal.querySelectorAll('.setting-select[data-key]').forEach(select => {
        newSettings[select.dataset.key] = select.value;
      });

      saveSettings(newSettings);
      location.reload();
    });

    footer.appendChild(resetBtn);
    footer.appendChild(saveBtn);

    // Assemble modal
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);

    // Close on overlay click (but not modal click)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // Close on Escape key
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      }
    });

    document.body.appendChild(overlay);
  }

  // ====== PROFILE NOTES ======
  function getProfileNotes(userId) {
    return GM_getValue(K_PROFILE_NOTES_PREFIX + userId, "");
  }

  function setProfileNotes(userId, text) {
    GM_setValue(K_PROFILE_NOTES_PREFIX + userId, text);
  }

  function injectProfileNotes() {
    // Find all open profile popups that don't already have notes injected
    const popups = document.querySelectorAll('.popupProfileBackground.open');
    popups.forEach(popup => {
      // Already injected?
      if (popup.querySelector('.mwc-profile-notes')) return;

      // Get user ID from the popup
      const usernameEl = popup.querySelector('.username[data-userid]');
      if (!usernameEl) return;
      const userId = usernameEl.getAttribute('data-userid');
      if (!userId) return;

      // Find injection point: between .popupProfile and .profileLinks
      const wrapper = popup.querySelector('.popupProfileWrapper');
      if (!wrapper) return;
      const profileLinks = wrapper.querySelector('.profileLinks');
      if (!profileLinks) return;

      // Create notes container
      const notesContainer = el('div', { className: 'mwc-profile-notes' });

      const textarea = el('textarea', {
        className: 'mwc-profile-notes-input',
        placeholder: 'Add notes about this player...',
        value: getProfileNotes(userId)
      });

      // Stop propagation to prevent game from closing popup on click
      const stopProp = (e) => {
        e.stopPropagation();
      };
      notesContainer.addEventListener('click', stopProp, true);
      notesContainer.addEventListener('mousedown', stopProp, true);
      notesContainer.addEventListener('mouseup', stopProp, true);
      textarea.addEventListener('click', stopProp, true);
      textarea.addEventListener('mousedown', stopProp, true);
      textarea.addEventListener('mouseup', stopProp, true);
      textarea.addEventListener('focus', stopProp, true);

      // Auto-save on input
      let saveTimeout;
      textarea.addEventListener('input', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          setProfileNotes(userId, textarea.value);
        }, 500);
      });

      // Save immediately on blur
      textarea.addEventListener('blur', () => {
        clearTimeout(saveTimeout);
        setProfileNotes(userId, textarea.value);
      });

      notesContainer.appendChild(textarea);

      // Insert before profileLinks
      wrapper.insertBefore(notesContainer, profileLinks);
    });
  }

  // Inject profile notes styles
  function injectProfileNotesStyles() {
    if (document.getElementById('mwcProfileNotesStyles')) return;
    const style = el('style', {
      id: 'mwcProfileNotesStyles',
      textContent: `
        .mwc-profile-notes {
          padding: 8px 15px;
          margin: 0;
        }

        .mwc-profile-notes-input {
          width: 100%;
          min-height: 50px;
          max-height: 120px;
          background: rgba(8,12,18,0.6);
          border: 1px solid rgba(39, 214, 210, 0.3);
          border-radius: 6px;
          padding: 8px 10px;
          font-size: 13px;
          font-family: inherit;
          color: #dff9f7;
          line-height: 1.4;
          resize: vertical;
          outline: none;
          box-sizing: border-box;
        }

        .mwc-profile-notes-input:focus {
          border-color: rgba(39, 214, 210, 0.6);
          background: rgba(8,12,18,0.8);
        }

        .mwc-profile-notes-input::placeholder {
          color: rgba(255,255,255,0.35);
          font-style: italic;
        }
      `
    });
    document.documentElement.appendChild(style);
  }

  // Watch for profile popups
  function startProfileNotesWatch() {
    // Check if profile notes are enabled
    if (!getSetting('enableProfileNotes')) return;
    
    injectProfileNotesStyles();
    // Initial injection
    injectProfileNotes();
    // Watch for new popups
    const observer = new MutationObserver(() => {
      injectProfileNotes();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  // ====== AUTO MAKE PUBLIC ======
  function tryAutoMakePublic() {
    if (!getSetting('autoMakePublic')) return;

    const onAttackArea = /\/attack\//i.test(location.pathname) || /attack\.php/i.test(location.pathname);
    if (!onAttackArea) return;

    const fightId = currentFightIdFromUrl();
    const guardKey = "mwc_autopublic_" + (fightId || location.href);

    if (!safeOnce(guardKey, 8000)) return;

    const clickMakePublic = () => {
      const candidates = [];

      document.querySelectorAll('a[href*="/action/public"], a[href*="action/public"]').forEach(a => {
        candidates.push(a);
      });

      document.querySelectorAll("button, a.button, a, input[type='button'], input[type='submit']").forEach(n => {
        const t = (n.textContent || n.value || "").trim().toLowerCase();
        if (t === "make public" || t.includes("make public") || t === "public") {
          candidates.push(n);
        }
      });

      const unique = Array.from(new Set(candidates)).filter(Boolean);

      if (unique.length === 0) return false;

      const best =
        unique.find(n => (n.getAttribute && (n.getAttribute("href") || "").includes("action/public"))) ||
        unique[0];

      best.click();
      return true;
    };

    if (clickMakePublic()) return;

    const obs = new MutationObserver(() => {
      if (clickMakePublic()) obs.disconnect();
    });

    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 12000);
  }

  // ====== AUTO CONFIRM DIALOGS ======
  function startAutoConfirm() {
    if (!getSetting('autoConfirmDialogs')) return;

    function norm(s) {
      return (s || "").toString().trim().toLowerCase().replace(/\s+/g, " ");
    }

    function isJoinAllConfirm(box) {
      const title = norm(box.querySelector(".jconfirm-title")?.textContent);
      const body = norm(box.querySelector(".jconfirm-content")?.textContent);
      return (
        title === "request to join all" &&
        body.includes("request to join all")
      );
    }

    function isAcceptAllStartConfirm(box) {
      const title = norm(box.querySelector(".jconfirm-title")?.textContent);
      const body = norm(box.querySelector(".jconfirm-content")?.textContent);
      return (
        title === "accept all & start fight" &&
        body.includes("accept all") &&
        body.includes("start")
      );
    }

    function isDepositAllConfirm(box) {
      const title = norm(box.querySelector(".jconfirm-title")?.textContent);
      const body = norm(box.querySelector(".jconfirm-content")?.textContent);
      return (
        title === "deposit all dollars?" &&
        body.includes("deposit all your on hand money")
      );
    }

    function clickPrimary(box) {
      // Try .btn-primary first, fall back to first .btn-default (for dialogs like Deposit All)
      const btn = box.querySelector(".jconfirm-buttons .btn.btn-primary") ||
                  box.querySelector(".jconfirm-buttons .btn.btn-default");
      if (!btn) return false;

      // prevent double-clicks if the observer fires multiple times
      if (btn.dataset._autoClicked) return false;
      btn.dataset._autoClicked = "1";

      btn.click();
      return true;
    }

    const confirmObs = new MutationObserver(() => {
      document.querySelectorAll(".jconfirm-box").forEach((box) => {
        if (isJoinAllConfirm(box) || isAcceptAllStartConfirm(box) || isDepositAllConfirm(box)) {
          clickPrimary(box);
        }
      });
    });

    confirmObs.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ====== ALERT POLLING ======
  let lastKnownUnjoinedCount = 0;
  let lastKnownFightIds = new Set();

  async function checkJoinStatus() {
    const isOnBossPage = location.pathname.toLowerCase().includes("/boss");

    // Only try to read DOM when on /boss page (content is dynamic)
    if (!isOnBossPage) {
      return null; // Signal to use API-based detection
    }

    const fights = await fetchPublicFightsStatus();

    if (!fights) {
      return null;
    }

    if (fights.length === 0) {
      // Cache this result
      GM_setValue(K_CACHED_UNJOINED, 0);
      GM_setValue(K_CACHED_TOTAL, 0);
      return {
        totalFights: 0,
        unjoinedCount: 0,
        hasNewFights: false
      };
    }

    const currentIds = new Set(fights.map(f => f.id).filter(Boolean));

    // Count fights where user has NOT taken action yet
    // (not "already in" and not "invite sent")
    const unjoinedFights = fights.filter(f => !f.isJoined);
    const unjoinedCount = unjoinedFights.length;

    // Look for new fights we haven't seen
    const newFightIds = [...currentIds].filter(id => !lastKnownFightIds.has(id));
    const hasNewFights = newFightIds.length > 0 && lastKnownFightIds.size > 0;

    // Update tracking
    lastKnownFightIds = currentIds;

    // Cache results for use when not on boss page
    GM_setValue(K_CACHED_UNJOINED, unjoinedCount);
    GM_setValue(K_CACHED_TOTAL, fights.length);

    return {
      totalFights: fights.length,
      unjoinedCount,
      hasNewFights
    };
  }

  async function pollBossStatus() {
    try {
      // First check the API for basic counts
      const res = await fetch(API_URL, {
        credentials: "include",
        cache: "no-store"
      });
      if (!res.ok) return;

      const data = await res.json();
      const bf = data?.bossFights;

      if (!bf || typeof bf.count === "undefined" || typeof bf.hasActive === "undefined") return;

      const apiCount = Number(bf.count);
      if (Number.isNaN(apiCount)) return;

      const active = Boolean(bf.hasActive);

      const lastCount = GM_getValue(K_LAST_COUNT, null);
      const lastActive = GM_getValue(K_LAST_ACTIVE, null);
      const lastApiCount = GM_getValue(K_LAST_API_COUNT, 0);

      // Initialize state on first run
      if (lastCount === null || lastActive === null) {
        GM_setValue(K_LAST_COUNT, apiCount);
        GM_setValue(K_LAST_ACTIVE, active);
      }

      // Check join status from page scraping (only works on /boss page)
      const joinStatus = await checkJoinStatus();

      // Determine button state based on join status or API
      if (joinStatus) {
        // We're on /boss page and got real data - CLEAR any pending alert since we have real info now
        GM_setValue(K_PENDING_ALERT, false);
        GM_setValue(K_PENDING_ALERT_COUNT, 0);

        const { unjoinedCount, hasNewFights, totalFights } = joinStatus;

        if (hasNewFights && unjoinedCount > 0) {
          // New fight posted that we haven't joined
          setJoinAllState("alert", unjoinedCount);
          doNotify(`New boss fight posted! ${unjoinedCount} fight(s) to join.`);
        } else if (unjoinedCount > lastKnownUnjoinedCount && unjoinedCount > 0) {
          // More unjoined fights than before
          setJoinAllState("alert", unjoinedCount);
          doNotify(`${unjoinedCount} boss fight(s) available to join.`);
        } else if (unjoinedCount > 0) {
          // Some fights available but not new
          setJoinAllState("active", unjoinedCount);
        } else {
          // All fights joined (or no fights)
          setJoinAllState("idle", 0);
        }

        lastKnownUnjoinedCount = unjoinedCount;
      } else {
        // Not on /boss page - use API count changes + cached data
        const cachedUnjoined = GM_getValue(K_CACHED_UNJOINED, 0);
        const cachedTotal = GM_getValue(K_CACHED_TOTAL, 0);
        const hasPendingAlert = GM_getValue(K_PENDING_ALERT, false);
        const pendingAlertCount = GM_getValue(K_PENDING_ALERT_COUNT, 0);

        // Detect if API count increased (new fight posted)
        const countIncreased = apiCount > lastApiCount && lastApiCount > 0;

        if (countIncreased && apiCount > 0) {
          // API count went up - new fight likely posted
          // Set PERSISTENT pending alert until user visits /boss page
          const estimatedUnjoined = Math.max(cachedUnjoined, pendingAlertCount) + (apiCount - lastApiCount);
          GM_setValue(K_PENDING_ALERT, true);
          GM_setValue(K_PENDING_ALERT_COUNT, estimatedUnjoined);
          setJoinAllState("alert", estimatedUnjoined);
          doNotify(`New boss fight detected! (${apiCount} total)`);
        } else if (hasPendingAlert && pendingAlertCount > 0) {
          // We have a pending alert from earlier - KEEP showing it until /boss page visit
          setJoinAllState("alert", pendingAlertCount);
        } else if (apiCount > cachedTotal && cachedTotal > 0) {
          // More fights than we last saw on /boss page - new fight(s) posted
          setJoinAllState("active", apiCount - cachedTotal);
        } else if (cachedUnjoined > 0) {
          // We know from last /boss page visit there were unjoined fights
          setJoinAllState("active", cachedUnjoined);
        } else if (cachedTotal > 0 && cachedUnjoined === 0) {
          // We visited /boss page and joined all fights - trust that cache
          setJoinAllState("idle", 0);
        } else if (active || apiCount > 0) {
          // API says there are fights but we've never visited /boss to check join status
          // Only show as active if we have no cached info
          setJoinAllState("active", apiCount);
        } else {
          setJoinAllState("idle", 0);
        }

        // Update last API count
        GM_setValue(K_LAST_API_COUNT, apiCount);
      }

      // Update stored values
      if (apiCount !== lastCount || active !== lastActive) {
        GM_setValue(K_LAST_COUNT, apiCount);
        GM_setValue(K_LAST_ACTIVE, active);
      }
    } catch {
      // ignore transient errors
    }
  }

  function startBossPolling() {
    pollBossStatus();
    const pollInterval = getSetting('apiPollInterval') * 1000;
    setInterval(pollBossStatus, pollInterval);
  }

  // Sync timers with game data when on /boss page
  function startBossTimerSync() {
    // Only syncs when user is on /boss page (cooldowns are JS-loaded, can't fetch remotely)
    setTimeout(syncBossTimers, 2000);
    setTimeout(syncBossTimers, 5000); // Second attempt in case page was slow to load
  }

  // Sync Quick Ops timer from /operations page
  function syncQopsTimer() {
    const isOnOpsPage = location.pathname.toLowerCase().includes('/operations');
    if (!isOnOpsPage) return;

    // Look for #timeToFull element that shows remaining time
    const timeToFullEl = document.getElementById('timeToFull');
    if (!timeToFullEl) return;

    const timeText = timeToFullEl.textContent?.trim() || '';
    // Parse HH:MM:SS format
    const match = timeText.match(/(\d{1,2}):(\d{2}):(\d{2})/);
    if (match) {
      const hours = parseInt(match[1], 10);
      const mins = parseInt(match[2], 10);
      const secs = parseInt(match[3], 10);
      const remainingMs = (hours * 3600 + mins * 60 + secs) * 1000;

      // Calculate what lastClaimAt should be
      const elapsedMs = QOPS_COOLDOWN_MS - remainingMs;
      const serverPercent = Math.max(0, Math.min(100, (elapsedMs / QOPS_COOLDOWN_MS) * 100));
      const ourPercent = getQopsPercent();

      // Sync if different by more than 2%
      if (Math.abs(ourPercent - serverPercent) > 2) {
        const calculatedLastClaim = Date.now() - elapsedMs;
        GM_setValue(K_QOPS_LAST_CLAIM, calculatedLastClaim);
        console.log('[BossPanel] Quick Ops timer synced to', serverPercent.toFixed(1) + '%');
      }
    }
  }

  // Attach claim detection listeners on /operations page
  function attachQopsClaimListeners() {
    const isOnOpsPage = location.pathname.toLowerCase().includes('/operations');
    if (!isOnOpsPage) return;

    // Listen for clicks on claim buttons
    document.addEventListener('click', (e) => {
      const target = e.target;
      const parent = target.parentElement;
      const grandparent = parent?.parentElement;

      const checkForClaim = (el) => {
        if (!el) return false;
        const className = el.className || '';
        const text = el.textContent || '';
        return className.toLowerCase().includes('claim') ||
               (text.toLowerCase().includes('claim') && text.length < 50);
      };

      if (checkForClaim(target) || checkForClaim(parent) || checkForClaim(grandparent)) {
        console.log('[BossPanel] Claim button clicked - resetting Quick Ops timer');
        setQopsLastClaimTime(Date.now());
      }
    }, true);

    // Also detect claim buttons with data-type attribute
    document.querySelectorAll('.button.claim-btn[data-type]').forEach(btn => {
      if (btn.dataset.mwcQopsBound) return;
      btn.dataset.mwcQopsBound = '1';
      btn.addEventListener('click', () => {
        setQopsLastClaimTime(Date.now());
      }, true);
    });

    // Watch for "Operation Complete!" popup
    let lastResetTime = 0;
    const qopsObserver = new MutationObserver(() => {
      const popup = document.querySelector('.operationResultNotification');
      const chargeReset = document.querySelector('.operationChargeReset');

      if (popup || chargeReset) {
        if (Date.now() - lastResetTime > 10000) {
          console.log('[BossPanel] Detected "Operation Complete!" popup - resetting timer');
          lastResetTime = Date.now();
          setQopsLastClaimTime(Date.now());
        }
      }
    });
    qopsObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Sync Quick Ops timer when on /operations page
  function startQopsSync() {
    setTimeout(syncQopsTimer, 500);
    setTimeout(syncQopsTimer, 1500);
    setTimeout(syncQopsTimer, 3000);
    setTimeout(attachQopsClaimListeners, 1000);
    setInterval(syncQopsTimer, 5000);
  }

  // Sync Lottery timer when on the lottery page
  function syncLotteryTimer() {
    const isOnLotteryPage = location.pathname.toLowerCase().includes("/amenity_lottery");
    if (!isOnLotteryPage) return;

    // Check if free entry section has "claimed" class
    const freeEntrySection = document.getElementById("freeEntrySection");
    if (freeEntrySection && freeEntrySection.classList.contains("claimed")) {
      // User has claimed today's free entry
      const currentDate = getGameDate();
      const lastClaimedDate = getLotteryClaimedDate();
      if (lastClaimedDate !== currentDate) {
        // Update claimed date to today
        setLotteryClaimedDate(currentDate);
      }
    } else if (freeEntrySection && !freeEntrySection.classList.contains("claimed")) {
      // Free entry is available - clear claimed date if it's from a previous day
      const currentDate = getGameDate();
      const lastClaimedDate = getLotteryClaimedDate();
      if (lastClaimedDate && lastClaimedDate < currentDate) {
        // Previous day's claim, reset
        GM_setValue(K_LOTTERY_CLAIMED_DATE, "");
      }
    }
  }

  // Attach click listener to detect when user claims lottery
  function attachLotteryClaimListeners() {
    const isOnLotteryPage = location.pathname.toLowerCase().includes("/amenity_lottery");
    if (!isOnLotteryPage) return;

    // Watch for changes to the freeEntrySection
    const freeEntrySection = document.getElementById("freeEntrySection");
    if (freeEntrySection && !freeEntrySection.dataset.mwcListenerAttached) {
      freeEntrySection.dataset.mwcListenerAttached = "1";

      // Use MutationObserver to detect when class changes to "claimed"
      const observer = new MutationObserver(() => {
        if (freeEntrySection.classList.contains("claimed")) {
          setLotteryClaimedDate(getGameDate());
        }
      });
      observer.observe(freeEntrySection, { attributes: true, attributeFilter: ['class'] });
    }

    // Also attach click handlers to any "Claim Free Entry" buttons
    document.querySelectorAll('button, a.button, input[type="submit"]').forEach(btn => {
      const text = (btn.textContent || btn.value || "").toLowerCase();
      if (text.includes("free entry") || text.includes("claim")) {
        if (btn.dataset.mwcLotteryListener) return;
        btn.dataset.mwcLotteryListener = "1";

        btn.addEventListener("click", () => {
          // Set claimed immediately on click
          setTimeout(() => {
            setLotteryClaimedDate(getGameDate());
          }, 500);
        });
      }
    });
  }

  // Start lottery sync
  function startLotterySync() {
    // Initial sync
    setTimeout(syncLotteryTimer, 1000);
    // Attach claim listeners
    setTimeout(attachLotteryClaimListeners, 1000);
    // Sync every 5 seconds when on the page
    setInterval(syncLotteryTimer, 5000);
    // Re-attach listeners periodically in case DOM updates
    setInterval(attachLotteryClaimListeners, 2000);
  }

  // ====== RUN ======
  debugLog('Smart Hub initializing...', { settings: getSettings() });
  
  const path = location.pathname.toLowerCase();
  const urlBossId = currentBossIdFromUrl();

  // Check if there's stored fight info from previous page
  const storedBossAtStart = getActiveFightBoss();
  const storedPathAtStart = getActiveFightPath();
  const storedTimeAtStart = getActiveFightTime();

  // CASE A: On boss setup page (/attack.php?bossFight=ID)
  // Store the boss ID BEFORE the fight starts - most reliable method
  if (urlBossId && /\/attack\.php/i.test(path)) {
    setActiveFight(urlBossId, path);
  }
  // CASE B: On active fight page (/attack/fight/ID) - SAVE IMMEDIATELY
  else if (/\/attack\/fight\/\d+/i.test(path)) {
    const detection = detectFightStart();
    if (detection.detectedBossId) {
      setActiveFight(detection.detectedBossId, path);
    }
  }
  // CASE C: On ANY /attack/ page - also try to save
  else if (/\/attack/i.test(path)) {
    const detection = detectFightStart();
    if (detection.detectedBossId) {
      setActiveFight(detection.detectedBossId, path);
    }
  }
  // CASE D: We arrived at a non-fight page with stored boss data - fight must have ended!
  // monitorFightStatus() will handle starting the timer

  injectPanel();
  injectSidebarNotes();
  injectSettingsStyles(); // Inject settings styles early for gear icon
  startProfileNotesWatch();
  tryAutoMakePublic();
  startAutoConfirm();
  startBossPolling();
  startBossTimerUpdates();
  startBossTimerSync();
  startQopsSync();
  startLotterySync();

  // Make game's "Menu" header clickable to toggle panel
  function attachMenuToggle() {
    const menuTitle = document.querySelector('.inner-body_title');
    if (!menuTitle) return;
    // Only target the Menu title (not other .inner-body_title elements)
    if (menuTitle.textContent.trim() !== 'Menu' && !menuTitle.textContent.includes('MWC MENU')) return;
    if (menuTitle.dataset.mwcBound) return; // Already bound

    // Rename to MWC MENU so users know it's our toggle
    menuTitle.textContent = 'MWC MENU';
    menuTitle.dataset.mwcBound = 'true';
    menuTitle.style.cursor = 'pointer';
    menuTitle.style.userSelect = 'none';
    menuTitle.title = 'Click to toggle MWC Panel';
    
    // Make menu title a flex container to position gear icon
    menuTitle.style.display = 'flex';
    menuTitle.style.alignItems = 'center';
    menuTitle.style.justifyContent = 'space-between';
    
    // Add settings gear icon
    const gearIcon = el('span', {
      className: 'mwc-settings-gear',
      textContent: '⚙️',
      title: 'Open Settings'
    });
    
    gearIcon.addEventListener('click', (e) => {
      e.stopPropagation(); // Don't trigger panel toggle
      openSettingsModal();
    });
    
    menuTitle.appendChild(gearIcon);

    menuTitle.addEventListener('click', (e) => {
      // Don't toggle if clicking gear icon
      if (e.target.classList.contains('mwc-settings-gear')) return;
      
      const panel = document.getElementById('mwcBossPanel');
      if (!panel) return;

      const nowCollapsed = panel.classList.toggle('collapsed');
      setPanelCollapsed(nowCollapsed);
    });
  }

  attachMenuToggle();

  // Monitor for fight completion to auto-start timers
  // Run immediately and frequently at first, then slow down
  monitorFightStatus();

  // Run every 500ms for first 10 seconds to catch fast transitions
  let fastMonitorCount = 0;
  const fastMonitorInterval = setInterval(() => {
    monitorFightStatus();
    fastMonitorCount++;
    if (fastMonitorCount >= 20) {
      clearInterval(fastMonitorInterval);
    }
  }, 500);

  // Then continue with slower interval
  setInterval(monitorFightStatus, 2000);

  const reObs = new MutationObserver(() => {
    injectPanel();
    injectSidebarNotes();
    monitorFightStatus();
    attachMenuToggle();
  });
  reObs.observe(document.documentElement, { childList: true, subtree: true });
})();
