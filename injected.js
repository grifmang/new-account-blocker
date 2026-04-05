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
      // Do NOT recurse into matched node — legacy sub-object would match the flat pattern
      return users;
    }

    if (obj.screen_name && obj.created_at && !obj.legacy) {
      users.push({
        screen_name: obj.screen_name,
        created_at: obj.created_at,
        user_id: obj.id_str || null,
        is_blue_verified: Boolean(obj.is_blue_verified),
        following: Boolean(obj.following)
      });
      return users;
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
      }, window.location.origin);
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
