'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
	isExternalHttpUrl,
	isAllowedInAppNavigation,
	navigationDecision,
	isProtectedStoreKey,
} = require('../src/main/urlPolicy');

test('only http and https count as external browser URLs', () => {
	assert.equal(isExternalHttpUrl('https://www.molecare.co.uk/help'), true);
	assert.equal(isExternalHttpUrl('http://example.com'), true);
	for (const bad of ['file:///etc/passwd', 'smb://nas/share', 'javascript:alert(1)', 'mailto:a@b.c', 'molecare://x', 'not a url', '', null, undefined, 42]) {
		assert.equal(isExternalHttpUrl(bad), false, String(bad));
	}
});

test('in-app navigation: file:// always, localhost only in dev', () => {
	assert.equal(isAllowedInAppNavigation('file:///Applications/MoleCare.app/renderer/index.html'), true);
	assert.equal(isAllowedInAppNavigation('http://localhost:3030/settings', { isDev: true }), true);
	assert.equal(isAllowedInAppNavigation('http://127.0.0.1:3030/', { isDev: true }), true);
	assert.equal(isAllowedInAppNavigation('http://localhost:3030/settings', { isDev: false }), false);
	assert.equal(isAllowedInAppNavigation('https://localhost.evil.com/', { isDev: true }), false);
	assert.equal(isAllowedInAppNavigation('http://localhost.evil.com/', { isDev: true }), false);
	assert.equal(isAllowedInAppNavigation('garbage', { isDev: true }), false);
});

test('navigation decision covers allow, open-external and block', () => {
	assert.equal(navigationDecision('file:///x/index.html'), 'allow');
	assert.equal(navigationDecision('https://api.molecare.co.uk/docs'), 'open-external');
	assert.equal(navigationDecision('smb://nas/share'), 'block');
	assert.equal(navigationDecision('javascript:void(0)'), 'block');
	assert.equal(navigationDecision('%%%not-a-url'), 'block', 'malformed URLs must not throw');
	assert.equal(navigationDecision('http://localhost:3030/', { isDev: true }), 'allow');
	assert.equal(navigationDecision('http://localhost:3030/', { isDev: false }), 'open-external');
});

test('the general store refuses the auth subtree and junk keys', () => {
	for (const key of ['auth', 'auth.accessToken', 'auth.refreshToken', 'auth.anything.deeper']) {
		assert.equal(isProtectedStoreKey(key), true, key);
	}
	for (const key of ['theme', 'window.bounds', 'authentication-help-seen', 'locale']) {
		assert.equal(isProtectedStoreKey(key), false, key);
	}
	for (const key of ['', 'x'.repeat(257), 42, null, undefined, {}]) {
		assert.equal(isProtectedStoreKey(key), true, String(key));
	}
});
