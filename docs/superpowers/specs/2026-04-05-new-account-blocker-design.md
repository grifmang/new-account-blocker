# New Account Blocker — Chrome Extension Design Spec

A Chrome extension that hides posts and replies from recently created Twitter/X accounts and/or blue-check (Twitter Blue / X Premium) verified accounts by intercepting Twitter's internal API responses and applying CSS-based hiding with collapsible reveal bars.

## Problem

Brand new accounts have become a plague on Twitter/X — spam, bots, and low-quality engagement from accounts created in the past few months to years. Additionally, some users are frustrated by new accounts purchasing blue checkmarks (Twitter Blue / X Premium) to gain visibility in replies. Twitter's API is too expensive to use for filtering, so this extension works entirely client-side by intercepting data Twitter already fetches.

## Architecture

Four components communicate via message passing:

### 1. Injected Page Script (`injected.js`)

Runs in Twitter's page context (not the content script's isolated world). Injected by the content script via a `<script>` tag added to the DOM.

**Responsibilities:**
- Monkey-patches `window.fetch()` and `XMLHttpRequest.prototype.open/send` to intercept Twitter's internal API responses
- Targets URLs matching Twitter's API patterns: `/i/api/graphql/*`, `/i/api/2/*`
- Clones responses before reading (so Twitter's own code is unaffected)
- Recursively walks response JSON to find user objects — any object containing both `screen_name` and `created_at` fields
- Also extracts `is_blue_verified` from user objects to identify paid blue-check accounts
- For each user found, posts a message to the content script via `window.postMessage`:
  ```js
  { type: 'NEW_ACCOUNT_BLOCKER_USER', screen_name, created_at, user_id, is_blue_verified }
  ```

### 2. Content Script (`content.js`)

The coordinator between the page script, the DOM, and the service worker. Runs in the content script isolated world on `x.com` and `twitter.com`.

**Responsibilities:**
- Injects `injected.js` into the page context on load
- Listens for `window.postMessage` events from the injected script
- Maintains an in-memory user cache: `Map<string, { createdAt: Date, following: boolean, isBlueVerified: boolean }>` mapping usernames to their account creation date, follow status, and blue-check status
- Uses a `MutationObserver` to detect new tweet elements added to the DOM
- For each new tweet element:
  - Extracts the `@handle` from the tweet's DOM structure
  - Looks up the handle in the user cache
  - If the account is younger than the configured threshold AND not on the allowlist, applies hiding
  - If the blue-check filter is enabled AND the user is blue-verified AND not on the allowlist, applies hiding
- After receiving a batch of new user data, re-scans currently visible tweets (handles the race condition where tweets render before their author data arrives)
- Communicates with the service worker via `chrome.runtime.sendMessage` for:
  - Reading/writing settings (threshold, enabled state, allowlist)
  - Reporting hidden post counts for badge updates
- Responds to queries from the popup for page-specific data (current hidden count, list of followed new accounts for the allowlist view)

### 3. Service Worker (`background.js`)

Manages persistent state and the extension badge.

**Responsibilities:**
- Stores all settings in `chrome.storage.local`:
  - `enabled` (boolean, default: `true`) — global on/off toggle
  - `thresholdMonths` (number, default: `24`) — account age threshold in months
  - `hideBlueChecks` (boolean, default: `false`) — hide posts from blue-check verified accounts
  - `allowlist` (string[]) — manually allowed usernames
  - `totalFiltered` (number) — lifetime hidden post counter
- Updates the extension badge count per tab when the content script reports hidden posts
- Broadcasts setting changes to all active Twitter tabs via `chrome.tabs.sendMessage` so changes take effect immediately without page reload

### 4. Popup UI (`popup/`)

HTML/CSS/JS popup shown when clicking the extension icon.

**Main view:**
- On/off toggle in the header
- Stats section: hidden count for the current page + total lifetime filtered count
- Age threshold slider with preset stops: 1 month, 3 months, 6 months, 1 year, 2 years, 3 years, 5 years
- Blue check filter toggle (off by default) — independent from the age filter; when enabled, hides all posts from blue-check verified accounts
- Link to allowlist management

**Allowlist view:**
- "Auto-allowed (followed)" section — accounts the user follows, detected from Twitter's API data (which includes follow status). These are managed by following/unfollowing on Twitter itself, not within the extension.
- "Manually allowed" section — accounts explicitly allowed via the collapse bar's "Allow user" button. Each entry has a Remove button.
- Tip text explaining how to add users to the allowlist

**Styling:** Uses Twitter's dark theme colors (`#15202b` background, `#e7e9ea` text, `#1d9bf0` accent) to feel native.

## Tweet Hiding Behavior

When a tweet is identified as belonging to a new account or a blue-check account (depending on which filters are active):

1. The original tweet element gets `display: none`
2. A **collapse bar** is inserted before it in the DOM
3. The collapse bar shows:
   - An info icon
   - Text varies by reason:
     - Age filter: "Post hidden — account created [Month Year] ([N] months/years old)"
     - Blue check filter: "Post hidden — blue-check verified account"
     - Both filters match: "Post hidden — blue-check account created [Month Year] ([N] months/years old)"
   - **Show** button — temporarily reveals the tweet for the current session by toggling `display` on the original element. Re-collapses on page reload.
   - **Allow user** button — permanently adds the username to the allowlist in `chrome.storage.local` and immediately reveals all their posts across the page.
4. The collapse bar uses Twitter's dark theme styling (`#16181c` background, `#71767b` text) to blend into the feed

A tweet is hidden if it matches **any** active filter (OR logic). The allowlist overrides all filters — an allowlisted user is never hidden regardless of account age or verification status.

## Scope

The extension works on all Twitter/X pages:
- Home timeline (Following + For You)
- Replies and threads
- Search results
- Profile pages
- Any other page where tweets appear

Since we intercept API responses at the network layer, account age data flows through regardless of which page the user is on.

## API Interception Details

Twitter's frontend makes GraphQL requests to endpoints such as:
- `/i/api/graphql/*/HomeTimeline`
- `/i/api/graphql/*/TweetDetail`
- `/i/api/graphql/*/SearchTimeline`
- `/i/api/graphql/*/UserTweets`
- `/i/api/2/timeline/*`

Response JSON contains nested user objects with a `legacy` field that includes `created_at` (format: `"Thu Jan 15 00:00:00 +0000 2025"`). The injected script walks the full response tree to find all user objects, regardless of nesting depth.

## Data Flow

1. Twitter's frontend makes an API request (e.g., loading the timeline)
2. The injected page script intercepts the response via the patched `fetch()`
3. The script clones the response, parses the JSON, and walks the object tree
4. For each user object found (has both `screen_name` and `created_at`), it posts the data (including `is_blue_verified`) to the content script
5. The content script adds the user to its in-memory cache
6. When the MutationObserver fires (new tweet nodes in the DOM), the content script checks each tweet's author against the cache
7. If the account matches any active filter (age below threshold, or blue-check verified) and is not allowlisted, the tweet is collapsed
8. After each batch of new user data, a re-scan of visible tweets handles the race condition where tweets rendered before their author data arrived
9. The content script reports the hidden count to the service worker, which updates the badge

## Allowlist Logic

Two types of allowlisting:

1. **Auto-allowlist (followed accounts):** Twitter's API responses include follow status for users. If the logged-in user follows an account, it is never hidden regardless of age or verification status. This is derived from API response data, not stored separately.
2. **Manual allowlist:** Users can click "Allow user" on any collapse bar. The username is saved to `chrome.storage.local` and persists across sessions. Can be managed (removed) from the popup's allowlist view. Overrides both the age filter and the blue-check filter.

## Manifest V3 Configuration

```json
{
  "manifest_version": 3,
  "name": "New Account Blocker",
  "version": "1.0.0",
  "description": "Hide posts from recently created Twitter/X accounts",
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

**Permissions rationale:**
- `storage` — for `chrome.storage.local` (settings, allowlist, counters)
- `host_permissions` on `x.com` and `twitter.com` — for the content script injection
- `web_accessible_resources` — so the content script can inject `injected.js` into the page context
- No `webRequest`, no `tabs`, no remote code — minimal permission footprint for Chrome Web Store review

## File Structure

```
manifest.json
background.js            — service worker: settings, badge, message routing
content.js               — content script: user cache, MutationObserver, DOM manipulation
injected.js              — page script: fetch/XHR interception, user data extraction
popup/
  popup.html             — popup markup
  popup.js               — popup logic (settings UI, allowlist management)
  popup.css              — popup styles (Twitter dark theme)
icons/
  icon-16.png
  icon-48.png
  icon-128.png
```

## Edge Cases

- **SPA navigation:** Twitter is a single-page app. The content script's MutationObserver handles new content appearing without full page reloads. The injected fetch/XHR patches persist across SPA navigations since the page context doesn't reload.
- **Race condition (tweets before user data):** Handled by re-scanning visible tweets whenever new user data arrives from the intercepted API.
- **User cache growth:** The in-memory cache is not persisted and resets on page reload, preventing unbounded growth. During a single session, typical usage accumulates hundreds of users at most — negligible memory.
- **Theme support:** The collapse bar and popup use Twitter's dark theme. If Twitter's DOM class names change for theming, the collapse bar's inline styles ensure it remains visually consistent regardless.
- **Extension disabled:** When toggled off, the content script removes all collapse bars and restores original tweet visibility. The injected script continues intercepting (simpler than removing patches) but the content script ignores incoming data.
