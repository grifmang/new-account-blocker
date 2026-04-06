<p align="center">
  <img src="icons/icon-128.png" alt="New Account Blocker" width="128" height="128">
</p>

<h1 align="center">New Account Blocker</h1>

<p align="center">
  A browser extension that hides Twitter/X posts from recently created accounts and blue-check verified accounts.
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/new-account-blocker/nghbihognhjnmglpiembanbdeegbmcje"><img src="https://img.shields.io/chrome-web-store/v/nghbihognhjnmglpiembanbdeegbmcje?style=flat&logo=googlechrome&logoColor=white&label=Chrome%20Web%20Store&color=4285F4" alt="Chrome Web Store"></a>
  <a href="https://chromewebstore.google.com/detail/new-account-blocker/nghbihognhjnmglpiembanbdeegbmcje"><img src="https://img.shields.io/chrome-web-store/users/nghbihognhjnmglpiembanbdeegbmcje?style=flat&logo=googlechrome&logoColor=white&label=Users&color=4285F4" alt="Chrome Web Store Users"></a>
  <a href="https://chromewebstore.google.com/detail/new-account-blocker/nghbihognhjnmglpiembanbdeegbmcje"><img src="https://img.shields.io/chrome-web-store/rating/nghbihognhjnmglpiembanbdeegbmcje?style=flat&logo=googlechrome&logoColor=white&label=Rating&color=4285F4" alt="Chrome Web Store Rating"></a>
  <a href="https://github.com/grifmang/new-account-blocker/blob/master/LICENSE"><img src="https://img.shields.io/github/license/grifmang/new-account-blocker?style=flat" alt="License"></a>
</p>

<p align="center">
  <a href="#features">Features</a> &middot;
  <a href="#installation">Installation</a> &middot;
  <a href="#how-it-works">How It Works</a> &middot;
  <a href="#privacy">Privacy</a>
</p>

---

## Features

- **Hide posts from new accounts** — Set a custom age threshold (1 month to 5 years) to filter out recently created accounts
- **Hide blue-check accounts** — Optional toggle to filter posts from Twitter Blue / X Premium verified accounts
- **Collapsible bars** — Hidden posts are replaced with a subtle bar showing the account's creation date, with options to reveal or permanently allow
- **Allowlist** — Accounts you follow are never hidden. Manually allow specific users with one click
- **Works everywhere** — Timeline, replies, search, profiles — anywhere tweets appear
- **Badge counter** — See how many posts were filtered on the current page at a glance
- **No API required** — Works entirely client-side by reading data Twitter already loads in your browser
- **Zero data collection** — All filtering happens locally. Nothing is sent to external servers

## Installation

### From the Store

- **[Chrome Web Store](https://chromewebstore.google.com/detail/new-account-blocker/nghbihognhjnmglpiembanbdeegbmcje)** — Install for Chrome, Brave, Arc, Opera, Vivaldi
- **Edge Add-ons** — *Coming soon*

### Manual Install (Developer Mode)

1. Download or clone this repository
2. Open your browser's extension page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** and select the project folder
5. Navigate to [x.com](https://x.com) and start browsing

## How It Works

The extension intercepts Twitter's internal API responses (which your browser already fetches) to extract account creation dates and verification status. It then uses a MutationObserver to detect new tweets in the DOM and hides those from accounts that match your filters.

**No extra network requests are made.** The extension reads data that Twitter already sends to your browser.

### Architecture

| Component | File | Purpose |
|-----------|------|---------|
| Injected Script | `injected.js` | Patches `fetch`/`XHR` to intercept Twitter API responses |
| Content Script | `content.js` | Manages user cache, hides tweets, renders collapse bars |
| Service Worker | `background.js` | Persists settings, updates badge count |
| Popup | `popup/` | Settings UI with threshold slider, toggles, and allowlist |

## Compatibility

Works on all Chromium-based browsers:

- Google Chrome
- Microsoft Edge
- Brave
- Opera
- Vivaldi
- Arc

## Privacy

New Account Blocker does not collect, store, or transmit any personal data. All filtering happens locally in your browser. See the full [Privacy Policy](PRIVACY.md).

## License

MIT
