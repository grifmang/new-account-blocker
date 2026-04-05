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
