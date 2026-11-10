// ==UserScript==
// @name         Moon - Matching Helper
// @namespace    local.movepay.matching
// @version      2.0.1
// @homepageURL  https://github.com/akintomoon/Matching-Doc-Helper
// @updateURL    https://raw.githubusercontent.com/akintomoon/Matching-Doc-Helper/main/matching-ticket.user.js
// @downloadURL  https://raw.githubusercontent.com/akintomoon/Matching-Doc-Helper/main/matching-ticket.user.js
// @description  Matching Doc Helper: reservations to TEST, withdrawal filters and Jira cancellation drafts.
// @match        https://pub.prod.movepay.online/frontoffice/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_openInTab
// @match        https://tasks.deltasystem.tech/servicedesk/customer/portal/22/create/894*
// @match        https://tasks.deltasystem.tech/servicedesk/customer/portal/22/create/1170*
// @match        https://cc.boadmin.org/*
// @match        https://gm.boadmin.org/*
// @match        https://dy.boadmin.org/*
// @match        https://mr.boadmin.org/*
// @match        https://rs.boadmin.org/*
// @match        https://kn.boadmin.org/*
// @match        https://backoffice.kent.casino/*
// @match        https://kt.boadmin.org/*
// @match        https://ak.boadmin.org/*
// @grant        GM_deleteValue
// @grant        unsafeWindow
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  'use strict';
  if (location.hostname !== 'pub.prod.movepay.online') return;
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

  function normalizeDepositAmount(raw) {
    let value = raw.replace(/\s|RUB|₽/gi, '');
    if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(value)) value = value.replace(/,/g, '');
    else if (/^\d+,\d{1,2}$/.test(value)) value = value.replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(value) || !Number.isFinite(Number(value))) throw new Error('Cannot read Amount to pay.');
    return value.replace(/^0+(?=\d)/, '').replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
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
      amount: normalizeDepositAmount(field(lines.slice(0, section), 'Amount to pay', /^[0-9][0-9\s.,]*(?:\s*RUB|\s*₽)?$/i)),
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
          if (result.schemaVersion !== 2) throw new Error('Update the Google receiver deployment first. The old receiver may have saved A–F without Сумма; check the row before retrying.');
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
      const text = `Reservation #${current.reservation} · W ${current.withdrawal} · D ${current.deposit} · User ${current.client} · ${current.project} · Сумма ${current.amount}`;
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

// Withdrawal and Jira module; its widget is limited to the withdrawals route.
(() => {
  'use strict';
  const PATH = '/frontoffice/matching/withdrawals';
  const ID = 'matching-withdrawals-helper';
  const PM_TAG = 'HUBBLEPAY_SBP_RUB_PAY_OUT';
  const BO_HOSTS = {cat:'cc',gama:'gm',daddy:'dy',mers:'mr',r7:'rs',kent:'kn',kometa:'kt',arkada:'ak'};
  function profileURL(project, client) {
    const name = project.trim().toLowerCase();
    const host = Object.hasOwn(BO_HOSTS, name) ? BO_HOSTS[name] : null;
    if (!host || !/^\d+$/.test(client)) throw new Error('Проверьте Project и Player ID');
    return `https://${host}.boadmin.org/ru/Users/Summary/${client}`;
  }
  function vipFromTags(tags) {
    if (!tags.length) return 'None';
    return tags.some(t => t.replace(/[×✕✖]+$/g, '').trim().toUpperCase() === 'VIP') ? 'Yes' : 'No';
  }
  function sameBoProfile(actual, expected) {
    const a = new URL(actual), b = new URL(expected);
    const host = h => h === 'backoffice.kent.casino' ? 'kn.boadmin.org' : h;
    return a.protocol === 'https:' && b.protocol === 'https:' && host(a.hostname) === host(b.hostname) && a.port === b.port &&
      a.pathname.replace(/\/$/, '') === b.pathname.replace(/\/$/, '');
  }
  function readBoTags(doc, client) {
    if (normalize(doc.querySelector('#SummaryUserId')?.textContent) !== client) return [];
    // Verified on both R7 and Kent. The remove cross is a CSS icon, not tag text.
    return [...doc.querySelectorAll('.fun-page-header__status-btn .name[id^="Statuses-"]')]
      .map(e => normalize(e.textContent)).filter(Boolean);
  }
  const PROJECTS = ['Cat', 'Gama', 'Daddy', 'Mers', 'R7', 'Kent', 'Kometa', 'Arkada'];
  const normalize = s => String(s || '').replace(/\s+/g, ' ').trim();
  const visible = e => !!e.getClientRects().length;

  function money(raw) {
    let s = normalize(raw).replace(/\s|RUB|₽/gi, '');
    if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) s = s.replace(/,/g, '');
    else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error('Проверьте сумму: ' + raw);
    const [whole, fraction = ''] = s.split('.');
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(cents)) throw new Error('Слишком большая сумма');
    return cents;
  }
  function amount(cents) { return (cents / 100).toFixed(2).replace(/\.00$/, ''); }
  function dateValue(raw, now = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    if (/^(Yesterday|Today|Вчера|Сегодня)(?:\s|$)/i.test(raw)) {
      const d = new Date(now);
      if (/^(Yesterday|Вчера)/i.test(raw)) d.setDate(d.getDate() - 1);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    let m = String(raw).match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = String(raw).match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return '';
  }
  function description(d) {
    const date = d.created.split('-').reverse().join('.');
    return `Дата заявки: ${date}\n\nзаявка: ${d.requested}\nвыплатили: ${d.paid}\n\nВернуть на баланс: ${amount(money(d.requested) - money(d.paid))}\n\nТокен ФУН: ${d.fun}\nТокен PSP: ${d.psp}`;
  }
  function filterURL(href, action, now = new Date()) {
    const u = new URL(href); u.pathname = PATH;
    if (action === 'balance') u.searchParams.set('status', 'PARTIALLY_COVERED,CLOSED_WITH_BALANCE');
    else {
      const start = new Date(now); start.setDate(start.getDate() + (action === 'yesterday' ? -1 : 0));
      start.setHours(0, 0, 0, 0); const end = new Date(start); end.setHours(23, 59, 59, 0);
      u.searchParams.set('createdAtFrom', start.toISOString()); u.searchParams.set('createdAtTo', end.toISOString());
    }
    u.searchParams.set('size', '100'); u.searchParams.set('page', '1'); u.hash = '';
    return u.href;
  }

  // Read only a small label/value container; never take values from the bids table.
  function readLabel(label) {
    const labels = [...document.querySelectorAll('span,div,dt,label,p')].filter(e =>
      visible(e) && normalize(e.textContent) === label && !e.closest('table,#' + ID));
    const values = new Set();
    for (const el of labels) {
      let box = el.parentElement;
      for (let i = 0; i < 2 && box; i++, box = box.parentElement) {
        const text = (box.innerText || '').trim();
        if (text.startsWith(label) && text.length < label.length + 120) {
          const value = text.slice(label.length).trim();
          if (value) { values.add(value); break; }
        }
      }
    }
    return values.size === 1 ? [...values][0] : '';
  }
  const css = `:host{font:12px system-ui,sans-serif;color:#eaf0ff}*{box-sizing:border-box}section{font-size:14px;background:#202638;border:1px solid #526381;border-radius:12px;padding:6px 9px;box-shadow:0 5px 22px #0006;width:max-content;max-width:calc(100vw - 20px)}header{display:flex;align-items:center;justify-content:space-between;font-weight:650}.row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:7px}.body{display:flex;align-items:center;gap:10px;border-top:1px solid #44516b;margin-top:5px;padding-top:6px}.body[hidden]{display:none}.group{min-width:0}.group+.group{border-left:1px solid #526381;padding-left:10px}.group .caption{margin-bottom:4px}.group .row{flex-wrap:nowrap}@media(max-width:510px){.body{flex-wrap:wrap}}.group .row{margin-top:0;gap:4px;flex:1}.caption{color:#b8c9e6;font-size:13px;flex:0 0 44px}section button{padding:5px 8px;font-size:13px;white-space:nowrap}section header button{padding:3px 8px}button{border:0;border-radius:6px;padding:7px 11px;cursor:pointer;font:600 12px system-ui;background:#35425a;color:white}button:hover{filter:brightness(1.15)}button:disabled{opacity:.45;cursor:default}.green{background:#65d68a;color:#102719}.red{background:#ba3949;color:white}.blue{background:#8bb9ff;color:#111827}input,select{width:100%;background:#151b2a;color:white;border:1px solid #526381;border-radius:5px;padding:7px;font:13px system-ui}label{display:block;margin-top:9px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}dialog{color:#eaf0ff;background:#202638;border:1px solid #526381;border-radius:12px;width:580px;max-width:95vw;max-height:90vh;overflow:auto}dialog::backdrop{background:#0009}p{line-height:1.5}pre{white-space:pre-wrap;background:#151b2a;padding:10px}a{color:#8bb9ff}.status{color:#ffcf91;white-space:pre-wrap}:focus-visible{outline:2px solid white;outline-offset:2px}`;
  function button(root, text, fn, cls = '') {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.className = cls;
    b.addEventListener('click', fn); root.append(b); return b;
  }
  function popup(root, action) {
    root.querySelector('dialog')?.remove();
    const withdrawal = location.pathname.match(/\/withdrawals\/(\d+)\/?$/)?.[1];
    if (!withdrawal) return;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `<form><header>${action === 'partial' ? 'Част. Отмена' : 'Полная Отмена'}</header><p>Проверьте данные. Скопируйте Merchant Transaction ID из транзакции в Токен ФУН.</p><a target="_blank" rel="noopener">Открыть транзакцию ↗</a><div class="grid"></div><pre></pre><p class="status" role="status"></p><div class="row"></div></form>`;
    dlg.querySelector('a').href = location.origin + '/frontoffice/transactions/' + withdrawal;
    const fields = {};
    const rawAmount = readLabel('Amount'), rawPaid = readLabel('Paid');
    const cleanMoney = s => { try { return amount(money(s)); } catch { return ''; } };
    const specs = [['client','Player ID',readLabel('User ID')],['project','Project / Brand',readLabel('Brand')],['created','Дата заявки',dateValue(readLabel('Created')),'date'],['requested',action === 'full' ? 'Withdrawal Amount' : 'Requested withdrawal amount',cleanMoney(rawAmount)],...(action === 'partial' ? [['paid','Actual withdrawal amount',cleanMoney(rawPaid)]] : []),['psp','Токен PSP',readLabel('Transaction') || withdrawal],['fun','Токен ФУН / Merchant Transaction ID','']];
    for (const [key, title, value, type] of specs) {
      const label = document.createElement('label'); label.textContent = title;
      const input = document.createElement('input'); input.type = type || 'text'; input.value = value; input.required = true;

      label.append(input); dlg.querySelector('.grid').append(label); fields[key] = input;
    }
    const vipBox = document.createElement('div');
    vipBox.innerHTML = '<label>Player VIP<select><option>None</option><option>Yes</option><option>No</option></select></label><div class="vip-actions"></div><small role="status">Проверка необязательна</small>';
    dlg.querySelector('.grid').append(vipBox);
    const vipSelect = vipBox.querySelector('select'); fields.vip = vipSelect;
    const vipStatus = vipBox.querySelector('small');
    let vipRequest = null;
    const cancelVip = () => {
      if (vipRequest) { clearInterval(vipRequest.timer); GM_deleteValue(vipRequest.key); vipRequest = null; }
    };
    vipSelect.addEventListener('change', () => { cancelVip(); vipStatus.textContent = 'Выбрано вручную'; });
    for (const key of ['client','project']) fields[key].addEventListener('input', () => {
      cancelVip(); vipSelect.value = 'None'; vipStatus.textContent = 'Клиент изменён — проверьте VIP заново';
    });
    dlg.addEventListener('close', cancelVip);
    button(vipBox.querySelector('.vip-actions'), 'Проверить VIP в BO ↗', () => {
      try {
        cancelVip();
        const client = fields.client.value.trim(), project = fields.project.value.trim();
        const url = profileURL(project, client), nonce = crypto.randomUUID(), key = 'matching-vip-' + nonce;
        GM_setValue(key, {client, url, timestamp:Date.now()});
        vipStatus.textContent = 'Жду теги из BO… При необходимости войдите в аккаунт.';
        const timer = setInterval(() => {
          if (!dlg.isConnected || !dlg.open) { cancelVip(); return; }
          const result = GM_getValue(key);
          if (result && result.client === client && result.url === url && ['Yes','No'].includes(result.vip)) {
            vipSelect.value = result.vip;
            vipStatus.textContent = result.vip === 'Yes' ? 'BO: найден тег VIP' : 'BO: среди прочитанных тегов нет VIP';
            cancelVip();
          } else if (!result || result.error || Date.now() - result.timestamp > 5 * 60000) {
            cancelVip(); vipStatus.textContent = 'Нет результата. Проверьте профиль и выберите Yes / No вручную.';
          }
        }, 700);
        vipRequest = {key, timer};
        GM_openInTab(url + '#matching-vip=' + nonce, {active:true});
      } catch (err) { vipStatus.textContent = err.message; }
    });
    const collect = () => {
      const d = Object.fromEntries(Object.entries(fields).map(([k, el]) => [k, el.value.trim()]));
      d.project = PROJECTS.find(p => p.toLowerCase() === d.project.toLowerCase()) || d.project;
      d.method = PM_TAG;
      if (!/^\d+$/.test(d.client) || !/^\d+$/.test(d.psp)) throw new Error('Проверьте Player ID и Токен PSP');
      if (d.psp !== withdrawal) throw new Error('Токен PSP не совпадает с открытой заявкой');
      if (!PROJECTS.includes(d.project)) throw new Error('Неизвестный Project / Brand');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.created)) throw new Error('Укажите дату создания');
      if (!d.fun) throw new Error('Укажите Токен ФУН');
      const requested = money(d.requested);
      const paid = action === 'partial' ? money(d.paid) : null;
      if (!requested) throw new Error('Проверьте Withdrawal Amount');
      if (paid !== null && paid > requested) throw new Error('Проверьте Amount и Paid');
      d.requested = amount(requested); if (paid !== null) d.paid = amount(paid); d.action = action; d.timestamp = Date.now();
      d.summary = `${d.client} ${d.project} / ${d.method}`; d.description = action === 'partial' ? description(d) :
        `Дата заявки: ${d.created.split('-').reverse().join('.')}\nДата отмены: ${new Date().toLocaleDateString('ru-RU')}\nМетод: ${d.method}\nТокен ФУН: ${d.fun}\nТокен PSP: ${d.psp}`;
      return d;
    };
    dlg.querySelector('form').addEventListener('input', () => {
      try { const d = collect(); dlg.querySelector('pre').textContent = d.summary + '\n\n' + d.description; }
      catch { dlg.querySelector('pre').textContent = 'Заполните поля для предпросмотра.'; }
    });
    const row = dlg.querySelector('.row');
    button(row, 'Закрыть', () => dlg.close());
    const go = button(row, 'Открыть Jira и заполнить', () => {}, 'blue'); go.type = 'submit';
    dlg.querySelector('form').addEventListener('submit', e => {
      e.preventDefault();
      try {
        if (location.pathname.match(/\/withdrawals\/(\d+)\/?$/)?.[1] !== withdrawal) throw new Error('Заявка изменилась. Откройте окно заново.');
        const d = collect(); const nonce = crypto.randomUUID();
        GM_setValue('matching-draft-' + nonce, d);
        GM_openInTab('https://tasks.deltasystem.tech/servicedesk/customer/portal/22/create/' + (action === 'partial' ? '894' : '1170') + '#matching-draft=' + nonce, {active:true});
        dlg.close();
      } catch (err) { dlg.querySelector('.status').textContent = err.message; }
    });
    root.append(dlg); dlg.showModal(); fields.fun.focus();
  }

  function sync() {
    const onPage = location.pathname === PATH || location.pathname.startsWith(PATH + '/');
    let host = document.getElementById(ID);
    if (!onPage) { host?.remove(); return; }
    if (!host) {
      host = document.createElement('div'); host.id = ID;
      host.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483646;max-width:calc(100vw - 20px)';
      const root = host.attachShadow({mode:'open'});
      root.innerHTML = `<style>${css}</style><section><header>Moon - Matching Helper · Withdrawals</header><div class="body"><div class="group"><div class="caption" title="100 строк на странице">Time</div><div class="row time"></div></div><div class="group"><div class="caption" title="Откройте конкретную заявку">Отмена</div><div class="row cancel"></div></div></div></section>`;
      button(root.querySelector('header'), '−', e => { const body = root.querySelector('.body'); body.hidden = !body.hidden; e.currentTarget.textContent = body.hidden ? '+' : '−'; });
      for (const [label, action] of [['Вчера','yesterday'],['Сегодня','today'],['Остатки','balance']]) button(root.querySelector('.time'), label, () => location.assign(filterURL(location.href, action)));
      button(root.querySelector('.cancel'), 'Част. Отмена', () => popup(root, 'partial'), 'green');
      button(root.querySelector('.cancel'), 'Полная Отмена', () => popup(root, 'full'), 'red');
      document.body.append(host);
    }
    host.shadowRoot.querySelectorAll('.cancel button').forEach(b => { b.disabled = !/\/withdrawals\/\d+\/?$/.test(location.pathname); });
  }

  function cleanLabel(s) {
    return normalize(s).replace(/\s*\((?:optional|required)\)/gi, '').replace(/\s*\*$/, '').trim().toLowerCase();
  }
  function jiraField(label, fallback) {
    const clean = cleanLabel;
    const lab = [...document.querySelectorAll('label')].find(l => clean(l.textContent) === clean(label));
    const linked = lab?.htmlFor ? document.getElementById(lab.htmlFor) : null;
    return linked || lab?.querySelector('input,textarea,select') || (lab?.closest('.field-group') || lab?.parentElement)?.querySelector('input:not([type=hidden]),textarea,select') || (fallback ? document.getElementById(fallback) || document.querySelector(`[name="${fallback}"]`) : null);
  }
  function setField(el, value) {
    if (!el) return false;
    if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return false;
    if (el.tagName === 'SELECT') {
      const opt = [...el.options].find(o => normalize(o.textContent).toLowerCase() === value.toLowerCase() || (value === 'Success' && normalize(o.textContent) === 'Succes') || (value === 'None' && ['', '-1'].includes(o.value)));
      if (!opt) return false;
      el.value = opt.value;
    } else {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    }
    el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true}));
    const w = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
    const jq = w.AJS?.$ || w.jQuery;
    if (jq) { try { jq(el).trigger('change'); } catch {} }
    return el.tagName === 'SELECT' || el.value === value;
  }
  function fillDescription(value) {
    const el = jiraField('Description', 'description');
    const lab = [...document.querySelectorAll('label')].find(l => cleanLabel(l.textContent) === 'description');
    const group = lab?.closest('.field-group') || lab?.parentElement;
    const selector = '[contenteditable="true"][role="textbox"], .ProseMirror[contenteditable="true"], [contenteditable="true"]';
    let rich = (el?.matches(selector) ? el : el?.querySelector(selector)) || group?.querySelector(selector);
    if (!rich) {
      const candidates = [...document.querySelectorAll('.ak-editor-content-area[contenteditable="true"], .ProseMirror[contenteditable="true"], [contenteditable="true"][role="textbox"]')].filter(visible);
      if (candidates.length === 1) rich = candidates[0];
    }
    const w = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
    const editor = w.tinymce?.get(el?.id || 'description');
    if (editor) {
      const html = value.split('\n').map(line => '<p>' + (line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') || '<br>') + '</p>').join('');
      editor.setContent(html); editor.save(); editor.fire('change');
      return normalize(editor.getContent({format:'text'})) === normalize(value);
    }
    if (!rich) {
      const iframe = document.querySelector('iframe.tox-edit-area__iframe, .wiki-edit-content iframe, iframe[id*="description"]');
      if (iframe) {
        try { const body = iframe.contentDocument?.body; if (body?.isContentEditable) rich = body; } catch {}
        if (!rich) return false;
      }
    }
    if (rich && visible(rich)) {
      // Native editing updates Jira's rich-editor state, unlike assigning innerText.
      const doc = rich.ownerDocument;
      rich.focus();
      const selection = doc.getSelection(); const range = doc.createRange();
      range.selectNodeContents(rich); selection.removeAllRanges(); selection.addRange(range);
      const inserted = doc.execCommand('insertText', false, value);
      rich.dispatchEvent(new Event('change', {bubbles:true}));
      rich.blur();
      return inserted && normalize(rich.innerText) === normalize(value);
    }
    // Do not count a hidden backing textarea as a filled rich-text editor.
    return el && visible(el) && ['TEXTAREA','INPUT'].includes(el.tagName) ? setField(el, value) : false;
  }
  function startJira() {
    const nonce = location.hash.match(/^#matching-draft=([a-f0-9-]{36})$/)?.[1];
    if (!nonce) return;
    const key = 'matching-draft-' + nonce; const d = GM_getValue(key);
    if (!d || !['partial','full'].includes(d.action) || Date.now() - d.timestamp > 15 * 60000) { if (d) GM_deleteValue(key); return; }
    if (!location.pathname.endsWith('/create/' + (d.action === 'partial' ? '894' : '1170'))) return;
    GM_deleteValue(key); // Keep each draft isolated; a later tab cannot consume another withdrawal.
    const banner = document.createElement('div'); banner.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;background:#202638;color:white;border:1px solid #526381;border-radius:8px;padding:12px;max-width:420px;font:13px system-ui';
    const status = document.createElement('p'); banner.append(status);
    const specs = [['Summary',d.summary,'summary'],['Description',d.description,'description'],['Project',d.project],['Player ID',d.client,'customfield_12600'],
      ...(d.action === 'partial' ? [['Player VIP',['Yes','No'].includes(d.vip) ? d.vip : 'None'],['Requested withdrawal amount',d.requested],['Actual withdrawal amount',d.paid],['Currency','RUB'],['Token',d.fun,'customfield_12603'],['PSP Token',d.psp],['PSP',PM_TAG,'customfield_12605'],['Ticket Link','','customfield_12606']] : [['Payment ID',d.fun],['Withdrawal status to return','Success']])];
    const done = new Set(); let stopped = false;
    const fill = () => {
      for (const [label, value, fallback] of specs) {
        if (done.has(label)) continue;
        if (label === 'Description') {
          try { if (fillDescription(value)) done.add(label); } catch {}
          continue;
        }
        const el = jiraField(label, fallback);
        if (setField(el, value)) done.add(label);
      }
      const missing = specs.map(s => s[0]).filter(s => !done.has(s));
      status.textContent = missing.length ? 'Не заполнены: ' + missing.join(', ') + '. Проверьте форму.' : 'Поля заполнены. Проверьте данные и отправьте заявку вручную.';
      return !missing.length;
    };
    button(banner, 'Повторить заполнение', () => { done.clear(); fill(); });
    button(banner, 'Закрыть', () => { stopped = true; banner.remove(); }); document.body.append(banner);
    // Fill each field once as it appears; do not overwrite subsequent user edits.
    let tries = 0; const timer = setInterval(() => { if (stopped || fill() || ++tries >= 40) clearInterval(timer); }, 500);
  }
  function startBoVip() {
    const nonce = location.hash.match(/^#matching-vip=([a-f0-9-]{36})$/)?.[1];
    if (!nonce) return;
    const key = 'matching-vip-' + nonce, request = GM_getValue(key);
    if (!request || Date.now() - request.timestamp > 5 * 60000 || !sameBoProfile(location.href, request.url)) return;
    const note = document.createElement('div');
    note.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;background:#202638;color:white;padding:14px;border-radius:8px;font:14px system-ui;max-width:380px';
    note.textContent = 'Matching: читаю VIP-теги клиента…'; document.body.append(note);
    let previous = '', stableSince = Date.now(), attempts = 0;
    const timer = setInterval(() => {
      if (!GM_getValue(key) || !sameBoProfile(location.href, request.url)) { clearInterval(timer); note.remove(); return; }
      const tags = readBoTags(document, request.client);
      const signature = JSON.stringify(tags);
      if (signature !== previous) { previous = signature; stableSince = Date.now(); }
      if (tags.length && Date.now() - stableSince >= 3000 && document.readyState === 'complete') {
        const vip = vipFromTags(tags);
        GM_setValue(key, {...request, vip});
        note.textContent = `Matching: прочитано тегов: ${tags.length}. Player VIP = ${vip}. Результат передан в окно MovePay. Можно вернуться к заявке.`;
        clearInterval(timer); setTimeout(() => note.remove(), 15000);
      } else if (++attempts >= 60) {
        GM_setValue(key, {...request, error:true});
        note.textContent = 'Matching: не удалось уверенно прочитать теги. Посмотрите тег VIP и выберите Yes / No в окне MovePay вручную.';
        clearInterval(timer); setTimeout(() => note.remove(), 30000);
      }
    }, 1000);
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = {money, amount, dateValue, description, filterURL, cleanLabel, profileURL, vipFromTags, sameBoProfile, readBoTags}; return; }
  if (location.hostname === 'tasks.deltasystem.tech') startJira();
  else if (location.hostname === 'backoffice.kent.casino' || Object.values(BO_HOSTS).some(host => location.hostname === host + '.boadmin.org')) startBoVip();
  else { sync(); setInterval(sync, 700); }
})();
