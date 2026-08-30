# Prompt Auto-Saver

A Manifest V3 browser extension that automatically saves your work in text areas and contenteditable chat boxes (ChatGPT, Gemini, Claude, and any site you enable) to `chrome.storage.local`, so a tab crash or accidental refresh never loses your prompt again.

Built from the architecture described in `auto_saver_extension_guide.md` (Advanced Implementation), extended with a rolling history stack, a recovery popup, and per-site activation.

---

## Features

- **Debounced auto-save** — snapshots are taken 2.5s after you stop typing.
- **Textarea + contenteditable support** — works with both plain `<textarea>` elements and the contenteditable editors used by modern AI chat boxes (including inherited editability).
- **Rolling history stack** — each input keeps its 5 most recent states as an array of `{ text, timestamp }`, newest first; consecutive duplicates and minor backspace-and-type fragments are filtered out.
- **Recovery popup** — lists the latest drafts for the current page, each with a compact 📋 copy-to-clipboard icon; history states are labeled (`Draft 1 · input_index_0 · 2m ago`).
- **Client-side search** — a sticky search box filters the rendered draft cards in real time.
- **JSON export** — one click downloads all saved data as a formatted JSON file.
- **Garbage collector** — a background service worker purges drafts older than 48 hours hourly via `chrome.alarms`.
- **Per-site toggle** — enable/disable Auto-Saver for the current site from the popup; host permission is requested on demand and the content script is injected immediately.
- **Keyboard shortcut** — `Alt+Shift+S` opens the popup.

---

## Installation (load unpacked)

1. Clone or download this repository.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked** and select the project folder containing `manifest.json`.
5. Open any site (e.g., ChatGPT, Gemini, Claude, or any other site you enable), open the extension popup, and flip **"Enable Auto-Saver on this site"** ON.

---

## Usage

| Action | How |
|---|---|
| Enable saving on a site | Open the popup → flip the **Enable Auto-Saver on this site** toggle ON (grant the permission prompt). The script injects instantly. |
| Disable saving on a site | Flip the toggle OFF — the host permission is revoked. |
| Recover drafts | Open the popup on that page; the 5 most recent drafts are listed. Click the 📋 icon to copy one. |
| Find a draft | Type in the **search box** at the top of the popup. |
| Back up everything | Click **Export Drafts** to download `prompt-auto-saver-export-<timestamp>.json`. |
| Open the popup quickly | Press **Alt+Shift+S**. |

Drafts are keyed by the page's sanitized URL (origin + pathname, no volatile query parameters) plus a stable input identifier, so multiple fields on one page never overwrite each other.

---

## Architecture

```
manifest.json   MV3 manifest: permissions, background worker, popup, commands
content.js      Injected saver: debounced capture, URL sanitizer, unique IDs,
                rolling history stack, defensive storage access (IIFE-wrapped)
background.js   Service worker: hourly garbage collector (chrome.alarms),
                Alt+Shift+S popup shortcut
popup.html      Popup UI: site toggle, search, export button, drafts list, toast
popup.js        Popup logic: permission toggle + injection, draft recovery,
                search filtering, JSON export, copy-to-clipboard
```

### Storage format

Each saved input is stored under a composite key:

```
<sanitized-url>|<input-id>  →  [ { text, timestamp }, ... ]  (max 5, newest first)
```

Example:

```
https://chatgpt.com/c/abc123|input_index_0  →  [
  { "text": "latest prompt...", "timestamp": 1717000000000 },
  { "text": "earlier prompt...", "timestamp": 1716999700000 }
]
```

### Permissions

| Permission | Why |
|---|---|
| `storage` | Persist drafts and the managed-domain state |
| `tabs` | Read the active tab's URL so drafts can be matched to the current page |
| `alarms` | Schedule the hourly garbage collector |
| `scripting` | Inject `content.js` on demand via `chrome.scripting.executeScript` |
| `optional_host_permissions` (`<all_urls>`) | Request host permission for whichever site the user enables, at runtime |

---

## Known limitations

- **Injection is page-scoped.** The toggle injects `content.js` into the *current* page via `executeScript`. After a reload or navigation the script is re-injected automatically the next time you **open the popup** (permission is still granted), but there is no background-based re-injection on navigation yet.
- The 5-draft cap is per input in storage; the popup shows the 5 most recent drafts *across all inputs* on the page.
- Drafts are stored per origin + pathname; pages that serve different content at the same path share a draft pool.

---

## Development

All scripts are plain JavaScript (no build step). Reload the extension in `chrome://extensions` after editing.

Quick syntax check:

```bash
node --check content.js
node --check background.js
node --check popup.js
```

Commit history follows the milestone plan in the guide: manifest → content script → garbage collector → recovery popup → history stack → export/search/shortcut → dynamic per-site injection.
