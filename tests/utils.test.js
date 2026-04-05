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
    const date = new Date(2025, 0, 15);
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
