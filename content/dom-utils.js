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
    console.debug('[LinkedIn Filter] No text elements found in post:', postElement);
    return '';
  }
  
  // If multiple text blocks, choose the largest one (likely original content)
  let selectedElement = textElements[0];
  let maxLength = 0;
  
  textElements.forEach((element, index) => {
    const text = element.textContent || '';
    if (text.length > maxLength) {
      maxLength = text.length;
      selectedElement = element;
    }
    console.debug(`[LinkedIn Filter] Text element ${index}: ${text.length} chars - "${text.substring(0, 50)}..."`);
  });
  
  const extractedText = selectedElement.textContent || '';
  
  // Additional logging for debugging
  if (extractedText.length > 0) {
    console.debug(`[LinkedIn Filter] Selected text element with ${extractedText.length} chars: "${extractedText.substring(0, 100)}..."`);
  } else {
    console.warn('[LinkedIn Filter] Warning: Selected text element has no content');
  }
  
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
    .replace(/[^\w\s\u00C0-\u017F]/g, ' ') // Remove punctuation and special characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Generate plural/singular variations of a word
 * More intelligent implementation to avoid false positives
 * @param {string} word 
 * @returns {string[]} Array of word variations
 */
function generateWordVariations(word) {
  if (!word || word.length < 2) return [word]; // Don't generate variations for very short words
  
  const variations = [word];
  
  // Only generate variations for words longer than 2 characters
  if (word.length > 2) {
    // Add plural variation (add 's')
    if (!word.endsWith('s')) {
      variations.push(word + 's');
    }
    
    // Add singular variation (remove 's')
    if (word.endsWith('s') && word.length > 3) {
      variations.push(word.slice(0, -1));
    }
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
 * Uses strict word boundaries to prevent partial matches
 * @param {string} text Normalized text to check
 * @param {Set<string>} wordSet Set of normalized words to match against
 * @returns {boolean} True if any word matches
 */
function matchesAny(text, wordSet) {
  if (!text || wordSet.size === 0) return false;
  
  // Convert text to lowercase for case-insensitive matching
  const normalizedText = text.toLowerCase();
  
  // Split text into individual words for more precise matching
  const textWords = normalizedText.split(/\s+/);
  
  for (const word of wordSet) {
    if (!word || word.length === 0) continue;
    
    // Check if the exact word exists in the text words
    for (const textWord of textWords) {
      // Clean the text word (remove punctuation, etc.)
      const cleanTextWord = textWord.replace(/[^\w\u00C0-\u017F]/g, '');
      
      // Exact match (case-insensitive)
      if (cleanTextWord.toLowerCase() === word.toLowerCase()) {
        console.debug(`[LinkedIn Filter] Keyword "${word}" matched exactly in text: "${cleanTextWord}"`);
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Highlight found keywords by converting them to bold in the post text
 * Preserves all original formatting while making keywords bold
 * @param {HTMLElement} postElement 
 * @param {Set<string>} wordSet 
 */
function highlightFoundKeywords(postElement, wordSet) {
  if (!wordSet || wordSet.size === 0) return;
  
  try {
    const textElements = getTextContentElements(postElement);
    
    textElements.forEach(textElement => {
      if (textElement.hasAttribute('data-lkw-highlighted')) return; // Skip if already highlighted
      
      // Store original HTML content to preserve formatting
      const originalHTML = textElement.innerHTML;
      
      // Create a temporary container to work with the HTML
      const tempContainer = document.createElement('div');
      tempContainer.innerHTML = originalHTML;
      
      let hasChanges = false;
      
      // Function to process text nodes and make keywords bold
      function processTextNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent;
          
          // Check each keyword against this text node
          wordSet.forEach(keyword => {
            if (keyword && keyword.length > 0) {
              // Create regex for case-insensitive matching with word boundaries
              const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'gi');
              const matches = text.match(regex);
              
              if (matches && matches.length > 0) {
                hasChanges = true;
                
                // Create a document fragment to hold the processed content
                const fragment = document.createDocumentFragment();
                let lastIndex = 0;
                
                matches.forEach(match => {
                  const matchIndex = text.indexOf(match, lastIndex);
                  
                  // Add text before the match
                  if (matchIndex > lastIndex) {
                    fragment.appendChild(document.createTextNode(text.substring(lastIndex, matchIndex)));
                  }
                  
                  // Create bold element for the keyword
                  const boldElement = document.createElement('strong');
                  boldElement.textContent = match;
                  boldElement.style.fontWeight = 'bold';
                  boldElement.style.color = '#0a66c2'; // LinkedIn blue color
                  fragment.appendChild(boldElement);
                  
                  lastIndex = matchIndex + match.length;
                });
                
                // Add remaining text after the last match
                if (lastIndex < text.length) {
                  fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
                }
                
                // Replace the text node with the fragment
                node.parentNode.replaceChild(fragment, node);
              }
            }
          });
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          // Recursively process child nodes to preserve nested formatting
          Array.from(node.childNodes).forEach(childNode => {
            processTextNode(childNode);
          });
        }
      }
      
      // Process all nodes in the container
      Array.from(tempContainer.childNodes).forEach(processTextNode);
      
      // Only update if changes were made
      if (hasChanges) {
        textElement.innerHTML = tempContainer.innerHTML;
        textElement.setAttribute('data-lkw-highlighted', '1');
        console.debug('[LinkedIn Filter] Keywords highlighted in bold while preserving formatting');
      }
    });
    
  } catch (error) {
    console.error('[LinkedIn Filter] Error highlighting keywords:', error);
  }
}

/**
 * Remove keyword highlighting from a post
 * @param {HTMLElement} postElement 
 */
function removeKeywordHighlighting(postElement) {
  try {
    const textElements = postElement.querySelectorAll('[data-lkw-highlighted]');
    textElements.forEach(element => {
      element.removeAttribute('data-lkw-highlighted');
    });
  } catch (error) {
    console.debug('[LinkedIn Filter] Error removing keyword highlighting:', error);
  }
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
    post.removeAttribute('data-lkw-highlighted');
  });
  console.debug(`[LinkedIn Filter] Reset processing markers on ${posts.size} posts`);
}






