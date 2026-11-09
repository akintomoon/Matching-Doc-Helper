// ==UserScript==
// @name         MovePay — Ticket to TEST
// @namespace    local.movepay.matching
// @version      1.3.1
// @homepageURL  https://github.com/akintomoon/Matching-Doc-Helper
// @updateURL    https://raw.githubusercontent.com/akintomoon/Matching-Doc-Helper/main/matching-ticket.user.js
// @downloadURL  https://raw.githubusercontent.com/akintomoon/Matching-Doc-Helper/main/matching-ticket.user.js
// @description  Save the opened reservation and a HelpDesk ticket to TEST.
// @match        https://pub.prod.movepay.online/frontoffice/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_openInTab
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  'use strict';
  const ROUTE = '/frontoffice/matching/reviews';
  const HOST_ID = 'matching-ticket-saver';
  let busy = false;
  let current = null;
  let ui;
  let activePanel = null;
  const openingAttempts = new WeakMap();

  function normalizeTicket(value) {
    const url = new URL(value.trim());
    if (url.origin !== 'https://app.helpdesk.com' || url.username || url.password ||
        !/^\/tickets\/[A-Za-z0-9_-]{1,100}\/?$/.test(url.pathname)) {
      throw new Error('Paste a HelpDesk ticket link.');
    }
    return url.origin + url.pathname.replace(/\/$/, '');
  }

  function visible(element) {
    return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  }

  function parseReservationText(text) {
    const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const section = lines.indexOf('Deposit and withdrawal');
    if (section < 0) throw new Error('Open “Deposit and withdrawal” to read the details.');
    const end = lines.indexOf('Payee', section + 1);
    const details = lines.slice(section + 1, end < 0 ? undefined : end);
    function field(source, label, pattern) {
      const values = [];
      for (let i = 0; i < source.length; i++) {
        if (source[i] === label) values.push(source[i + 1] || '');
        else if (source[i].startsWith(label + '\t') || source[i].startsWith(label + ' ')) {
          const value = source[i].slice(label.length).trim();
          // Ignore unrelated labels such as “Deposit via”.
          if (pattern.test(value)) values.push(value);
        }
      }
      if (values.length !== 1 || !pattern.test(values[0])) throw new Error('Cannot read ' + label + '. Open “Deposit and withdrawal” and check the details.');
      return values[0];
    }
    return {
      deposit: field(lines.slice(0, section), 'Deposit', /^\d{1,30}$/),
      withdrawal: field(details, 'Withdrawal', /^\d{1,30}$/),
      client: field(details, 'User ID', /^\d{1,30}$/),
      project: field(details, 'Brand', /^(?![=+@-])[^\r\n\t]{1,100}$/)
    };
  }

  function expandDetails(panel, reservation) {
    const label = 'Deposit and withdrawal';
    const candidates = [...panel.querySelectorAll('button,[role="button"],summary,[aria-expanded]')]
      .filter(e => visible(e) && e.textContent.trim() === label);
    // A non-button accordion header may wrap its label in several elements.
    if (!candidates.length) {
      const matches = [...panel.querySelectorAll('*')].filter(e => visible(e) && e.textContent.trim() === label);
      const outer = matches.filter(e => !matches.includes(e.parentElement));
      candidates.push(...outer);
    }
    const unique = candidates.filter(e => !candidates.some(other => other !== e && other.contains(e)));
    if (unique.length !== 1) return;
    const control = unique[0];
    const details = control.closest('details');
    const state = control.getAttribute('aria-expanded');
    if (state === 'true' || (details && details.open)) return;
    if (state !== 'false' && !details) {
      // With no explicit state, don't toggle a section already showing its data.
      try { parseReservationText(panel.innerText); return; } catch (_) {}
      const sectionText = panel.innerText.split(label)[1] || '';
      if (/User ID\s+\d+/.test(sectionText) && /Brand\s+\S+/.test(sectionText)) return;
    }
    if (openingAttempts.get(control) === reservation) return;
    openingAttempts.set(control, reservation);
    control.click();
    // Re-read after both immediate rendering and accordion animation.
    [100, 400, 1000, 2000].forEach(delay => setTimeout(refresh, delay));
  }

  function readReservation() {
    activePanel = null;
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')]
      .filter(e => visible(e) && /^Reservation\s*#\s*\d+$/i.test(e.textContent.trim()));
    if (headings.length !== 1) throw new Error('Open one reservation to continue.');
    const heading = headings[0];
    const reservation = heading.textContent.match(/#\s*(\d+)/)[1];
    for (let panel = heading.parentElement; panel && panel !== document.body; panel = panel.parentElement) {
      const text = panel.innerText;
      if (!text.split(/\r?\n/).some(line => line.trim() === 'Deposit and withdrawal')) continue;
      // Stop at the first enclosing panel even if details are missing.
      activePanel = panel;
      expandDetails(panel, reservation);
      return {reservation, ...parseReservationText(panel.innerText)};
    }
    throw new Error('Open “Deposit and withdrawal” in the reservation.');
  }

  function backofficeURL(record) {
    const hosts = {cat:'cc', daddy:'dy', r7:'rs', gama:'gm', kent:'kn', kometa:'kt', arkada:'ak'};
    const project = String(record.project || '').trim().toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(hosts, project)) throw new Error('No backoffice configured for this project.');
    if (typeof record.client !== 'string' || !/^\d{1,30}$/.test(record.client)) throw new Error('Cannot read the client ID.');
    return 'https://' + hosts[project] + '.boadmin.org/ru/Users/Summary/' + record.client;
  }

  function openBackoffice() {
    if (busy) return;
    try {
      if (location.pathname.replace(/\/$/, '') !== ROUTE) throw new Error('Open Payment reviews first.');
      const detected = readReservation();
      if (!current || JSON.stringify(current) !== JSON.stringify(detected)) {
        refresh();
        throw new Error('Reservation changed. Check the preview, then press ФУН again.');
      }
      const url = backofficeURL(detected);
      GM_setClipboard(detected.client, 'text');
      GM_openInTab(url, {active:true, insert:true, setParent:true});
      ui.status.textContent = 'Client ID copied · opened ' + detected.project;
    } catch (error) { ui.status.textContent = error.message; }
  }

  function settings() {
    const previous = GM_getValue('connection', {});
    const endpoint = prompt('Paste the Google Apps Script web app URL (ending /exec):', previous.endpoint || '');
    if (endpoint === null) return;
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint.trim())) {
      alert('Use the deployed Google Apps Script URL ending /exec.'); return;
    }
    const secret = prompt('Paste your connection key from Google Apps Script setup:', previous.secret || '');
    if (secret === null) return;
    if (!/^[a-f0-9]{64}$/i.test(secret.trim())) { alert('The connection key should contain 64 letters and numbers.'); return; }
    GM_setValue('connection', {endpoint: endpoint.trim(), secret: secret.trim()});
    if (ui) ui.status.textContent = 'Connected settings saved. Ready for a test.';
  }

  function send(record) {
    const config = GM_getValue('connection', {});
    if (!config.endpoint || !config.secret) throw new Error('Click Settings to connect TEST first.');
    return new Promise((resolve, reject) => GM_xmlhttpRequest({
      method: 'POST', url: config.endpoint, anonymous: true,
      headers: {'Content-Type': 'application/json'},
      data: JSON.stringify({secret: config.secret, record}), timeout: 45000,
      onload: response => {
        try {
          if (response.status !== 200) throw new Error('Google returned an error. Check the connection settings.');
          const result = JSON.parse(response.responseText);
          if (!result.ok) throw new Error(result.error || 'Google could not save this row.');
          if (!Number.isInteger(result.row) || result.row < 2) throw new Error('Google did not confirm a row.');
          resolve(result);
        } catch (error) { reject(new Error(error instanceof SyntaxError ? 'Google did not return a save confirmation. Check web app access.' : error.message)); }
      },
      onerror: () => reject(new Error('Connection failed. Your ticket is kept; retry is safe.')),
      ontimeout: () => reject(new Error('Save was not confirmed. Retry is safe: duplicates are checked.'))
    }));
  }

  async function save() {
    if (busy) return;
    try {
      if (location.pathname.replace(/\/$/, '') !== ROUTE) throw new Error('Open Payment reviews first.');
      const detected = readReservation();
      if (!current || JSON.stringify(current) !== JSON.stringify(detected)) {
        current = detected; refresh(); throw new Error('Reservation changed. Check the preview, then press GO.');
      }
      const record = {...detected, ticket: normalizeTicket(ui.ticket.value)};
      const draft = ui.ticket.value;
      busy = true; ui.go.disabled = true; ui.ticket.disabled = true;
      ui.status.textContent = 'Saving reservation #' + record.reservation + '…';
      const result = await send(record);
      ui.status.textContent = (result.duplicate ? 'Already saved' : 'Saved') + ' — row ' + result.row + ', reservation #' + record.reservation;
      if (ui.ticket.value === draft) { ui.ticket.value = ''; GM_setValue('draft', ''); }
    } catch (error) { ui.status.textContent = error.message; }
    finally { busy = false; ui.ticket.disabled = false; refresh(); }
  }

  function mount() {
    if (document.getElementById(HOST_ID)) return;
    if (ui) { document.body.append(ui.host); return; }
    const host = document.createElement('div'); host.id = HOST_ID;
    host.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:calc(100vw - 20px)';
    const root = host.attachShadow({mode:'closed'});
    root.innerHTML = `<style>
      :host{color-scheme:dark} *{box-sizing:border-box}
      section{font:12px system-ui,sans-serif;color:#eaf0ff;background:#202638;border:1px solid #526381;border-radius:12px;padding:8px 10px;box-shadow:0 5px 22px #0006;width:440px;max-width:calc(100vw - 20px)}
      form{display:flex;gap:6px;margin:0} input{flex:1;min-width:0;background:#131a29;color:#fff;border:1px solid #526381;border-radius:6px;padding:8px}
      button{border:0;border-radius:6px;padding:7px 11px;cursor:pointer;font:600 12px system-ui;background:#8bb9ff;color:#111827}button:disabled{opacity:.5;cursor:default}
      .settings{background:#35425a;color:white;padding:7px} .details{display:flex;align-items:center;gap:7px;margin-top:6px}.preview{margin:0;font-size:12px;line-height:1.4;color:#c7d7f1;min-width:0;overflow-wrap:anywhere}.fun{flex-shrink:0;background:#65d68a;color:#102719;padding:4px 7px} .status{margin:4px 0 0;font-size:11px;overflow-wrap:anywhere} :focus-visible{outline:2px solid #fff;outline-offset:2px}
    </style><section aria-label="Save matching ticket"><form><input aria-label="HelpDesk ticket link" placeholder="Paste ticket link…" type="url" required><button class="go" type="submit">GO</button><button class="settings" type="button" title="Connection settings" aria-label="Connection settings">⚙</button></form><div class="details"><p class="preview"></p><button class="fun" type="button" disabled title="Copy client ID and open backoffice">ФУН</button></div><p class="status" role="status" aria-live="polite"></p></section>`;
    ui = {host, ticket:root.querySelector('input'), go:root.querySelector('.go'), fun:root.querySelector('.fun'), preview:root.querySelector('.preview'), status:root.querySelector('.status')};
    ui.ticket.value = GM_getValue('draft', '');
    ui.ticket.addEventListener('input', () => GM_setValue('draft', ui.ticket.value));
    root.querySelector('form').addEventListener('submit', e => { e.preventDefault(); save(); });
    root.querySelector('.settings').addEventListener('click', settings);
    ui.fun.addEventListener('click', openBackoffice);
    document.body.append(host);
  }

  function refresh() {
    if (!document.body) return;
    const onPage = location.pathname.replace(/\/$/, '') === ROUTE;
    if (!onPage) { if (ui) ui.host.hidden = true; current = null; return; }
    mount(); ui.host.hidden = false;
    try {
      current = readReservation();
      // Keep the input inside the drawer's focus boundary while it is open.
      if (activePanel && ui.host.parentElement !== activePanel) activePanel.append(ui.host);
      const text = `Reservation #${current.reservation} · W ${current.withdrawal} · D ${current.deposit} · User ${current.client} · ${current.project}`;
      if (ui.preview.textContent !== text) ui.preview.textContent = text;
      ui.go.disabled = busy;
      try {
        backofficeURL(current);
        ui.fun.disabled = busy;
        ui.fun.title = 'Copy client ID and open ' + current.project + ' backoffice';
      } catch (error) {
        ui.fun.disabled = true;
        ui.fun.title = error.message;
      }
    } catch (error) {
      current = null;
      const parent = activePanel || document.body;
      if (ui.host.parentElement !== parent) parent.append(ui.host);
      if (ui.preview.textContent !== error.message) ui.preview.textContent = error.message;
      ui.go.disabled = true;
      ui.fun.disabled = true;
    }
  }

  GM_registerMenuCommand('Connect to TEST spreadsheet', settings);
  refresh();
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; refresh(); });
  }).observe(document.documentElement, {childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['aria-expanded','hidden','open','data-state']});
  window.addEventListener('popstate', refresh);
})();
