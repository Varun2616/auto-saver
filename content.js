(() => {
  // Idempotency guard: if this page already runs the content script, skip
  // re-attaching listeners (e.g., when the popup auto-re-injects on open).
  if (document.documentElement.dataset.pasContentLoaded === '1') {
    return;
  }
  document.documentElement.dataset.pasContentLoaded = '1';

  let debounceTimer;
  const DEBOUNCE_DELAY = 2500; // Wait 2.5s after typing stops
  const MAX_HISTORY_ITEMS = 5; // Cap the rolling history per input
  const MIN_TEXT_LENGTH_DIFF = 5; // Minimum character change to record a fragment
  const MIN_SAVE_INTERVAL_MS = 30 * 1000; // Minimum time between snapshots for small changes

  // Helper function to sanitize URLs (remove volatile query parameters)
  function getCleanUrl() {
    const url = new URL(window.location.href);
    return url.origin + url.pathname; 
  }

  // Helper function to generate a unique ID for a specific text area
  function getUniqueInputId(element) {
    if (element.id) return element.id;
    if (element.name) return element.name;
    
    // Fallback: use its exact index relative to every editable field on the
    // page, combining textareas and contenteditable elements
    const editableFields = Array.from(
      document.querySelectorAll('textarea, [contenteditable]')
    );
    return 'input_index_' + editableFields.indexOf(element);
  }

  // Helper function to extract the current text from an editable target
  function getTargetText(target) {
    // Textareas store their content in the value property
    if (target.tagName.toLowerCase() === 'textarea') {
      return target.value;
    }

    // Contenteditable elements store their content in innerText. When the
    // target only inherits editability, read from the editable host element.
    const editableRoot = target.closest('[contenteditable]') || target;
    return editableRoot.innerText;
  }

  // Defensively access chrome.storage.local. Returns null (with a warning)
  // when the API is missing or the extension context has been invalidated, so
  // callers can bail gracefully instead of hard-crashing.
  function getStorageLocal() {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        console.warn('chrome.storage.local is unavailable; draft save skipped.');
        return null;
      }
      return chrome.storage.local;
    } catch (err) {
      console.warn('chrome.storage.local is unavailable; draft save skipped.', err);
      return null;
    }
  }

  // Save a draft into the rolling history stack for a given storage key.
  // The entry is an array of { text, timestamp } objects, newest first.
  function saveDraft(storageKey, dataToSave) {
    const storage = getStorageLocal();
    if (!storage) return;

    try {
      storage.get(storageKey, (result) => {
        // Start a fresh array if no entry exists yet
        const history = Array.isArray(result[storageKey]) ? result[storageKey] : [];

        // Skip consecutive duplicates of the most recent state
        if (history.length > 0 && history[0].text === dataToSave.text) {
          return;
        }

        // Filter minor fragments: only record a new snapshot if the text
        // length changed significantly from the latest entry, or if enough
        // time has elapsed since it — prevents backspace-and-type churn
        // from cluttering the 5-item history limit.
        if (history.length > 0) {
          const latest = history[0];
          const lengthDiff = Math.abs(dataToSave.text.length - latest.text.length);
          const timeElapsed = Date.now() - (typeof latest.timestamp === 'number' ? latest.timestamp : 0);

          if (lengthDiff < MIN_TEXT_LENGTH_DIFF && timeElapsed < MIN_SAVE_INTERVAL_MS) {
            return;
          }
        }

        // Push the new draft to the front of the history
        history.unshift(dataToSave);

        // Cap the history length at MAX_HISTORY_ITEMS
        if (history.length > MAX_HISTORY_ITEMS) {
          history.length = MAX_HISTORY_ITEMS;
        }

        try {
          storage.set({ [storageKey]: history }, () => {
            // Surface storage quota/context errors via chrome.runtime.lastError
            if (chrome.runtime && chrome.runtime.lastError) {
              console.error('Draft save failed:', chrome.runtime.lastError.message);
              return;
            }
            console.log(`Draft saved for: ${storageKey}`);
          });
        } catch (err) {
          console.warn('Draft save write failed:', err.message);
        }
      });
    } catch (err) {
      console.warn('Draft save read failed:', err.message);
    }
  }

  document.addEventListener('input', (event) => {
    const target = event.target;
    
    // Only target text areas or contenteditable elements (attribute set to
    // true, or inherited from an ancestor)
    const isTextarea = target.tagName.toLowerCase() === 'textarea';
    const isContentEditable = target.isContentEditable === true;
    if (!isTextarea && !isContentEditable) return;

    clearTimeout(debounceTimer);
    
    debounceTimer = setTimeout(() => {
      const cleanUrl = getCleanUrl();
      const inputId = getUniqueInputId(target);
      
      // Create a composite key to prevent multi-field overwrites
      const storageKey = `${cleanUrl}|${inputId}`; 
      
      const dataToSave = {
        text: getTargetText(target),
        timestamp: Date.now() // Crucial for solving the storage bloat flaw
      };
      
      saveDraft(storageKey, dataToSave);
    }, DEBOUNCE_DELAY);
  });
})();
