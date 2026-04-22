// ==UserScript==
// @name         MWC - Smart BlackJack
// @namespace    http://tampermonkey.net/
// @version      1.1.1
// @description  Optimal blackjack basic strategy - one button auto-play
// @author       MountainDewd
// @match        *://mobwarscity.com/blackjack.php*
// @match        *://www.mobwarscity.com/blackjack.php*
// @run-at       document-idle
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  const CONFIG = {
    debug: false,
  };

  function log(...args) {
    if (!CONFIG.debug) return;
    console.log("[SmartBJ]", ...args);
  }

  if (!/\/blackjack\.php$/i.test(window.location.pathname)) {
    return;
  }
  
  // Log immediately to confirm script runs
  log("=== SCRIPT STARTING === URL:", window.location.href, "isIframe:", window.top !== window.self);
  
  // Only run if blackjack elements exist (works in any frame)
  function hasBlackjackElements() {
    return document.querySelector('.blackjack-container') ||
           document.getElementById('dealerCards') ||
           document.getElementById('hitBtn') ||
           document.querySelector('.game-table');
  }
  
  // Check immediately
  if (hasBlackjackElements()) {
    log("Blackjack elements found immediately");
    initBlackjack();
  } else {
    // Wait and check again
    log("No elements yet, waiting...");
    const checkInterval = setInterval(() => {
      if (hasBlackjackElements()) {
        log("Blackjack elements found after wait");
        clearInterval(checkInterval);
        initBlackjack();
      }
    }, 500);
    
    // Stop checking after 10 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      log("Gave up waiting for blackjack elements");
    }, 10000);
  }
  
  function initBlackjack() {
    log("Initializing blackjack helper...");

  // ====== CARD PARSING ======
  // Cards are images: images/cards/{suit}/{value}.gif
  // Values: 2-10 = face value, 11=J, 12=Q, 13=K, 14=A

  function parseCardValue(imgSrc) {
    // Extract value from URL like "images/cards/hearts/14.gif"
    const match = imgSrc.match(/\/(\d+)\.gif$/i);
    if (!match) return null;
    
    const rawValue = parseInt(match[1], 10);
    
    // Convert to blackjack value
    if (rawValue >= 2 && rawValue <= 10) return rawValue;
    if (rawValue >= 11 && rawValue <= 13) return 10; // J, Q, K
    if (rawValue === 14) return 11; // Ace (we'll handle soft hands separately)
    
    return null;
  }

  function isAce(imgSrc) {
    const match = imgSrc.match(/\/(\d+)\.gif$/i);
    return match && parseInt(match[1], 10) === 14;
  }

  function getCardsFromContainer(container) {
    if (!container) return [];
    const cards = [];
    const imgs = container.querySelectorAll(".card img");
    imgs.forEach(img => {
      const val = parseCardValue(img.src);
      if (val !== null) {
        cards.push({
          value: val,
          isAce: isAce(img.src),
          src: img.src
        });
      }
    });
    return cards;
  }

  function calculateHandValue(cards) {
    let total = 0;
    let aces = 0;
    
    for (const card of cards) {
      total += card.value;
      if (card.isAce) aces++;
    }
    
    // Adjust aces from 11 to 1 if busting
    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }
    
    return {
      value: total,
      soft: aces > 0 && total <= 21, // Soft hand = has an ace counted as 11
      aceCount: cards.filter(c => c.isAce).length
    };
  }

  function isPair(cards) {
    if (cards.length !== 2) return false;
    // For blackjack purposes, all 10-value cards are the same for splitting
    const v1 = cards[0].value;
    const v2 = cards[1].value;
    // But check if they're actually the same card value (not just same BJ value)
    const match1 = cards[0].src.match(/\/(\d+)\.gif$/i);
    const match2 = cards[1].src.match(/\/(\d+)\.gif$/i);
    if (match1 && match2) {
      return match1[1] === match2[1];
    }
    return v1 === v2;
  }

  function getPairValue(cards) {
    // Return the raw card value for pair decisions
    const match = cards[0].src.match(/\/(\d+)\.gif$/i);
    if (!match) return cards[0].value;
    const raw = parseInt(match[1], 10);
    if (raw === 14) return 11; // Aces
    if (raw >= 11 && raw <= 13) return 10; // Face cards
    return raw;
  }

  // ====== BASIC STRATEGY ======
  // H = Hit, S = Stand, D = Double (hit if can't), P = Split, Ds = Double (stand if can't)
  
  // Hard totals (no ace counted as 11)
  // Rows: player total 5-17+, Cols: dealer up card 2-10,A
  const HARD_STRATEGY = {
    // Player total: { dealer up card: action }
    5:  { 2:'H', 3:'H', 4:'H', 5:'H', 6:'H', 7:'H', 8:'H', 9:'H', 10:'H', 11:'H' },
    6:  { 2:'H', 3:'H', 4:'H', 5:'H', 6:'H', 7:'H', 8:'H', 9:'H', 10:'H', 11:'H' },
    7:  { 2:'H', 3:'H', 4:'H', 5:'H', 6:'H', 7:'H', 8:'H', 9:'H', 10:'H', 11:'H' },
    8:  { 2:'H', 3:'H', 4:'H', 5:'H', 6:'H', 7:'H', 8:'H', 9:'H', 10:'H', 11:'H' },
    9:  { 2:'H', 3:'D', 4:'D', 5:'D', 6:'D', 7:'H', 8:'H', 9:'H', 10:'H', 11:'H' },
    10: { 2:'D', 3:'D', 4:'D', 5:'D', 6:'D', 7:'D', 8:'D', 9:'D', 10:'H', 11:'H' },
    11: { 2:'D', 3:'D', 4:'D', 5:'D', 6:'D', 7:'D', 8:'D', 9:'D', 10:'D', 11:'D' },
    12: { 2:'H', 3:'H', 4:'S', 5:'S', 6:'S', 7:'H', 8:'H', 9:'H', 10:'H', 11:'H' },
    13: { 2:'S', 3:'S', 4:'S', 5:'S', 6:'S', 7:'H', 8:'H', 9:'H', 10:'H', 11:'H' },
    14: { 2:'S', 3:'S', 4:'S', 5:'S', 6:'S', 7:'H', 8:'H', 9:'H', 10:'H', 11:'H' },
    15: { 2:'S', 3:'S', 4:'S', 5:'S', 6:'S', 7:'H', 8:'H', 9:'H', 10:'H', 11:'H' },
    16: { 2:'S', 3:'S', 4:'S', 5:'S', 6:'S', 7:'H', 8:'H', 9:'H', 10:'H', 11:'H' },
    17: { 2:'S', 3:'S', 4:'S', 5:'S', 6:'S', 7:'S', 8:'S', 9:'S', 10:'S', 11:'S' },
  };

  // Soft totals (ace counted as 11)
  // A,2 = 13, A,3 = 14, etc.
  const SOFT_STRATEGY = {
    13: { 2:'H', 3:'H', 4:'H', 5:'D', 6:'D', 7:'H', 8:'H', 9:'H', 10:'H', 11:'H' }, // A,2
    14: { 2:'H', 3:'H', 4:'H', 5:'D', 6:'D', 7:'H', 8:'H', 9:'H', 10:'H', 11:'H' }, // A,3
    15: { 2:'H', 3:'H', 4:'D', 5:'D', 6:'D', 7:'H', 8:'H', 9:'H', 10:'H', 11:'H' }, // A,4
    16: { 2:'H', 3:'H', 4:'D', 5:'D', 6:'D', 7:'H', 8:'H', 9:'H', 10:'H', 11:'H' }, // A,5
    17: { 2:'H', 3:'D', 4:'D', 5:'D', 6:'D', 7:'H', 8:'H', 9:'H', 10:'H', 11:'H' }, // A,6
    18: { 2:'Ds', 3:'Ds', 4:'Ds', 5:'Ds', 6:'Ds', 7:'S', 8:'S', 9:'H', 10:'H', 11:'H' }, // A,7
    19: { 2:'S', 3:'S', 4:'S', 5:'S', 6:'Ds', 7:'S', 8:'S', 9:'S', 10:'S', 11:'S' }, // A,8
    20: { 2:'S', 3:'S', 4:'S', 5:'S', 6:'S', 7:'S', 8:'S', 9:'S', 10:'S', 11:'S' }, // A,9
  };

  // Pair splitting
  // Value is the card value (2-10, or 11 for Aces)
  const PAIR_STRATEGY = {
    2:  { 2:'P', 3:'P', 4:'P', 5:'P', 6:'P', 7:'P', 8:'H', 9:'H', 10:'H', 11:'H' },
    3:  { 2:'P', 3:'P', 4:'P', 5:'P', 6:'P', 7:'P', 8:'H', 9:'H', 10:'H', 11:'H' },
    4:  { 2:'H', 3:'H', 4:'H', 5:'P', 6:'P', 7:'H', 8:'H', 9:'H', 10:'H', 11:'H' },
    5:  { 2:'D', 3:'D', 4:'D', 5:'D', 6:'D', 7:'D', 8:'D', 9:'D', 10:'H', 11:'H' }, // Never split 5s
    6:  { 2:'P', 3:'P', 4:'P', 5:'P', 6:'P', 7:'H', 8:'H', 9:'H', 10:'H', 11:'H' },
    7:  { 2:'P', 3:'P', 4:'P', 5:'P', 6:'P', 7:'P', 8:'H', 9:'H', 10:'H', 11:'H' },
    8:  { 2:'P', 3:'P', 4:'P', 5:'P', 6:'P', 7:'P', 8:'P', 9:'P', 10:'P', 11:'P' }, // Always split 8s
    9:  { 2:'P', 3:'P', 4:'P', 5:'P', 6:'P', 7:'S', 8:'P', 9:'P', 10:'S', 11:'S' },
    10: { 2:'S', 3:'S', 4:'S', 5:'S', 6:'S', 7:'S', 8:'S', 9:'S', 10:'S', 11:'S' }, // Never split 10s
    11: { 2:'P', 3:'P', 4:'P', 5:'P', 6:'P', 7:'P', 8:'P', 9:'P', 10:'P', 11:'P' }, // Always split Aces
  };

  function getOptimalAction(playerCards, dealerUpCard, canDouble, canSplit) {
    const hand = calculateHandValue(playerCards);
    const dealerValue = dealerUpCard.isAce ? 11 : dealerUpCard.value;
    
    let action = 'H'; // Default to hit
    
    // Check for pair splitting first
    if (canSplit && isPair(playerCards)) {
      const pairValue = getPairValue(playerCards);
      if (PAIR_STRATEGY[pairValue]) {
        action = PAIR_STRATEGY[pairValue][dealerValue] || 'H';
        if (action === 'P') return { action: 'SPLIT', reason: `Split ${pairValue}s vs dealer ${dealerValue}` };
      }
    }
    
    // Soft hand strategy
    if (hand.soft && SOFT_STRATEGY[hand.value]) {
      action = SOFT_STRATEGY[hand.value][dealerValue] || 'H';
    }
    // Hard hand strategy
    else {
      const lookupValue = Math.min(Math.max(hand.value, 5), 17); // Clamp to 5-17
      if (hand.value >= 17) {
        action = 'S'; // Always stand on 17+
      } else if (HARD_STRATEGY[lookupValue]) {
        action = HARD_STRATEGY[lookupValue][dealerValue] || 'H';
      }
    }
    
    // Handle double down
    if (action === 'D' || action === 'Ds') {
      if (canDouble) {
        return { action: 'DOUBLE', reason: `Double on ${hand.soft ? 'soft ' : ''}${hand.value} vs ${dealerValue}` };
      }
      // Can't double - D means hit, Ds means stand
      action = (action === 'Ds') ? 'S' : 'H';
    }
    
    if (action === 'S') {
      return { action: 'STAND', reason: `Stand on ${hand.soft ? 'soft ' : ''}${hand.value} vs ${dealerValue}` };
    }
    
    return { action: 'HIT', reason: `Hit on ${hand.soft ? 'soft ' : ''}${hand.value} vs ${dealerValue}` };
  }

  // ====== UI ======
  function getGameState() {
    const dealerCards = document.getElementById("dealerCards");
    const playerHandsContainer = document.getElementById("playerHandsContainer");
    const gameActions = document.getElementById("gameActions");
    
    // Check if we're in an active game
    if (!gameActions) {
      log("No gameActions element");
      return null;
    }
    
    // Get dealer's up card (first visible card)
    if (!dealerCards) {
      log("No dealerCards element");
      return null;
    }
    
    const dealerCardImgs = dealerCards.querySelectorAll(".card:not(.card-back) img");
    if (!dealerCardImgs || dealerCardImgs.length === 0) {
      log("No dealer card images found");
      return null;
    }
    
    const dealerUpCard = {
      value: parseCardValue(dealerCardImgs[0].src),
      isAce: isAce(dealerCardImgs[0].src)
    };
    
    if (dealerUpCard.value === null) {
      log("Could not parse dealer card:", dealerCardImgs[0].src);
      return null;
    }
    
    // Get player cards from the active hand
    if (!playerHandsContainer) {
      log("No playerHandsContainer element");
      return null;
    }
    
    const playerHands = playerHandsContainer.querySelectorAll(".hand");
    if (!playerHands || playerHands.length === 0) {
      log("No player hands found");
      return null;
    }
    
    // Find the active hand (or first hand if no split)
    let activeHand = playerHands[0];
    // If there's a split, look for the hand that's currently active
    playerHands.forEach(hand => {
      if (hand.classList.contains("active")) {
        activeHand = hand;
      }
    });
    
    const cardsArea = activeHand.querySelector(".cards-area");
    const playerCards = getCardsFromContainer(cardsArea);
    
    if (playerCards.length === 0) {
      log("No player cards found in:", cardsArea?.innerHTML);
      return null;
    }
    
    // Get available actions
    const hitBtn = document.getElementById("hitBtn");
    const standBtn = document.getElementById("standBtn");
    const doubleBtn = document.getElementById("doubleDownBtn");
    const splitBtn = document.getElementById("splitBtn");
    
    const canDouble = doubleBtn && doubleBtn.style.display !== 'none' && !doubleBtn.disabled;
    const canSplit = splitBtn && splitBtn.style.display !== 'none' && !splitBtn.disabled;
    
    log("Game state found - Dealer:", dealerUpCard.value, "Player:", playerCards.map(c => c.value));
    
    return {
      dealerUpCard,
      playerCards,
      canDouble,
      canSplit,
      buttons: { hitBtn, standBtn, doubleBtn, splitBtn }
    };
  }

  function executeAction(action, buttons) {
    switch (action) {
      case 'HIT':
        buttons.hitBtn?.click();
        break;
      case 'STAND':
        buttons.standBtn?.click();
        break;
      case 'DOUBLE':
        buttons.doubleBtn?.click();
        break;
      case 'SPLIT':
        buttons.splitBtn?.click();
        break;
    }
  }

  function createSmartButton() {
    // Check if button already exists
    if (document.getElementById("mwc-smart-bj-btn")) {
      log("Button already exists");
      return;
    }
    
    const gameActions = document.getElementById("gameActions");
    if (!gameActions) {
      log("Cannot create button - no gameActions element");
      return;
    }
    
    log("Creating Smart Play button");
    
    // Create container for our button - styled like SmartHub
    const container = document.createElement("div");
    container.id = "mwc-smart-bj-container";
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      margin-top: 12px;
      padding: 10px 14px;
      background: linear-gradient(180deg, rgba(30,40,50,0.95) 0%, rgba(20,28,38,0.98) 100%);
      border-radius: 6px;
      border: 1px solid rgba(255,215,0,0.25);
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;
    
    // Header label
    const header = document.createElement("div");
    header.innerHTML = '<i class="fa-solid fa-brain" style="margin-right: 5px;"></i>SMART PLAY';
    header.style.cssText = `
      color: #ffd700;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    `;
    
    // Create the smart play button
    const btn = document.createElement("button");
    btn.id = "mwc-smart-bj-btn";
    btn.type = "button";
    btn.textContent = "AUTO";
    btn.style.cssText = `
      background: linear-gradient(180deg, #ffd700 0%, #e6ac00 100%);
      color: #000;
      font-weight: 700;
      font-size: 13px;
      padding: 8px 28px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(255,215,0,0.3);
      transition: all 0.15s ease;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    `;
    btn.onmouseover = () => {
      btn.style.background = "linear-gradient(180deg, #ffe44d 0%, #ffd700 100%)";
      btn.style.boxShadow = "0 3px 10px rgba(255,215,0,0.5)";
    };
    btn.onmouseout = () => {
      btn.style.background = "linear-gradient(180deg, #ffd700 0%, #e6ac00 100%)";
      btn.style.boxShadow = "0 2px 6px rgba(255,215,0,0.3)";
    };
    
    // Create recommendation display
    const recommendation = document.createElement("div");
    recommendation.id = "mwc-smart-bj-rec";
    recommendation.style.cssText = `
      color: #a0aec0;
      font-size: 11px;
      text-align: center;
      min-height: 16px;
      line-height: 1.3;
    `;
    
    btn.onclick = () => {
      const state = getGameState();
      
      // Check if game is over (Play Again visible)
      const playAgainBtn = document.getElementById("playAgainBtn");
      const endGameActions = document.getElementById("endGameActions");
      const isGameOver = endGameActions && getComputedStyle(endGameActions).display !== 'none';
      
      if (isGameOver && playAgainBtn) {
        recommendation.innerHTML = '<span style="color: #4ade80;">↻ New hand...</span>';
        playAgainBtn.click();
        return;
      }
      
      if (!state) {
        recommendation.innerHTML = '<span style="color: #f87171;">No active game</span>';
        return;
      }
      
      const result = getOptimalAction(
        state.playerCards,
        state.dealerUpCard,
        state.canDouble,
        state.canSplit
      );
      
      // Color-code the action
      let actionColor = '#ffd700';
      if (result.action === 'HIT') actionColor = '#60a5fa';
      else if (result.action === 'STAND') actionColor = '#4ade80';
      else if (result.action === 'DOUBLE') actionColor = '#f59e0b';
      else if (result.action === 'SPLIT') actionColor = '#c084fc';
      
      recommendation.innerHTML = `<span style="color: ${actionColor}; font-weight: 600;">→ ${result.action}</span>`;
      executeAction(result.action, state.buttons);
    };
    
    container.appendChild(header);
    container.appendChild(btn);
    container.appendChild(recommendation);
    
    // Insert after game actions (inside the table-felt div for visibility)
    const tableFelt = document.querySelector(".table-felt");
    if (tableFelt) {
      tableFelt.appendChild(container);
    } else {
      gameActions.parentNode.insertBefore(container, gameActions.nextSibling);
    }
    
    log("Button inserted into DOM");
    
    // Auto-update recommendation on game state changes
    updateRecommendation(recommendation);
  }

  function updateRecommendation(recElement) {
    if (!recElement) recElement = document.getElementById("mwc-smart-bj-rec");
    if (!recElement) return;
    
    // Check if game is over
    const endGameActions = document.getElementById("endGameActions");
    const isGameOver = endGameActions && getComputedStyle(endGameActions).display !== 'none';
    
    if (isGameOver) {
      recElement.innerHTML = `<span style="color: #4ade80;">✓ Click to play again</span>`;
      return;
    }
    
    const state = getGameState();
    if (!state) {
      recElement.textContent = "";
      return;
    }
    
    const result = getOptimalAction(
      state.playerCards,
      state.dealerUpCard,
      state.canDouble,
      state.canSplit
    );
    
    const hand = calculateHandValue(state.playerCards);
    
    // Color-code the action
    let actionColor = '#ffd700'; // gold default
    if (result.action === 'HIT') actionColor = '#60a5fa'; // blue
    else if (result.action === 'STAND') actionColor = '#4ade80'; // green
    else if (result.action === 'DOUBLE') actionColor = '#f59e0b'; // orange
    else if (result.action === 'SPLIT') actionColor = '#c084fc'; // purple
    
    recElement.innerHTML = `
      <span style="color: #64748b;">${hand.soft ? 'Soft ' : ''}${hand.value} vs ${state.dealerUpCard.value}</span>
      <span style="color: ${actionColor}; font-weight: 600;"> → ${result.action}</span>
    `;
  }

  // ====== INITIALIZATION ======
  let updateTimeout = null;
  let initAttempts = 0;
  
  function isGameVisible() {
    const gameTable = document.getElementById("gameTable");
    const gameActions = document.getElementById("gameActions");
    
    // Check if elements exist and are not explicitly hidden
    if (!gameTable || !gameActions) return false;
    
    // Check various ways elements could be hidden
    const tableHidden = gameTable.style.display === 'none' || 
                        getComputedStyle(gameTable).display === 'none';
    const actionsHidden = gameActions.style.display === 'none' || 
                          getComputedStyle(gameActions).display === 'none';
    
    return !tableHidden && !actionsHidden;
  }

  function ensureMessageAreaBelowTable() {
    const gameTable = document.getElementById("gameTable");
    const messageArea = document.getElementById("messageArea");

    if (!gameTable || !messageArea) return;

    if (gameTable.nextElementSibling !== messageArea) {
      gameTable.insertAdjacentElement("afterend", messageArea);
      log("Moved messageArea below gameTable");
    }
  }
  
  function tryCreateButton() {
    ensureMessageAreaBelowTable();

    if (isGameVisible()) {
      createSmartButton();
      updateRecommendation();
      return true;
    }
    return false;
  }
  
  function init() {
    log("Initializing...");

    // Keep win/loss message panel directly under the table.
    ensureMessageAreaBelowTable();
    
    // Try immediately
    if (tryCreateButton()) {
      log("Button created on first try");
    }
    
    // Also poll for a bit in case the game loads dynamically
    const pollInterval = setInterval(() => {
      initAttempts++;
      if (tryCreateButton() || initAttempts > 50) {
        clearInterval(pollInterval);
        if (initAttempts > 50) {
          log("Gave up polling, will rely on observer");
        }
      }
    }, 200);
    
    // Watch for game state changes (throttled)
    const observer = new MutationObserver((mutations) => {
      // Keep message area in the right spot as soon as DOM updates occur.
      ensureMessageAreaBelowTable();

      // Throttle updates to prevent freezing
      if (updateTimeout) return;
      
      updateTimeout = setTimeout(() => {
        updateTimeout = null;
        tryCreateButton();
      }, 100); // 100ms throttle
    });
    
    // Observe document body for any changes
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });
    
    log("MWC Smart BlackJack loaded - observer active");
  }

  // Start immediately and also on various ready states
  init();
  
  if (document.readyState !== "complete") {
    window.addEventListener("load", () => {
      log("Window load event");
      tryCreateButton();
    });
  }
  
  } // end initBlackjack
})();
