// ==UserScript==
// @name         MWC House Amenity Extractor
// @namespace    MWC
// @version      1.0
// @description  Extracts all house amenity data from the MWC Item Guide
// @match        https://mobwarscity.com/itemguide*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Wait for page to fully load
    window.addEventListener('load', function() {
        // Add extract button to page
        const btn = document.createElement('button');
        btn.textContent = '📋 Extract Amenity Data';
        btn.style.cssText = 'position:fixed;top:10px;right:10px;z-index:99999;padding:12px 20px;background:#4CAF50;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:16px;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
        btn.addEventListener('click', extractAmenities);
        document.body.appendChild(btn);
    });

    function extractAmenities() {
        const items = document.querySelectorAll('.item.inventory');
        const amenities = [];

        items.forEach(item => {
            const name = (item.getAttribute('data-searchterm') || '').trim();
            if (!name) return;

            const desc = (item.querySelector('.itemDesc')?.textContent || '').trim();
            const stats = item.querySelectorAll('.itemStat');

            let rarity = '';
            let maxDeploy = 0;
            let sizeW = 0;
            let sizeH = 0;
            let requires = [];
            let requiresSpecific = '';
            let effects = {};
            let educationTime = '';

            stats.forEach(stat => {
                const text = stat.textContent.trim().replace(/\s+/g, ' ');

                // Rarity (first stat with background color, contains rarity text)
                if (/^(Common|Uncommon|Rare|Very Rare|Epic|Legendary)$/i.test(text)) {
                    rarity = text;
                    return;
                }

                // Max Deployable
                if (text.includes('Max Deployable')) {
                    const match = text.match(/(\d+)\s*Max Deployable/);
                    if (match) maxDeploy = parseInt(match[1]);
                    return;
                }

                // Size
                if (text.includes('Size')) {
                    const match = text.match(/(\d+)x(\d+)\s*Size/);
                    if (match) {
                        sizeW = parseInt(match[1]);
                        sizeH = parseInt(match[2]);
                    }
                    return;
                }

                // Education Time
                if (text.includes('Education Time')) {
                    const match = text.match(/([-+]?\d+%?)/);
                    if (match) educationTime = match[1];
                    return;
                }

                // Requires (from tippy-content or text)
                if (text.includes('Requires')) {
                    const tippy = stat.getAttribute('data-tippy-content');
                    if (tippy) {
                        // "Requires One Of..." - parse from tippy tooltip
                        requires = tippy.split('<br>').map(s => s.trim()).filter(Boolean);
                    } else {
                        // "Requires <strong>Toilet</strong>" style
                        const strong = stat.querySelector('strong');
                        if (strong) {
                            requiresSpecific = strong.textContent.trim();
                            requires = [requiresSpecific];
                        }
                    }
                    return;
                }

                // Stat effects: "+10% Speed", "+5 Energy", "-2 Nerve", etc.
                const effectMatch = text.match(/^([+-]?\d+%?)\s+(.+)$/);
                if (effectMatch) {
                    const value = effectMatch[1];
                    const statName = effectMatch[2].trim();
                    effects[statName] = value;
                }
            });

            amenities.push({
                name,
                rarity,
                maxDeploy,
                size: `${sizeW}x${sizeH}`,
                sizeW,
                sizeH,
                requires,
                effects,
                educationTime: educationTime || null,
                description: desc
            });
        });

        // Display results
        console.log('=== MWC HOUSE AMENITIES DATA ===');
        console.log(JSON.stringify(amenities, null, 2));
        console.log(`Total amenities found: ${amenities.length}`);

        // Copy to clipboard
        const jsonStr = JSON.stringify(amenities, null, 2);
        navigator.clipboard.writeText(jsonStr).then(() => {
            alert(`✅ Extracted ${amenities.length} amenities!\n\nData copied to clipboard as JSON.\n\nAlso logged to console (F12).`);
        }).catch(() => {
            // Fallback: show in a textarea for manual copy
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:999999;display:flex;align-items:center;justify-content:center;';

            const container = document.createElement('div');
            container.style.cssText = 'background:#1a1a2e;padding:20px;border-radius:12px;width:80%;max-height:80%;display:flex;flex-direction:column;';

            const header = document.createElement('div');
            header.style.cssText = 'color:#4CAF50;font-size:18px;font-weight:bold;margin-bottom:10px;';
            header.textContent = `✅ Extracted ${amenities.length} amenities! Select all and copy:`;

            const textarea = document.createElement('textarea');
            textarea.value = jsonStr;
            textarea.style.cssText = 'width:100%;flex:1;min-height:400px;background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:6px;padding:12px;font-family:monospace;font-size:12px;';

            const closeBtn = document.createElement('button');
            closeBtn.textContent = 'Close';
            closeBtn.style.cssText = 'margin-top:10px;padding:8px 20px;background:#e74c3c;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;';
            closeBtn.addEventListener('click', () => overlay.remove());

            container.appendChild(header);
            container.appendChild(textarea);
            container.appendChild(closeBtn);
            overlay.appendChild(container);
            document.body.appendChild(overlay);

            textarea.select();
        });

        return amenities;
    }
})();
