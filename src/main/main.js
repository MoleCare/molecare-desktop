const { app, BrowserWindow, ipcMain, dialog, shell, Notification, safeStorage, session } = require('electron');
const path = require('path');
const crypto = require('crypto');
const log = require('electron-log');
// electron-store is ESM-only from v10. Electron 44 ships Node 22, whose
// require(esm) returns the module namespace rather than the class, so reach for
// .default — and keep the fallback so a CommonJS build still works.
const StoreModule = require('electron-store');
const Store = StoreModule.default || StoreModule;
const { createMenu } = require('./menu');
const { createTray } = require('./tray');
const { setupUpdater } = require('./updater');
const { restoreWindowState, trackWindowState } = require('./windowState');

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

/**
 * Derive a machine-local store key. Preferences are non-auth data;
 * auth tokens use safeStorage separately.
 */
function preferencesEncryptionKey() {
	const seed = [
		app.getPath('userData'),
		app.getName(),
		process.platform,
		'molecare-desktop-prefs-v1',
	].join('|');
	return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 32);
}

// Secure store for non-sensitive preferences
const store = new Store({
	name: 'molecare-preferences',
	encryptionKey: preferencesEncryptionKey(),
});

// Keep global references to prevent garbage collection
let mainWindow = null;
let tray = null;
const isDev = process.argv.includes('--dev');

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
	app.quit();
} else {
	app.on('second-instance', () => {
		if (mainWindow) {
			if (mainWindow.isMinimized()) mainWindow.restore();
			mainWindow.focus();
		}
	});
}

function createWindow() {
	const windowState = restoreWindowState(store);

	mainWindow = new BrowserWindow({
		width: windowState.width || 1280,
		height: windowState.height || 800,
		x: windowState.x,
		y: windowState.y,
		minWidth: 900,
		minHeight: 600,
		title: 'MoleCare',
		icon: path.join(__dirname, '..', 'assets', process.platform === 'darwin' ? 'icon.icns' : 'icon.ico'),
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			webSecurity: true,
		},
		show: false,
		backgroundColor: '#FFFFFF',
	});

	// Track window state for persistence
	trackWindowState(mainWindow, store);

	// Set Content Security Policy
	session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
		callback({
			responseHeaders: {
				...details.responseHeaders,
				'Content-Security-Policy': [
					"default-src 'self';" +
					" script-src 'self' 'unsafe-inline' 'unsafe-eval';" +
					" style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;" +
					" font-src 'self' https://fonts.gstatic.com data:;" +
					" img-src 'self' data: blob: https:;" +
					" connect-src 'self' https://d3ajqpkbwsbhoq.cloudfront.net https://molecare.co.uk https://api.molecare.co.uk http://localhost:*;" +
					" media-src 'self' blob:;"
				],
			},
		});
	});

	// Load the app
	if (isDev) {
		mainWindow.loadURL('http://localhost:3030');
		mainWindow.webContents.openDevTools();
		log.info('Running in development mode, loading from localhost:3030');
	} else {
		const indexPath = path.join(__dirname, '..', 'renderer', 'index.html');
		mainWindow.loadFile(indexPath);
		log.info('Running in production mode, loading from', indexPath);
	}

	// Show window when ready
	mainWindow.once('ready-to-show', () => {
		mainWindow.show();
		if (windowState.isMaximized) {
			mainWindow.maximize();
		}
	});

	// Handle external links — open in default browser
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith('http://') || url.startsWith('https://')) {
			shell.openExternal(url);
		}
		return { action: 'deny' };
	});

	// macOS: hide to dock on close instead of quitting
	mainWindow.on('close', (event) => {
		if (process.platform === 'darwin' && !app.isQuitting) {
			event.preventDefault();
			mainWindow.hide();
		}
	});

	mainWindow.on('closed', () => {
		mainWindow = null;
	});

	// Set up native menu
	createMenu(mainWindow, isDev);

	// Set up system tray
	tray = createTray(mainWindow);

	// Set up auto-updater (production only)
	if (!isDev) {
		setupUpdater(mainWindow);
	}
}

// ─── IPC Handlers ────────────────────────────────────────────

// Secure token storage using OS keychain (safeStorage)
ipcMain.handle('auth:setToken', (_event, key, value) => {
	if (typeof key !== 'string' || typeof value !== 'string') return false;
	try {
		const encrypted = safeStorage.encryptString(value);
		store.set(`auth.${key}`, encrypted.toString('base64'));
		return true;
	} catch (err) {
		log.error('Failed to encrypt token:', err.message);
		return false;
	}
});

ipcMain.handle('auth:getToken', (_event, key) => {
	if (typeof key !== 'string') return null;
	try {
		const encrypted = store.get(`auth.${key}`);
		if (!encrypted) return null;
		const buffer = Buffer.from(encrypted, 'base64');
		return safeStorage.decryptString(buffer);
	} catch (err) {
		log.error('Failed to decrypt token:', err.message);
		return null;
	}
});

ipcMain.handle('auth:clearToken', (_event, key) => {
	if (typeof key !== 'string') return false;
	store.delete(`auth.${key}`);
	return true;
});

ipcMain.handle('auth:clearAll', () => {
	store.delete('auth');
	return true;
});

// General store (non-sensitive preferences)
ipcMain.handle('store:get', (_event, key) => {
	if (typeof key !== 'string') return null;
	return store.get(key);
});

ipcMain.handle('store:set', (_event, key, value) => {
	if (typeof key !== 'string') return false;
	store.set(key, value);
	return true;
});

ipcMain.handle('store:delete', (_event, key) => {
	if (typeof key !== 'string') return false;
	store.delete(key);
	return true;
});

// App info
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:platform', () => 'desktop');

// Shell
ipcMain.handle('shell:openExternal', (_event, url) => {
	if (typeof url !== 'string') return false;
	// Only allow http/https URLs
	if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
	shell.openExternal(url);
	return true;
});

// Native notification
ipcMain.handle('notification:show', (_event, title, body) => {
	if (typeof title !== 'string' || typeof body !== 'string') return false;
	if (Notification.isSupported()) {
		const notification = new Notification({ title, body });
		notification.on('click', () => {
			if (mainWindow) {
				mainWindow.show();
				mainWindow.focus();
			}
		});
		notification.show();
		return true;
	}
	return false;
});

// File save dialog (for PDF reports)
ipcMain.handle('file:saveDialog', async (_event, defaultFilename, fileData) => {
	if (!mainWindow) return null;
	const result = await dialog.showSaveDialog(mainWindow, {
		defaultPath: defaultFilename || 'MoleCare_Report.pdf',
		filters: [
			{ name: 'PDF Documents', extensions: ['pdf'] },
			{ name: 'All Files', extensions: ['*'] },
		],
	});
	if (result.canceled || !result.filePath) return null;

	try {
		const fs = require('fs');
		const buffer = Buffer.from(fileData, 'base64');
		fs.writeFileSync(result.filePath, buffer);
		return result.filePath;
	} catch (err) {
		log.error('Failed to save file:', err.message);
		return null;
	}
});

// Print
ipcMain.handle('print:page', () => {
	if (mainWindow) {
		mainWindow.webContents.print();
		return true;
	}
	return false;
});

// ─── App Lifecycle ───────────────────────────────────────────

app.on('ready', createWindow);

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('activate', () => {
	if (mainWindow === null) {
		createWindow();
	} else {
		mainWindow.show();
	}
});

app.on('before-quit', () => {
	app.isQuitting = true;
});

// Security: prevent navigation to unknown URLs
app.on('web-contents-created', (_event, contents) => {
	contents.on('will-navigate', (event, navigationUrl) => {
		const parsedUrl = new URL(navigationUrl);
		// Allow navigation to localhost (dev) and file:// (prod)
		if (
			parsedUrl.protocol === 'file:' ||
			(isDev && parsedUrl.hostname === 'localhost')
		) {
			return;
		}
		// Block all other navigation — open in external browser
		event.preventDefault();
		shell.openExternal(navigationUrl);
	});
});
