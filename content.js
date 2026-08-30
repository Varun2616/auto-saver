let debounceTimer;
const DEBOUNCE_DELAY = 500; // Wait 500ms after typing stops

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
    
    chrome.storage.local.set({ [storageKey]: dataToSave }, () => {
      console.log(`Draft saved for: ${storageKey}`);
    });
  }, DEBOUNCE_DELAY);
});
