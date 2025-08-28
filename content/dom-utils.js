/**
 * LinkedIn DOM Utilities
 * Contains helper functions for selecting and manipulating LinkedIn feed posts
 */

/**
 * Get all feed posts on the current page
 * Uses multiple selectors for resilience against DOM changes
 * @returns {Set<HTMLElement>} Set of unique post elements
 */
function getAllFeedPosts() {
  const selectors = [
    // Main post containers - most specific first
    'div.feed-shared-update-v2[role="article"][data-urn]',
    'div.feed-shared-update-v2',
    '[data-id^="urn:li:activity:"]', // Parent container with data-id
    'div[data-urn^="urn:li:activity:"]',
    '[role="article"][data-urn]',
    'div.feed-shared-update' // fallback for older versions
  ];
  
  const posts = new Set();
  
  selectors.forEach(selector => {
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        // More flexible checks to identify feed posts
        const isInFeed = el.closest('.scaffold-finite-scroll__content, .feed-container, [data-finite-scroll-hotkey], [data-finite-scroll-hotkey-item]') ||
                        el.querySelector('[data-finite-scroll-hotkey-item]') ||
                        document.querySelector('.scaffold-finite-scroll__content, .feed-container')?.contains(el) ||
                        el.closest('main') || // LinkedIn feed is usually in main
                        el.closest('[role="main"]');
        
        // Only add if it's really a feed post
        if (isInFeed && (el.hasAttribute('data-urn') || el.hasAttribute('data-id'))) {
          posts.add(el);
        }
      });
    } catch (error) {
      console.debug('[LinkedIn Filter] Selector failed:', selector, error);
    }
  });
  
  console.debug(`[LinkedIn Filter] Found ${posts.size} posts with selectors`);
  return posts;
}

/**
 * Find text content blocks within a post
 * Handles multiple content structures and reposts
 * @param {HTMLElement} postElement 
 * @returns {HTMLElement[]} Array of text content elements
 */
function getTextContentElements(postElement) {
  const selectors = [
    // More specific selectors based on real structure
    '.update-components-text',
    '.update-components-update-v2__commentary',
    '.feed-shared-text',
    '.feed-shared-inline-show-more-text .update-components-text',
    '[data-test-id*="update"] [dir="ltr"]',
    '.feed-shared-update-v2__description .update-components-text',
    '.update-components-text__text-view',
    '.feed-shared-inline-show-more-text',
    '.attributed-text-segment-list__content',
    // More generic fallbacks
    '[dir="ltr"]'
  ];
  
  const textElements = [];
  
  selectors.forEach(selector => {
    try {
      const elements = postElement.querySelectorAll(selector);
      elements.forEach(el => {
        // Skip if element is inside a comment section or reactions
        if (!el.closest('.comments-comments-list, .social-details-social-counts, .social-actions-button, .feed-shared-social-action-bar')) {
          // Check if element has significant textual content
          const text = el.textContent?.trim();
          if (text && text.length > 10) { // Ignore very short texts
            textElements.push(el);
          }
        }
      });
    } catch (error) {
      console.debug('[LinkedIn Filter] Text selector failed:', selector, error);
    }
  });
  
  console.debug(`[LinkedIn Filter] Found ${textElements.length} text elements`);
  return textElements;
}

/**
 * Expand "see more" content if present and not already expanded
 * @param {HTMLElement} postElement 
 * @returns {Promise<boolean>} True if expansion was attempted
 */
async function expandSeeMoreContent(postElement) {
  // Check if already expanded
  if (postElement.getAttribute('data-lkw-expanded') === '1') {
    return false;
  }
  
  const seeMoreSelectors = [
    // More specific selectors based on real structure
    '.feed-shared-inline-show-more-text__see-more-less-toggle',
    'button[aria-label*="ver mais"]',
    'button[aria-label*="see more"]',
    '.see-more',
    '.inline-show-more-text__button',
    'button[data-control-name*="see_more"]',
    'button.feed-shared-inline-show-more-text__see-more-less-toggle',
    '.update-components-show-more-text button',
    // Fallback for any button inside text container
    '.feed-shared-inline-show-more-text button'
  ];
  
  let button = null;
  
  // Find the see more button
  for (const selector of seeMoreSelectors) {
    try {
      button = postElement.querySelector(selector);
      if (button && button.offsetParent !== null && !button.disabled) { // Check if visible and enabled
        break;
      }
    } catch (error) {
      console.debug('[LinkedIn Filter] See more selector failed:', selector, error);
    }
  }
  
  if (!button) {
    return false;
  }
  
  try {
    console.debug('[LinkedIn Filter] Expanding see more content');
    
    // Mark as expanded before clicking to prevent duplicate clicks
    postElement.setAttribute('data-lkw-expanded', '1');
    
    // Click with a small delay to ensure DOM is ready
    await new Promise(resolve => {
      requestAnimationFrame(() => {
        button.click();
        setTimeout(resolve, 200); // Increased delay for content to load
      });
    });
    
    return true;
  } catch (error) {
    console.debug('[LinkedIn Filter] Failed to expand see more:', error);
    return false;
  }
}

/**
 * Extract text content from a post element
 * Handles reposts by selecting the largest text block as original content
 * @param {HTMLElement} postElement 
 * @returns {string} Extracted and cleaned text content
 */
function extractPostText(postElement) {
  const textElements = getTextContentElements(postElement);
  
  if (textElements.length === 0) {
    console.debug('[LinkedIn Filter] No text elements found');
    return '';
  }
  
  // If multiple text blocks, choose the largest one (likely original content)
  let selectedElement = textElements[0];
  let maxLength = 0;
  
  textElements.forEach(element => {
    const text = element.textContent || '';
    if (text.length > maxLength) {
      maxLength = text.length;
      selectedElement = element;
    }
  });
  
  const extractedText = selectedElement.textContent || '';
  console.debug(`[LinkedIn Filter] Extracted text (${extractedText.length} chars):`, extractedText.substring(0, 100) + '...');
  
  return extractedText;
}

/**
 * Normalize text for matching
 * Removes accents, converts to lowercase, removes links, hashtags, mentions, emojis
 * @param {string} text 
 * @returns {string} Normalized text
 */
function normalizeText(text) {
  if (!text) return '';
  
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/https?:\/\/\S+/g, ' ') // Remove URLs
    .replace(/[@#][\p{L}\p{N}_-]+/gu, ' ') // Remove mentions and hashtags
    .replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, ' ') // Remove emojis
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Generate plural/singular variations of a word
 * Simple implementation: adds/removes 's' at the end
 * @param {string} word 
 * @returns {string[]} Array of word variations
 */
function generateWordVariations(word) {
  if (!word) return [];
  
  const variations = [word];
  
  // Add plural variation (add 's')
  if (!word.endsWith('s')) {
    variations.push(word + 's');
  }
  
  // Add singular variation (remove 's')
  if (word.endsWith('s') && word.length > 1) {
    variations.push(word.slice(0, -1));
  }
  
  return variations;
}

/**
 * Generate all variations for a list of words
 * Includes normalization and deduplication
 * @param {string[]} words 
 * @returns {Set<string>} Set of normalized word variations
 */
function generateNormalizedWordSet(words) {
  const wordSet = new Set();
  
  words.forEach(word => {
    const normalized = normalizeText(word);
    if (normalized) {
      const variations = generateWordVariations(normalized);
      variations.forEach(variation => wordSet.add(variation));
    }
  });
  
  console.debug(`[LinkedIn Filter] Generated ${wordSet.size} word variations from ${words.length} original words:`, Array.from(wordSet));
  return wordSet;
}

/**
 * Check if text matches any word in the word set
 * @param {string} text Normalized text to check
 * @param {Set<string>} wordSet Set of normalized words to match against
 * @returns {boolean} True if any word matches
 */
function matchesAny(text, wordSet) {
  if (!text || wordSet.size === 0) return false;
  
  // Convert text to lowercase for case-insensitive matching
  const normalizedText = text.toLowerCase();
  
  for (const word of wordSet) {
    if (!word || word.length === 0) continue;
    
    // Use word boundaries to match complete words only
    // \b ensures we match word boundaries (start/end of word)
    // This prevents "ia" from matching "tecnologia", "eficiência", etc.
    const wordBoundaryRegex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    
    if (wordBoundaryRegex.test(normalizedText)) {
      console.debug(`[LinkedIn Filter] Keyword "${word}" matched in text: "${normalizedText.substring(0, 100)}..."`);
      return true;
    }
  }
  
  return false;
}

/**
 * Hide a post element
 * @param {HTMLElement} postElement 
 */
function hidePost(postElement) {
  postElement.style.display = 'none';
  postElement.setAttribute('data-lkw-hidden', '1');
  console.debug('[LinkedIn Filter] Post hidden');
}

/**
 * Show a post element (unhide)
 * @param {HTMLElement} postElement 
 */
function showPost(postElement) {
  postElement.style.display = '';
  postElement.removeAttribute('data-lkw-hidden');
  console.debug('[LinkedIn Filter] Post shown');
}

/**
 * Check if a post is already processed
 * @param {HTMLElement} postElement 
 * @returns {boolean}
 */
function isPostProcessed(postElement) {
  return postElement.getAttribute('data-lkw-processed') === '1';
}

/**
 * Mark a post as processed
 * @param {HTMLElement} postElement 
 */
function markPostAsProcessed(postElement) {
  postElement.setAttribute('data-lkw-processed', '1');
}

/**
 * Reset processing markers on all posts
 */
function resetProcessingMarkers() {
  const posts = getAllFeedPosts();
  posts.forEach(post => {
    post.removeAttribute('data-lkw-processed');
    post.removeAttribute('data-lkw-expanded');
  });
  console.debug(`[LinkedIn Filter] Reset processing markers on ${posts.size} posts`);
}

/**
 * Highlight keywords in text content when using whitelist mode
 * @param {HTMLElement} textElement - The text element to highlight
 * @param {Set<string>} normalizedWords - Set of normalized keywords to highlight
 * @param {string} mode - Current filter mode ('blacklist' or 'whitelist')
 */
function highlightKeywords(textElement, normalizedWords, mode) {
  // Only highlight in whitelist mode
  if (mode !== 'whitelist' || normalizedWords.size === 0) {
    return;
  }

  // Get the text content
  const originalText = textElement.textContent;
  if (!originalText || originalText.trim().length === 0) {
    return;
  }

  // Create a copy of the element to work with
  const clonedElement = textElement.cloneNode(true);
  
  // Split text into words and highlight matches
  let highlightedText = originalText;
  let offset = 0;
  
  // Sort words by length (longest first) to avoid partial matches
  const sortedWords = Array.from(normalizedWords).sort((a, b) => b.length - a.length);
  
  for (const word of sortedWords) {
    if (!word || word.length === 0) continue;
    
    // Use word boundaries to highlight complete words only
    // \b ensures we match word boundaries (start/end of word)
    // This prevents "ia" from highlighting "tecnologia", "eficiência", etc.
    const wordBoundaryRegex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    highlightedText = highlightedText.replace(wordBoundaryRegex, '<mark class="lkw-highlight">$&</mark>');
  }
  
  // Only update if we actually found matches
  if (highlightedText !== originalText) {
    // Create a temporary container to parse the HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = highlightedText;
    
    // Clear the original element and append highlighted content
    textElement.innerHTML = '';
    while (tempDiv.firstChild) {
      textElement.appendChild(tempDiv.firstChild);
    }
    
    // Add a class to indicate this element has been highlighted
    textElement.classList.add('lkw-highlighted');
  }
}

/**
 * Remove all keyword highlights from the page
 */
function removeAllHighlights() {
  // Remove highlight marks
  const highlights = document.querySelectorAll('.lkw-highlight');
  highlights.forEach(highlight => {
    const parent = highlight.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
      parent.normalize(); // Merge adjacent text nodes
    }
  });
  
  // Remove highlighted class
  const highlightedElements = document.querySelectorAll('.lkw-highlighted');
  highlightedElements.forEach(el => {
    el.classList.remove('lkw-highlighted');
  });
}

/**
 * Process text content for highlighting (called from content.js)
 * @param {HTMLElement} postElement - The post element to process
 * @param {Set<string>} normalizedWords - Set of normalized keywords
 * @param {string} mode - Current filter mode
 */
function processTextHighlighting(postElement, normalizedWords, mode) {
  // Get text content elements
  const textElements = getTextContentElements(postElement);
  
  // Highlight keywords in each text element
  textElements.forEach(textElement => {
    highlightKeywords(textElement, normalizedWords, mode);
  });
}
