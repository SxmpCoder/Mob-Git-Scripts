// ==UserScript==
// @name         Highlight Warehouse Buds
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Adds a glowing outline to all warehouse buds
// @match        https://mobwarscity.com/*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    GM_addStyle(`
        @keyframes budPulse {
            0%, 100% {
                box-shadow: 0 0 8px 3px rgba(255, 50, 200, 0.5),
                            0 0 16px 6px rgba(255, 50, 200, 0.2);
            }
            50% {
                box-shadow: 0 0 16px 6px rgba(255, 50, 200, 0.8),
                            0 0 32px 12px rgba(255, 50, 200, 0.4);
            }
        }

        @keyframes statPulse {
            0%, 100% {
                text-shadow: 0 0 8px rgba(255, 50, 200, 0.6);
                transform: scale(1);
            }
            50% {
                text-shadow: 0 0 20px rgba(255, 50, 200, 1), 0 0 40px rgba(255, 50, 200, 0.5);
                transform: scale(1.1);
            }
        }

        .warehouseBud {
            outline: 3px solid #ff32c8 !important;
            outline-offset: 2px !important;
            border-radius: 50% !important;
            animation: budPulse 1.5s ease-in-out infinite !important;
        }

        .warehouseBud:hover {
            outline-color: #ff80dd !important;
            box-shadow: 0 0 20px 8px rgba(255, 50, 200, 0.9),
                        0 0 40px 16px rgba(255, 50, 200, 0.5) !important;
            animation: none !important;
        }

        .warehouseStatBuds.has-buds {
            color: #ff32c8 !important;
            font-size: 2.2em !important;
            font-weight: bold !important;
            animation: statPulse 1.5s ease-in-out infinite !important;
            display: inline-block !important;
        }
    `);

    // Highlight the harvestable buds stat if > 0
    const budStat = document.querySelector('.warehouseStatBuds');
    if (budStat && parseInt(budStat.textContent.trim(), 10) > 0) {
        budStat.classList.add('has-buds');
    }

    // Watch for dynamic updates
    if (budStat) {
        const observer = new MutationObserver(() => {
            const count = parseInt(budStat.textContent.trim(), 10);
            budStat.classList.toggle('has-buds', count > 0);
        });
        observer.observe(budStat, { childList: true, characterData: true, subtree: true });
    }
})();
