# Matching Doc helper

A Tampermonkey widget for MovePay Payment reviews.

## Features

- Opens Deposit and withdrawal automatically and previews the reservation details.
- Saves a HelpDesk ticket link, withdrawal ID, deposit ID, reservation number, deposit client ID, and project to the team's Google Sheet when GO is clicked.
- The green ФУН button copies the client ID and opens the matching backoffice client page.

## Install

[Install the widget in Tampermonkey](https://raw.githubusercontent.com/akintomoon/Matching-Doc-Helper/main/matching-ticket.user.js)

Tampermonkey must already be installed. No GitHub account is needed for this public repository.

1. Install Tampermonkey in your browser.
2. Open matching-ticket.user.js in this repository and click Raw. If Tampermonkey offers installation, click Install.
3. Otherwise, copy the entire script, open Tampermonkey → Create a new script, replace the starter code, and save.
4. Refresh MovePay Payment reviews.
5. Click ⚙ on the widget. Enter the team's web app URL ending in /exec, then its connection key. Obtain both privately from the owner.
6. Open a reservation and check the displayed values before your first save.

Each operator enters the connection settings once per browser profile. The owner sets up the Google receiver once; operators do not create their own deployment. Keep the same script installed when updating to preserve its saved settings.

## Private connection details

Never put the connection key or your team's deployment URL in this repository, screenshots, issues, or README. They are supplied separately by the owner. The shared key permits submissions and does not identify individual operators.

## Updates

Tampermonkey checks this repository for updates according to its update settings. You can also use its Check for updates action. Existing saved connection settings remain when updating the same script. Refresh MovePay after an update.

For the owner: upload the updated matching-ticket.user.js to the root of the main branch and increase @version for each release. Keep @name and @namespace unchanged. Update and download addresses are already included in the script.

## Scope

GO writes the six requested values only. The manual blocking checkbox is not changed. ФУН opens a client page; it does not perform account actions. Website layout changes can require a widget update.
