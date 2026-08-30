// popup.js — Recovery UI: shows drafts saved by the content script for the
// current tab's page.

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

        // Fetch every saved draft and keep only those for this page
        chrome.storage.local.get(null, (items) => {
            let matchCount = 0;

            for (const [key, draft] of Object.entries(items)) {
                const isForThisPage = key.startsWith(cleanUrl);
                const isRecoverableDraft = draft && typeof draft.text === 'string';

                if (isForThisPage && isRecoverableDraft) {
                    renderDraft(draft);
                    matchCount++;
                }
            }

            if (matchCount === 0) {
                showEmpty('No saved drafts for this page yet.');
            }
        });
    });
});
