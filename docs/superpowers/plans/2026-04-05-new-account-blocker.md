# New Account Blocker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension that hides Twitter/X posts from recently created accounts and/or blue-check verified accounts by intercepting Twitter's internal API responses.

**Architecture:** Four components — an injected page script monkey-patches fetch/XHR to intercept Twitter API responses and extract user data, a content script manages a user cache and uses MutationObserver to hide matching tweets with collapsible bars, a service worker persists settings and manages the badge, and a popup provides the settings UI.

**Tech Stack:** Vanilla JS, Chrome Extension Manifest V3, Node.js built-in test runner for unit tests

---

## File Structure

```
manifest.json                — extension manifest (MV3)
background.js                — service worker: settings, badge, message routing
content.js                   — content script: user cache, MutationObserver, DOM manipulation
injected.js                  — page script: fetch/XHR interception, user data extraction
popup/
  popup.html                 — popup markup (main view + allowlist view)
  popup.js                   — popup logic: settings controls, allowlist management
  popup.css                  — popup styles (Twitter dark theme)
icons/
  icon-16.png                — toolbar icon
  icon-48.png                — extensions page icon
  icon-128.png               — Chrome Web Store icon
scripts/
  generate-icons.js          — generates placeholder PNG icons (dev tool)
tests/
  utils.test.js              — tests for pure utility functions
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `manifest.json`
- Create: `scripts/generate-icons.js`
- Create: `icons/icon-16.png`, `icons/icon-48.png`, `icons/icon-128.png`

- [ ] **Step 1: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "New Account Blocker",
  "version": "1.0.0",
  "description": "Hide posts from recently created and/or blue-check verified Twitter/X accounts",
  "permissions": ["storage"],
  "host_permissions": ["*://x.com/*", "*://twitter.com/*"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [{
    "matches": ["*://x.com/*", "*://twitter.com/*"],
    "js": ["content.js"],
    "run_at": "document_start"
  }],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "web_accessible_resources": [{
    "resources": ["injected.js"],
    "matches": ["*://x.com/*", "*://twitter.com/*"]
  }]
}
```

- [ ] **Step 2: Create icon generator script**

Create `scripts/generate-icons.js`:

```js
const { writeFileSync, mkdirSync } = require('fs');
const { deflateSync } = require('zlib');

function createPng(size, r, g, b) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData.writeUInt8(8, 8);
  ihdrData.writeUInt8(2, 9);
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);
  const ihdr = createChunk('IHDR', ihdrData);

  const rawData = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const offset = y * (1 + size * 3);
    rawData[offset] = 0;
    for (let x = 0; x < size; x++) {
      const px = offset + 1 + x * 3;
      rawData[px] = r;
      rawData[px + 1] = g;
      rawData[px + 2] = b;
    }
  }
  const idat = createChunk('IDAT', deflateSync(rawData));
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const crcVal = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

mkdirSync('icons', { recursive: true });
writeFileSync('icons/icon-16.png', createPng(16, 29, 155, 240));
writeFileSync('icons/icon-48.png', createPng(48, 29, 155, 240));
writeFileSync('icons/icon-128.png', createPng(128, 29, 155, 240));
console.log('Icons generated: icon-16.png, icon-48.png, icon-128.png');
```

- [ ] **Step 3: Generate the icons**

Run: `node scripts/generate-icons.js`
Expected: Three PNG files created in `icons/`, console prints confirmation.

- [ ] **Step 4: Create placeholder files for remaining components**

Create empty files so the manifest doesn't error on load:
- `background.js` — contents: `// Service worker`
- `content.js` — contents: `// Content script`
- `injected.js` — contents: `// Injected page script`
- `popup/popup.html` — contents: `<!DOCTYPE html><html><body><p>Popup</p></body></html>`
- `popup/popup.js` — contents: `// Popup logic`
- `popup/popup.css` — contents: `/* Popup styles */`

- [ ] **Step 5: Verify extension loads in Chrome**

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the project root
4. Verify the extension appears with no errors and the blue icon shows in the toolbar

- [ ] **Step 6: Commit**

```bash
git add manifest.json background.js content.js injected.js popup/ icons/ scripts/
git commit -m "feat: project scaffold with manifest and placeholder icons"
```

---

### Task 2: Utility Functions + Tests

**Files:**
- Create: `tests/utils.test.js`
- Create: `utils.js`

These are the pure logic functions shared across components. The file uses a conditional export pattern so it works in both Chrome (browser globals) and Node.js (require).

- [ ] **Step 1: Write failing tests for all utility functions**

Create `tests/utils.test.js`:

```js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  isTwitterApiUrl,
  extractUsers,
  getAccountAgeMonths,
  shouldHideTweet,
  formatCollapseBarText,
  THRESHOLD_PRESETS,
  THRESHOLD_LABELS
} = require('../utils.js');

describe('isTwitterApiUrl', () => {
  it('matches GraphQL endpoints', () => {
    assert.strictEqual(isTwitterApiUrl('/i/api/graphql/abc123/HomeTimeline'), true);
    assert.strictEqual(isTwitterApiUrl('https://x.com/i/api/graphql/xyz/TweetDetail'), true);
    assert.strictEqual(isTwitterApiUrl('https://x.com/i/api/graphql/abc/SearchTimeline'), true);
  });

  it('matches REST v2 endpoints', () => {
    assert.strictEqual(isTwitterApiUrl('/i/api/2/timeline/home.json'), true);
  });

  it('rejects non-API URLs', () => {
    assert.strictEqual(isTwitterApiUrl('/home'), false);
    assert.strictEqual(isTwitterApiUrl('https://x.com/settings'), false);
    assert.strictEqual(isTwitterApiUrl('/i/api/1.1/something'), false);
  });
});

describe('extractUsers', () => {
  it('extracts users from GraphQL response with legacy sub-object', () => {
    const response = {
      data: {
        user_results: {
          result: {
            rest_id: '123',
            is_blue_verified: true,
            legacy: {
              screen_name: 'testuser',
              created_at: 'Thu Jan 15 00:00:00 +0000 2025',
              following: false
            }
          }
        }
      }
    };
    const users = extractUsers(response);
    assert.strictEqual(users.length, 1);
    assert.strictEqual(users[0].screen_name, 'testuser');
    assert.strictEqual(users[0].created_at, 'Thu Jan 15 00:00:00 +0000 2025');
    assert.strictEqual(users[0].user_id, '123');
    assert.strictEqual(users[0].is_blue_verified, true);
    assert.strictEqual(users[0].following, false);
  });

  it('extracts users from flat REST response', () => {
    const response = {
      users: [{
        screen_name: 'flatuser',
        created_at: 'Mon Mar 01 00:00:00 +0000 2020',
        id_str: '456',
        is_blue_verified: false,
        following: true
      }]
    };
    const users = extractUsers(response);
    assert.strictEqual(users.length, 1);
    assert.strictEqual(users[0].screen_name, 'flatuser');
    assert.strictEqual(users[0].user_id, '456');
    assert.strictEqual(users[0].following, true);
  });

  it('extracts multiple users from nested response', () => {
    const response = {
      data: {
        entries: [
          {
            content: {
              user_results: {
                result: {
                  rest_id: '1',
                  is_blue_verified: false,
                  legacy: { screen_name: 'user1', created_at: 'Thu Jan 01 00:00:00 +0000 2015', following: true }
                }
              }
            }
          },
          {
            content: {
              user_results: {
                result: {
                  rest_id: '2',
                  is_blue_verified: true,
                  legacy: { screen_name: 'user2', created_at: 'Fri Jun 15 00:00:00 +0000 2024', following: false }
                }
              }
            }
          }
        ]
      }
    };
    const users = extractUsers(response);
    assert.strictEqual(users.length, 2);
    assert.strictEqual(users[0].screen_name, 'user1');
    assert.strictEqual(users[1].screen_name, 'user2');
  });

  it('returns empty array for response with no users', () => {
    const response = { data: { timeline: { instructions: [] } } };
    const users = extractUsers(response);
    assert.strictEqual(users.length, 0);
  });

  it('handles null and primitive values without crashing', () => {
    assert.deepStrictEqual(extractUsers(null), []);
    assert.deepStrictEqual(extractUsers('string'), []);
    assert.deepStrictEqual(extractUsers(42), []);
  });
});

describe('getAccountAgeMonths', () => {
  it('calculates age in months', () => {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const age = getAccountAgeMonths(twoYearsAgo);
    assert.ok(age >= 23 && age <= 25, `Expected ~24 months, got ${age}`);
  });

  it('returns 0 for accounts created this month', () => {
    const thisMonth = new Date();
    const age = getAccountAgeMonths(thisMonth);
    assert.strictEqual(age, 0);
  });

  it('returns 0 for future dates', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const age = getAccountAgeMonths(future);
    assert.strictEqual(age, 0);
  });
});

describe('shouldHideTweet', () => {
  const baseSettings = {
    enabled: true,
    thresholdMonths: 24,
    hideBlueChecks: false,
    allowlist: []
  };

  it('hides tweet from new account', () => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const userData = { createdAt: sixMonthsAgo, following: false, isBlueVerified: false };
    assert.strictEqual(shouldHideTweet('newuser', userData, baseSettings), true);
  });

  it('does not hide tweet from old account', () => {
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    const userData = { createdAt: fiveYearsAgo, following: false, isBlueVerified: false };
    assert.strictEqual(shouldHideTweet('olduser', userData, baseSettings), false);
  });

  it('does not hide when extension is disabled', () => {
    const newDate = new Date();
    const userData = { createdAt: newDate, following: false, isBlueVerified: false };
    const settings = { ...baseSettings, enabled: false };
    assert.strictEqual(shouldHideTweet('newuser', userData, settings), false);
  });

  it('does not hide followed accounts', () => {
    const newDate = new Date();
    const userData = { createdAt: newDate, following: true, isBlueVerified: false };
    assert.strictEqual(shouldHideTweet('newuser', userData, baseSettings), false);
  });

  it('does not hide allowlisted accounts', () => {
    const newDate = new Date();
    const userData = { createdAt: newDate, following: false, isBlueVerified: false };
    const settings = { ...baseSettings, allowlist: ['newuser'] };
    assert.strictEqual(shouldHideTweet('newuser', userData, settings), false);
  });

  it('hides blue-check accounts when filter is enabled', () => {
    const oldDate = new Date();
    oldDate.setFullYear(oldDate.getFullYear() - 10);
    const userData = { createdAt: oldDate, following: false, isBlueVerified: true };
    const settings = { ...baseSettings, hideBlueChecks: true };
    assert.strictEqual(shouldHideTweet('blueuser', userData, settings), true);
  });

  it('does not hide blue-check accounts when filter is disabled', () => {
    const oldDate = new Date();
    oldDate.setFullYear(oldDate.getFullYear() - 10);
    const userData = { createdAt: oldDate, following: false, isBlueVerified: true };
    assert.strictEqual(shouldHideTweet('blueuser', userData, baseSettings), false);
  });

  it('hides when either filter matches (OR logic)', () => {
    const newDate = new Date();
    const userData = { createdAt: newDate, following: false, isBlueVerified: true };
    const settings = { ...baseSettings, hideBlueChecks: true };
    assert.strictEqual(shouldHideTweet('bothuser', userData, settings), true);
  });

  it('allowlist overrides blue-check filter', () => {
    const oldDate = new Date();
    oldDate.setFullYear(oldDate.getFullYear() - 10);
    const userData = { createdAt: oldDate, following: false, isBlueVerified: true };
    const settings = { ...baseSettings, hideBlueChecks: true, allowlist: ['blueuser'] };
    assert.strictEqual(shouldHideTweet('blueuser', userData, settings), false);
  });
});

describe('formatCollapseBarText', () => {
  const baseSettings = {
    enabled: true,
    thresholdMonths: 24,
    hideBlueChecks: false,
    allowlist: []
  };

  it('formats text for new account', () => {
    const date = new Date(2025, 0, 15); // Jan 2025
    const userData = { createdAt: date, isBlueVerified: false };
    const text = formatCollapseBarText(userData, baseSettings);
    assert.ok(text.includes('account created'));
    assert.ok(text.includes('Jan 2025'));
  });

  it('formats text for blue-check only', () => {
    const oldDate = new Date(2010, 0, 1);
    const userData = { createdAt: oldDate, isBlueVerified: true };
    const settings = { ...baseSettings, hideBlueChecks: true, thresholdMonths: 0 };
    const text = formatCollapseBarText(userData, settings);
    assert.ok(text.includes('blue-check verified account'));
  });

  it('formats text for blue-check + new account', () => {
    const date = new Date(2025, 0, 15);
    const userData = { createdAt: date, isBlueVerified: true };
    const settings = { ...baseSettings, hideBlueChecks: true };
    const text = formatCollapseBarText(userData, settings);
    assert.ok(text.includes('blue-check'));
    assert.ok(text.includes('Jan 2025'));
  });
});

describe('THRESHOLD_PRESETS', () => {
  it('has 7 preset values', () => {
    assert.strictEqual(THRESHOLD_PRESETS.length, 7);
  });

  it('values are in ascending order', () => {
    for (let i = 1; i < THRESHOLD_PRESETS.length; i++) {
      assert.ok(THRESHOLD_PRESETS[i] > THRESHOLD_PRESETS[i - 1]);
    }
  });

  it('default index 4 is 24 months', () => {
    assert.strictEqual(THRESHOLD_PRESETS[4], 24);
  });

  it('has matching labels', () => {
    assert.strictEqual(THRESHOLD_LABELS.length, THRESHOLD_PRESETS.length);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/utils.test.js`
Expected: FAIL — `Cannot find module '../utils.js'`

- [ ] **Step 3: Implement all utility functions**

Create `utils.js`:

```js
const THRESHOLD_PRESETS = [1, 3, 6, 12, 24, 36, 60];
const THRESHOLD_LABELS = ['1 mo', '3 mo', '6 mo', '1 yr', '2 yr', '3 yr', '5 yr'];

function isTwitterApiUrl(url) {
  return /\/i\/api\/(graphql|2)\//.test(url);
}

function extractUsers(obj, users) {
  if (users === undefined) users = [];
  if (obj === null || typeof obj !== 'object') return users;

  if (obj.legacy && typeof obj.legacy === 'object' && obj.legacy.screen_name && obj.legacy.created_at) {
    users.push({
      screen_name: obj.legacy.screen_name,
      created_at: obj.legacy.created_at,
      user_id: obj.rest_id || obj.legacy.id_str || null,
      is_blue_verified: Boolean(obj.is_blue_verified),
      following: Boolean(obj.legacy.following)
    });
  } else if (obj.screen_name && obj.created_at && !obj.legacy) {
    users.push({
      screen_name: obj.screen_name,
      created_at: obj.created_at,
      user_id: obj.id_str || null,
      is_blue_verified: Boolean(obj.is_blue_verified),
      following: Boolean(obj.following)
    });
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      extractUsers(obj[i], users);
    }
  } else {
    var keys = Object.keys(obj);
    for (var k = 0; k < keys.length; k++) {
      if (typeof obj[keys[k]] === 'object' && obj[keys[k]] !== null) {
        extractUsers(obj[keys[k]], users);
      }
    }
  }

  return users;
}

function getAccountAgeMonths(createdAt) {
  var now = new Date();
  var months = (now.getFullYear() - createdAt.getFullYear()) * 12 + (now.getMonth() - createdAt.getMonth());
  return Math.max(0, months);
}

function shouldHideTweet(username, userData, settings) {
  if (!settings.enabled) return false;
  if (userData.following) return false;
  if (settings.allowlist.indexOf(username) !== -1) return false;

  var ageMonths = getAccountAgeMonths(userData.createdAt);
  var hiddenByAge = ageMonths < settings.thresholdMonths;
  var hiddenByBlueCheck = settings.hideBlueChecks && userData.isBlueVerified;

  return hiddenByAge || hiddenByBlueCheck;
}

function formatCollapseBarText(userData, settings) {
  var date = userData.createdAt;
  var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var dateStr = monthNames[date.getMonth()] + ' ' + date.getFullYear();
  var ageMonths = getAccountAgeMonths(date);
  var ageStr;
  if (ageMonths >= 12) {
    var years = Math.floor(ageMonths / 12);
    ageStr = years + ' year' + (years !== 1 ? 's' : '') + ' old';
  } else {
    ageStr = ageMonths + ' month' + (ageMonths !== 1 ? 's' : '') + ' old';
  }

  var isNewAccount = ageMonths < settings.thresholdMonths;
  var isBlueCheck = settings.hideBlueChecks && userData.isBlueVerified;

  if (isBlueCheck && isNewAccount) {
    return 'Post hidden \u2014 blue-check account created <span style="color: #f4900c;">' + dateStr + '</span> (' + ageStr + ')';
  } else if (isBlueCheck) {
    return 'Post hidden \u2014 blue-check verified account';
  } else {
    return 'Post hidden \u2014 account created <span style="color: #f4900c;">' + dateStr + '</span> (' + ageStr + ')';
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isTwitterApiUrl: isTwitterApiUrl,
    extractUsers: extractUsers,
    getAccountAgeMonths: getAccountAgeMonths,
    shouldHideTweet: shouldHideTweet,
    formatCollapseBarText: formatCollapseBarText,
    THRESHOLD_PRESETS: THRESHOLD_PRESETS,
    THRESHOLD_LABELS: THRESHOLD_LABELS
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/utils.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add utils.js tests/utils.test.js
git commit -m "feat: utility functions with full test coverage"
```

---

### Task 3: Service Worker

**Files:**
- Create: `background.js`

The service worker manages persistent settings in `chrome.storage.local`, handles messages from the content script and popup, and updates the extension badge.

- [ ] **Step 1: Implement background.js**

Replace `background.js` with:

```js
var DEFAULT_SETTINGS = {
  enabled: true,
  thresholdMonths: 24,
  hideBlueChecks: false,
  allowlist: [],
  totalFiltered: 0
};

chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.local.get(DEFAULT_SETTINGS, function (stored) {
    chrome.storage.local.set(stored);
  });
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.type === 'GET_SETTINGS') {
    chrome.storage.local.get(DEFAULT_SETTINGS, function (settings) {
      sendResponse(settings);
    });
    return true;
  }

  if (message.type === 'SET_SETTINGS') {
    chrome.storage.local.set(message.settings, function () {
      broadcastToTwitterTabs({ type: 'SETTINGS_UPDATED', settings: message.settings });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === 'ADD_TO_ALLOWLIST') {
    chrome.storage.local.get({ allowlist: [] }, function (data) {
      var list = data.allowlist;
      if (list.indexOf(message.username) === -1) {
        list.push(message.username);
        chrome.storage.local.set({ allowlist: list }, function () {
          broadcastToTwitterTabs({ type: 'SETTINGS_UPDATED', settings: { allowlist: list } });
          sendResponse({ ok: true });
        });
      } else {
        sendResponse({ ok: true });
      }
    });
    return true;
  }

  if (message.type === 'REMOVE_FROM_ALLOWLIST') {
    chrome.storage.local.get({ allowlist: [] }, function (data) {
      var list = data.allowlist.filter(function (u) { return u !== message.username; });
      chrome.storage.local.set({ allowlist: list }, function () {
        broadcastToTwitterTabs({ type: 'SETTINGS_UPDATED', settings: { allowlist: list } });
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  if (message.type === 'UPDATE_BADGE') {
    var count = message.count;
    var tabId = sender.tab ? sender.tab.id : null;
    if (tabId) {
      var text = count > 0 ? String(count) : '';
      chrome.action.setBadgeText({ text: text, tabId: tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#f4900c', tabId: tabId });
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'INCREMENT_TOTAL_FILTERED') {
    chrome.storage.local.get({ totalFiltered: 0 }, function (data) {
      chrome.storage.local.set({ totalFiltered: data.totalFiltered + message.count });
    });
    return false;
  }
});

function broadcastToTwitterTabs(message) {
  chrome.tabs.query({ url: ['*://x.com/*', '*://twitter.com/*'] }, function (tabs) {
    for (var i = 0; i < tabs.length; i++) {
      chrome.tabs.sendMessage(tabs[i].id, message).catch(function () {});
    }
  });
}
```

- [ ] **Step 2: Verify extension reloads without errors**

1. Go to `chrome://extensions`
2. Click the reload button on the extension
3. Check there are no errors in the service worker console (click "Inspect views: service worker")

- [ ] **Step 3: Commit**

```bash
git add background.js
git commit -m "feat: service worker with settings management and badge updates"
```

---

### Task 4: Injected Page Script

**Files:**
- Modify: `injected.js`
- Modify: `manifest.json` (add `utils.js` to `web_accessible_resources`)

The injected page script runs in Twitter's page context. It monkey-patches `fetch()` and `XMLHttpRequest` to intercept API responses, extracts user data, and posts it to the content script via `window.postMessage`.

- [ ] **Step 1: Implement injected.js**

Replace `injected.js` with:

```js
(function () {
  'use strict';

  function isTwitterApiUrl(url) {
    return /\/i\/api\/(graphql|2)\//.test(url);
  }

  function extractUsers(obj, users) {
    if (users === undefined) users = [];
    if (obj === null || typeof obj !== 'object') return users;

    if (obj.legacy && typeof obj.legacy === 'object' && obj.legacy.screen_name && obj.legacy.created_at) {
      users.push({
        screen_name: obj.legacy.screen_name,
        created_at: obj.legacy.created_at,
        user_id: obj.rest_id || obj.legacy.id_str || null,
        is_blue_verified: Boolean(obj.is_blue_verified),
        following: Boolean(obj.legacy.following)
      });
    } else if (obj.screen_name && obj.created_at && !obj.legacy) {
      users.push({
        screen_name: obj.screen_name,
        created_at: obj.created_at,
        user_id: obj.id_str || null,
        is_blue_verified: Boolean(obj.is_blue_verified),
        following: Boolean(obj.following)
      });
    }

    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) {
        extractUsers(obj[i], users);
      }
    } else {
      var keys = Object.keys(obj);
      for (var k = 0; k < keys.length; k++) {
        if (typeof obj[keys[k]] === 'object' && obj[keys[k]] !== null) {
          extractUsers(obj[keys[k]], users);
        }
      }
    }

    return users;
  }

  function postUsers(users) {
    for (var i = 0; i < users.length; i++) {
      window.postMessage({
        type: 'NEW_ACCOUNT_BLOCKER_USER',
        screen_name: users[i].screen_name,
        created_at: users[i].created_at,
        user_id: users[i].user_id,
        is_blue_verified: users[i].is_blue_verified,
        following: users[i].following
      }, '*');
    }
  }

  // Patch fetch
  var originalFetch = window.fetch;
  window.fetch = function () {
    var args = arguments;
    return originalFetch.apply(this, args).then(function (response) {
      var url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
      if (isTwitterApiUrl(url)) {
        var clone = response.clone();
        clone.json().then(function (json) {
          var users = extractUsers(json);
          if (users.length > 0) {
            postUsers(users);
          }
        }).catch(function () {});
      }
      return response;
    });
  };

  // Patch XMLHttpRequest
  var originalXHROpen = XMLHttpRequest.prototype.open;
  var originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._nabUrl = url;
    return originalXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    var xhr = this;
    xhr.addEventListener('load', function () {
      if (isTwitterApiUrl(xhr._nabUrl)) {
        try {
          var json = JSON.parse(xhr.responseText);
          var users = extractUsers(json);
          if (users.length > 0) {
            postUsers(users);
          }
        } catch (e) {}
      }
    });
    return originalXHRSend.apply(this, arguments);
  };
})();
```

Note: The utility functions (`isTwitterApiUrl`, `extractUsers`) are inlined here because this script runs in the page context and cannot import extension files. They are tested via `utils.js` in Task 2 — the implementations are identical.

- [ ] **Step 2: Verify extension reloads without errors**

1. Reload the extension at `chrome://extensions`
2. Navigate to `https://x.com`
3. Open DevTools console — no errors should appear related to the extension

- [ ] **Step 3: Commit**

```bash
git add injected.js
git commit -m "feat: injected script with fetch/XHR interception"
```

---

### Task 5: Content Script

**Files:**
- Modify: `content.js`

The content script injects the page script, listens for user data via postMessage, maintains the user cache, observes the DOM for new tweets, applies hiding with collapse bars, and communicates with the service worker.

- [ ] **Step 1: Implement content.js**

Replace `content.js` with:

```js
(function () {
  'use strict';

  // --- Constants ---
  var THRESHOLD_PRESETS = [1, 3, 6, 12, 24, 36, 60];

  // --- State ---
  var userCache = {};          // username -> { createdAt, following, isBlueVerified }
  var sessionRevealed = {};    // username -> true (temporarily shown this session)
  var hiddenCount = 0;
  var settings = {
    enabled: true,
    thresholdMonths: 24,
    hideBlueChecks: false,
    allowlist: []
  };

  // --- Inject page script ---
  var script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function () { script.remove(); };
  (document.head || document.documentElement).appendChild(script);

  // --- Load settings ---
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, function (response) {
    if (response) {
      settings.enabled = response.enabled;
      settings.thresholdMonths = response.thresholdMonths;
      settings.hideBlueChecks = response.hideBlueChecks;
      settings.allowlist = response.allowlist || [];
    }
  });

  // --- Listen for settings updates from service worker ---
  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.type === 'SETTINGS_UPDATED') {
      var updated = message.settings;
      if (updated.enabled !== undefined) settings.enabled = updated.enabled;
      if (updated.thresholdMonths !== undefined) settings.thresholdMonths = updated.thresholdMonths;
      if (updated.hideBlueChecks !== undefined) settings.hideBlueChecks = updated.hideBlueChecks;
      if (updated.allowlist !== undefined) settings.allowlist = updated.allowlist;
      reapplyAllTweets();
    }

    if (message.type === 'GET_PAGE_STATS') {
      var followedNewAccounts = [];
      var keys = Object.keys(userCache);
      for (var i = 0; i < keys.length; i++) {
        var u = userCache[keys[i]];
        if (u.following && getAccountAgeMonths(u.createdAt) < settings.thresholdMonths) {
          followedNewAccounts.push({
            username: keys[i],
            createdAt: u.createdAt.toISOString(),
            isBlueVerified: u.isBlueVerified
          });
        }
      }
      sendResponse({ hiddenCount: hiddenCount, followedNewAccounts: followedNewAccounts });
      return true;
    }
  });

  // --- Listen for user data from injected script ---
  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== 'NEW_ACCOUNT_BLOCKER_USER') return;

    var d = event.data;
    var username = d.screen_name.toLowerCase();
    userCache[username] = {
      createdAt: new Date(d.created_at),
      isBlueVerified: d.is_blue_verified,
      following: d.following
    };

    rescanVisibleTweets();
  });

  // --- Utility functions ---
  function getAccountAgeMonths(createdAt) {
    var now = new Date();
    var months = (now.getFullYear() - createdAt.getFullYear()) * 12 + (now.getMonth() - createdAt.getMonth());
    return Math.max(0, months);
  }

  function shouldHideTweet(username, userData) {
    if (!settings.enabled) return false;
    if (userData.following) return false;
    if (settings.allowlist.indexOf(username) !== -1) return false;
    if (sessionRevealed[username]) return false;

    var ageMonths = getAccountAgeMonths(userData.createdAt);
    var hiddenByAge = ageMonths < settings.thresholdMonths;
    var hiddenByBlueCheck = settings.hideBlueChecks && userData.isBlueVerified;

    return hiddenByAge || hiddenByBlueCheck;
  }

  function formatCollapseBarText(userData) {
    var date = userData.createdAt;
    var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var dateStr = monthNames[date.getMonth()] + ' ' + date.getFullYear();
    var ageMonths = getAccountAgeMonths(date);
    var ageStr;
    if (ageMonths >= 12) {
      var years = Math.floor(ageMonths / 12);
      ageStr = years + ' year' + (years !== 1 ? 's' : '') + ' old';
    } else {
      ageStr = ageMonths + ' month' + (ageMonths !== 1 ? 's' : '') + ' old';
    }

    var isNewAccount = ageMonths < settings.thresholdMonths;
    var isBlueCheck = settings.hideBlueChecks && userData.isBlueVerified;

    if (isBlueCheck && isNewAccount) {
      return 'Post hidden \u2014 blue-check account created <span style="color: #f4900c;">' + dateStr + '</span> (' + ageStr + ')';
    } else if (isBlueCheck) {
      return 'Post hidden \u2014 blue-check verified account';
    } else {
      return 'Post hidden \u2014 account created <span style="color: #f4900c;">' + dateStr + '</span> (' + ageStr + ')';
    }
  }

  // --- DOM helpers ---
  function extractUsername(tweetEl) {
    var userNameEl = tweetEl.querySelector('[data-testid="User-Name"]');
    if (userNameEl) {
      var spans = userNameEl.querySelectorAll('span');
      for (var i = 0; i < spans.length; i++) {
        var text = spans[i].textContent.trim();
        if (text.charAt(0) === '@') {
          return text.slice(1).toLowerCase();
        }
      }
      // Fallback: find link with /@username pattern
      var links = userNameEl.querySelectorAll('a[href^="/"]');
      for (var j = 0; j < links.length; j++) {
        var href = links[j].getAttribute('href');
        if (href && href.indexOf('/') === 0 && href.indexOf('/', 1) === -1) {
          return href.slice(1).toLowerCase();
        }
      }
    }
    return null;
  }

  function findTweetElements(root) {
    var tweets = [];
    if (root.matches && root.matches('[data-testid="tweet"]')) {
      tweets.push(root);
    }
    if (root.querySelectorAll) {
      var found = root.querySelectorAll('[data-testid="tweet"]');
      for (var i = 0; i < found.length; i++) {
        tweets.push(found[i]);
      }
    }
    return tweets;
  }

  function createCollapseBar(tweetEl, username, userData) {
    var bar = document.createElement('div');
    bar.className = 'nab-collapse-bar';
    bar.setAttribute('data-nab-username', username);
    bar.style.cssText = 'padding:8px 16px;background:#16181c;border-bottom:1px solid #2f3336;display:flex;align-items:center;gap:10px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';

    var text = formatCollapseBarText(userData);

    bar.innerHTML =
      '<div style="display:flex;align-items:center;gap:6px;">' +
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="#71767b"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 12.5a5.5 5.5 0 110-11 5.5 5.5 0 010 11zm-.75-8.25v3.5h1.5v-3.5h-1.5zm0 4.5v1.5h1.5v-1.5h-1.5z"/></svg>' +
        '<span style="color:#71767b;font-size:13px;">' + text + '</span>' +
      '</div>' +
      '<div style="margin-left:auto;display:flex;gap:8px;align-items:center;">' +
        '<span class="nab-show-btn" style="color:#1d9bf0;font-size:12px;padding:4px 10px;border:1px solid rgba(29,155,240,0.2);border-radius:9999px;cursor:pointer;">Show</span>' +
        '<span class="nab-allow-btn" style="color:#059669;font-size:12px;padding:4px 10px;border:1px solid rgba(5,150,105,0.2);border-radius:9999px;cursor:pointer;">Allow user</span>' +
      '</div>';

    bar.querySelector('.nab-show-btn').addEventListener('click', function (e) {
      e.stopPropagation();
      tweetEl.style.display = '';
      bar.style.display = 'none';
      sessionRevealed[username] = true;
    });

    bar.querySelector('.nab-allow-btn').addEventListener('click', function (e) {
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: 'ADD_TO_ALLOWLIST', username: username });
      settings.allowlist.push(username);
      revealAllPostsByUser(username);
    });

    return bar;
  }

  function hideTweet(tweetEl, username, userData) {
    if (tweetEl.getAttribute('data-nab-hidden')) return;
    tweetEl.setAttribute('data-nab-hidden', 'true');
    tweetEl.style.display = 'none';

    var bar = createCollapseBar(tweetEl, username, userData);
    tweetEl.parentNode.insertBefore(bar, tweetEl);

    hiddenCount++;
    updateBadge();
    chrome.runtime.sendMessage({ type: 'INCREMENT_TOTAL_FILTERED', count: 1 });
  }

  function unhideTweet(tweetEl) {
    if (!tweetEl.getAttribute('data-nab-hidden')) return;
    tweetEl.removeAttribute('data-nab-hidden');
    tweetEl.style.display = '';

    var bar = tweetEl.previousElementSibling;
    if (bar && bar.classList.contains('nab-collapse-bar')) {
      bar.remove();
    }

    hiddenCount = Math.max(0, hiddenCount - 1);
    updateBadge();
  }

  function revealAllPostsByUser(username) {
    var bars = document.querySelectorAll('.nab-collapse-bar[data-nab-username="' + username + '"]');
    for (var i = 0; i < bars.length; i++) {
      var tweet = bars[i].nextElementSibling;
      if (tweet && tweet.getAttribute('data-nab-hidden')) {
        tweet.removeAttribute('data-nab-hidden');
        tweet.style.display = '';
        hiddenCount = Math.max(0, hiddenCount - 1);
      }
      bars[i].remove();
    }
    updateBadge();
  }

  function processTweet(tweetEl) {
    if (tweetEl.getAttribute('data-nab-hidden')) return;

    var username = extractUsername(tweetEl);
    if (!username) return;

    var userData = userCache[username];
    if (!userData) return;

    if (shouldHideTweet(username, userData)) {
      hideTweet(tweetEl, username, userData);
    }
  }

  function rescanVisibleTweets() {
    var tweets = document.querySelectorAll('[data-testid="tweet"]:not([data-nab-hidden])');
    for (var i = 0; i < tweets.length; i++) {
      processTweet(tweets[i]);
    }
  }

  function reapplyAllTweets() {
    // First, unhide everything
    var hidden = document.querySelectorAll('[data-nab-hidden]');
    for (var i = 0; i < hidden.length; i++) {
      unhideTweet(hidden[i]);
    }
    hiddenCount = 0;
    // Then re-process all tweets with current settings
    var allTweets = document.querySelectorAll('[data-testid="tweet"]');
    for (var j = 0; j < allTweets.length; j++) {
      processTweet(allTweets[j]);
    }
  }

  function updateBadge() {
    chrome.runtime.sendMessage({ type: 'UPDATE_BADGE', count: hiddenCount });
  }

  // --- MutationObserver ---
  function setupObserver() {
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        for (var j = 0; j < mutations[i].addedNodes.length; j++) {
          var node = mutations[i].addedNodes[j];
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          var tweets = findTweetElements(node);
          for (var k = 0; k < tweets.length; k++) {
            processTweet(tweets[k]);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Wait for document.body (we run at document_start)
  if (document.body) {
    setupObserver();
  } else {
    var bodyCheck = new MutationObserver(function () {
      if (document.body) {
        bodyCheck.disconnect();
        setupObserver();
      }
    });
    bodyCheck.observe(document.documentElement, { childList: true });
  }
})();
```

- [ ] **Step 2: Test on Twitter/X**

1. Reload extension at `chrome://extensions`
2. Navigate to `https://x.com/home`
3. Open DevTools console
4. Scroll through timeline — look for collapse bars appearing on posts from new accounts
5. Verify the badge count updates on the extension icon

- [ ] **Step 3: Test collapse bar interactions**

1. Click "Show" on a collapsed post — it should reveal the tweet and hide the bar
2. Reload the page — the revealed tweet should be collapsed again
3. Click "Allow user" on a collapsed post — all their posts should appear and stay visible after reload

- [ ] **Step 4: Commit**

```bash
git add content.js
git commit -m "feat: content script with user cache, tweet hiding, and collapse bars"
```

---

### Task 6: Popup UI

**Files:**
- Modify: `popup/popup.html`
- Modify: `popup/popup.css`
- Modify: `popup/popup.js`

- [ ] **Step 1: Create popup HTML**

Replace `popup/popup.html` with:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div id="main-view">
    <header>
      <h1>New Account Blocker</h1>
      <label class="toggle">
        <input type="checkbox" id="enabled-toggle" checked>
        <span class="toggle-slider"></span>
      </label>
    </header>

    <div class="stats">
      <div class="stat">
        <div class="stat-label">Hidden on this page</div>
        <div class="stat-value" id="page-count">0</div>
      </div>
      <div class="stat">
        <div class="stat-label">Total filtered</div>
        <div class="stat-value secondary" id="total-count">0</div>
      </div>
    </div>

    <div class="setting">
      <div class="setting-header">
        <span>Account age threshold</span>
        <span class="setting-value" id="threshold-label">2 yr</span>
      </div>
      <input type="range" id="threshold-slider" min="0" max="6" value="4" step="1">
      <div class="slider-labels">
        <span>1 mo</span><span>3 mo</span><span>6 mo</span><span>1 yr</span><span>2 yr</span><span>3 yr</span><span>5 yr</span>
      </div>
    </div>

    <div class="setting inline">
      <span>Hide blue-check accounts</span>
      <label class="toggle small">
        <input type="checkbox" id="blue-check-toggle">
        <span class="toggle-slider"></span>
      </label>
    </div>

    <div class="allowlist-link" id="manage-allowlist">
      <div>
        <div class="link-title">Allowed accounts</div>
        <div class="link-subtitle" id="allowlist-count">0 users on your allowlist</div>
      </div>
      <span class="arrow">&rarr;</span>
    </div>
  </div>

  <div id="allowlist-view" style="display:none;">
    <header>
      <span id="back-btn" class="back">&larr;</span>
      <h1>Allowed Accounts</h1>
    </header>
    <div id="allowlist-content"></div>
    <div class="tip">Tip: Click "Allow user" on any hidden post to add them here</div>
  </div>

  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create popup CSS**

Replace `popup/popup.css` with:

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  width: 320px;
  background: #15202b;
  color: #e7e9ea;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
}

header {
  padding: 14px 16px;
  border-bottom: 1px solid #2f3336;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

h1 {
  font-size: 16px;
  font-weight: 700;
}

/* Toggle switch */
.toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.toggle.small {
  width: 36px;
  height: 20px;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background: #333;
  border-radius: 12px;
  transition: background 0.2s;
}

.toggle-slider::before {
  content: "";
  position: absolute;
  height: 20px;
  width: 20px;
  left: 2px;
  bottom: 2px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s;
}

.toggle.small .toggle-slider::before {
  height: 16px;
  width: 16px;
}

.toggle input:checked + .toggle-slider {
  background: #1d9bf0;
}

.toggle input:checked + .toggle-slider::before {
  transform: translateX(20px);
}

.toggle.small input:checked + .toggle-slider::before {
  transform: translateX(16px);
}

/* Stats */
.stats {
  padding: 14px 16px;
  border-bottom: 1px solid #2f3336;
  display: flex;
  justify-content: space-between;
}

.stat-label {
  color: #71767b;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #f4900c;
  margin-top: 2px;
}

.stat-value.secondary {
  color: #71767b;
}

.stat:last-child {
  text-align: right;
}

/* Settings */
.setting {
  padding: 14px 16px;
  border-bottom: 1px solid #2f3336;
}

.setting.inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.setting-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.setting-value {
  color: #1d9bf0;
  font-weight: 700;
}

/* Slider */
input[type="range"] {
  -webkit-appearance: none;
  width: 100%;
  height: 4px;
  background: #333;
  border-radius: 2px;
  outline: none;
}

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: #1d9bf0;
  border: 2px solid white;
  border-radius: 50%;
  cursor: pointer;
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  color: #71767b;
  font-size: 11px;
}

/* Allowlist link */
.allowlist-link {
  padding: 14px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  border-bottom: 1px solid #2f3336;
}

.allowlist-link:hover {
  background: #1c2938;
}

.link-title {
  font-size: 14px;
}

.link-subtitle {
  color: #71767b;
  font-size: 12px;
  margin-top: 2px;
}

.arrow {
  color: #1d9bf0;
  font-size: 16px;
}

/* Back button */
.back {
  color: #1d9bf0;
  font-size: 18px;
  cursor: pointer;
  margin-right: 10px;
}

/* Allowlist items */
.allowlist-section-label {
  padding: 10px 16px 6px;
  color: #71767b;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.allowlist-item {
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid #2f3336;
}

.allowlist-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #1d9bf0;
  flex-shrink: 0;
}

.allowlist-info {
  flex: 1;
}

.allowlist-name {
  font-size: 14px;
  font-weight: 600;
}

.allowlist-handle {
  font-size: 12px;
  color: #71767b;
}

.allowlist-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
}

.allowlist-badge.following {
  color: #059669;
  background: rgba(5, 150, 105, 0.13);
}

.allowlist-badge.remove {
  color: #dc2626;
  border: 1px solid rgba(220, 38, 38, 0.25);
  cursor: pointer;
}

.allowlist-badge.remove:hover {
  background: rgba(220, 38, 38, 0.1);
}

.tip {
  padding: 16px;
  color: #71767b;
  font-size: 12px;
  text-align: center;
}

.empty-state {
  padding: 24px 16px;
  color: #71767b;
  font-size: 13px;
  text-align: center;
}
```

- [ ] **Step 3: Create popup JS**

Replace `popup/popup.js` with:

```js
(function () {
  'use strict';

  var THRESHOLD_PRESETS = [1, 3, 6, 12, 24, 36, 60];
  var THRESHOLD_LABELS = ['1 mo', '3 mo', '6 mo', '1 yr', '2 yr', '3 yr', '5 yr'];

  var enabledToggle = document.getElementById('enabled-toggle');
  var blueCheckToggle = document.getElementById('blue-check-toggle');
  var thresholdSlider = document.getElementById('threshold-slider');
  var thresholdLabel = document.getElementById('threshold-label');
  var pageCount = document.getElementById('page-count');
  var totalCount = document.getElementById('total-count');
  var allowlistCountEl = document.getElementById('allowlist-count');
  var manageAllowlist = document.getElementById('manage-allowlist');
  var mainView = document.getElementById('main-view');
  var allowlistView = document.getElementById('allowlist-view');
  var allowlistContent = document.getElementById('allowlist-content');
  var backBtn = document.getElementById('back-btn');

  var currentSettings = {};

  // Load settings and stats
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, function (settings) {
    if (!settings) return;
    currentSettings = settings;

    enabledToggle.checked = settings.enabled;
    blueCheckToggle.checked = settings.hideBlueChecks;

    var sliderIndex = THRESHOLD_PRESETS.indexOf(settings.thresholdMonths);
    if (sliderIndex === -1) sliderIndex = 4;
    thresholdSlider.value = sliderIndex;
    thresholdLabel.textContent = THRESHOLD_LABELS[sliderIndex];

    totalCount.textContent = String(settings.totalFiltered || 0);
    allowlistCountEl.textContent = (settings.allowlist ? settings.allowlist.length : 0) + ' users on your allowlist';
  });

  // Get page-specific stats from the active tab's content script
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_PAGE_STATS' }, function (response) {
        if (chrome.runtime.lastError) return;
        if (response) {
          pageCount.textContent = String(response.hiddenCount || 0);
        }
      });
    }
  });

  // Event handlers
  enabledToggle.addEventListener('change', function () {
    saveSetting({ enabled: enabledToggle.checked });
  });

  blueCheckToggle.addEventListener('change', function () {
    saveSetting({ hideBlueChecks: blueCheckToggle.checked });
  });

  thresholdSlider.addEventListener('input', function () {
    var index = parseInt(thresholdSlider.value, 10);
    thresholdLabel.textContent = THRESHOLD_LABELS[index];
  });

  thresholdSlider.addEventListener('change', function () {
    var index = parseInt(thresholdSlider.value, 10);
    saveSetting({ thresholdMonths: THRESHOLD_PRESETS[index] });
  });

  manageAllowlist.addEventListener('click', function () {
    showAllowlistView();
  });

  backBtn.addEventListener('click', function () {
    mainView.style.display = '';
    allowlistView.style.display = 'none';
  });

  function saveSetting(partial) {
    for (var key in partial) {
      currentSettings[key] = partial[key];
    }
    chrome.runtime.sendMessage({ type: 'SET_SETTINGS', settings: partial });
  }

  function showAllowlistView() {
    mainView.style.display = 'none';
    allowlistView.style.display = '';
    renderAllowlist();
  }

  function renderAllowlist() {
    allowlistContent.innerHTML = '';

    // Get followed new accounts from the content script
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs[0]) {
        renderManualOnly();
        return;
      }

      chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_PAGE_STATS' }, function (response) {
        if (chrome.runtime.lastError || !response) {
          renderManualOnly();
          return;
        }

        var followed = response.followedNewAccounts || [];
        if (followed.length > 0) {
          var label = document.createElement('div');
          label.className = 'allowlist-section-label';
          label.textContent = 'Auto-allowed (followed)';
          allowlistContent.appendChild(label);

          for (var i = 0; i < followed.length; i++) {
            var item = createAllowlistItem(followed[i].username, followed[i].createdAt, 'following');
            allowlistContent.appendChild(item);
          }
        }

        renderManualSection();
      });
    });
  }

  function renderManualOnly() {
    renderManualSection();
  }

  function renderManualSection() {
    var list = currentSettings.allowlist || [];

    if (list.length > 0) {
      var label = document.createElement('div');
      label.className = 'allowlist-section-label';
      label.textContent = 'Manually allowed';
      allowlistContent.appendChild(label);

      for (var i = 0; i < list.length; i++) {
        var item = createAllowlistItem(list[i], null, 'manual');
        allowlistContent.appendChild(item);
      }
    }

    if (allowlistContent.children.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No allowed accounts yet';
      allowlistContent.appendChild(empty);
    }
  }

  function createAllowlistItem(username, createdAt, type) {
    var item = document.createElement('div');
    item.className = 'allowlist-item';

    var avatar = document.createElement('div');
    avatar.className = 'allowlist-avatar';

    var info = document.createElement('div');
    info.className = 'allowlist-info';

    var name = document.createElement('div');
    name.className = 'allowlist-name';
    name.textContent = '@' + username;

    info.appendChild(name);

    if (createdAt) {
      var handle = document.createElement('div');
      handle.className = 'allowlist-handle';
      var d = new Date(createdAt);
      var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      handle.textContent = 'Joined ' + monthNames[d.getMonth()] + ' ' + d.getFullYear();
      info.appendChild(handle);
    }

    item.appendChild(avatar);
    item.appendChild(info);

    if (type === 'following') {
      var badge = document.createElement('div');
      badge.className = 'allowlist-badge following';
      badge.textContent = 'Following';
      item.appendChild(badge);
    } else {
      var removeBtn = document.createElement('div');
      removeBtn.className = 'allowlist-badge remove';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', function () {
        chrome.runtime.sendMessage({ type: 'REMOVE_FROM_ALLOWLIST', username: username }, function () {
          currentSettings.allowlist = currentSettings.allowlist.filter(function (u) { return u !== username; });
          allowlistCountEl.textContent = currentSettings.allowlist.length + ' users on your allowlist';
          allowlistContent.innerHTML = '';
          renderAllowlist();
        });
      });
      item.appendChild(removeBtn);
    }

    return item;
  }
})();
```

- [ ] **Step 4: Verify popup renders correctly**

1. Reload extension at `chrome://extensions`
2. Click the extension icon in the toolbar
3. Verify the popup opens with dark theme, toggle, slider, stats, and allowlist link
4. Toggle the switch, move the slider, and click "Manage" to verify all interactions work

- [ ] **Step 5: Commit**

```bash
git add popup/
git commit -m "feat: popup UI with settings controls and allowlist management"
```

---

### Task 7: Integration Testing

Manual end-to-end verification on `https://x.com`.

- [ ] **Step 1: Verify API interception**

1. Reload extension and navigate to `https://x.com/home`
2. Open DevTools console and run:
   ```js
   window.addEventListener('message', function(e) {
     if (e.data && e.data.type === 'NEW_ACCOUNT_BLOCKER_USER') {
       console.log('NAB User:', e.data.screen_name, e.data.created_at, 'blue:', e.data.is_blue_verified);
     }
   });
   ```
3. Scroll down — user data messages should appear in the console as Twitter loads more tweets

- [ ] **Step 2: Verify tweet hiding**

1. Scroll through the timeline
2. Look for collapse bars — they should appear for accounts younger than 2 years (default threshold)
3. Verify the bar text shows the correct creation date and account age
4. Verify the badge count on the extension icon matches the number of hidden posts

- [ ] **Step 3: Verify Show button**

1. Click "Show" on a collapse bar — the tweet should appear and the bar should hide
2. Scroll away and back — the tweet should still be visible (session-level reveal)
3. Reload the page — the tweet should be collapsed again

- [ ] **Step 4: Verify Allow user button**

1. Click "Allow user" on a collapse bar
2. All posts from that user should become visible immediately
3. Reload the page — posts from that user should remain visible
4. Open popup → Manage allowlist → verify the user appears in "Manually allowed"
5. Click "Remove" on that user → reload → their posts should be collapsed again

- [ ] **Step 5: Verify settings**

1. Open the popup and change the threshold slider to "6 mo"
2. Some previously hidden posts (6-24 month old accounts) should reappear
3. Change it back to "2 yr" — they should be hidden again
4. Toggle the extension off — all collapse bars should disappear
5. Toggle it back on — bars should reappear

- [ ] **Step 6: Verify blue-check filter**

1. Open popup and enable "Hide blue-check accounts"
2. Posts from blue-check verified accounts should now be hidden with appropriate bar text
3. Disable the toggle — blue-check posts should reappear
4. Age filter should continue working independently

- [ ] **Step 7: Verify on other pages**

1. Navigate to a tweet's replies (`x.com/<user>/status/<id>`) — filter should work
2. Search for something (`x.com/search?q=...`) — filter should work
3. Visit a profile page — filter should work on their tweets

- [ ] **Step 8: Commit any fixes**

If any bugs were found during testing, fix them and commit:

```bash
git add -A
git commit -m "fix: address issues found during integration testing"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Project scaffold | `manifest.json`, `scripts/generate-icons.js`, `icons/` |
| 2 | Utility functions + tests | `utils.js`, `tests/utils.test.js` |
| 3 | Service worker | `background.js` |
| 4 | Injected page script | `injected.js` |
| 5 | Content script | `content.js` |
| 6 | Popup UI | `popup/popup.html`, `popup/popup.css`, `popup/popup.js` |
| 7 | Integration testing | Manual verification on x.com |
