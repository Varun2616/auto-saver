// background.js
// Garbage Collector: periodically deletes expired drafts from chrome.storage.local.

const GC_ALARM_NAME = 'draft-garbage-collector';
const GC_INTERVAL_MINUTES = 60; // Run the GC once per hour
const MAX_DRAFT_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours

// Delete any stored draft whose timestamp is older than 48 hours.
function garbageCollect() {
  chrome.storage.local.get(null, (items) => {
    const now = Date.now();
    const keysToRemove = [];

    for (const [key, entry] of Object.entries(items)) {
      if (entry && typeof entry.timestamp === 'number' && now - entry.timestamp > MAX_DRAFT_AGE_MS) {
        keysToRemove.push(key);
      }
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

// Set up the alarm after install and on browser startup.
chrome.runtime.onInstalled.addListener(createGcAlarm);
chrome.runtime.onStartup.addListener(createGcAlarm);

// Trigger the garbage collector whenever the alarm fires.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === GC_ALARM_NAME) {
    garbageCollect();
  }
});
