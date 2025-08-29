/**
 * LinkedIn Keyword Filter - Content Script
 * Main filtering logic and coordination
 */

// Initial log to confirm script loading
console.log('🚀 [LinkedIn Filter] Content script loaded!');
console.log('📍 Current URL:', window.location.href);
console.log('🌐 Hostname:', window.location.hostname);

// Session state (reset on page reload)
let sessionHiddenCount = 0;
let currentConfig = {
  mode: 'blacklist',
  paused: false,
  words: []
};

// Processing state
let normalizedWordSet = new Set();
let observer = null;
let processingTimeout = null;
let isProcessing = false;
let pendingPosts = new Set();
let performanceObserver = null;

/**
 * Initialize the extension
 */
async function init() {
  console.log('[LinkedIn Filter] 🔧 Initializing...');
  
  try {
    // Check if we're on LinkedIn
    if (!location.hostname.includes('linkedin.com')) {
      console.log('[LinkedIn Filter] ❌ Not on LinkedIn, skipping initialization');
      return;
    }
    
    // Check if we're specifically on the LinkedIn feed (not profile, posts, etc.)
    const isFeedPage = location.pathname === '/feed/' || 
                      location.pathname === '/' || 
                      location.pathname === '/feed';
    
    if (!isFeedPage) {
      console.log('[LinkedIn Filter] ❌ Not on LinkedIn feed, current path:', location.pathname);
      console.log('[LinkedIn Filter] ❌ Skipping initialization - plugin only works on feed pages');
      return;
    }
    
    console.log('[LinkedIn Filter] ✅ On LinkedIn feed, proceeding with initialization');
    
    // Wait a bit for LinkedIn to fully load
    if (document.readyState !== 'complete') {
      console.log('[LinkedIn Filter] ⏳ Waiting for page to fully load...');
      await new Promise(resolve => {
        if (document.readyState === 'complete') {
          resolve();
        } else {
          window.addEventListener('load', resolve, { once: true });
        }
      });
    }
    
    // Load initial configuration
    console.log('[LinkedIn Filter] 📥 Loading configuration...');
    await loadConfig();
    
    // Verify configuration was loaded correctly
    if (!currentConfig || typeof currentConfig !== 'object') {
      throw new Error('Configuration object is invalid');
    }
    
    console.log('[LinkedIn Filter] 🔧 Setting up listeners and observers...');
    
    // Set up storage change listener
    setupStorageListener();
    
    // Set up message listener
    setupMessageListener();
    
    // Process existing posts
    console.log('[LinkedIn Filter] 📝 Processing existing posts...');
    await processAllExistingPosts();
    
    // Start observing for new posts
    console.log('[LinkedIn Filter] 👀 Starting mutation observer...');
    startMutationObserver();
    
    console.log('[LinkedIn Filter] ✅ Successfully initialized');
    
    // Send ready message to popup
    try {
      chrome.runtime.sendMessage({ type: 'ready', value: 'content-script-loaded' });
      console.log('[LinkedIn Filter] ✅ Ready message sent');
    } catch (error) {
      console.log('[LinkedIn Filter] ⚠️ Could not send ready message:', error);
    }
    
  } catch (error) {
    console.error('[LinkedIn Filter] ❌ Initialization failed:', error);
    
    // Try to recover by re-initializing after a delay
    console.log('[LinkedIn Filter] 🔄 Attempting recovery in 3 seconds...');
    setTimeout(() => {
      if (location.hostname.includes('linkedin.com')) {
        console.log('[LinkedIn Filter] 🔄 Recovery attempt...');
        init();
      }
    }, 3000);
  }
}

/**
 * Load configuration from storage
 */
async function loadConfig() {
  try {
    console.log('[LinkedIn Filter] 🔍 Loading configuration from storage...');
    
    const result = await chrome.storage.local.get({
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
    
    // Get current profile configuration
    const currentProfileId = result.currentProfileId || 'default';
    const profiles = result.profiles || {
      default: {
        name: 'Default Profile',
        mode: 'blacklist',
        paused: false,
        words: []
      }
    };
    
    currentConfig = profiles[currentProfileId] || profiles.default;
    normalizedWordSet = generateNormalizedWordSet(currentConfig.words);
    
    console.log('[LinkedIn Filter] ✅ Configuration loaded successfully:', {
      currentProfile: currentProfileId,
      mode: currentConfig.mode,
      paused: currentConfig.paused,
      wordsCount: currentConfig.words.length,
      normalizedWordsCount: normalizedWordSet.size
    });
    
    // Verify configuration persistence
    if (currentConfig.words.length > 0) {
      console.log('[LinkedIn Filter] 📝 Keywords found:', currentConfig.words.slice(0, 5));
    } else {
      console.log('[LinkedIn Filter] ⚠️ No keywords configured');
    }
    
  } catch (error) {
    console.error('[LinkedIn Filter] ❌ Failed to load config:', error);
    
    // Fallback to default configuration
    console.log('[LinkedIn Filter] 🔄 Using fallback configuration');
    currentConfig = {
      mode: 'blacklist',
      paused: false,
      words: []
    };
    normalizedWordSet = new Set();
  }
}

/**
 * Set up storage change listener
 */
function setupStorageListener() {
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local') return;
    
    let configChanged = false;
    
    if (changes.mode) {
      const oldMode = currentConfig.mode;
      currentConfig.mode = changes.mode.newValue;
      configChanged = true;
      
      // Remove highlights when switching from whitelist to blacklist
      if (oldMode === 'whitelist' && currentConfig.mode === 'blacklist') {
        removeAllHighlights();
        console.log('[LinkedIn Filter] Removed highlights (switched to blacklist)');
      }
    }
    
    if (changes.paused) {
      currentConfig.paused = changes.paused.newValue;
      configChanged = true;
    }
    
    if (changes.words) {
      currentConfig.words = changes.words.newValue || [];
      normalizedWordSet = generateNormalizedWordSet(currentConfig.words);
      configChanged = true;
    }
    

    
    if (configChanged) {
      console.debug('[LinkedIn Filter] Config updated:', currentConfig);
      reprocessAllPosts();
    }
  });
}

/**
 * Set up message listener for popup communication
 */
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.debug('[LinkedIn Filter] Message received:', message);
    
    switch (message.type) {
      case 'getCount':
        sendResponse(sessionHiddenCount);
        break;
        
      case 'reprocess':
        reprocessAllPosts();
        sendResponse(true);
        break;
        
      case 'ping':
        sendResponse('pong');
        break;
        
      default:
        console.debug('[LinkedIn Filter] Unknown message type:', message.type);
    }
    
    return true; // Keep message channel open for async responses
  });
}

/**
 * Determine if a post should be hidden based on current configuration
 * @param {boolean} hasMatch Whether the post matches any keywords
 * @returns {boolean} True if post should be hidden
 */
function shouldHidePost(hasMatch) {
  if (currentConfig.paused || normalizedWordSet.size === 0) {
    return false;
  }
  
  switch (currentConfig.mode) {
    case 'blacklist':
      return hasMatch === true;
    case 'whitelist':
      return hasMatch === false;
    default:
      return false;
  }
}

/**
 * Process a single post for filtering
 * @param {HTMLElement} postElement 
 */
async function processPost(postElement) {
  try {
    // Skip if already processed
    if (isPostProcessed(postElement)) {
      return;
    }
    
    // Mark as processed immediately to prevent reprocessing
    markPostAsProcessed(postElement);
    
    // Expand "see more" content if needed
    await expandSeeMoreContent(postElement);
    
    // Extract and normalize text
    const rawText = extractPostText(postElement);
    const normalizedText = normalizeText(rawText);
    
    if (!normalizedText) {
      console.debug('[LinkedIn Filter] No text content found in post');
      return;
    }
    
    // Check for matches
    const hasMatch = matchesAny(normalizedText, normalizedWordSet);
    const shouldHide = shouldHidePost(hasMatch);
    
    console.debug('[LinkedIn Filter] Post processed:', {
      hasMatch,
      shouldHide,
      mode: currentConfig.mode,
      textPreview: normalizedText.substring(0, 100) + '...'
    });
    
    // Apply filtering
    if (shouldHide) {
      hidePost(postElement);
      sessionHiddenCount++;
      notifyPopupCountUpdate();
    } else {
      showPost(postElement);
      
      // Highlight found keywords in visible posts (for whitelist mode)
      if (currentConfig.mode === 'whitelist' && hasMatch) {
        highlightFoundKeywords(postElement, normalizedWordSet);
      }
    }
    
    // Update last processed time for health monitoring
    lastProcessedTime = Date.now();
    
  } catch (error) {
    console.error('[LinkedIn Filter] Error processing post:', error);
  }
}

/**
 * Process all existing posts on the page with performance optimizations
 */
async function processAllExistingPosts() {
  const posts = getAllFeedPosts();
  console.debug(`[LinkedIn Filter] Processing ${posts.size} posts`);
  
  if (posts.size === 0) {
    console.debug('[LinkedIn Filter] No posts found to process');
    return;
  }
  
  // Process posts in smaller batches to avoid blocking the UI
  const batchSize = 5;
  const postsArray = Array.from(posts);
  
  for (let i = 0; i < postsArray.length; i += batchSize) {
    const batch = postsArray.slice(i, i + batchSize);
    
    // Process batch
    const batchPromises = batch.map(post => processPost(post));
    await Promise.all(batchPromises);
    
    // Small delay between batches to let the UI breathe
    if (i + batchSize < postsArray.length) {
      await new Promise(resolve => {
        if (window.requestIdleCallback) {
          window.requestIdleCallback(resolve, { timeout: 100 });
        } else {
          setTimeout(resolve, 10);
        }
      });
    }
  }
  
  console.debug(`[LinkedIn Filter] Processed all posts. Hidden: ${sessionHiddenCount}`);
}

/**
 * Reprocess all posts (useful when config changes)
 */
function reprocessAllPosts() {
  console.debug('[LinkedIn Filter] Reprocessing all posts...');
  
  // Reset processing markers
  resetProcessingMarkers();
  
  // Reset hidden count for reprocessing
  sessionHiddenCount = 0;
  
  // Process all posts again
  processAllExistingPosts();
}

/**
 * Start mutation observer for new posts with performance optimizations
 */
function startMutationObserver() {
  if (observer) {
    observer.disconnect();
  }
  
  // Use a more efficient observer configuration
  observer = new MutationObserver((mutations) => {
    // Skip processing if already busy
    if (isProcessing) {
      return;
    }
    
    const newPosts = new Set();
    
    // Process mutations in batches for better performance
    mutations.forEach(mutation => {
      // Only process if new nodes were added
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if the added node is a post or contains posts
            const posts = getAllFeedPosts();
            posts.forEach(post => {
              if (node.contains(post) || node === post) {
                if (!isPostProcessed(post)) {
                  newPosts.add(post);
                }
              }
            });
          }
        });
      }
    });
    
    if (newPosts.size > 0) {
      // Add to pending posts instead of processing immediately
      newPosts.forEach(post => pendingPosts.add(post));
      
      // Use requestIdleCallback for better performance when browser is idle
      if (window.requestIdleCallback) {
        window.requestIdleCallback(() => processPendingPosts(), { timeout: 1000 });
      } else {
        // Fallback to setTimeout with longer delay
        if (processingTimeout) {
          clearTimeout(processingTimeout);
        }
        processingTimeout = setTimeout(processPendingPosts, 200);
      }
    }
  });
  
  // More specific observation to reduce unnecessary callbacks
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    // Only observe specific areas where posts are likely to appear
    attributeFilter: ['data-urn', 'data-id']
  });
  
  console.debug('[LinkedIn Filter] Performance-optimized mutation observer started');
}

/**
 * Process pending posts with performance optimizations
 */
function processPendingPosts() {
  if (isProcessing || pendingPosts.size === 0) {
    return;
  }
  
  isProcessing = true;
  
  try {
    const postsToProcess = Array.from(pendingPosts);
    pendingPosts.clear();
    
    console.debug(`[LinkedIn Filter] Processing ${postsToProcess.length} pending posts`);
    
    // Process posts in smaller batches to avoid blocking the UI
    const batchSize = 3;
    let currentIndex = 0;
    
    function processBatch() {
      const batch = postsToProcess.slice(currentIndex, currentIndex + batchSize);
      
      if (batch.length === 0) {
        isProcessing = false;
        return;
      }
      
      // Process batch
      batch.forEach(post => {
        if (!isPostProcessed(post)) {
          processPost(post).catch(error => {
            console.error('[LinkedIn Filter] Error processing post:', error);
          });
        }
      });
      
      currentIndex += batchSize;
      
      // Schedule next batch with requestIdleCallback for better performance
      if (window.requestIdleCallback) {
        window.requestIdleCallback(processBatch, { timeout: 500 });
      } else {
        setTimeout(processBatch, 50);
      }
    }
    
    // Start processing batches
    processBatch();
    
  } catch (error) {
    console.error('[LinkedIn Filter] Error in processPendingPosts:', error);
    isProcessing = false;
  }
}

/**
 * Notify popup of count update
 */
function notifyPopupCountUpdate() {
  try {
    chrome.runtime.sendMessage({
      type: 'count',
      value: sessionHiddenCount
    }).catch(() => {
      // Popup might not be open, ignore error
    });
  } catch (error) {
    // Extension context might be invalid, ignore
  }
}

/**
 * Clean up resources
 */
function cleanup() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  
  if (processingTimeout) {
    clearTimeout(processingTimeout);
    processingTimeout = null;
  }
}

/**
 * Remove all highlights from posts
 */
function removeAllHighlights() {
  const allPosts = getAllFeedPosts();
  allPosts.forEach(post => {
    removeKeywordHighlighting(post);
  });
  console.debug('[LinkedIn Filter] Removed all highlights');
}

/**
 * Check observer health and recover if needed
 */
function checkObserverHealth() {
  try {
    const currentTime = Date.now();
    const timeSinceLastProcess = currentTime - lastProcessedTime;
    
    // Check if observer is still working
    if (observer && !observer.disconnected) {
      // If no posts processed in the last 10 seconds, observer might be stuck
      if (timeSinceLastProcess > 10000 && !isProcessing) {
        console.warn('[LinkedIn Filter] ⚠️ Observer health check: No posts processed recently, observer might be stuck');
        consecutiveFailures++;
        
        if (consecutiveFailures >= 2) {
          console.warn('[LinkedIn Filter] 🔄 Observer appears stuck, restarting...');
          restartObserver();
          consecutiveFailures = 0;
        }
      } else {
        // Reset failure counter if processing is working
        consecutiveFailures = 0;
      }
    } else {
      console.warn('[LinkedIn Filter] ⚠️ Observer is disconnected, restarting...');
      restartObserver();
    }
    
    // Check if we're still on a feed page
    const isFeedPage = location.pathname === '/feed/' || 
                      location.pathname === '/' || 
                      location.pathname === '/feed';
    
    if (location.hostname.includes('linkedin.com') && isFeedPage) {
      // Force reprocess if no posts were processed recently
      if (timeSinceLastProcess > 15000 && !isProcessing) {
        console.log('[LinkedIn Filter] 🔍 Health check: Force reprocessing posts...');
        reprocessAllPosts();
      }
    }
    
  } catch (error) {
    console.error('[LinkedIn Filter] Error in health check:', error);
    restartObserver();
  }
}

/**
 * Restart the mutation observer
 */
function restartObserver() {
  try {
    console.log('[LinkedIn Filter] 🔄 Restarting mutation observer...');
    
    // Clean up existing observer
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    
    // Reset processing state
    isProcessing = false;
    pendingPosts.clear();
    if (processingTimeout) {
      clearTimeout(processingTimeout);
      processingTimeout = null;
    }
    
    // Reset processing markers to allow reprocessing
    resetProcessingMarkers();
    
    // Restart observer
    startMutationObserver();
    
    // Force reprocess all posts
    setTimeout(() => {
      reprocessAllPosts();
    }, 1000);
    
    console.log('[LinkedIn Filter] ✅ Observer restarted successfully');
    
  } catch (error) {
    console.error('[LinkedIn Filter] Error restarting observer:', error);
  }
}

/**
 * Debug function to check for unprocessed posts
 */
function debugUnprocessedPosts() {
  try {
    const allPosts = getAllFeedPosts();
    const processedPosts = [];
    const unprocessedPosts = [];
    
    allPosts.forEach(post => {
      if (isPostProcessed(post)) {
        processedPosts.push(post);
      } else {
        unprocessedPosts.push(post);
      }
    });
    
    console.log(`[LinkedIn Filter] 🔍 Debug: Found ${allPosts.size} total posts`);
    console.log(`[LinkedIn Filter] 🔍 Debug: ${processedPosts.length} processed, ${unprocessedPosts.length} unprocessed`);
    
    if (unprocessedPosts.length > 0) {
      console.log('[LinkedIn Filter] 🔍 Debug: Unprocessed posts:', unprocessedPosts.map(p => ({
        id: p.getAttribute('data-urn') || p.getAttribute('data-id') || 'unknown',
        classes: Array.from(p.classList),
        hasText: extractPostText(p).length > 0
      })));
    }
    
    return { total: allPosts.size, processed: processedPosts.length, unprocessed: unprocessedPosts.length };
  } catch (error) {
    console.error('[LinkedIn Filter] Error in debug function:', error);
    return { total: 0, processed: 0, unprocessed: 0 };
  }
}

/**
 * Force reprocess all posts with better error handling
 */
function reprocessAllPosts() {
  console.debug('[LinkedIn Filter] Reprocessing all posts...');
  
  // Reset processing markers
  resetProcessingMarkers();
  
  // Reset hidden count for reprocessing
  sessionHiddenCount = 0;
  
  // Debug current state
  const debugInfo = debugUnprocessedPosts();
  console.log('[LinkedIn Filter] Debug info before reprocessing:', debugInfo);
  
  // Process all posts again
  processAllExistingPosts();
  
  // Debug final state
  setTimeout(() => {
    const finalDebugInfo = debugUnprocessedPosts();
    console.log('[LinkedIn Filter] Debug info after reprocessing:', finalDebugInfo);
  }, 2000);
}

// Handle page unload
window.addEventListener('beforeunload', cleanup);

// Pause observer when page is not visible for better performance
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (observer) {
      observer.disconnect();
      console.debug('[LinkedIn Filter] Observer paused (page hidden)');
    }
  } else {
    if (observer && !observer.disconnected) {
      startMutationObserver();
      console.debug('[LinkedIn Filter] Observer resumed (page visible)');
    }
  }
});

// Handle extension context invalidation
chrome.runtime.onConnect.addListener(() => {
  // Extension context is still valid
});

// Wait for DOM to be ready and initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  // If DOM is already ready, wait a bit for LinkedIn to fully load
  setTimeout(init, 500);
}

// Re-initialize if needed (for SPA navigation)
let lastUrl = location.href;
const urlObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    
    // Check if we're still on LinkedIn feed
    const isFeedPage = location.pathname === '/feed/' || 
                      location.pathname === '/' || 
                      location.pathname === '/feed';
    
    if (location.hostname === 'www.linkedin.com' && isFeedPage) {
      console.debug('[LinkedIn Filter] URL changed, still on feed - reinitializing...');
      
      // Reset session count for new page
      sessionHiddenCount = 0;
      
      // Small delay to let LinkedIn load content
      setTimeout(() => {
        reprocessAllPosts();
      }, 1000);
    } else if (location.hostname === 'www.linkedin.com' && !isFeedPage) {
      console.debug('[LinkedIn Filter] URL changed, left feed page:', location.pathname);
      console.debug('[LinkedIn Filter] Plugin will not work on this page');
    }
  }
});

urlObserver.observe(document, { subtree: true, childList: true });

// Additional safety: re-initialize after a delay to ensure LinkedIn is fully loaded
setTimeout(() => {
  if (location.hostname.includes('linkedin.com')) {
    console.debug('[LinkedIn Filter] Safety re-initialization...');
    init();
  }
}, 2000);

// Periodic configuration verification to ensure settings persist
setInterval(async () => {
  // Only run on LinkedIn feed pages
  const isFeedPage = location.pathname === '/feed/' || 
                    location.pathname === '/' || 
                    location.pathname === '/feed';
  
  if (location.hostname.includes('linkedin.com') && isFeedPage && currentConfig) {
    try {
      // Verify configuration is still in storage
      const storedConfig = await chrome.storage.local.get();
      if (storedConfig.words && storedConfig.words.length > 0 && currentConfig.words.length === 0) {
        console.log('[LinkedIn Filter] 🔍 Configuration mismatch detected, reloading...');
        await loadConfig();
        if (currentConfig.words.length > 0) {
          console.log('[LinkedIn Filter] ✅ Configuration restored from storage');
          reprocessAllPosts();
        }
      }
    } catch (error) {
      console.debug('[LinkedIn Filter] Periodic config check failed:', error);
    }
  }
}, 30000); // Check every 30 seconds (reduced frequency for better performance)

// Periodic health monitoring to prevent observer from stopping
setInterval(() => {
  const isFeedPage = location.pathname === '/feed/' || 
                    location.pathname === '/' || 
                    location.pathname === '/feed';
  
  if (location.hostname.includes('linkedin.com') && isFeedPage) {
    checkObserverHealth();
  }
}, 60000); // Check every 60 seconds (reduced from 15s for better performance)

// Expose debug functions globally for testing
window.linkedinFilterDebug = {
  debugUnprocessedPosts,
  reprocessAllPosts,
  checkObserverHealth,
  restartObserver,
  getCurrentConfig: () => currentConfig,
  getNormalizedWords: () => Array.from(normalizedWordSet),
  getHiddenCount: () => sessionHiddenCount
};

console.log('[LinkedIn Filter] 🔧 Debug functions available at window.linkedinFilterDebug');
console.log('[LinkedIn Filter] 🔧 Use linkedinFilterDebug.debugUnprocessedPosts() to check for unprocessed posts');
console.log('[LinkedIn Filter] 🔧 Use linkedinFilterDebug.reprocessAllPosts() to force reprocessing');

// Handle scroll events to ensure observer keeps working (optimized for performance)
let scrollTimeout = null;
let lastScrollTime = 0;
const SCROLL_THROTTLE = 2000; // Only process scroll events every 2 seconds

window.addEventListener('scroll', () => {
  const now = Date.now();
  
  // Throttle scroll events to improve performance
  if (now - lastScrollTime < SCROLL_THROTTLE) {
    return;
  }
  
  lastScrollTime = now;
  
  // Clear existing timeout
  if (scrollTimeout) {
    clearTimeout(scrollTimeout);
  }
  
  // Set a timeout to check observer health after scrolling stops
  scrollTimeout = setTimeout(() => {
    const isFeedPage = location.pathname === '/feed/' || 
                      location.pathname === '/' || 
                      location.pathname === '/feed';
    
    if (location.hostname.includes('linkedin.com') && isFeedPage) {
      console.debug('[LinkedIn Filter] Scroll stopped, checking observer health...');
      checkObserverHealth();
    }
  }, 5000); // Wait 5 seconds after scrolling stops (increased for better performance)
}, { passive: true });

// Handle wheel events (mouse wheel, trackpad) - optimized for performance
let wheelTimeout = null;
let lastWheelTime = 0;
const WHEEL_THROTTLE = 2000; // Only process wheel events every 2 seconds

window.addEventListener('wheel', () => {
  const now = Date.now();
  
  // Throttle wheel events to improve performance
  if (now - lastWheelTime < WHEEL_THROTTLE) {
    return;
  }
  
  lastWheelTime = now;
  
  // Clear existing timeout
  if (wheelTimeout) {
    clearTimeout(wheelTimeout);
  }
  
  // Set a timeout to check observer health after wheel stops
  wheelTimeout = setTimeout(() => {
    const isFeedPage = location.pathname === '/feed/' || 
                      location.pathname === '/' || 
                      location.pathname === '/feed';
    
    if (location.hostname.includes('linkedin.com') && isFeedPage) {
      console.debug('[LinkedIn Filter] Wheel stopped, checking observer health...');
      checkObserverHealth();
    }
  }, 5000); // Wait 5 seconds after wheel stops (increased for better performance)
}, { passive: true });
