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
