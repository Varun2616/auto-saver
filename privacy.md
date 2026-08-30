# Privacy Policy — Prompt Auto-Saver

**Last updated:** August 30, 2025

This privacy policy explains what data the Prompt Auto-Saver browser extension ("the extension") collects, how it is used, and the controls you have over it.

---

## 1. Overview

Prompt Auto-Saver is a local-first tool. Its only job is to save text you type in text areas and contenteditable chat boxes so you do not lose your work when a tab crashes or a page reloads.

**The extension does not collect, transmit, or sell any of your data.** Everything you type is stored **only in your own browser**, on your own device, using Chrome's `chrome.storage.local` API. No servers are involved.

---

## 2. Data collected

The extension only collects data **after you explicitly enable it for a specific site** by flipping the "Enable Auto-Saver on this site" toggle in the popup (which also requires you to grant a host-permission prompt).

When enabled, the extension stores:

| Data | Purpose |
|---|---|
| **Text you type** into text areas or contenteditable fields on the enabled site | Restoring your drafts after a crash or refresh |
| **Timestamp of each save** | Sorting drafts newest-first and enabling automatic cleanup |
| **A storage key** derived from the page's URL (origin + path) and the input field's identifier | Organizing drafts per page and per input so fields never overwrite each other |

**What is NOT collected:**

- No keystrokes outside editable fields (only the resulting text of the field is saved, after a pause in typing).
- No login credentials, passwords, or payment data are read intentionally; the extension never reads non-editable page content.
- No personal identifiers, no accounts, no email, no location.
- No browsing history, no cookies, no tracking, no analytics.
- Nothing is collected on sites you have **not** enabled.

---

## 3. How data is used

Saved drafts are used for exactly one purpose: displaying them in the extension's popup so you can copy your work back. There is no other use.

---

## 4. Where data is stored and security

- All data lives in **`chrome.storage.local`** — browser-managed, device-local extension storage.
- The extension makes **no network requests** and contains **no remote code**. Nothing is uploaded, synced, or shared.
- Data does not appear in your browser's normal web storage (cookies, localStorage of websites) and is not readable by websites.

---

## 5. Data retention

- A **garbage collector** runs automatically in the background (once per hour) and **deletes drafts older than 48 hours**.
- Each input keeps at most its **5 most recent** saved states.
- You can delete all drafts at any time by disabling the site toggle, uninstalling the extension, or manually clearing browser extension storage.

---

## 6. Permissions requested

| Permission | Why it is used |
|---|---|
| `storage` | Storing your drafts locally in the browser |
| `tabs` | Reading the active tab's URL so drafts can be matched to the page you are viewing |
| `alarms` | Scheduling the periodic cleanup of old drafts |
| `scripting` | Injecting the save script into the site you enabled |
| `optional_host_permissions` | Requesting your consent before saving on any site (nothing is saved on a site until you enable it) |

Host access is requested **only when you turn the toggle on** for a given site, and is revoked when you turn it off.

---

## 7. Third parties and data sharing

**None.** The extension has no third-party services, no advertising, no analytics SDKs, and no data-sharing partners. Because no data ever leaves your device, there is nothing to share.

---

## 8. Your control and deletion

- **Disable a site:** open the popup and flip "Enable Auto-Saver on this site" OFF — the saved data remains on your device, but collection stops and the host permission is revoked.
- **Export your data:** use the "Export Drafts" button in the popup to download a JSON backup.
- **Delete everything:** uninstalling the extension removes all of its stored data from your browser.

---

## 9. Children's privacy

The extension does not knowingly collect information from anyone, and it stores data only on the device of the user who installed it. It does not require an account or any personal information.

---

## 10. Changes to this policy

If this policy changes, the "Last updated" date above will be revised and the updated policy will be published in this repository.

---

## 11. Contact

For questions about this privacy policy or the extension, please open an issue in the project repository or contact the developer at: **varunjha2616@gmail.com**
