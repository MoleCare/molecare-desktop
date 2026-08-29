# MoleCare Desktop

The desktop app for [MoleCare](https://www.molecare.co.uk) — skin health
self-management for macOS, Windows and Linux. It wraps the
[MoleCare web app](https://github.com/MoleCare/molecare-webapp) in an Electron
shell, adding OS keychain storage for auth tokens, a tray icon, window state
persistence, and auto-updates.

> **MoleCare is not a diagnostic tool and not a medical device.** It supports
> self-monitoring. Anyone concerned about a skin change should see a qualified
> clinician.

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)

---

## Getting started

The renderer is built from a **separate repository**, so you need both checked
out side by side:

```bash
git clone https://github.com/MoleCare/molecare-webapp.git
git clone https://github.com/MoleCare/molecare-desktop.git
cd molecare-desktop
npm install
```

Then run it:

```bash
npm run build:webapp   # builds the web app into src/renderer/
npm run dev            # launches Electron
```

`npm run dev` loads `http://localhost:3030`, so run the web app's dev server
(`npm run dev` in `molecare-webapp`) alongside it for hot reload. Without the
dev server, use `npm run pack` and open the packaged app instead.

If your web app checkout lives elsewhere:

```bash
MOLECARE_WEBAPP_DIR=/path/to/molecare-webapp npm run build:webapp
```

Node 20+ is required.

## Building installers

```bash
npm run pack        # unpacked app directory, fastest for testing
npm run build:mac   # .dmg
npm run build:win   # NSIS installer
npm run build:linux # AppImage, deb, rpm
```

Unsigned builds work fine for local testing. Signing and notarisation need
credentials that are not in this repository and are not needed to contribute.

## How it is put together

```
src/main/
  main.js          app lifecycle, window creation, CSP, IPC handlers
  preload.js       the contextBridge surface exposed to the renderer
  menu.js          application menu
  tray.js          tray icon and its context menu
  updater.js       electron-updater wiring
  windowState.js   remembers window size and position
src/renderer/      built from molecare-webapp — not committed
```

## Security model

- `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true`
- the renderer reaches the main process only through the narrow `preload.js`
  bridge — there is no direct Node access from page code
- auth tokens go through Electron's `safeStorage`, which uses the macOS
  Keychain and Windows DPAPI; they are never written to plain disk
- a Content Security Policy is applied to every response
- external links open in the system browser rather than in an app window

Found a hole in any of that? See [SECURITY.md](./SECURITY.md).

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) first — it covers the Electron
security rules that are not negotiable here, and the fact that this app handles
personal health data.

## Related

- [molecare-webapp](https://github.com/MoleCare/molecare-webapp) — the web front end this packages
- [molecare-ml](https://github.com/MoleCare/molecare-ml) — melanoma classification service
- [molecare-mcp](https://github.com/MoleCare/molecare-mcp) — MCP server for dermatology tooling

## Contributors

Thank you to everyone who has helped molecare-desktop.

<!-- readme: contributors,bots/- -start -->
<table>
	<tbody>
		<tr>
			<td align="center">
				<a href="https://github.com/YauhenBichel">
					<img src="https://avatars.githubusercontent.com/YauhenBichel?s=48" width="48" alt="Yauhen Bichel" />
					<br />
					<sub><b>Yauhen Bichel</b></sub>
				</a>
			</td>
		</tr>
	</tbody>
</table>
<!-- readme: contributors,bots/- -end -->

The list is filled by [Contributors](./.github/workflows/contributors.yml) from
GitHub commits, bots omitted — never hand-maintained, because a stale list is
worse than none. [Contributor graph](https://github.com/MoleCare/molecare-desktop/graphs/contributors) ·
[good first issue](https://github.com/MoleCare/molecare-desktop/labels/good%20first%20issue)

## License

[Apache-2.0](./LICENSE) © MoleCare LTD
