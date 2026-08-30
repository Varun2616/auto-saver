// options.js — manage the domains where content.js is injected.

const DOMAINS_STORAGE_KEY = 'managed_domains';

// Must match the id scheme used in background.js so registrations stay unique.
function scriptIdForDomain(domain) {
  return 'auto-saver-' + domain.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function setStatus(message, isError) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = 'status' + (isError ? ' error' : ' ok');
}

async function getManagedDomains() {
  const result = await chrome.storage.local.get(DOMAINS_STORAGE_KEY);
  return Array.isArray(result[DOMAINS_STORAGE_KEY]) ? result[DOMAINS_STORAGE_KEY] : [];
}

// Turn arbitrary user input ("https://www.example.com/some/path") into a bare
// registrable-looking host like "example.com".
function normalizeDomain(input) {
  let domain = String(input).trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '');
  domain = domain.split('/')[0].split('?')[0].split('#')[0];
  return domain;
}

function isValidDomain(domain) {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain);
}

async function renderList() {
  const domains = await getManagedDomains();
  const list = document.getElementById('domain-list');
  list.textContent = '';

  if (domains.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No domains configured.';
    list.appendChild(li);
    return;
  }

  for (const domain of domains) {
    const li = document.createElement('li');

    const span = document.createElement('span');
    span.textContent = domain;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => removeDomain(domain));

    li.appendChild(span);
    li.appendChild(removeBtn);
    list.appendChild(li);
  }
}

async function addDomain() {
  const input = document.getElementById('domain-input');
  const domain = normalizeDomain(input.value);

  if (!domain || !isValidDomain(domain)) {
    setStatus('Please enter a valid domain (e.g., example.com).', true);
    return;
  }

  const domains = await getManagedDomains();
  if (domains.includes(domain)) {
    setStatus(`${domain} is already configured.`, true);
    return;
  }

  // Ask for host permission for the custom domain (must be a user gesture)
  const origins = [`*://${domain}/*`];
  const granted = await chrome.permissions.request({ origins });
  if (!granted) {
    setStatus(`Permission for ${domain} was denied.`, true);
    return;
  }

  try {
    await chrome.scripting.registerContentScripts([{
      id: scriptIdForDomain(domain),
      matches: origins,
      js: ['content.js'],
      runAt: 'document_idle'
    }]);
  } catch (err) {
    // A duplicate id just means it is already registered — keep going.
    if (!String(err.message || '').includes('Duplicate')) {
      setStatus(`Failed to register content script for ${domain}: ${err.message}`, true);
      return;
    }
  }

  domains.push(domain);
  await chrome.storage.local.set({ [DOMAINS_STORAGE_KEY]: domains });

  input.value = '';
  setStatus(`Added ${domain}.`, false);
  renderList();
}

async function removeDomain(domain) {
  const domains = await getManagedDomains();
  const updated = domains.filter((d) => d !== domain);

  try {
    await chrome.scripting.unregisterContentScripts({ ids: [scriptIdForDomain(domain)] });
  } catch (err) {
    // Ignore: the script may not be registered.
  }

  // Revoke the optional host permission if it was granted
  chrome.permissions.remove({ origins: [`*://${domain}/*`] }).catch(() => {});

  await chrome.storage.local.set({ [DOMAINS_STORAGE_KEY]: updated });
  setStatus(`Removed ${domain}.`, false);
  renderList();
}

document.getElementById('add-domain-btn').addEventListener('click', addDomain);
document.getElementById('domain-input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') addDomain();
});

renderList();
