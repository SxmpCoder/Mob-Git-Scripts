// ==UserScript==
// @name         MWC UI Overhaul
// @namespace    http://mobwarscity.com/
// @version      1.0.1
// @description  Better looking UI with improved button colors and styling
// @match        *://mobwarscity.com/*
// @match        *://www.mobwarscity.com/*
// @grant        GM_addStyle
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    const customCSS = `
    /* ===== ROUNDED BUTTONS SITE-WIDE ===== */
    .button,
    button,
    button.secondary,
    input[type="submit"] {
        border-radius: 8px !important;
    }

    /* ===== KILL CYAN BUTTONS — CITY PAGE ONLY ===== */
    .citySection .button,
    .citySection button.secondary,
    .citySection input[type="submit"],
    .cityPageHeader .button,
    .cityPageHeader button.secondary,
    .cityPageHeader input[type="submit"],
    .travelBtn .button,
    .travelBtn input[type="submit"] {
        background: linear-gradient(145deg, rgba(45, 55, 72, 0.9), rgba(26, 32, 44, 0.95)) !important;
        border: 1px solid rgba(139, 132, 204, 0.25) !important;
        border-radius: 8px !important;
        color: #fff !important;
        transition: all 0.2s ease;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3),
                    inset 0 1px 0 rgba(255, 255, 255, 0.05);
    }

    .citySection .button:hover,
    .citySection button.secondary:hover,
    .citySection input[type="submit"]:hover,
    .cityPageHeader .button:hover,
    .cityPageHeader button.secondary:hover,
    .cityPageHeader input[type="submit"]:hover,
    .travelBtn .button:hover,
    .travelBtn input[type="submit"]:hover {
        background: linear-gradient(145deg, rgba(79, 70, 229, 0.35), rgba(55, 48, 163, 0.4)) !important;
        border-color: rgba(165, 160, 210, 0.5) !important;
        box-shadow: 0 3px 8px rgba(99, 102, 241, 0.15),
                    inset 0 1px 0 rgba(255, 255, 255, 0.08);
    }

    /* ===== CITY LINK BUTTONS OVERHAUL ===== */
    .citySectionLinks {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
        padding: 12px;
        background: rgba(10, 14, 30, 1);
    }

    /* Full-width sections get more columns */
    .citySection:has(.townHall) .citySectionLinks {
        grid-template-columns: repeat(4, 1fr);
    }

    .cityLink {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        min-width: 0;
        background: linear-gradient(145deg, rgba(45, 55, 72, 0.9), rgba(26, 32, 44, 0.95)) !important;
        border: 1px solid rgba(139, 132, 204, 0.25) !important;
        border-radius: 8px;
        color: #fff !important;
        text-decoration: none !important;
        font-size: 0.9em;
        font-weight: 500;
        transition: all 0.2s ease;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3),
                    inset 0 1px 0 rgba(255, 255, 255, 0.05);
    }

    .cityLink:hover {
        background: linear-gradient(145deg, rgba(79, 70, 229, 0.35), rgba(55, 48, 163, 0.4)) !important;
        border-color: rgba(165, 160, 210, 0.5) !important;
        color: #fff !important;
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2),
                    inset 0 1px 0 rgba(255, 255, 255, 0.08);
        transform: translateY(-1px);
    }

    .cityLink:active {
        transform: translateY(0);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    }

    .cityLink > i {
        color: #9b97c7 !important;
        font-size: 1em;
        width: 1.2em;
        text-align: center;
        flex-shrink: 0;
        transition: color 0.2s ease;
    }

    .cityLink:hover > i {
        color: #bbb7db !important;
    }

    /* Global trader links */
    .cityLink--global {
        background: linear-gradient(145deg, rgba(40, 50, 80, 0.9), rgba(25, 30, 55, 0.95)) !important;
        border-color: rgba(147, 155, 205, 0.3) !important;
    }

    .cityLink--global:hover {
        background: linear-gradient(145deg, rgba(70, 65, 150, 0.4), rgba(55, 48, 130, 0.5)) !important;
        border-color: rgba(165, 170, 215, 0.5) !important;
        box-shadow: 0 4px 12px rgba(99, 102, 180, 0.25);
    }

    .cityLink--global > i {
        color: #a9b0d6 !important;
    }

    /* Boss fights link */
    .cityLink--boss-fights {
        background: linear-gradient(145deg, rgba(127, 29, 29, 0.9), rgba(69, 10, 10, 0.95));
        border-color: rgba(248, 113, 113, 0.3);
    }

    .cityLink--boss-fights:hover {
        background: linear-gradient(145deg, rgba(220, 38, 38, 0.4), rgba(185, 28, 28, 0.5));
        border-color: rgba(252, 165, 165, 0.6);
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
    }

    .cityLink--boss-fights > i {
        color: #fca5a5;
    }

    /* ===== SECTION HEADERS OVERHAUL ===== */
    .citySectionHeader {
        position: relative;
        padding: 14px 18px;
        border-bottom: 2px solid rgba(99, 102, 241, 0.3);
        background-size: cover !important;
        background-position: center !important;
        width: 100% !important;
        box-sizing: border-box !important;
    }

    .citySectionHeader .citySectionOverlay {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100% !important;
        height: 100% !important;
        background: linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.4) 100%) !important;
    }

    .citySectionTitle {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 1.1em;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #fff;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    }

    .citySectionTitle i {
        color: #9b97c7;
        font-size: 1.1em;
    }

    /* Commerce section */
    .commerceArea {
        background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%) !important;
    }

    .commerceArea .citySectionTitle i {
        color: #93b5cf;
    }

    /* Activities/Gambling section */
    .gamblingArea {
        background: linear-gradient(135deg, #4a1d5e 0%, #1a0a2e 100%) !important;
    }

    .gamblingArea .citySectionTitle i {
        color: #e879f9;
    }

    /* Gang/Mafia section */
    .mafia {
        background: linear-gradient(135deg, #5c1a1a 0%, #1f0808 100%) !important;
    }

    .mafia .citySectionTitle i {
        color: #f87171;
    }

    /* Education section */
    .education {
        background: linear-gradient(135deg, #1e4d3a 0%, #0a1f15 100%) !important;
    }

    .education .citySectionTitle i {
        color: #6ee7b7;
    }

    /* Town Hall section */
    .townHall {
        background: linear-gradient(135deg, #3d3a1e 0%, #1a1908 100%) !important;
    }

    .townHall .citySectionTitle i {
        color: #fde047;
    }

    /* Challenge section */
    .challengeArea {
        background: linear-gradient(135deg, #3b1d5c 0%, #15082e 100%) !important;
    }

    /* ===== CHALLENGE SECTION IMPROVEMENTS ===== */
    .citySection--challenge .challengeTimer {
        background: linear-gradient(135deg, rgba(79, 70, 180, 0.3), rgba(110, 115, 190, 0.2));
        border: 1px solid rgba(139, 132, 204, 0.35);
        color: #fff;
        border-radius: 6px;
    }

    .citySection--challenge .challengeBody {
        background: rgba(15, 23, 42, 0.6);
    }

    .citySection--challenge .leaderboardEntry {
        background: rgba(51, 65, 85, 0.3);
        border-radius: 6px;
        border-left: 3px solid transparent;
    }

    .citySection--challenge .leaderboardEntry:hover {
        background: rgba(71, 85, 105, 0.4);
    }

    .citySection--challenge .leaderboardEntry.isCurrentUser {
        background: linear-gradient(90deg, rgba(99, 102, 241, 0.2), rgba(79, 70, 229, 0.1));
        border-left: 3px solid #818cf8;
    }

    .citySection--challenge .entryProgress {
        color: #fff;
    }

    .citySection--challenge .progressAmount {
        color: #fff;
        text-shadow: 0 0 20px rgba(168, 158, 212, 0.4);
    }

    .citySection--challenge .challengeYourProgress {
        background: linear-gradient(135deg, rgba(79, 70, 229, 0.15), rgba(49, 46, 129, 0.2));
        border-radius: 8px;
        border: 1px solid rgba(129, 140, 248, 0.2);
    }

    .citySection--challenge .entryRewards {
        background: linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(245, 158, 11, 0.1));
        border: 1px solid rgba(251, 191, 36, 0.3);
        border-radius: 6px;
    }

    .citySection--challenge .entryRewards:hover {
        background: linear-gradient(135deg, rgba(251, 191, 36, 0.25), rgba(245, 158, 11, 0.2));
        border-color: rgba(251, 191, 36, 0.5);
    }

    .citySection--challenge .challengeSubtitle {
        color: #fff;
        border-bottom: 1px solid rgba(148, 163, 184, 0.2);
    }

    .citySection--challenge .challengeSubtitle i {
        color: #9b97c7;
    }

    .citySection--challenge .challengeMetric i {
        color: #9b97c7;
    }

    .citySection--challenge .challengeName {
        color: #fff !important;
    }

    .citySection--challenge .challengeMetric {
        color: #fff !important;
    }

    .citySection--challenge .challengeDesc {
        color: rgba(255, 255, 255, 0.6) !important;
    }

    .citySection--challenge .progressRank {
        color: #fff !important;
    }

    /* ===== CITY SECTIONS CONTAINER ===== */
    .citySections {
        display: grid;
        gap: 16px;
    }

    .citySection {
        background: rgb(15, 23, 42);
        border: 1px solid rgba(90, 85, 140, 0.15);
        border-radius: 10px;
        overflow: hidden;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
        transition: border-color 0.3s ease, box-shadow 0.3s ease;
    }

    .citySection:hover {
        border-color: rgba(90, 85, 140, 0.3);
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
    }

    /* ===== BUTTON ANIMATIONS ===== */
    @keyframes buttonGlow {
        0%, 100% { box-shadow: 0 0 5px rgba(90, 85, 140, 0.3); }
        50% { box-shadow: 0 0 15px rgba(90, 85, 140, 0.4); }
    }

    .cityLink:focus {
        outline: none;
        animation: buttonGlow 1.5s ease-in-out infinite;
    }

    /* ===== BADGE STYLING ===== */
    .cityLink-badge {
        background: linear-gradient(135deg, #dc2626, #b91c1c) !important;
        color: #fff !important;
        font-size: 0.75em;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 10px;
        min-width: 18px;
        text-align: center;
    }

    .cityLink-badge--gold {
        background: linear-gradient(135deg, #f59e0b, #d97706) !important;
        color: #fff !important;
    }

    .cityLink-badge--gold i {
        color: #fff !important;
    }

    /* Gold glow on auction button when admin auction active */
    .cityLink--auction-active {
        border-color: rgba(245, 158, 11, 0.5) !important;
        box-shadow: 0 0 12px rgba(245, 158, 11, 0.3),
                    0 0 24px rgba(245, 158, 11, 0.15),
                    inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
        animation: auctionGlow 2s ease-in-out infinite !important;
    }

    .cityLink--auction-active:hover {
        border-color: rgba(245, 158, 11, 0.7) !important;
        box-shadow: 0 0 16px rgba(245, 158, 11, 0.4),
                    0 0 32px rgba(245, 158, 11, 0.2) !important;
    }

    @keyframes auctionGlow {
        0%, 100% { box-shadow: 0 0 8px rgba(245, 158, 11, 0.2), 0 0 16px rgba(245, 158, 11, 0.1); }
        50% { box-shadow: 0 0 16px rgba(245, 158, 11, 0.4), 0 0 32px rgba(245, 158, 11, 0.2); }
    }

    /* ===== CITY PAGE HEADER ===== */
    .cityPageHeader {
        background: linear-gradient(135deg, rgba(25, 30, 55, 0.9), rgba(15, 18, 35, 0.95)) !important;
        border: 1px solid rgba(90, 85, 140, 0.15) !important;
        border-radius: 10px !important;
        padding: 16px 20px !important;
        margin-bottom: 16px !important;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .cityPageHeader h1 {
        color: #fff !important;
        font-size: 1.4em;
        margin: 0;
    }

    .cityPageHeader .mobsterCount {
        color: #fff !important;
        text-decoration: none;
        font-size: 0.85em;
        transition: opacity 0.2s ease;
    }

    .cityPageHeader .mobsterCount:hover {
        opacity: 0.8;
    }

    .cityPageHeader .mobsterCount i {
        color: #9b97c7 !important;
        margin-right: 4px;
    }

    /* Travel button */
    .travelBtn .button,
    .travelBtn a {
        background: linear-gradient(145deg, rgba(45, 55, 72, 0.9), rgba(26, 32, 44, 0.95)) !important;
        border: 1px solid rgba(139, 132, 204, 0.25) !important;
        border-radius: 8px !important;
        color: #fff !important;
        padding: 10px 18px;
        font-weight: 600;
        font-size: 0.9em;
        text-decoration: none !important;
        transition: all 0.2s ease;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3),
                    inset 0 1px 0 rgba(255, 255, 255, 0.05);
    }

    .travelBtn .button:hover,
    .travelBtn a:hover {
        background: linear-gradient(145deg, rgba(79, 70, 229, 0.35), rgba(55, 48, 163, 0.4)) !important;
        border-color: rgba(165, 160, 210, 0.5) !important;
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2),
                    inset 0 1px 0 rgba(255, 255, 255, 0.08);
    }

    .travelBtn .button i,
    .travelBtn a i {
        color: #9b97c7 !important;
    }

    /* ===== FOOTER STATS (Mobsters Online — city page) ===== */
    .smugglers-list {
        display: flex;
        gap: 12px;
        padding: 0;
        margin: 16px 0;
        list-style: none;
    }

    .smugglers-list li {
        background: linear-gradient(145deg, rgba(25, 30, 55, 0.9), rgba(15, 18, 35, 0.95)) !important;
        border: 1px solid rgba(90, 85, 140, 0.15) !important;
        border-radius: 8px !important;
        overflow: hidden;
        transition: border-color 0.2s ease;
    }

    .smugglers-list li:hover {
        border-color: rgba(90, 85, 140, 0.3) !important;
    }

    .smugglers-list li a {
        color: #fff !important;
        text-decoration: none !important;
        transition: opacity 0.2s ease;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
    }

    .smugglers-list li a:hover {
        opacity: 0.85;
    }

    .smugglers-list .number {
        color: #fff !important;
        font-weight: 700;
        font-size: 1.2em;
    }

    .smugglers-list .text {
        color: rgba(255, 255, 255, 0.7) !important;
        font-size: 0.8em;
        text-transform: uppercase;
        letter-spacing: 0.3px;
    }

    /* ===== SECTION THEME COLOR BLEEDING ===== */
    /* Commerce — blue tint */
    .citySection:has(.commerceArea) .cityLink:hover {
        background: linear-gradient(145deg, rgba(30, 58, 95, 0.5), rgba(20, 40, 70, 0.6)) !important;
        border-color: rgba(147, 181, 207, 0.4) !important;
    }
    .citySection:has(.commerceArea) .cityLink > i { color: #93b5cf !important; }

    /* Gambling — magenta tint */
    .citySection:has(.gamblingArea) .cityLink:hover {
        background: linear-gradient(145deg, rgba(74, 29, 94, 0.5), rgba(50, 20, 70, 0.6)) !important;
        border-color: rgba(232, 121, 249, 0.35) !important;
    }
    .citySection:has(.gamblingArea) .cityLink > i { color: #e879f9 !important; }

    /* Mafia — red tint */
    .citySection:has(.mafia) .cityLink:hover {
        background: linear-gradient(145deg, rgba(92, 26, 26, 0.5), rgba(60, 15, 15, 0.6)) !important;
        border-color: rgba(248, 113, 113, 0.35) !important;
    }
    .citySection:has(.mafia) .cityLink > i { color: #f87171 !important; }

    /* Education — green tint */
    .citySection:has(.education) .cityLink:hover {
        background: linear-gradient(145deg, rgba(30, 77, 58, 0.5), rgba(20, 55, 40, 0.6)) !important;
        border-color: rgba(110, 231, 183, 0.35) !important;
    }
    .citySection:has(.education) .cityLink > i { color: #6ee7b7 !important; }

    /* Town Hall — gold tint */
    .citySection:has(.townHall) .cityLink:hover {
        background: linear-gradient(145deg, rgba(61, 58, 30, 0.5), rgba(45, 42, 18, 0.6)) !important;
        border-color: rgba(253, 224, 71, 0.35) !important;
    }
    .citySection:has(.townHall) .cityLink > i { color: #fde047 !important; }

    /* Challenge — purple tint */
    .citySection:has(.challengeArea) .cityLink:hover {
        background: linear-gradient(145deg, rgba(59, 29, 92, 0.5), rgba(40, 18, 65, 0.6)) !important;
        border-color: rgba(167, 139, 250, 0.35) !important;
    }
    .citySection:has(.challengeArea) .cityLink > i { color: #a78bfa !important; }

    /* ===== GRID LINKS (Gang Actions, etc.) ===== */
    .gridLinks {
        display: grid !important;
        grid-template-columns: repeat(4, 1fr) !important;
        gap: 8px !important;
        padding: 12px !important;
    }

    .gridLinks .button {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 8px !important;
        padding: 12px 14px !important;
        background: linear-gradient(145deg, rgba(30, 55, 75, 0.95), rgba(18, 35, 50, 0.95)) !important;
        border: 1px solid rgba(56, 189, 248, 0.2) !important;
        border-radius: 8px !important;
        color: #fff !important;
        text-decoration: none !important;
        font-size: 0.85em !important;
        font-weight: 500 !important;
        text-align: center !important;
        transition: all 0.2s ease !important;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4),
                    inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;
        width: 100% !important;
        box-sizing: border-box !important;
    }

    .gridLinks .button:hover {
        background: linear-gradient(145deg, rgba(20, 80, 110, 0.5), rgba(15, 60, 85, 0.55)) !important;
        border-color: rgba(56, 189, 248, 0.4) !important;
        box-shadow: 0 3px 10px rgba(56, 189, 248, 0.12),
                    inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
    }

    .gridLinks .button i {
        color: #7dd3e8 !important;
    }
    `;

    // Primary injection via GM_addStyle (handles document-start timing)
    if (typeof GM_addStyle !== 'undefined') {
        GM_addStyle(customCSS);
    } else {
        const styleElement = document.createElement('style');
        styleElement.textContent = customCSS;
        document.head.appendChild(styleElement);
    }

    // Backup: re-inject on soft navigation (pushState/popstate)
    function ensureStyles() {
        const existing = document.querySelector('style[data-mwc-overhaul]');
        if (existing) return;
        const el = document.createElement('style');
        el.setAttribute('data-mwc-overhaul', '1');
        el.textContent = customCSS;
        (document.head || document.documentElement).appendChild(el);
    }

    // Catch back/forward and bfcache
    window.addEventListener('pageshow', ensureStyles);
    window.addEventListener('popstate', ensureStyles);

    // Catch pushState navigation the game may use
    const origPushState = history.pushState;
    history.pushState = function() {
        origPushState.apply(this, arguments);
        setTimeout(ensureStyles, 50);
    };

    const origReplaceState = history.replaceState;
    history.replaceState = function() {
        origReplaceState.apply(this, arguments);
        setTimeout(ensureStyles, 50);
    };

    console.log('MWC UI Overhaul loaded successfully!');
})();
