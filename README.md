# LinkedIn Keyword Filter

A Chrome extension (Manifest V3) that filters posts from the main LinkedIn feed by keywords using block list or allow list. **100% local, no tracking.**

## ✨ Features

### 🔍 **Smart Filters**
- **Block List**: Hides posts containing specific words
- **Allow List**: Shows only posts containing specific words
- **Highlight**: **NEW!** Highlights keywords in allow list mode for easy identification
- **Pause filter**: Shows all posts temporarily

### 🎯 **Advanced Matching**
- **Case-insensitive**: Ignores uppercase/lowercase
- **Accents**: Normalizes accents (e.g., "trabalho" = "trabalhó")
- **Substring**: "dev" filters "developer", "devops", etc.
- **Simple plurals**: "trabalho" filters "trabalhos"
- **Ignores**: hashtags, mentions (@user), links and emojis

### 🎨 **Visual Highlighting (Allow List Mode)**
- **Golden background**: Keywords highlighted with golden yellow background
- **Hover effect**: Visual effect when hovering over highlights
- **Smooth animation**: Elegant transition when applying highlights
- **Responsive**: Works on all screen sizes
- **Automatic**: Highlights are applied/removed automatically when changing modes

### 🤖 **AI-Powered Keyword Generation** ⭐ **NEW!**
- **LLM Prompt Button**: Copy optimized prompts for ChatGPT, Claude, Gemini, etc.
- **Smart Topic Suggestions**: Automatically suggests topics based on current keywords
- **Multi-language Support**: Generates prompts for English and Portuguese
- **One-click Copy**: Automatically copies prompts to clipboard
- **Visual Feedback**: Button shows "✅ Copied!" confirmation

### 💾 **Configuration Management**
- **Import/Export**: Support for JSON and CSV
- **Persistent**: Settings saved automatically
- **Counter**: Hidden posts in current session
- **Intuitive interface**: Easy-to-use popup

## 🚀 Installation

### Method 1: Developer (Recommended)
1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (top right corner)
4. Click "Load unpacked"
5. Select the project folder

### Method 2: .crx file
1. Download the `.crx` file from the Releases section
2. Drag the file to `chrome://extensions/`
3. Confirm installation

## 📖 How to Use

### 1. **Configure Keywords**
- Click the extension icon in the toolbar
- Choose between **Block List** or **Allow List**
- Enter keywords (one per line or separated by commas)
- Click **Save**

### 2. **Block List Mode**
- Posts containing keywords are **hidden**
- Feed shows only "clean" content
- Ideal for filtering spam, unwanted content

### 3. **Allow List Mode**
- Posts **without** keywords are hidden
- Keywords are **highlighted** with golden background
- Ideal for focusing on specific topics

### 4. **AI-Powered Keyword Expansion** ⭐ **NEW!**
- Click the **"🤖 Copy LLM Prompt"** button
- The prompt is automatically copied to your clipboard
- Paste it into ChatGPT, Claude, Gemini, or any other LLM
- Copy the generated keywords back to the extension
- This feature helps create comprehensive keyword lists with synonyms, variations, and hashtags

### 5. **Manage Settings**
- **Pause filter**: Shows all posts temporarily
- **Import**: Load settings from JSON/CSV file
- **Export**: Save current settings
- **Counter**: See how many posts were hidden in the session

## 🎨 Highlight Example

**Allow List Mode** with keywords: "job", "vacancy", "developer"

```
I'm looking for a [vacancy] as a [developer] frontend. 
I have experience with React and Node.js. If anyone knows 
of a [job] opportunity, let me know!
```

Keywords appear highlighted with a golden yellow background, making it easy to identify why the post is being shown.

## 🤖 LLM Prompt Example

When you click the "Copy LLM Prompt" button, it generates a prompt like this:

```
Prompt for generating allow list/block list keywords

I want to create a list of keywords to use in a LinkedIn post filter.

The filter can work as a block list (to hide posts about these topics) or an allow list (to only show posts about these topics).

My topics are:
trabalho, vaga, estagio, linkedin, desenvolvedor

The languages I want the keywords in are:
English, Portuguese, or both

Please:

Generate a list of keywords related to these topics.

Include synonyms, common terms, variations, short expressions, and popular hashtags.

Provide the list in the specified languages.

Return the result in a clean format, one keyword per line.

Do not add explanations, just the final list of keywords.
```

The LLM will then generate a comprehensive list of related keywords that you can use to improve your filters.

## 🔧 Main Files

- **`manifest.json`**: Extension configuration
- **`content/content.js`**: Main filtering logic
- **`content/dom-utils.js`**: DOM utilities and highlighting
- **`content/content.css`**: Styles for highlights
- **`popup/popup.html/js/css`**: User interface
- **`service_worker.js`**: Background worker

## 🧪 Testing

### Demo Files
- **`highlight-demo.html`**: Demonstrates the highlighting system
- **`test.html`**: General extension tests
- **`content-test.html`**: Specific content script tests
- **`test-popup-prompt.html`**: Tests the new LLM prompt functionality
- **`diagnostico-extensao.html`**: Comprehensive diagnostic tool
- **`test-linkedin-selectors.html`**: Tests DOM selectors on LinkedIn
- **`test-config-persistence.html`**: **NEW!** Tests configuration persistence after page reload

### How to Test
1. Open demo files in browser
2. Test different keywords
3. Switch between block list/allow list modes
4. Verify highlights work correctly
5. Test the LLM prompt button functionality

## 📱 Compatibility

- **Chrome**: 88+ (Manifest V3)
- **Edge**: 88+ (Chromium-based)
- **LinkedIn**: Current web version
- **Systems**: Windows, macOS, Linux

## 🚫 Known Limitations

- **Main feed only**: Does not filter comments or reactions
- **Dynamic DOM**: May need page reload on structural changes
- **Reposts**: Considers original content or largest text block
- **Languages**: Optimized for Portuguese and English

## 🔧 Troubleshooting

### Configuration Not Persisting After Page Reload

If your configuration is lost after pressing F5 or reloading the page:

1. **Use the diagnostic tool**: Open `test-config-persistence.html` to test storage functionality
2. **Check browser console**: Look for error messages related to Chrome Storage API
3. **Verify extension permissions**: Ensure the extension has storage permission
4. **Test storage access**: Use the test buttons to verify storage is working
5. **Check for conflicts**: Other extensions might interfere with storage

### Common Issues

- **Storage API errors**: Usually indicates permission or context issues
- **Configuration mismatch**: Content script and popup might have different configs
- **Service worker issues**: Background script might not be running properly
- **LinkedIn DOM changes**: Selectors might need updating

### Diagnostic Steps

1. Open `test-config-persistence.html` in your browser
2. Run the full test suite
3. Check the console for detailed logs
4. If tests fail, the issue is with Chrome Storage API
5. If tests pass but extension fails, the issue is in the content script

## 🔒 Privacy

- **100% local**: No data sent to external servers
- **No tracking**: Does not collect personal information
- **No analytics**: Does not monitor user behavior
- **Local storage**: Settings stay only on your browser

## 🤝 Contributions

Contributions are welcome! Please:

1. Fork the project
2. Create a branch for your feature
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

This project is under the MIT license. See the `LICENSE` file for details.

## 🆕 Changelog

### v1.1.0 - AI-Powered Keyword Generation
- ✅ **NEW**: "🤖 Copy LLM Prompt" button
- ✅ **NEW**: Smart prompt generation based on current keywords
- ✅ **NEW**: Multi-language support (English/Portuguese)
- ✅ **NEW**: One-click clipboard copy with visual feedback
- ✅ **NEW**: Comprehensive testing tools for the new functionality
- ✅ **NEW**: Enhanced configuration persistence and recovery system

### v1.0.0 - Core Features
- ✅ Block list/allow list filters
- ✅ Intelligent word matching
- ✅ Intuitive popup interface
- ✅ Keyword highlighting system for allow list mode
- ✅ Enhanced visual styles
- ✅ Smooth animations
- ✅ Interactive demo
- ✅ Import/export configurations
- ✅ Hidden posts counter
- ✅ Pause filter support

---

**Developed with ❤️ to improve your LinkedIn experience**
