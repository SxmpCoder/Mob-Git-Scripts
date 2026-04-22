// ==UserScript==
// @name         MWC - Waterboard Button
// @namespace    http://tampermonkey.net/
// @version      4.2.0
// @description  Adds waterboard buttons to low-energy users on boss fight pages
// @author       MountainDewd
// @match        https://mobwarscity.com/*
// @match        https://www.mobwarscity.com/*
// @run-at       document-end
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  // Prevent script running in the outer frame
  if (window.top === window.self) return;

  const K_LAST_FIGHT_URL = 'mwc_last_fight_url';
  const K_SHOW_ENERGY_BANNER = 'mwc_show_energy_banner';

  // ====== AJAX WATERBOARD ======
  async function ajaxWaterboard(userId) {
    try {
      const formData = new FormData();
      formData.append('confirm', '1');
      
      const response = await fetch(`/waterboard.php?target=${userId}`, {
        method: 'POST',
        credentials: 'same-origin',
        body: formData
      });

      if (response.ok) {
        const text = await response.text();
        console.log('[MWC-Waterboard] Waterboard response for user', userId, '- length:', text.length);
        return { success: true, html: text };
      }
      return { success: false, error: 'Request failed: ' + response.status };
    } catch (e) {
      console.log('[MWC-Waterboard] AJAX error:', e);
      return { success: false, error: e.message };
    }
  }

  // ====== ERROR PAGE - REDIRECT BACK TO FIGHT ======
  function handleErrorPage() {
    // Check if we're on the /fight error page
    if (!location.pathname.includes('/fight')) return;
    
    // Don't run on fight setup pages (they have IDs)
    if (location.pathname.match(/\/fight\/\d+/)) return;

    // Look for error message - try multiple selectors
    const errorMsg = document.querySelector('.message.errorMessage') ||
                     document.querySelector('.errorMessage') ||
                     document.querySelector('[class*="error"]');
    
    if (!errorMsg) {
      console.log('[MWC-Waterboard] No error message found on /fight page');
      return;
    }

    const pageText = document.body.textContent || '';
    const hasEnergyError = pageText.includes('Does not have enough energy') || 
                          pageText.includes('must have more than 10 energy');
    
    if (!hasEnergyError) {
      console.log('[MWC-Waterboard] Not a low energy error');
      return;
    }

    console.log('[MWC-Waterboard] Low energy error detected!');

    // Get the fight URL to redirect back to
    const lastFightUrl = sessionStorage.getItem(K_LAST_FIGHT_URL);
    
    console.log('[MWC-Waterboard] Last fight URL:', lastFightUrl);
    
    if (lastFightUrl) {
      console.log('[MWC-Waterboard] Redirecting back to:', lastFightUrl);
      
      // Set flag to show banner on fight page
      sessionStorage.setItem(K_SHOW_ENERGY_BANNER, 'true');
      
      // Redirect back to fight setup page
      window.top.location.href = lastFightUrl;
    } else {
      // No stored URL - redirect to boss page as fallback
      console.log('[MWC-Waterboard] No stored fight URL, redirecting to /boss');
      sessionStorage.setItem(K_SHOW_ENERGY_BANNER, 'true');
      window.top.location.href = '/boss';
    }
  }

  // ====== SHOW ENERGY BANNER ON FIGHT PAGE ======
  function showEnergyBanner() {
    // Check if we should show the banner
    if (sessionStorage.getItem(K_SHOW_ENERGY_BANNER) !== 'true') return;
    
    // Clear the flag
    sessionStorage.removeItem(K_SHOW_ENERGY_BANNER);
    
    // Don't show duplicate banners
    if (document.querySelector('.mwc-energy-banner')) return;
    
    const banner = document.createElement('div');
    banner.className = 'mwc-energy-banner';
    banner.innerHTML = `
      <div style="
        background: linear-gradient(135deg, rgba(244, 67, 54, 0.2), rgba(211, 47, 47, 0.2));
        border: 1px solid rgba(244, 67, 54, 0.5);
        border-radius: 6px;
        padding: 12px 16px;
        margin: 10px 0;
        color: #ff8a80;
        display: flex;
        align-items: center;
        justify-content: space-between;
      ">
        <div>
          <strong><i class="fas fa-exclamation-triangle" aria-hidden="true"></i> Fight Failed - Low Energy User</strong><br>
          <span style="font-size: 0.9em; opacity: 0.9;">A user doesn't have enough energy. Click the <i class="fas fa-tint"></i> button next to low-energy users to waterboard them.</span>
        </div>
        <button class="mwc-banner-close" style="
          background: transparent;
          border: 1px solid rgba(255,138,128,0.5);
          color: #ff8a80;
          padding: 4px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.85em;
        ">Dismiss</button>
      </div>
    `;
    
    // Find the intro paragraph and insert after it
    const paragraphs = document.querySelectorAll('p');
    let introParagraph = null;
    for (const p of paragraphs) {
      if (p.textContent.includes('select your partners in your fight')) {
        introParagraph = p;
        break;
      }
    }
    
    if (introParagraph) {
      introParagraph.parentNode.insertBefore(banner, introParagraph.nextSibling);
    } else {
      // Fallback: insert at top of contentBox
      const contentBox = document.querySelector('.contentBox, .inner-content, .content');
      if (contentBox) {
        contentBox.insertBefore(banner, contentBox.firstChild);
      }
    }
    
    // Add close button handler
    banner.querySelector('.mwc-banner-close').addEventListener('click', () => {
      banner.remove();
    });
    
    console.log('[MWC-Waterboard] Showing energy banner');
  }

  // ====== TRACK FIGHT URL ======
  function trackFightUrl() {
    // Match /attack/fight/12345 or /fight/12345
    const pathMatch = location.pathname.match(/\/(?:attack\/)?fight\/(\d+)/i);
    if (pathMatch) {
      const fightUrl = `/attack/fight/${pathMatch[1]}`;
      sessionStorage.setItem(K_LAST_FIGHT_URL, fightUrl);
      console.log('[MWC-Waterboard] Tracked fight URL:', fightUrl);
      return;
    }

    if (location.pathname.match(/\/attack\.php/i)) {
      const params = new URLSearchParams(location.search);
      const fightId = params.get('fight');
      if (fightId) {
        const fightUrl = `/attack/fight/${fightId}`;
        sessionStorage.setItem(K_LAST_FIGHT_URL, fightUrl);
        console.log('[MWC-Waterboard] Tracked fight URL (from attack.php):', fightUrl);
      }
    }
  }

  // ====== WATERBOARD BUTTON FOR INDIVIDUAL USERS ======
  async function doWaterboard(userId, buttonElement) {
    buttonElement.style.pointerEvents = 'none';
    buttonElement.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>';

    const result = await ajaxWaterboard(userId);
    if (result.success) {
      buttonElement.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i>';
      buttonElement.style.color = '#4caf50';
      
      // Find and update the parent invite element to show it's been waterboarded
      const invite = buttonElement.closest('.invite');
      if (invite) {
        invite.style.opacity = '0.6';
        invite.style.borderColor = '#4caf50';
      }
    } else {
      buttonElement.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
      buttonElement.style.color = '#f44336';
      setTimeout(() => {
        buttonElement.style.pointerEvents = 'auto';
        buttonElement.innerHTML = '<i class="fas fa-tint" aria-hidden="true"></i>';
        buttonElement.style.color = '#4fc3f7';
      }, 2000);
    }
  }

  // ====== INJECT WATERBOARD BUTTONS ON LOW-ENERGY USERS ======
  function injectWaterboardButtons() {
    const lowEnergyInvites = document.querySelectorAll('.invite.low-energy');

    lowEnergyInvites.forEach((invite) => {
      if (invite.querySelector('.mwc-waterboard-btn')) return;

      const usernameSpan = invite.querySelector('.username[data-userid]');
      if (!usernameSpan) return;

      const userId = usernameSpan.getAttribute('data-userid');
      if (!userId) return;

      const userInfo = invite.querySelector('.userInformation');
      if (!userInfo) return;

      const waterboardLink = document.createElement('a');
      waterboardLink.href = 'javascript:void(0)';
      waterboardLink.className = 'mwc-waterboard-btn';
      waterboardLink.title = 'Waterboard this user';
      waterboardLink.setAttribute('data-userid', userId);
      waterboardLink.style.cssText = `
        margin-left: 8px;
        color: #4fc3f7;
        cursor: pointer;
        transition: color 0.2s ease;
        font-size: 1.1em;
      `;
      waterboardLink.innerHTML = '<i class="fas fa-tint" aria-hidden="true"></i>';

      waterboardLink.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        doWaterboard(userId, waterboardLink);
      });

      userInfo.appendChild(waterboardLink);
    });
  }

  // ====== MAIN EXECUTION ======

  // Handle error page (redirect back to fight)
  handleErrorPage();

  // Track fight URL if on fight setup page
  trackFightUrl();

  // Only run on fight setup pages
  if (location.pathname.match(/\/(attack|fight)\/fight\/\d+/i) || 
      location.pathname.match(/\/attack\.php/i)) {
    
    // Show energy banner if redirected from error
    showEnergyBanner();
    
    // Initial setup
    injectWaterboardButtons();

    // Watch for dynamic content changes
    const observer = new MutationObserver(() => {
      injectWaterboardButtons();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  console.log('[MWC-Waterboard] Script loaded (v4.2.0)');
})();
