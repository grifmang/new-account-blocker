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
    var hidden = document.querySelectorAll('[data-nab-hidden]');
    for (var i = 0; i < hidden.length; i++) {
      unhideTweet(hidden[i]);
    }
    hiddenCount = 0;
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
