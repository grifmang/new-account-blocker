var THRESHOLD_PRESETS = [1, 3, 6, 12, 24, 36, 60];
var THRESHOLD_LABELS = ['1 mo', '3 mo', '6 mo', '1 yr', '2 yr', '3 yr', '5 yr'];

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
    return users;
  } else if (obj.screen_name && obj.created_at && !obj.legacy) {
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
