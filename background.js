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
    var allowed = {};
    var s = message.settings;
    if (s && typeof s.enabled === 'boolean') allowed.enabled = s.enabled;
    if (s && typeof s.thresholdMonths === 'number' && [1, 3, 6, 12, 24, 36, 60].indexOf(s.thresholdMonths) !== -1) {
      allowed.thresholdMonths = s.thresholdMonths;
    }
    if (s && typeof s.hideBlueChecks === 'boolean') allowed.hideBlueChecks = s.hideBlueChecks;
    if (Object.keys(allowed).length === 0) {
      sendResponse({ ok: false });
      return true;
    }
    chrome.storage.local.set(allowed, function () {
      broadcastToTwitterTabs({ type: 'SETTINGS_UPDATED', settings: allowed });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === 'ADD_TO_ALLOWLIST') {
    var username = message.username;
    if (typeof username !== 'string' || username.length === 0 || username.length > 30 || !/^[a-zA-Z0-9_]+$/.test(username)) {
      sendResponse({ ok: false });
      return true;
    }
    chrome.storage.local.get({ allowlist: [] }, function (data) {
      var list = data.allowlist;
      if (list.indexOf(username) === -1) {
        list.push(username);
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
    var username = message.username;
    if (typeof username !== 'string' || username.length === 0 || username.length > 30 || !/^[a-zA-Z0-9_]+$/.test(username)) {
      sendResponse({ ok: false });
      return true;
    }
    chrome.storage.local.get({ allowlist: [] }, function (data) {
      var list = data.allowlist.filter(function (u) { return u !== username; });
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
    var count = parseInt(message.count, 10);
    if (isNaN(count) || count < 0 || count > 100) return false;
    chrome.storage.local.get({ totalFiltered: 0 }, function (data) {
      chrome.storage.local.set({ totalFiltered: data.totalFiltered + count });
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
