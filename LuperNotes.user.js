// ========================================================================================
// Script Name:    LuperNotes (v1.0)
// Author:         HoRRis Lupercal (with assistance from Google Gemini)
// Description:    Adds a notes tab within the "Friends" widget with markdown link support,
//                 custom UI colors and formatting, individual notes for each city,
//                 plus a persistent Global Notes page toggle!
// AI Disclosure:  Google Gemini was used in the creation of this script
// Target Site:    *://*.illyriad.co.uk/*
// ========================================================================================

// -------------------------------------------------------------------
// CUSTOM TAGS & FORMATTING OPTIONS
// You can use the following tags directly inside your notes:
//
// UI Theme Overrides (Use hex codes, e.g., #ff0000 or ff0000):
//   !TextColour(#hex)     - Changes the default note text color
//   !UITextColour(#hex)   - Changes the title and button text color
//   !UIButtonColour(#hex) - Changes the button background color
//   !UIBodyColour(#hex)   - Changes the notepad and textarea background
//   !UIBorderColour(#hex) - Changes the outer frame and border colors
//   !UIHeaderColour(#hex) - Changes the header bar background color
//
// Text Formatting:
//   <b>text</b>           - Bold text
//   <i>text</i>           - Italic text
//   <u>text</u>           - Underlined text
//   <fs(#)>text</fs>   - Custom font size. You can use pure numbers (<fs(14)> defaults to px)
//                           or CSS units (<fs(1.2em)>).
//
// Links:
//   [Label](URL)          - Standard markdown link
//   [Label](URL){#hex}    - Markdown link with a custom color
//   Bare URLs             - Starting with http://, https://, or www.
//                           are automatically converted to links
// -----------------------------------------------------------------

// ==UserScript==
// @name         LuperNotes
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Adds a Notes Tab within the Friends List widget in Illyriad.
// @author       HoRRis_Lupercal
// @match        *://*.illyriad.co.uk/*
// @include      *://*.illyriad.co.uk/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // -------------------------------------------------------------
    // DEFAULT CONFIGURATION
    // Modify these values to change default colors and layout properties.
    // -------------------------------------------------------------
    var DEFAULT_THEME = {
        // --- Colors (Can be overridden in notes via custom tags) ---
        textColour:     '#523307', // Default note text color
        uiTextColour:   '#523307', // Title and button text color
        uiHeaderBg:     '#d4b767', // Header bar background color
        uiBodyBg:       '#fef6dc', // Notepad display area & textarea background
        uiButtonBg:     '#caa84e', // Button background color
        uiBorderColour: '#89501c', // Outer frame background, padding & all borders

        // --- Layout & Borders (Hardcoded via script only, no custom tags) ---
        borderWidth:    '1px', // Thickness of borders for all panel elements
        panelPadding:   '1px', // Outer padding inside the main widget frame
        panelRadius:    '2px', // Rounded corners for the outer widget frame
        bodyPadding:    '4px', // Inner padding for the text display/edit area
        headerPadding:  '2px 2px', // Inner padding for the top header title bar
        headerGap:      '1px', // Space/gap between the header title bar and the note section
        buttonPadding:  '3px 0', // Inner padding for the action buttons
        buttonRadius:   '2px' // Rounded corners for the action buttons
    };

    // --------------------------------------------------------------------------
    // Global State & Configurations. NO USER EDITABLE VALUES BELOW THIS COMMENT!
    // --------------------------------------------------------------------------

    var currentLoadedTown = null;
    var isGlobalMode = false;

    var TOWN_SELECTORS = [
        '#ddlTowns',
        'select[name="towns"]',
        '#townSelect',
        '#currentTown',
        '.town-select',
        '#ddlTown'
    ];

    // -------------------------------------------------------------
    // Helper Functions
    // -------------------------------------------------------------

    function createEl(tag, className, text) {
        var el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }

    function cleanTownName(rawName) {
        if (!rawName) return '';
        return rawName
            .replace(/[\(\[\{]\s*Capital\s*[\)\]\}]/gi, '')
            .replace(/^(Capital)\s*[-:]?\s*/gi, '')
            .replace(/\s*-\s*.*$/, '')
            .replace(/^[\s-:]+|[\s-:]+$/g, '')
            .trim() || rawName;
    }

    function escapeHTML(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function parseHexColor(text, tagRegex) {
        if (!text) return null;
        var match = text.match(tagRegex);
        if (match && match[1]) {
            var rawHex = match[1].trim();
            var isValidHex = /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(rawHex);
            if (isValidHex) {
                return rawHex.startsWith('#') ? rawHex : '#' + rawHex;
            }
        }
        return null;
    }

    function getStorageKey() {
        return isGlobalMode ? 'notes_global' : ('notes_' + getActiveTownId());
    }

    function applyCustomUITheme(text, rootEl) {
        var context = rootEl || document;

        var textColor = parseHexColor(text, /!TextColour\(([^)]+)\)/i) || DEFAULT_THEME.textColour;
        var uiTextColor = parseHexColor(text, /!UITextColour\(([^)]+)\)/i)|| DEFAULT_THEME.uiTextColour;
        var uiBtnBgColor = parseHexColor(text, /!UIButtonColour\(([^)]+)\)/i)|| DEFAULT_THEME.uiButtonBg;
        var uiBodyBgColor = parseHexColor(text, /!UIBodyColour\(([^)]+)\)/i)|| DEFAULT_THEME.uiBodyBg;
        var uiBorderColor = parseHexColor(text, /!UIBorderColour\(([^)]+)\)/i)|| DEFAULT_THEME.uiBorderColour;
        var uiHeaderBgColor = parseHexColor(text, /!UIHeaderColour\(([^)]+)\)/i)|| DEFAULT_THEME.uiHeaderBg;

        var panelContainer = (context.classList && context.classList.contains('notepad-tab-panel'))
            ? context
            : context.querySelector('.notepad-tab-panel');

        if (panelContainer) {
            panelContainer.style.setProperty('background-color', uiBorderColor, 'important');
            panelContainer.style.setProperty('border-color', uiBorderColor, 'important');
        }

        var titleLabel = context.querySelector('#cityNotesTitleLabel');
        if (titleLabel) titleLabel.style.setProperty('color', uiTextColor, 'important');

        var headerBar = context.querySelector('.notepad-bar');
        if (headerBar) {
            headerBar.style.setProperty('background-color', uiHeaderBgColor, 'important');
            headerBar.style.setProperty('border-color', uiBorderColor, 'important');
        }

        var buttons = context.querySelectorAll('.city-notes-btn');
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].style.setProperty('color', uiTextColor, 'important');
            buttons[i].style.setProperty('background-color', uiBtnBgColor, 'important');
            buttons[i].style.setProperty('border-color', uiBorderColor, 'important');
        }

        var displayDiv = context.querySelector('.city-notes-display');
        var textarea = context.querySelector('.city-notes-area');
        if (displayDiv) {
            displayDiv.style.setProperty('background-color', uiBodyBgColor, 'important');
            displayDiv.style.setProperty('border-color', uiBorderColor, 'important');
        }
        if (textarea) {
            textarea.style.setProperty('background-color', uiBodyBgColor, 'important');
            textarea.style.setProperty('border-color', uiBorderColor, 'important');
            textarea.style.setProperty('color', textColor, 'important');
        }
    }

    function renderClickableText(text) {
        var defaultTextColor = parseHexColor(text, /!TextColour\(([^)]+)\)/i) || DEFAULT_THEME.textColour;

        if (!text || !text.trim()) {
            var emptyLabel = isGlobalMode ? 'No global notes yet.' : 'No city notes yet.';
            return '<span style="color: ' + defaultTextColor + '; font-style: italic; opacity: 0.7;">' + emptyLabel + ' See script comments for a list of features! Click "Edit" to add notes.</span>';
        }

        var cleanText = text
            .replace(/!TextColour\(([^)]+)\)/gi, '')
            .replace(/!UITextColour\(([^)]+)\)/gi, '')
            .replace(/!UIButtonColour\(([^)]+)\)/gi, '')
            .replace(/!UIBodyColour\(([^)]+)\)/gi, '')
            .replace(/!UIBorderColour\(([^)]+)\)/gi, '')
            .replace(/!UIHeaderColour\(([^)]+)\)/gi, '');

        var escaped = escapeHTML(cleanText);
        var linkRegex = /\[([^\]]+)\]\(([^)]+)\)(?:\{([^}]+)\})?|((?:https?:\/\/|www\.)[^\s<]+)/gi;

        // Process markdown and bare URLs
        var processed = escaped.replace(linkRegex, function(match, label, mdUrl, hexColor, bareUrl) {
            var href = '';
            var displayText = '';
            var finalColor = '#3479c6';

            if (label && mdUrl) {
                href = mdUrl.trim();
                displayText = label;

                if (hexColor) {
                    var cleanedHex = hexColor.trim();
                    var isValidHex = /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(cleanedHex);
                    if (isValidHex) {
                        finalColor = cleanedHex.startsWith('#') ? cleanedHex : '#' + cleanedHex;
                    }
                }
            } else if (bareUrl) {
                href = bareUrl.trim();
                displayText = bareUrl;
            } else {
                return match;
            }

            if (!href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('/')) {
                href = 'https://' + href;
            }

            return '<a href="' + href + '" target="_top" style="color: ' + finalColor + '; text-decoration: underline;" onclick="event.stopPropagation();">' + displayText + '</a>';
        });

        // Process <fs(#)> font size tags
        processed = processed.replace(/&lt;fs\(([^)]+)\)&gt;/gi, function(match, size) {
            // Strip out any potentially dangerous characters, allowing only numbers, dots, letters, and %
            var cleanSize = size.trim().replace(/[^a-zA-Z0-9.%]/g, '');
            // Automatically append 'px' if the user only entered a number
            if (/^\d+(\.\d+)?$/.test(cleanSize)) {
                cleanSize += 'px';
            }
            return '<span style="font-size: ' + cleanSize + ';">';
        });

        // Process closing </fs> or </fs(#)> tags
        processed = processed.replace(/&lt;\/fs(?:\([^)]+\))?&gt;/gi, '</span>');

        // Process standard b, u, i tags
        processed = processed.replace(/&lt;(\/?[bui])&gt;/gi, '<$1>');

        return '<span style="color: ' + defaultTextColor + ';">' + processed + '</span>';
    }

    function updateNotesDisplay(targetEl) {
        var displayDiv = targetEl || document.querySelector('.city-notes-display');
        if (!displayDiv) return;

        var rootContainer = displayDiv.closest('.notepad-tab-panel') || document;
        var savedText = GM_getValue(getStorageKey(), '');
        displayDiv.innerHTML = renderClickableText(savedText);
        applyCustomUITheme(savedText, rootContainer);
    }

    // -------------------------------------------------------------
    // Town Detection Logic
    // -------------------------------------------------------------

    function getTownSelectEl() {
        for (var i = 0; i < TOWN_SELECTORS.length; i++) {
            var el = document.querySelector(TOWN_SELECTORS[i]);
            if (el) return el;
        }
        return null;
    }

    function getActiveTownId() {
        try {
            if (window.Illyriad && window.Illyriad.Town && window.Illyriad.Town.CurrentTownID) {
                return String(window.Illyriad.Town.CurrentTownID);
            }
        } catch(e) {}

        if (window.currentTownId) return String(window.currentTownId);
        if (window.townId) return String(window.townId);

        var el = getTownSelectEl();
        if (el) {
            if (el.tagName === 'SELECT' && el.value) return String(el.value);
            if (el.textContent && el.textContent.trim()) return el.textContent.trim();
        }

        var opt = document.querySelector('select option:checked');
        return (opt && opt.value) ? String(opt.value) : 'default_city';
    }

    function getActiveTownName() {
        var rawName = '';

        try {
            if (window.Illyriad && window.Illyriad.Town && window.Illyriad.Town.CurrentTownName) {
                rawName = window.Illyriad.Town.CurrentTownName;
            }
        } catch(e) {}

        if (!rawName) {
            var el = getTownSelectEl();
            if (el) {
                if (el.tagName === 'SELECT' && el.selectedIndex >= 0 && el.options[el.selectedIndex]) {
                    rawName = el.options[el.selectedIndex].text.trim();
                } else if (el.textContent) {
                    rawName = el.textContent.trim();
                }
            }
        }

        if (!rawName) {
            var opt = document.querySelector('select option:checked');
            if (opt && opt.text) rawName = opt.text.trim();
        }

        return cleanTownName(rawName || getActiveTownId());
    }

    // -------------------------------------------------------------
    // Data Syncing & Polling
    // -------------------------------------------------------------

    function checkAndSyncTownNotes() {
        var activeTownId = getActiveTownId();
        var activeTownName = getActiveTownName();

        if (activeTownId !== currentLoadedTown) {
            currentLoadedTown = activeTownId;

            if (!isGlobalMode) {
                var savedText = GM_getValue('notes_' + activeTownId, '');
                var textarea = document.querySelector('.city-notes-area');
                if (textarea && textarea.style.display === 'block') {
                    textarea.value = savedText;
                }
                updateNotesDisplay();
            }
        }

        var titleLabel = document.querySelector('#cityNotesTitleLabel');
        if (titleLabel) {
            var expectedTitle = isGlobalMode ? 'Global Notes' : ('City Notes (' + activeTownName + ')');
            if (titleLabel.textContent !== expectedTitle) {
                titleLabel.textContent = expectedTitle;
            }
        }
    }

    setInterval(checkAndSyncTownNotes, 500);

    // -------------------------------------------------------------
    // UI Construction & CSS Styles
    // -------------------------------------------------------------

    function injectStyles() {
        if (document.getElementById('city-notes-styles')) return;
        var style = createEl('style');
        style.id = 'city-notes-styles';

        style.textContent = [
            // Tab Header Buttons
            '.illy-tab-active { color: #8b0000 !important; font-family: Georgia, serif !important; font-size: 13px !important; font-weight: bold !important; cursor: pointer !important; text-decoration: none !important; opacity: 1.0 !important; line-height: 1.1 !important; }',
            '.illy-tab-inactive { color: #786452 !important; font-family: Georgia, serif !important; font-size: 13px !important; font-weight: bold !important; cursor: pointer !important; text-decoration: none !important; opacity: 0.7 !important; line-height: 1.1 !important; }',
            '.illy-tab-inactive:hover { opacity: 1.0 !important; color: #8b0000 !important; }',

            // Panel Layout Container
            '.notepad-tab-panel { display: flex !important; flex-direction: column !important; flex: 1 1 0px !important; height: 100% !important; max-height: 100% !important; min-height: 0 !important; box-sizing: border-box !important; background: ' + DEFAULT_THEME.uiBorderColour + ' !important; padding: ' + DEFAULT_THEME.panelPadding + ' !important; border: ' + DEFAULT_THEME.borderWidth + ' solid ' + DEFAULT_THEME.uiBorderColour + ' !important; border-radius: ' + DEFAULT_THEME.panelRadius + ' !important; overflow: hidden !important; }',
            '.notepad-bar { display: flex !important; justify-content: center !important; align-items: center !important; text-align: center !important; background: ' + DEFAULT_THEME.uiHeaderBg + ' !important; border: ' + DEFAULT_THEME.borderWidth + ' solid ' + DEFAULT_THEME.uiBorderColour + ' !important; padding: ' + DEFAULT_THEME.headerPadding + ' !important; color: ' + DEFAULT_THEME.uiTextColour + ' !important; font-size: 10px !important; font-weight: bold !important; margin-bottom: ' + DEFAULT_THEME.headerGap + ' !important; flex-shrink: 0 !important; }',

            // Display Mode & Edit Textarea
            '.city-notes-display, .city-notes-area { flex: 1 1 0px !important; width: 100% !important; height: 0 !important; min-height: 0 !important; background: ' + DEFAULT_THEME.uiBodyBg + ' !important; color: ' + DEFAULT_THEME.textColour + ' !important; border: ' + DEFAULT_THEME.borderWidth + ' solid ' + DEFAULT_THEME.uiBorderColour + ' !important; padding: ' + DEFAULT_THEME.bodyPadding + ' !important; font-family: monospace !important; font-size: 10.5px !important; line-height: 1.35 !important; box-sizing: border-box !important; }',
            '.city-notes-display { overflow-y: auto !important; scrollbar-gutter: stable !important; white-space: pre-wrap !important; word-break: break-word !important; cursor: auto !important; }',
            '.city-notes-area { resize: none !important; display: none; }',

            '.city-notes-area::placeholder { color: inherit !important; font-style: italic !important; opacity: 0.7 !important; }',
            '.city-notes-area::-webkit-input-placeholder { color: inherit !important; font-style: italic !important; opacity: 0.7 !important; }',
            '.city-notes-area::-moz-placeholder { color: inherit !important; font-style: italic !important; opacity: 0.7 !important; }',
            '.city-notes-area:-ms-input-placeholder { color: inherit !important; font-style: italic !important; opacity: 0.7 !important; }',
            '.city-notes-area:focus { outline: 1px solid #d4af37 !important; }',

            // Action Footer & Buttons
            '.notepad-footer { display: flex !important; width: 100% !important; gap: 2px !important; padding-top: 2px !important; flex-shrink: 0 !important; box-sizing: border-box !important; height: auto !important; min-height: 0 !important; }',
            '.city-notes-btn { height: auto !important; min-height: 0 !important; max-height: none !important; background: ' + DEFAULT_THEME.uiButtonBg + ' !important; color: ' + DEFAULT_THEME.uiTextColour + ' !important; border: ' + DEFAULT_THEME.borderWidth + ' solid ' + DEFAULT_THEME.uiBorderColour + ' !important; border-radius: ' + DEFAULT_THEME.buttonRadius + ' !important; padding: ' + DEFAULT_THEME.buttonPadding + ' !important; margin: 0 !important; font-size: 9px !important; line-height: 1.1 !important; font-weight: bold !important; cursor: pointer !important; text-align: center !important; box-sizing: border-box !important; appearance: none !important; -webkit-appearance: none !important; }',
            '.city-notes-btn:hover { filter: brightness(1.25) !important; }',
            '.city-notes-btn-mode { flex: 1 1 33.333% !important; width: 33.333% !important; }',
            '.city-notes-btn-edit { flex: 2 2 66.667% !important; width: 66.667% !important; }'
        ].join(' ');

        document.head.appendChild(style);
    }

    function createNotesContentUI() {
        var container = createEl('div', 'notepad-tab-panel');

        var bar = createEl('div', 'notepad-bar');
        var title = createEl('span', '', 'City Notes (' + getActiveTownName() + ')');
        title.id = 'cityNotesTitleLabel';
        bar.appendChild(title);

        var displayDiv = createEl('div', 'city-notes-display');
        var textarea = createEl('textarea', 'city-notes-area');

        var emptyPrefix = isGlobalMode ? 'No global notes yet.' : 'No city notes yet.';
        textarea.placeholder = emptyPrefix + '  See script comments for a list of features!';

        var footer = createEl('div', 'notepad-footer');
        var modeBtn = createEl('button', 'city-notes-btn city-notes-btn-mode', 'Global');
        var editBtn = createEl('button', 'city-notes-btn city-notes-btn-edit', 'Edit');
        footer.append(modeBtn, editBtn);

        container.append(bar, displayDiv, textarea, footer);

        currentLoadedTown = getActiveTownId();
        textarea.value = GM_getValue(getStorageKey(), '');
        updateNotesDisplay(displayDiv);

        function toggleEditMode() {
            var isEditing = textarea.style.display === 'block';
            var key = getStorageKey();

            if (isEditing) {
                GM_setValue(key, textarea.value);
                textarea.style.display = 'none';
                displayDiv.style.display = 'block';
                editBtn.textContent = 'Edit';
                updateNotesDisplay(displayDiv);
            } else {
                textarea.value = GM_getValue(key, '');
                displayDiv.style.display = 'none';
                textarea.style.display = 'block';
                editBtn.textContent = 'Done';
                applyCustomUITheme(textarea.value, container);
                textarea.focus();
            }
        }

        function toggleNotesMode() {
            if (textarea.style.display === 'block') {
                GM_setValue(getStorageKey(), textarea.value);
            }

            isGlobalMode = !isGlobalMode;
            modeBtn.textContent = isGlobalMode ? 'City' : 'Global';

            var currentEmptyPrefix = isGlobalMode ? 'No global notes yet.' : 'No city notes yet.';
            textarea.placeholder = currentEmptyPrefix + ' See script comments for a list of features!';

            var newKey = getStorageKey();
            var newText = GM_getValue(newKey, '');
            textarea.value = newText;
            updateNotesDisplay(displayDiv);

            if (title) {
                title.textContent = isGlobalMode ? 'Global Notes' : ('City Notes (' + getActiveTownName() + ')');
            }
        }

        modeBtn.addEventListener('click', toggleNotesMode);
        editBtn.addEventListener('click', toggleEditMode);

        textarea.addEventListener('input', function() {
            var val = textarea.value;
            GM_setValue(getStorageKey(), val);
            applyCustomUITheme(val, container);
        });

        return container;
    }

    // -------------------------------------------------------------
    // Widget Integration & DOM Manipulation
    // -------------------------------------------------------------

    function findFriendsHeader() {
        var candidates = document.querySelectorAll('div, td, span, h1, h2, h3, h4, a');
        for (var i = 0; i < candidates.length; i++) {
            var el = candidates[i];
            if (el.children.length > 2) continue;
            if (/^Friends(\s*\(.*\))?$/i.test(el.textContent.trim())) {
                return el;
            }
        }
        return null;
    }

    function tryInjectNextToFriends() {
        if (document.getElementById('tabCityNotesHeader')) return true;

        var friendsHeader = findFriendsHeader();
        if (!friendsHeader) return false;

        var headerBar = (friendsHeader.parentElement && friendsHeader.parentElement.children.length === 1)
            ? friendsHeader.parentElement
            : friendsHeader;

        var widgetBox = headerBar.parentElement;
        if (!widgetBox) return false;

        injectStyles();

        Object.assign(widgetBox.style, { display: 'flex', flexDirection: 'column', overflow: 'hidden' });

        var friendsWrapper = createEl('div');
        friendsWrapper.id = 'illyriad-friends-body-wrapper';
        friendsWrapper.style.width = '100%';

        Array.from(widgetBox.children).forEach(function(child) {
            if (child !== headerBar) friendsWrapper.appendChild(child);
        });
        widgetBox.appendChild(friendsWrapper);

        Object.assign(headerBar.style, {
            textAlign: 'center', padding: '1px 0 2px 0', margin: '0',
            height: 'auto', minHeight: '0', lineHeight: '1.1',
            overflow: 'visible', flexShrink: '0'
        });
        headerBar.innerHTML = '';

        var friendsTabBtn = createEl('span', 'illy-tab-active', 'Friends');
        var sep = createEl('span', '', ' | ');
        sep.style.cssText = 'color: #8a7662; font-size: 12px; margin: 0 6px;';

        var notesTabBtn = createEl('span', 'illy-tab-inactive', 'Notes');
        notesTabBtn.id = 'tabCityNotesHeader';

        headerBar.append(friendsTabBtn, sep, notesTabBtn);

        var notesPanel = createEl('div');
        notesPanel.id = 'notepadCityNotesContent';

        notesPanel.style.cssText = 'display: none; flex: 1 1 0px; width: 100%; box-sizing: border-box; overflow: hidden; padding: 1px !important;';
        notesPanel.appendChild(createNotesContentUI());

        widgetBox.appendChild(notesPanel);

        function switchTab(showNotes) {
            friendsTabBtn.className = showNotes ? 'illy-tab-inactive' : 'illy-tab-active';
            notesTabBtn.className = showNotes ? 'illy-tab-active' : 'illy-tab-inactive';
            friendsWrapper.style.display = showNotes ? 'none' : 'block';
            notesPanel.style.display = showNotes ? 'flex' : 'none';
            if (showNotes) notesPanel.style.flexDirection = 'column';
        }

        friendsTabBtn.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); switchTab(false); });
        notesTabBtn.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); switchTab(true); });

        return true;
    }

    // -------------------------------------------------------------
    // Initialization Loop
    // -------------------------------------------------------------

    var checkCount = 0;
    var timer = setInterval(function() {
        checkCount++;
        if (tryInjectNextToFriends() || checkCount > 40) {
            clearInterval(timer);
        }
    }, 800);

})();
