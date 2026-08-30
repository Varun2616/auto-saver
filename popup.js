// popup.js — Recovery UI: shows drafts saved by the content script for the
// current tab's page. Storage entries are rolling history stacks (arrays of
// { text, timestamp } objects), so all stacks are flattened, sorted, and the
// most recent drafts are rendered.

const MAX_RECENT_DRAFTS = 5; // Show at most the 5 most recent drafts

// Sanitize a URL exactly like content.js does (origin + pathname, no query)
function getCleanUrl(url) {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
}

// Copy text to the clipboard, with a legacy fallback for contexts where the
// async Clipboard API is unavailable.
function copyToClipboard(text, button) {
    const restoreLabel = () => {
        button.textContent = 'Copy to Clipboard';
    };

    navigator.clipboard.writeText(text).then(() => {
        button.textContent = 'Copied!';
        setTimeout(restoreLabel, 1500);
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        button.textContent = 'Copied!';
        setTimeout(restoreLabel, 1500);
    });
}

// Render a single recovered draft into the container
function renderDraft(draft) {
    const container = document.getElementById('drafts-container');

    const draftDiv = document.createElement('div');
    draftDiv.className = 'draft';

    const textDiv = document.createElement('div');
    textDiv.className = 'draft-text';
    textDiv.textContent = draft.text;

    const copyButton = document.createElement('button');
    copyButton.textContent = 'Copy to Clipboard';
    copyButton.addEventListener('click', () => copyToClipboard(draft.text, copyButton));

    draftDiv.appendChild(textDiv);
    draftDiv.appendChild(copyButton);
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

        // Fetch every saved entry and flatten all drafts for this page into a
        // single combined list, attaching the source input identifier.
        chrome.storage.local.get(null, (items) => {
            const allDrafts = [];

            for (const [key, entry] of Object.entries(items)) {
                if (!key.startsWith(cleanUrl)) continue;

                // Entries are arrays; tolerate legacy single-object entries
                const history = Array.isArray(entry) ? entry : [entry];
                const inputId = key.slice(cleanUrl.length + 1); // strip "url|"

                for (const draft of history) {
                    if (draft && typeof draft.text === 'string') {
                        allDrafts.push({
                            text: draft.text,
                            timestamp: typeof draft.timestamp === 'number' ? draft.timestamp : 0,
                            inputId: inputId || 'unknown'
                        });
                    }
                }
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
