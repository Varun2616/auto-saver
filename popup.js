// popup.js — Recovery UI: shows drafts saved by the content script for the
// current tab's page. Storage entries are rolling history stacks (arrays of
// { text, timestamp } objects), so all stacks are flattened, sorted, and the
// most recent drafts are rendered.

const MAX_RECENT_DRAFTS = 5; // Show at most the 5 most recent drafts
const CLIPBOARD_ICON = '📋';
const COPIED_ICON = '✅';

// The drafts currently rendered in the popup (subject to the search filter)
let currentDrafts = [];

// Export the entire contents of chrome.storage.local as a formatted JSON
// file downloaded via a Blob URL.
function exportDrafts() {
    chrome.storage.local.get(null, (items) => {
        const json = JSON.stringify(items, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `prompt-auto-saver-export-${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);
    });
}

// Wire up the Export Drafts button
document.getElementById('export-btn').addEventListener('click', exportDrafts);

// Clear the drafts container
function clearContainer() {
    const container = document.getElementById('drafts-container');
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }
}

// Render a list of drafts, or an appropriate empty-state message
function renderDrafts(drafts, query) {
    clearContainer();

    if (drafts.length === 0) {
        showEmpty(query ? 'No drafts match your search.' : 'No saved drafts for this page yet.');
        return;
    }

    drafts.forEach(renderDraft);
}

// Real-time search: filter the rendered draft cards by keyword in the text
const searchInput = document.getElementById('search-input');
searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    const filtered = query
        ? currentDrafts.filter((draft) => draft.text.toLowerCase().includes(query))
        : currentDrafts;
    renderDrafts(filtered, query);
});

// --- Per-site Auto-Saver toggle ---
const siteToggle = document.getElementById('site-toggle');

// Host-permission pattern for the current tab's origin, e.g. "https://chatgpt.com/*"
function getOriginPattern(url) {
    return new URL(url).origin + '/*';
}

// Make sure content.js is running in the given tab. Safe to call repeatedly:
// content.js has an idempotency guard that skips re-attaching listeners.
function ensureInjected(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
    }, () => {
        if (chrome.runtime.lastError) {
            console.error('Auto-inject failed:', chrome.runtime.lastError.message);
        }
    });
}

// Reflect the current permission state for the active tab's origin. If the
// permission is already granted (toggle renders ON), also ensure content.js
// is actually injected — it won't be after a reload or navigation, and the
// user shouldn't have to toggle off and on to recover it.
function initSiteToggle(tab) {
    const originPattern = getOriginPattern(tab.url);
    chrome.permissions.contains({ origins: [originPattern] }, (result) => {
        siteToggle.checked = Boolean(result);

        if (result && typeof tab.id === 'number') {
            ensureInjected(tab.id);
        }
    });
}

siteToggle.addEventListener('change', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs && tabs[0];

        if (!tab || !tab.url) {
            siteToggle.checked = false;
            showToast('Unable to determine the current tab URL.');
            return;
        }

        const originPattern = getOriginPattern(tab.url);

        if (siteToggle.checked) {
            // Enable: request host permission, then inject content.js
            // immediately so it works without a page reload.
            chrome.permissions.request({ origins: [originPattern] }, (granted) => {
                if (!granted) {
                    siteToggle.checked = false;
                    showToast('Permission denied — Auto-Saver not enabled.');
                    return;
                }

                if (typeof tab.id !== 'number') {
                    siteToggle.checked = false;
                    showToast('Unable to inject into this tab.');
                    return;
                }

                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Injection failed:', chrome.runtime.lastError.message);
                        siteToggle.checked = false;
                        showToast(`Injection failed: ${chrome.runtime.lastError.message}`);
                        return;
                    }
                    showToast('Auto-Saver enabled on this site.');
                });
            });
        } else {
            // Disable: revoke the host permission
            chrome.permissions.remove({ origins: [originPattern] }, () => {
                showToast('Auto-Saver disabled on this site.');
            });
        }
    });
});

// Sanitize a URL exactly like content.js does (origin + pathname, no query)
function getCleanUrl(url) {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
}

// Human-readable "time elapsed since saved" label for a draft
function formatTimeAgo(timestamp) {
    if (!timestamp || typeof timestamp !== 'number' || timestamp <= 0) return '';

    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

// Show a brief visual notification at the bottom of the popup
let toastTimer;
function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add('show');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, 1200);
}

// Copy text to the clipboard, with a legacy fallback for contexts where the
// async Clipboard API is unavailable.
function copyToClipboard(text, iconButton) {
    const flashCopied = () => {
        iconButton.textContent = COPIED_ICON;
        iconButton.classList.add('copied');
        showToast('Copied to clipboard');
        setTimeout(() => {
            iconButton.textContent = CLIPBOARD_ICON;
            iconButton.classList.remove('copied');
        }, 1200);
    };

    navigator.clipboard.writeText(text).then(flashCopied).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        flashCopied();
    });
}

// Render a single recovered draft into the container. Each draft has a
// compact clipboard icon button instead of a full-size label button.
function renderDraft(draft) {
    const container = document.getElementById('drafts-container');

    const draftDiv = document.createElement('div');
    draftDiv.className = 'draft';

    // Header row: history-state label on the left, compact icon on the right.
    // The label shows the draft number within its input's history, the source
    // input ID, and how long ago it was saved, so multiple states of the same
    // input are clearly distinguishable.
    const headerDiv = document.createElement('div');
    headerDiv.className = 'draft-header';

    const timeAgo = formatTimeAgo(draft.timestamp);
    const sourceLabel = document.createElement('span');
    sourceLabel.className = 'source-label';
    sourceLabel.textContent = `Draft ${draft.draftNumber} · ${draft.inputId}${timeAgo ? ` · ${timeAgo}` : ''}`;

    const copyButton = document.createElement('button');
    copyButton.className = 'copy-icon';
    copyButton.textContent = CLIPBOARD_ICON;
    copyButton.title = 'Copy to Clipboard';
    copyButton.addEventListener('click', () => copyToClipboard(draft.text, copyButton));

    headerDiv.appendChild(sourceLabel);
    headerDiv.appendChild(copyButton);

    const textDiv = document.createElement('div');
    textDiv.className = 'draft-text';
    textDiv.textContent = draft.text;

    draftDiv.appendChild(headerDiv);
    draftDiv.appendChild(textDiv);
    container.appendChild(draftDiv);
}

// Show a fallback message when there is nothing to display
function showEmpty(message) {
    const container = document.getElementById('drafts-container');

    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty';
    emptyDiv.textContent = message;
    container.appendChild(emptyDiv);
}

document.addEventListener('DOMContentLoaded', () => {
    // Get the currently active tab in the focused window
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs && tabs[0];
        if (!tab || !tab.url) {
            showEmpty('Unable to determine the current tab URL.');
            return;
        }

        const cleanUrl = getCleanUrl(tab.url);

        // Sync the site toggle with the current permission state and
        // auto-inject content.js if permission is already granted
        initSiteToggle(tab);

        // Fetch every saved entry and group drafts by their source input so
        // each history state can be numbered within its own input's stack.
        chrome.storage.local.get(null, (items) => {
            const draftsByInput = new Map();

            for (const [key, entry] of Object.entries(items)) {
                if (!key.startsWith(cleanUrl)) continue;

                // Entries are arrays; tolerate legacy single-object entries
                const history = Array.isArray(entry) ? entry : [entry];
                const inputId = key.slice(cleanUrl.length + 1) || 'unknown'; // strip "url|"

                const validDrafts = history.filter((draft) => draft && typeof draft.text === 'string');
                // Newest first within this input's history
                validDrafts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

                draftsByInput.set(inputId, validDrafts);
            }

            // Flatten all inputs into one list, tagging each draft with its
            // history-state number (Draft 1 = newest for that input) and its
            // source input identifier.
            const allDrafts = [];
            for (const [inputId, history] of draftsByInput) {
                history.forEach((draft, index) => {
                    allDrafts.push({
                        text: draft.text,
                        timestamp: typeof draft.timestamp === 'number' ? draft.timestamp : 0,
                        inputId,
                        draftNumber: index + 1
                    });
                });
            }

            // Sort the whole collection by timestamp, newest first
            allDrafts.sort((a, b) => b.timestamp - a.timestamp);

            // Keep only the most recent drafts and render them, applying any
            // active search query so the filter survives a re-render
            currentDrafts = allDrafts.slice(0, MAX_RECENT_DRAFTS);

            const query = searchInput.value.trim().toLowerCase();
            const filtered = query
                ? currentDrafts.filter((draft) => draft.text.toLowerCase().includes(query))
                : currentDrafts;
            renderDrafts(filtered, query);
        });
    });
});
