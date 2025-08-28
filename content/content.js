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
      words: []
    });
    
    currentConfig = result;
    normalizedWordSet = generateNormalizedWordSet(currentConfig.words);
    
    console.log('[LinkedIn Filter] ✅ Configuration loaded successfully:', {
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
      

    }
    
  } catch (error) {
    console.error('[LinkedIn Filter] Error processing post:', error);
  }
}

/**
 * Process all existing posts on the page
 */
async function processAllExistingPosts() {
  const posts = getAllFeedPosts();
  console.debug(`[LinkedIn Filter] Processing ${posts.size} posts`);
  
  if (posts.size === 0) {
    console.debug('[LinkedIn Filter] No posts found to process');
    return;
  }
  
  const processingPromises = Array.from(posts).map(post => processPost(post));
  await Promise.all(processingPromises);
  
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
 * Start mutation observer for new posts
 */
function startMutationObserver() {
  if (observer) {
    observer.disconnect();
  }
  
  observer = new MutationObserver((mutations) => {
    const newPosts = new Set();
    
    mutations.forEach(mutation => {
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
    });
    
    if (newPosts.size > 0) {
      // Debounce processing to handle rapid DOM changes
      if (processingTimeout) {
        clearTimeout(processingTimeout);
      }
      
      processingTimeout = setTimeout(() => {
        console.debug(`[LinkedIn Filter] Processing ${newPosts.size} new posts`);
        
        const processingPromises = Array.from(newPosts).map(post => processPost(post));
        Promise.all(processingPromises).catch(error => {
          console.error('[LinkedIn Filter] Error processing new posts:', error);
        });
      }, 100);
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  console.debug('[LinkedIn Filter] Mutation observer started');
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

// Handle page unload
window.addEventListener('beforeunload', cleanup);

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
}, 10000); // Check every 10 seconds
