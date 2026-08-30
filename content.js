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
    
    // Fallback: use its exact index relative to other textareas on the page
    const textareas = Array.from(document.querySelectorAll('textarea'));
    return 'textarea_index_' + textareas.indexOf(element);
}

document.addEventListener('input', (event) => {
  const target = event.target;
  
  // Only target text areas
  if (target.tagName.toLowerCase() !== 'textarea') return;

  clearTimeout(debounceTimer);
  
  debounceTimer = setTimeout(() => {
    const cleanUrl = getCleanUrl();
    const inputId = getUniqueInputId(target);
    
    // Create a composite key to prevent multi-field overwrites
    const storageKey = `${cleanUrl}|${inputId}`; 
    
    const dataToSave = {
        text: target.value,
        timestamp: Date.now() // Crucial for solving the storage bloat flaw
    };
    
    chrome.storage.local.set({ [storageKey]: dataToSave }, () => {
      console.log(`Draft saved for: ${storageKey}`);
    });
  }, DEBOUNCE_DELAY);
});
