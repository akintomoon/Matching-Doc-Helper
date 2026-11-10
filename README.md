# Moon - Matching Helper — 2.0.1

One Tampermonkey script for Payment reviews → TEST, withdrawal time filters, Jira cancellation drafts, and optional BO VIP checks.

## Update the Google receiver first (owner only)

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
