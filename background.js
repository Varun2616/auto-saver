// background.js
// Garbage Collector + keyboard shortcut handling. Content-script injection is
// managed from the popup via a per-site toggle (chrome.scripting.executeScript),
// so no domain registration is needed here.

const GC_ALARM_NAME = 'draft-garbage-collector';
const GC_INTERVAL_MINUTES = 60; // Run the GC once per hour
const MAX_DRAFT_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours

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

// On install/update: set up the GC alarm and clear any content scripts
// registered by older versions (injection is now toggle-driven).
chrome.runtime.onInstalled.addListener(() => {
  createGcAlarm();
  chrome.scripting.unregisterContentScripts().catch(() => {});
});

// On browser startup: ensure the GC alarm exists.
chrome.runtime.onStartup.addListener(createGcAlarm);

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
