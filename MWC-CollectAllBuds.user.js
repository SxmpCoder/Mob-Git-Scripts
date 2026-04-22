// ==UserScript==
// @name         MWC - Collect All Buds
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Adds a Collect All button above the warehouse plant grid
// @match        https://mobwarscity.com/*
// @match        https://www.mobwarscity.com/*
// @run-at       document-end
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    GM_addStyle(`
        #mwcCollectAllBtn {
            display: block;
            width: 100%;
            margin: 8px 0 12px;
            padding: 10px 16px;
            background: linear-gradient(135deg, rgba(255, 50, 200, 0.25), rgba(180, 0, 255, 0.25));
            border: 1px solid rgba(255, 50, 200, 0.6);
            border-radius: 8px;
            color: #ff80dd;
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.05em;
            cursor: pointer;
            transition: all 0.2s ease;
            text-align: center;
        }

        #mwcCollectAllBtn:hover:not(:disabled) {
            background: linear-gradient(135deg, rgba(255, 50, 200, 0.4), rgba(180, 0, 255, 0.4));
            box-shadow: 0 0 14px rgba(255, 50, 200, 0.5);
            color: #fff;
        }

        #mwcCollectAllBtn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    `);

    function injectCollectAllButton() {
        if (document.getElementById('mwcCollectAllBtn')) return;

        const grid = document.getElementById('plantsGrid');
        if (!grid) return;

        const buds = grid.querySelectorAll('.warehouseBud');

        const btn = document.createElement('button');
        btn.id = 'mwcCollectAllBtn';
        btn.textContent = `🌸 Collect All Buds (${buds.length})`;
        btn.disabled = buds.length === 0;

        btn.addEventListener('click', async () => {
            const allBuds = grid.querySelectorAll('.warehouseBud');
            if (!allBuds.length) {
                btn.textContent = '✅ Nothing to collect';
                return;
            }

            btn.disabled = true;
            let collected = 0;

            for (const bud of allBuds) {
                bud.click();
                collected++;
                btn.textContent = `⏳ Collecting... (${collected}/${allBuds.length})`;
                await new Promise(r => setTimeout(r, 300));
            }

            btn.textContent = `✅ Collected ${collected} bud${collected !== 1 ? 's' : ''}!`;
            setTimeout(() => {
                const remaining = grid.querySelectorAll('.warehouseBud').length;
                btn.disabled = remaining === 0;
                btn.textContent = remaining > 0
                    ? `🌸 Collect All Buds (${remaining})`
                    : '🌸 Collect All Buds (0)';
            }, 2000);
        });

        grid.parentNode.insertBefore(btn, grid);
        console.log('[MWC] Collect All button injected for', buds.length, 'buds');
    }

    injectCollectAllButton();

    const gridObserver = new MutationObserver(() => injectCollectAllButton());
    gridObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
