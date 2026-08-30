// popup.js — Recovery UI: shows drafts saved by the content script for the
// current tab's page. Storage entries are rolling history stacks (arrays of
// { text, timestamp } objects), so all stacks are flattened, sorted, and the
// most recent drafts are rendered.

const MAX_RECENT_DRAFTS = 5; // Show at most the 5 most recent drafts
const CLIPBOARD_ICON = '📋';
const COPIED_ICON = '✅';

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

            if (allDrafts.length === 0) {
                showEmpty('No saved drafts for this page yet.');
                return;
            }

            // Sort the whole collection by timestamp, newest first
            allDrafts.sort((a, b) => b.timestamp - a.timestamp);

            // Render only the most recent drafts
            const recentDrafts = allDrafts.slice(0, MAX_RECENT_DRAFTS);
            recentDrafts.forEach(renderDraft);
        });
    });
});
