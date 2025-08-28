/**
 * LinkedIn Keyword Filter - Service Worker
 * Handles badge updates and extension coordination
 */

// Cache for hidden counts per tab
const tabHiddenCounts = new Map();

/**
 * Initialize service worker
 */
chrome.runtime.onStartup.addListener(async () => {
  console.debug('[LinkedIn Filter SW] Extension started');
  await ensureConfigurationExists();
  initializeBadges();
});

chrome.runtime.onInstalled.addListener(async (details) => {
  console.debug('[LinkedIn Filter SW] Extension installed/updated:', details.reason);
  
  if (details.reason === 'install') {
    // Set default configuration on first install
    await setDefaultConfiguration();
  } else {
    // Ensure configuration exists on updates
    await ensureConfigurationExists();
  }
  
  initializeBadges();
});

/**
 * Set default configuration for new installations
 */
async function setDefaultConfiguration() {
  try {
    const defaultConfig = {
      mode: 'blacklist',
      paused: false,
      words: [],
      profiles: {
        default: {
          name: 'Default Profile',
          mode: 'blacklist',
          paused: false,
          words: []
        }
      },
      currentProfileId: 'default'
    };
    
    await chrome.storage.local.set(defaultConfig);
    console.debug('[LinkedIn Filter SW] Default configuration with profiles set');
  } catch (error) {
    console.error('[LinkedIn Filter SW] Failed to set default configuration:', error);
  }
}

/**
 * Ensure configuration exists and is valid
 */
async function ensureConfigurationExists() {
  try {
    const stored = await chrome.storage.local.get();
    
    // Check if we have a valid configuration with profiles
    if (!stored.profiles || !stored.currentProfileId || !stored.hasOwnProperty('mode') || !stored.hasOwnProperty('paused') || !stored.hasOwnProperty('words')) {
      console.log('[LinkedIn Filter SW] Invalid configuration or missing profiles detected, setting defaults...');
      await setDefaultConfiguration();
    }
    
    // Ensure all required fields exist
    const currentConfig = await chrome.storage.local.get({
      mode: 'blacklist',
      paused: false,
      words: [],
      profiles: {
        default: {
          name: 'Default Profile',
          mode: 'blacklist',
          paused: false,
          words: []
        }
      },
      currentProfileId: 'default'
    });
    
    console.log('[LinkedIn Filter SW] Configuration with profiles verified:', currentConfig);
  } catch (error) {
    console.error('[LinkedIn Filter SW] Failed to ensure configuration:', error);
  }
}

/**
 * Initialize badges for all LinkedIn tabs
 */
async function initializeBadges() {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
    
    tabs.forEach(tab => {
      updateBadge(tab.id, tabHiddenCounts.get(tab.id) || 0);
    });
  } catch (error) {
    console.error('[LinkedIn Filter SW] Failed to initialize badges:', error);
  }
}

/**
 * Handle messages from content scripts and popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'count':
      if (sender.tab && sender.tab.id) {
        handleCountUpdate(sender.tab.id, message.value);
      }
      break;
      
    case 'ping':
      sendResponse('pong');
      break;
      
    default:
      console.debug('[LinkedIn Filter SW] Unknown message type:', message.type);
  }
  
  return true; // Keep message channel open for async responses
});

/**
 * Handle count updates from content scripts
 */
function handleCountUpdate(tabId, count) {
  const numericCount = parseInt(count) || 0;
  
  // Update cache
  tabHiddenCounts.set(tabId, numericCount);
  
  // Update badge
  updateBadge(tabId, numericCount);
  
  console.debug(`[LinkedIn Filter SW] Count updated for tab ${tabId}: ${numericCount}`);
}

/**
 * Update badge for a specific tab
 */
async function updateBadge(tabId, count) {
  try {
    const numericCount = parseInt(count) || 0;
    
    if (numericCount > 0) {
      // Show count on badge
      await chrome.action.setBadgeText({
        text: numericCount > 99 ? '99+' : numericCount.toString(),
        tabId: tabId
      });
      
      await chrome.action.setBadgeBackgroundColor({
        color: '#dc3545', // Red to indicate filtering is active
        tabId: tabId
      });
    } else {
      // Clear badge
      await chrome.action.setBadgeText({
        text: '',
        tabId: tabId
      });
    }
  } catch (error) {
    console.debug('[LinkedIn Filter SW] Failed to update badge:', error);
    // This can fail if tab is closed, which is normal
  }
}

/**
 * Clean up when tabs are closed
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  tabHiddenCounts.delete(tabId);
  console.debug(`[LinkedIn Filter SW] Cleaned up data for closed tab ${tabId}`);
});

/**
 * Handle tab updates (e.g., navigation)
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    if (tab.url.includes('linkedin.com')) {
      // Initialize badge for LinkedIn tabs
      updateBadge(tabId, tabHiddenCounts.get(tabId) || 0);
    } else {
      // Clear badge for non-LinkedIn tabs
      tabHiddenCounts.delete(tabId);
      updateBadge(tabId, 0);
    }
  }
});

/**
 * Handle extension context invalidation
 */
chrome.runtime.onConnect.addListener(() => {
  console.debug('[LinkedIn Filter SW] Extension context is valid');
});

// Error handling for unhandled promise rejections
self.addEventListener('unhandledrejection', (event) => {
  console.error('[LinkedIn Filter SW] Unhandled promise rejection:', event.reason);
});

console.debug('[LinkedIn Filter SW] Service worker loaded');
