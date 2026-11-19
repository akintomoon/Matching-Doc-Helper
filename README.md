# Moon - Matching Helper — 2.0.5

One Tampermonkey script for Payment reviews → TEST, withdrawal time filters, Jira cancellation drafts, and optional BO VIP checks.

## Updating to 2.0.5

- Fix collapsed Payee selection by clicking its inner label rather than its non-interactive wrapper; retry briefly while it renders. SHOW IN FULL remains automatic.
- ПРОВЕРИТЬ only opens receipt and Fundist in background tabs next to MovePay (receipt first visually). It no longer opens the comparison panel.
- СВЕРИТЬ alone opens the panel. Payee data refreshes as it becomes available.
- Wider receipt preview with Развернуть чек / свойства PDF: hide the comparison column, then use the PDF viewer's ⋮ → Document properties menu. The script cannot directly control the browser's PDF menu.
- Update the same installed entry and refresh MovePay. Connection settings and Google receiver remain unchanged.

## Previous update: 2.0.4

- ПРОВЕРИТЬ opens a comparison panel on MovePay and appends two background tabs: receipt on the left, Fundist on the right. MovePay keeps focus.
- СВЕРИТЬ opens just the panel without creating extra tabs. ФУНДИСТ alone still opens the backoffice in front.
- The panel displays Recipient name, Phone number and Bank in large text beside an embedded receipt preview.
- Paste the receipt recipient phone into the comparison field. Formatting (+, spaces, brackets, hyphens) is ignored; differing digits are highlighted. Masked, partial or invalid numbers never confirm a match. Leading 8 and 7 are not silently treated as equal. Name and bank are visual checks only.
- If Payee was still loading, use Обновить данные Payee. The panel closes if the reservation changes.
- Some receipt hosts or PDF viewers may block embedding. Use Открыть чек отдельно when the preview is blank. No external OCR service is used, and comparison data is not saved or sent to Google Sheets.
- Update the existing entry, then refresh MovePay. Document keys and connection settings are preserved; no Google receiver changes.

## Previous update: 2.0.3

- Larger green **ФУНДИСТ** button: copies the client ID and opens their backoffice.
- Yellow **ПРОВЕРИТЬ** button beside it: opens the current reservation receipt in a background tab, then activates Fundist. It does not compare receipt details automatically.
- If the receipt link is missing or ambiguous, the helper reports the problem instead of opening an unrelated receipt.
- Update the existing Tampermonkey entry and refresh MovePay. Your document URL, key and drafts remain saved; no Google receiver changes are needed.

## Previous update: 2.0.2

Update the existing **Moon - Matching Helper** entry in Tampermonkey, then refresh MovePay. Saved document URL, connection key and drafts are preserved. No Google Apps Script changes or redeployment are needed for this update.

- Cat aliases: cat, cc, Cat casino and Cat casino (cc) open the Cat backoffice, including optional withdrawal VIP checks.
- Opening a reservation expands Payee and clicks SHOW IN FULL within that section once per rendered control and reservation.

## Initial merged-version setup: Google receiver (owner only)

1. In the destination sheet, check columns A–G: Тикеты в онхолде, Айди вывода, Айди депозита, Заявка хаба, Айди клиента, Проект, Сумма. If a manual checkbox was in G, move it to H. Columns H onward are preserved.
2. Open the Apps Script project used by the existing widget. Back up its code and note its TARGET_ID and TARGET_TAB values.
3. Replace the code with Google-Sheets.gs from this repository. Replace YOUR_SPREADSHEET_ID and YOUR_SHEET_TAB_NAME with those existing values. The tab name means the bottom sheet tab, not the document title TEST.
4. Save. Keep the existing MATCHING_SECRET Script Property, project, and connection key.
5. Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy. Keep the existing execution/access settings and /exec URL.

## Update the existing userscript

[Install/update](https://raw.githubusercontent.com/akintomoon/Matching-Doc-Helper/main/matching-ticket.user.js)

1. Open the existing **MovePay — Ticket to TEST** script in the Tampermonkey editor, replace its entire contents with matching-ticket.user.js, and save. It will be renamed **Moon - Matching Helper**, version **2.0.1**. Updating the existing entry preserves its connection settings. Do not install a second copy through the Raw link for this rename; a changed name can be treated as a different script. The namespace and GitHub update URLs remain unchanged.
2. Accept the added Jira/backoffice site permissions if prompted.
3. Disable the separate **Matching Doc Helper — Withdrawals** and old **MovePay Withdrawals — Today** scripts. Leave only the merged helper enabled.
4. Refresh MovePay; start new Jira drafts and VIP checks rather than reusing old tabs.

## Verify

- Payment reviews: open one reservation. The preview now includes Сумма. Amount to pay `1,000.00 RUB` becomes `1000`; fractional amounts are retained without currency or thousands separators. GO writes A–G.
- Test a new reservation/ticket combination: existing rows are deduplicated and are not backfilled.
- Withdrawals: the Time/cancellation widget appears on withdrawal pages. The partial and full cancellation popups retain their different fields. Jira tickets are filled but never automatically submitted.
- VIP remains optional: open the BO check from the popup, wait for its result, then return to MovePay. Exact VIP → Yes; a readable tag list without VIP → No. Manual selection remains available.

## New operators

Install Tampermonkey, use the install link, then click ⚙ on Payment reviews. Enter the team's existing /exec URL and connection key privately. Each operator configures their browser once; only the owner deploys the receiver.

## Privacy and compatibility

Do not publish a real connection key, deployment URL, or configured receiver. Google-Sheets.gs in this repository has configuration placeholders. Updating the same installed script preserves the connection and ticket draft. Installing a separate copy may not.

The modules use separate routes and element IDs. Review observers/settings run only on MovePay. Jira and BO routines run on their respective domains. Kent checks still open boadmin; the old Kent domain is accepted as an alias.

Duplicates use the ticket, withdrawal, deposit, and reservation combination. Header mismatches block writes. The helper reports an outdated receiver rather than silently claiming Сумма was saved. Deploy the receiver before updating operators.

## Validation

Local tests cover amount parsing, seven-column writes, validation, headers, locking, duplicate checks, preservation of H onward, withdrawal calculations/dates, and BO client matching. The VIP selector was tested live on R7 and Kent. The merged installation and new deployment still require a live first save.
