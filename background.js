// background.js
// Garbage Collector + dynamic content-script injection management.

const GC_ALARM_NAME = 'draft-garbage-collector';
const GC_INTERVAL_MINUTES = 60; // Run the GC once per hour
const MAX_DRAFT_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours

// Domain management for dynamic content-script injection
const DEFAULT_DOMAINS = ['chatgpt.com', 'gemini.google.com', 'claude.ai'];
const DOMAINS_STORAGE_KEY = 'managed_domains';

// Stable content-script id per domain (chrome.scripting requires unique ids)
function scriptIdForDomain(domain) {
  return 'auto-saver-' + domain.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function getManagedDomains() {
  return chrome.storage.local.get(DOMAINS_STORAGE_KEY).then((result) => {
    const stored = result[DOMAINS_STORAGE_KEY];
    if (Array.isArray(stored)) return stored;
    return DEFAULT_DOMAINS; // fall back to the built-in defaults
  });
}

async function registerScriptForDomain(domain) {
  try {
    await chrome.scripting.registerContentScripts([{
      id: scriptIdForDomain(domain),
      matches: [`*://${domain}/*`],
      js: ['content.js'],
      runAt: 'document_idle'
    }]);
  } catch (err) {
    // Registration can fail (duplicate id, missing file, missing permission);
    // log and continue so one bad domain can't break the whole sync.
    console.warn(`Failed to register content script for ${domain}:`, err.message);
  }
}

async function unregisterScriptForDomain(domain) {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [scriptIdForDomain(domain)] });
  } catch (err) {
    console.warn(`Failed to unregister content script for ${domain}:`, err.message);
  }
}

// Rebuild the full set of registered content scripts from the managed domains.
async function syncAllScripts() {
  const domains = await getManagedDomains();
  await chrome.scripting.unregisterContentScripts(); // clear previous registrations
  for (const domain of domains) {
    await registerScriptForDomain(domain);
  }
}

// Garbage collector: purges expired drafts. Entries are rolling history
// stacks (arrays of { text, timestamp } objects), so each draft inside an
// array is inspected individually. Legacy single-draft entries are also
// handled.
function garbageCollect() {
  chrome.storage.local.get(null, (items) => {
    const now = Date.now();
    const keysToRemove = [];
    const updates = {};

    for (const [key, entry] of Object.entries(items)) {
      if (Array.isArray(entry)) {
        // Keep drafts that are still fresh (or undated); drop the stale ones
        const freshDrafts = entry.filter((draft) => {
          if (!draft || typeof draft.timestamp !== 'number') return true;
          return now - draft.timestamp <= MAX_DRAFT_AGE_MS;
        });

        if (freshDrafts.length === 0) {
          // Nothing recent left: remove the storage key entirely
          keysToRemove.push(key);
        } else if (freshDrafts.length !== entry.length) {
          // Some drafts expired: save the trimmed array back
          updates[key] = freshDrafts;
        }
      } else if (entry && typeof entry.timestamp === 'number' && now - entry.timestamp > MAX_DRAFT_AGE_MS) {
        // Legacy single-draft entry that has expired
        keysToRemove.push(key);
      }
    }

    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates, () => {
        console.log(`Garbage collector trimmed ${Object.keys(updates).length} draft history(ies).`);
      });
    }

    if (keysToRemove.length > 0) {
      chrome.storage.local.remove(keysToRemove, () => {
        console.log(`Garbage collector removed ${keysToRemove.length} expired draft(s).`);
      });
    }
  });
}

// Register the periodic alarm so the GC runs on a schedule.
function createGcAlarm() {
  chrome.alarms.create(GC_ALARM_NAME, { periodInMinutes: GC_INTERVAL_MINUTES });
}

// On install/update: seed the default domains, set up the GC alarm, and
// register content scripts for every managed domain.
async function handleInstalled() {
  const result = await chrome.storage.local.get(DOMAINS_STORAGE_KEY);
  if (!Array.isArray(result[DOMAINS_STORAGE_KEY])) {
    await chrome.storage.local.set({ [DOMAINS_STORAGE_KEY]: DEFAULT_DOMAINS });
  }

  createGcAlarm();
  syncAllScripts();
}

chrome.runtime.onInstalled.addListener(handleInstalled);

// On browser startup: ensure the GC alarm and registered scripts exist.
chrome.runtime.onStartup.addListener(() => {
  createGcAlarm();
  syncAllScripts();
});

// Trigger the garbage collector whenever the alarm fires.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === GC_ALARM_NAME) {
    garbageCollect();
  }
});

// Keyboard shortcut (Alt+Shift+S) opens the extension popup.
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open_popup') {
    chrome.action.openPopup();
  }
});
