# Chrome Browser Bridge setup

The Browser Bridge is an unpacked Chrome extension for local development and testing. It lets Mini Muse read the last website tab you used, fill form fields after approval, and click a selected button after approval.

It is not a Chrome Web Store package and does not run a remote browser. It works with your existing local Chrome session.

## What it can and cannot do

| Capability | Behavior |
| --- | --- |
| Read a page | Mini Muse can read the page title, URL, and visible text. |
| Fill form fields | Requires an approval card in Mini Muse before any values are entered. |
| Click a button/link | Requires an approval card, including for form submission. |
| Passwords, MFA codes, CAPTCHAs, payment details | Not handled by Mini Muse. Enter these yourself. |
| Access websites | Requires a one-time Chrome permission granted from the extension popup. |

## 1. Load the extension

1. Pull the repository at commit `1046e94` or later.
2. In Chrome, open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Select **Load unpacked**.
5. Select the repository's `chrome-extension` folder.
6. Pin **Mini Muse Browser Bridge** to Chrome's toolbar.

## 2. Grant website access

1. Click the pinned extension icon.
2. Select **Enable browser control**.
3. Accept Chrome's website-access prompt.

The permission is optional and user-granted. Chrome Manifest V3 supports optional host permissions so an extension can request website access at runtime instead of automatically at install time. See [Chrome's permissions documentation](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions).

You can revoke permission at any time from `chrome://extensions` or the extension's site-access settings.

## 3. Use it with Mini Muse

1. Open the job site or other target website in Chrome.
2. Return to Mini Muse in a different tab.
3. Ask Muse to read the current browser page, fill a field, or prepare an application.
4. Review every approval card carefully before allowing a form fill or click.

The extension uses the last non–Mini Muse tab as the target. If Mini Muse says it cannot find a target tab, open the intended website once, then return to Mini Muse and retry.

## Security model

- The extension accepts commands only from `https://mini-muse-project.vercel.app` and local development at `http://localhost:3000`.
- Mini Muse must ask for approval before browser writes or clicks.
- Browser permissions do not bypass those Mini Muse approvals.
- Do not ask Mini Muse to enter passwords, one-time codes, banking data, payment information, or CAPTCHA responses.
- Review site URLs and the exact proposed action before approving a click, especially an application or submission.

## Troubleshooting

| Symptom | Likely fix |
| --- | --- |
| “Browser Bridge did not respond” | Confirm the extension is loaded and refresh the Mini Muse tab. |
| “Browser access for this website is not enabled” | Open the extension popup and choose **Enable browser control**. |
| “Open the website you want…” | Visit the target site in Chrome, then return to Mini Muse. |
| No form field matches a selector | The site changed its HTML or uses a protected/custom control; inspect the page and retry with a more specific selector. |
| A site blocks interaction | Complete the sign-in, CAPTCHA, or protected step yourself. |

## Before sharing broadly

This is a development prototype. Before publishing it to the Chrome Web Store, add a privacy policy, narrow host permissions by default, provide a clear site-access picker, conduct a security review, and test approval behavior on target job sites.
