/**
 * LinkedIn Keyword Filter - Popup Script
 * Handles UI interactions, configuration, import/export
 */

// DOM elements
let elements = {};

// Current configuration
let currentConfig = {
  mode: 'blacklist',
  paused: false,
  words: []
};

// Profiles system
let profiles = {
  default: {
    name: 'Default Profile',
    mode: 'blacklist',
    paused: false,
    words: []
  }
};

let currentProfileId = 'default';

/**
 * Initialize the popup
 */
async function init() {
  console.debug('[LinkedIn Filter Popup] Initializing...');
  
  // Get DOM elements
  getElements();
  
  // Set up event listeners
  setupEventListeners();
  
  // Load and display configuration
  await loadConfig();
  updateUI();
  
  // Update counter
  await updateHiddenCounter();
  
  // Set up periodic counter updates
  setupCounterUpdates();
  
  console.debug('[LinkedIn Filter Popup] Initialized');
}

/**
 * Get all DOM elements
 */
function getElements() {
  elements = {
    // Profile selection
    profileSelect: document.getElementById('profileSelect'),
    newProfileBtn: document.getElementById('newProfileBtn'),
    deleteProfileBtn: document.getElementById('deleteProfileBtn'),
    
    // Mode selection
    modeBlacklist: document.getElementById('modeBlacklist'),
    modeWhitelist: document.getElementById('modeWhitelist'),
    
    // Toggles
    pauseFilter: document.getElementById('pauseFilter'),
    
    // Keywords input
    keywordsInput: document.getElementById('keywordsInput'),
    
    // Action buttons
    saveBtn: document.getElementById('saveBtn'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    copyPromptBtn: document.getElementById('copyPromptBtn'),
    
    // Status and counter
    statusMessage: document.getElementById('statusMessage'),
    hiddenCount: document.getElementById('hiddenCount')
  };
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Profile selection
  elements.profileSelect.addEventListener('change', handleProfileChange);
  elements.newProfileBtn.addEventListener('click', handleNewProfile);
  elements.deleteProfileBtn.addEventListener('click', handleDeleteProfile);
  
  // Mode change
  elements.modeBlacklist.addEventListener('change', handleModeChange);
  elements.modeWhitelist.addEventListener('change', handleModeChange);
  
  // Pause toggle
  elements.pauseFilter.addEventListener('change', handlePauseChange);
  

  
  // Buttons
  elements.saveBtn.addEventListener('click', handleSave);
  elements.exportBtn.addEventListener('click', handleExport);
  elements.importBtn.addEventListener('click', handleImport);
  elements.copyPromptBtn.addEventListener('click', handleCopyPrompt);
  
  // Import file input (if it exists)
  if (elements.importFile) {
    elements.importFile.addEventListener('change', handleFileImport);
  }
  
  // Auto-save on textarea blur (optional convenience)
  elements.keywordsInput.addEventListener('blur', handleAutoSave);
  
  // Enter key in textarea as save shortcut
  elements.keywordsInput.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  });
}

/**
 * Update visual state of form elements
 */
function updateVisualState() {
  // Update radio button visual state
  const blacklistContainer = elements.modeBlacklist.closest('.radio-option');
  const whitelistContainer = elements.modeWhitelist.closest('.radio-option');
  const pauseContainer = elements.pauseFilter.closest('.pause-filter');


  // Remove all checked classes first
  blacklistContainer.classList.remove('checked');
  whitelistContainer.classList.remove('checked');
  pauseContainer.classList.remove('checked');

  // Add checked class to active elements
  if (elements.modeBlacklist.checked) {
    blacklistContainer.classList.add('checked');
  } else if (elements.modeWhitelist.checked) {
    whitelistContainer.classList.add('checked');
  }

  if (elements.pauseFilter.checked) {
    pauseContainer.classList.add('checked');
  }


}

/**
 * Load configuration from storage
 */
async function loadConfig() {
  try {
    console.log('[LinkedIn Filter Popup] 🔍 Loading configuration from storage...');
    
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
    
    // Load profiles
    profiles = result.profiles || {
      default: {
        name: 'Default Profile',
        mode: 'blacklist',
        paused: false,
        words: []
      }
    };
    
    currentProfileId = result.currentProfileId || 'default';
    
    // Load current profile configuration
    currentConfig = profiles[currentProfileId] || profiles.default;
    
    console.log('[LinkedIn Filter Popup] ✅ Configuration loaded successfully:', {
      currentProfile: currentProfileId,
      mode: currentConfig.mode,
      paused: currentConfig.paused,
      wordsCount: currentConfig.words.length,
      profilesCount: Object.keys(profiles).length
    });
    
    // Verify configuration persistence
    if (currentConfig.words.length > 0) {
      console.log('[LinkedIn Filter Popup] 📝 Keywords found:', currentConfig.words.slice(0, 5));
    } else {
      console.log('[LinkedIn Filter Popup] ⚠️ No keywords configured');
    }
    
    // Update profile selector
    updateProfileSelector();
    
  } catch (error) {
    console.error('[LinkedIn Filter Popup] ❌ Failed to load config:', error);
    showStatusMessage('Error loading configuration', 'error');
    
    // Fallback to default configuration
    console.log('[LinkedIn Filter Popup] 🔄 Using fallback configuration');
    currentConfig = {
      mode: 'blacklist',
      paused: false,
      words: []
    };
  }
}

/**
 * Update profile selector with available profiles
 */
function updateProfileSelector() {
  // Clear existing options
  elements.profileSelect.innerHTML = '';
  
  // Add profile options
  Object.keys(profiles).forEach(profileId => {
    const profile = profiles[profileId];
    const option = document.createElement('option');
    option.value = profileId;
    option.textContent = profile.name;
    elements.profileSelect.appendChild(option);
  });
  
  // Set current profile
  elements.profileSelect.value = currentProfileId;
  
  // Show/hide delete button (don't allow deleting default profile)
  elements.deleteProfileBtn.style.display = currentProfileId === 'default' ? 'none' : 'block';
}

/**
 * Update UI with current configuration
 */
function updateUI() {
  // Set mode
  if (currentConfig.mode === 'blacklist') {
    elements.modeBlacklist.checked = true;
  } else {
    elements.modeWhitelist.checked = true;
  }
  
  // Set pause state
  elements.pauseFilter.checked = currentConfig.paused;
  

  
  // Set keywords
  elements.keywordsInput.value = currentConfig.words.join('\n');
  
  // Update visual state
  updateVisualState();
}

/**
 * Handle profile change
 */
async function handleProfileChange() {
  const newProfileId = elements.profileSelect.value;
  
  if (newProfileId !== currentProfileId) {
    // Save current profile before switching
    await saveCurrentProfile();
    
    // Switch to new profile
    currentProfileId = newProfileId;
    currentConfig = { ...profiles[currentProfileId] };
    
    // Update UI
    updateUI();
    
    // Save current profile ID
    await chrome.storage.local.set({ currentProfileId });
    
    // Trigger reprocessing in content script
    await triggerReprocess();
    
    showStatusMessage(`Switched to profile: ${profiles[currentProfileId].name}`, 'info');
  }
}

/**
 * Handle new profile creation
 */
async function handleNewProfile() {
  const profileName = prompt('Enter profile name:');
  
  if (profileName && profileName.trim()) {
    const profileId = 'profile_' + Date.now();
    
    // Create new profile with current settings
    profiles[profileId] = {
      name: profileName.trim(),
      mode: currentConfig.mode,
      paused: currentConfig.paused,
      words: [...currentConfig.words]
    };
    
    // Save profiles
    await chrome.storage.local.set({ profiles });
    
    // Update UI
    updateProfileSelector();
    
    showStatusMessage(`Profile "${profileName}" created successfully!`, 'success');
  }
}

/**
 * Handle profile deletion
 */
async function handleDeleteProfile() {
  if (currentProfileId === 'default') {
    showStatusMessage('Cannot delete default profile', 'error');
    return;
  }
  
  const profileName = profiles[currentProfileId].name;
  const confirmDelete = confirm(`Are you sure you want to delete profile "${profileName}"?`);
  
  if (confirmDelete) {
    // Delete profile
    delete profiles[currentProfileId];
    
    // Switch to default profile
    currentProfileId = 'default';
    currentConfig = { ...profiles.default };
    
    // Save changes
    await chrome.storage.local.set({ 
      profiles,
      currentProfileId 
    });
    
    // Update UI
    updateProfileSelector();
    updateUI();
    
    // Trigger reprocessing
    await triggerReprocess();
    
    showStatusMessage(`Profile "${profileName}" deleted successfully!`, 'success');
  }
}

/**
 * Save current profile configuration
 */
async function saveCurrentProfile() {
  // Update current profile with current config
  profiles[currentProfileId] = { ...currentConfig };
  
  // Save to storage
  await chrome.storage.local.set({ profiles });
}

/**
 * Handle mode change
 */
async function handleModeChange() {
  const newMode = elements.modeBlacklist.checked ? 'blacklist' : 'whitelist';
  
  if (newMode !== currentConfig.mode) {
    currentConfig.mode = newMode;
    updateVisualState(); // Update visual state immediately
    await saveConfig();
    showStatusMessage(`Mode changed to ${newMode === 'blacklist' ? 'Blacklist' : 'Whitelist'}`, 'info');
  }
}

/**
 * Handle pause toggle change
 */
async function handlePauseChange() {
  const newPaused = elements.pauseFilter.checked;
  
  if (newPaused !== currentConfig.paused) {
    currentConfig.paused = newPaused;
    updateVisualState(); // Update visual state immediately
    await saveConfig();
    showStatusMessage(newPaused ? 'Filter paused' : 'Filter activated', 'info');
  }
}



/**
 * Handle auto-save on textarea blur
 */
async function handleAutoSave() {
  const currentWords = parseKeywords(elements.keywordsInput.value);
  
  // Only save if words actually changed
  if (!arraysEqual(currentWords, currentConfig.words)) {
    await handleSave();
  }
}

/**
 * Handle save button click
 */
async function handleSave() {
  try {
    elements.saveBtn.disabled = true;
    elements.saveBtn.textContent = 'Saving...';
    
    // Parse and normalize keywords
    const rawKeywords = elements.keywordsInput.value;
    const keywords = parseKeywords(rawKeywords);
    const normalizedKeywords = normalizeKeywords(keywords);
    
    // Update configuration
    currentConfig.words = normalizedKeywords;
    
    // Save to current profile and storage
    await saveCurrentProfile();
    await saveConfig();
    
    // Trigger reprocessing in content script
    await triggerReprocess();
    
    showStatusMessage(`Configuration saved to profile "${profiles[currentProfileId].name}"! ${normalizedKeywords.length} words configured.`, 'success');
    
  } catch (error) {
    console.error('[LinkedIn Filter Popup] Save failed:', error);
    showStatusMessage('Error saving configuration', 'error');
  } finally {
    elements.saveBtn.disabled = false;
    elements.saveBtn.innerHTML = '<span class="btn-icon">💾</span> Save';
  }
}

/**
 * Handle export button click
 */
async function handleExport() {
  try {
    const exportData = {
      profileName: profiles[currentProfileId].name,
      mode: currentConfig.mode,
      words: currentConfig.words,
      exportDate: new Date().toISOString()
    };
    
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const link = document.createElement('a');
    link.href = url;
    link.download = `linkedin-filter-${profiles[currentProfileId].name.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.json`;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
    
    showStatusMessage(`Profile "${profiles[currentProfileId].name}" exported successfully!`, 'success');
    
  } catch (error) {
    console.error('[LinkedIn Filter Popup] Export failed:', error);
    showStatusMessage('Error exporting configuration', 'error');
  }
}

/**
 * Handle import button click
 */
function handleImport() {
  elements.importFile.click();
}

/**
 * Handle file import
 */
async function handleFileImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    let importData;
    
    // Try parsing as JSON first
    if (file.name.endsWith('.json')) {
      importData = JSON.parse(text);
    } else if (file.name.endsWith('.csv')) {
      // Parse CSV (simple comma-separated or line-separated)
      const words = text.split(/[,\n\r]+/).map(w => w.trim()).filter(w => w);
      importData = { words };
    } else {
      throw new Error('Unsupported file format. Use .json or .csv');
    }
    
    // Validate and extract words
    if (!importData.words || !Array.isArray(importData.words)) {
      throw new Error('Invalid file format. Expected: { "words": [...] }');
    }
    
    // Check if this is a profile import
    if (importData.profileName && importData.profileName !== profiles[currentProfileId].name) {
      const createNewProfile = confirm(
        `This file contains profile "${importData.profileName}". Would you like to create a new profile with this data?`
      );
      
      if (createNewProfile) {
        // Create new profile
        const profileId = 'profile_' + Date.now();
        profiles[profileId] = {
          name: importData.profileName,
          mode: importData.mode || currentConfig.mode,
          paused: false,
          words: importData.words
        };
        
        // Save profiles
        await chrome.storage.local.set({ profiles });
        
        // Switch to new profile
        currentProfileId = profileId;
        currentConfig = { ...profiles[profileId] };
        
        // Update UI
        updateProfileSelector();
        updateUI();
        
        showStatusMessage(`New profile "${importData.profileName}" created and imported!`, 'success');
        return;
      }
    }
    
    // Merge with current configuration
    const normalizedWords = normalizeKeywords(importData.words);
    const mergedWords = [...new Set([...currentConfig.words, ...normalizedWords])];
    
    // Update UI and configuration
    currentConfig.words = mergedWords;
    elements.keywordsInput.value = mergedWords.join('\n');
    
    // Optionally import mode
    if (importData.mode && ['blacklist', 'whitelist'].includes(importData.mode)) {
      currentConfig.mode = importData.mode;
      updateUI();
    }
    
    await saveCurrentProfile();
    await saveConfig();
    await triggerReprocess();
    
    showStatusMessage(`Import completed! ${normalizedWords.length} words added to current profile.`, 'success');
    
  } catch (error) {
    console.error('[LinkedIn Filter Popup] Import failed:', error);
    showStatusMessage(`Import error: ${error.message}`, 'error');
  } finally {
    // Reset file input
    elements.importFile.value = '';
  }
}

/**
 * Parse keywords from textarea input
 */
function parseKeywords(input) {
  if (!input) return [];
  
  return input
    .split(/[,\n\r]+/)
    .map(word => word.trim())
    .filter(word => word.length > 0);
}

/**
 * Normalize keywords (lowercase, remove accents, deduplicate)
 */
function normalizeKeywords(keywords) {
  const normalized = keywords.map(word => 
    word
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
  ).filter(word => word.length > 0);
  
  // Remove duplicates
  return [...new Set(normalized)];
}

/**
 * Save configuration to storage
 */
async function saveConfig() {
  await chrome.storage.local.set(currentConfig);
  console.debug('[LinkedIn Filter Popup] Config saved:', currentConfig);
}

/**
 * Trigger reprocessing in content script
 */
async function triggerReprocess() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];
    
    if (activeTab?.url?.includes('linkedin.com')) {
      await chrome.tabs.sendMessage(activeTab.id, { type: 'reprocess' });
    }
  } catch (error) {
    console.debug('[LinkedIn Filter Popup] Failed to trigger reprocess:', error);
    // This might fail if no LinkedIn tab is open, which is okay
  }
}

/**
 * Update hidden posts counter
 */
async function updateHiddenCounter() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];
    
    if (activeTab?.url?.includes('linkedin.com')) {
      const response = await chrome.tabs.sendMessage(activeTab.id, { type: 'getCount' });
      elements.hiddenCount.textContent = response || 0;
    } else {
      elements.hiddenCount.textContent = '-';
    }
  } catch (error) {
    console.debug('[LinkedIn Filter Popup] Failed to get count:', error);
    elements.hiddenCount.textContent = '-';
  }
}

/**
 * Set up periodic counter updates
 */
function setupCounterUpdates() {
  // Update counter every 2 seconds when popup is open
  const updateInterval = setInterval(updateHiddenCounter, 2000);
  
  // Cleanup on popup close
  window.addEventListener('beforeunload', () => {
    clearInterval(updateInterval);
  });
  
  // Listen for count updates from content script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'count') {
      elements.hiddenCount.textContent = message.value || 0;
    }
  });
}

/**
 * Show status message
 */
function showStatusMessage(message, type = 'info') {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message ${type}`;
  elements.statusMessage.style.display = 'block';
  
  // Auto-hide after 3 seconds
  setTimeout(() => {
    elements.statusMessage.style.display = 'none';
  }, 3000);
}

/**
 * Check if two arrays are equal
 */
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((val, i) => val === b[i]);
}

/**
 * Handle copy prompt button click
 */
async function handleCopyPrompt() {
  try {
    // Get current keywords to suggest topics
    const currentKeywords = currentConfig.words;
    const suggestedTopics = currentKeywords.length > 0 
      ? currentKeywords.slice(0, 5).join(', ') 
      : 'job, vacancy, internship, developer, marketing';
    
    // Create the prompt
    const prompt = `# LinkedIn Keyword Filter Prompt - ${profiles[currentProfileId].name}

I want to create a list of keywords to use in a LinkedIn post filter.  

The filter can work as a **block list** (to hide posts about these topics) or an **allow list** (to only show posts about these topics).  

---

### My topics are:
${suggestedTopics}  

### The languages I want the keywords in are:
English, Portuguese, or both  

---

### Instructions
- Generate a list of **keywords related** to these topics.  
- Include **synonyms, common terms, variations, and short expressions**.  
- Provide the list in the specified **languages**.  
- Return the result in a **clean format: only the keywords, one per line, with no hashtags, no language labels, no numbers, and no explanations.**  `;

    // Copy to clipboard
    await navigator.clipboard.writeText(prompt);
    
    // Show success message
    showStatusMessage('LLM prompt copied to clipboard!', 'success');
    
    // Update button text temporarily
    const originalText = elements.copyPromptBtn.innerHTML;
    elements.copyPromptBtn.innerHTML = '✅ Copied!';
    elements.copyPromptBtn.disabled = true;
    
    // Reset button after 2 seconds
    setTimeout(() => {
      elements.copyPromptBtn.innerHTML = originalText;
      elements.copyPromptBtn.disabled = false;
    }, 2000);
    
  } catch (error) {
    console.error('[LinkedIn Filter Popup] Failed to copy prompt:', error);
    showStatusMessage('Failed to copy prompt to clipboard', 'error');
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
