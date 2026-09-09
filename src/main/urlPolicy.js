'use strict';

/**
 * Pure policies for the main process: which URLs the renderer may navigate
 * to, which may be handed to the system browser, and which store keys the
 * general-purpose preferences IPC may touch. No Electron imports, so every
 * rule here is unit-tested in plain Node.
 */

function parse(url) {
	try {
		return new URL(String(url));
	} catch {
		return null;
	}
}

/** True for http(s) URLs only. Anything else (file:, smb:, javascript:, custom schemes) is not. */
function isExternalHttpUrl(url) {
	const parsed = parse(url);
	return !!parsed && (parsed.protocol === 'http:' || parsed.protocol === 'https:');
}

/**
 * Navigation the renderer may perform inside the window: its own file://
 * bundle in production, or the local dev server when running with --dev.
 */
function isAllowedInAppNavigation(url, { isDev = false } = {}) {
	const parsed = parse(url);
	if (!parsed) return false;
	if (parsed.protocol === 'file:') return true;
	if (!isDev) return false;
	return parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
}

/**
 * What to do with a navigation request:
 *   'allow'         — let it happen in the window
 *   'open-external' — cancel it and open the system browser
 *   'block'         — cancel it and do nothing
 */
function navigationDecision(url, options) {
	if (isAllowedInAppNavigation(url, options)) return 'allow';
	if (isExternalHttpUrl(url)) return 'open-external';
	return 'block';
}

const PROTECTED_STORE_ROOTS = new Set(['auth']);
const MAX_STORE_KEY_LENGTH = 256;

/**
 * Keys the general store IPC (store:get/set/delete) must refuse. The
 * encrypted auth tokens live under `auth.*` and are reachable only through
 * the dedicated auth handlers, which decrypt/encrypt on the way through.
 * Without this, a compromised renderer could read the ciphertext or replace
 * a token with one of its own.
 */
function isProtectedStoreKey(key) {
	if (typeof key !== 'string' || key.length === 0 || key.length > MAX_STORE_KEY_LENGTH) return true;
	const root = key.split('.')[0];
	return PROTECTED_STORE_ROOTS.has(root);
}

module.exports = {
	isExternalHttpUrl,
	isAllowedInAppNavigation,
	navigationDecision,
	isProtectedStoreKey,
};
