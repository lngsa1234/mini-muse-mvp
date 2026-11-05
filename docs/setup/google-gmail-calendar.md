# Google Cloud setup: Gmail and Google Calendar

This guide connects Mini Muse to a user's Gmail and primary Google Calendar using Google OAuth. Mini Muse requests these permissions:

- Read Gmail: `https://www.googleapis.com/auth/gmail.readonly`
- Send Gmail: `https://www.googleapis.com/auth/gmail.send`
- Read, create, and remove Calendar events: `https://www.googleapis.com/auth/calendar.events`

## 1. Create or select a Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project or select the project for this Mini Muse deployment.
3. Open **APIs & Services → Library** and enable both **Gmail API** and **Google Calendar API**.

Google requires every API used by an OAuth application to be enabled in the selected project. See [Google's OAuth web-server guide](https://developers.google.com/identity/protocols/oauth2/web-server).

## 2. Configure the OAuth consent screen

1. Open **APIs & Services → OAuth consent screen**.
2. Select the appropriate audience:
   - **Internal** only if every user belongs to the same Google Workspace organization.
   - **External** for personal Google accounts or users outside the Workspace organization.
3. Provide an application name, support email, and developer contact email.
4. Add the three scopes listed above if Google asks you to configure scopes explicitly.
5. For an External app that remains in testing, add each intended Google account as a **Test user**.

Sensitive Gmail scopes may require Google verification before a broadly available production launch. Keep access limited to the minimum scopes Mini Muse needs.

## 3. Create the OAuth client

1. Open **APIs & Services → Credentials**.
2. Select **Create credentials → OAuth client ID**.
3. Choose **Web application**.
4. Add these exact **Authorized redirect URIs**:

   ```text
   http://localhost:3000/api/google/callback
   https://mini-muse-project.vercel.app/api/google/callback
   ```

   Add only the URL(s) you actually use. For a custom domain, use that domain instead of the Vercel URL.

5. Copy the generated **Client ID** and **Client secret**.

The redirect URI must match Mini Muse's value exactly—including protocol, hostname, path, case, and trailing slash behavior—or Google returns `redirect_uri_mismatch`. Google documents these validation rules in its [OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server#redirect-uri-validation-rules).

## 4. Configure local development

Create a local `.env` file from `.env.example` and set:

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=base64-encoded-32-byte-key
APP_URL=http://localhost:3000
```

Generate the encryption key with:

```bash
openssl rand -base64 32
```

Do not commit `.env`, client secrets, refresh tokens, or the encryption key.

## 5. Configure Vercel production

In **Vercel → Project → Settings → Environment Variables**, add the same variables for the Production environment, with production URLs:

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://mini-muse-project.vercel.app/api/google/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=base64-encoded-32-byte-key
APP_URL=https://mini-muse-project.vercel.app
```

Redeploy after changing environment variables. Keep `GOOGLE_TOKEN_ENCRYPTION_KEY` stable: changing it invalidates existing encrypted Google-token cookies, and users must reconnect.

## 6. Connect and test

1. Open Mini Muse and go to **Connectors**.
2. Choose **Connect** on Gmail or Google Calendar, then **Continue with Google**.
3. Complete Google consent and return to Mini Muse.
4. Verify Gmail search, Calendar list, and an approved test email or test event.
5. Disconnect the connector when testing is complete if you no longer need access.

Mini Muse stores OAuth tokens only in an encrypted, HttpOnly cookie. The browser-side agent and the LLM do not receive OAuth access or refresh tokens.

## Troubleshooting

| Symptom | Likely fix |
| --- | --- |
| `redirect_uri_mismatch` | Make the Google client redirect URI exactly match `GOOGLE_REDIRECT_URI`. |
| `Google OAuth is not configured` | Add the client ID, client secret, and 32-byte base64 encryption key to the active Vercel environment and redeploy. |
| Google blocks sign-in during testing | Add the account under OAuth consent screen **Test users**. |
| Gmail/Calendar returns permission errors | Confirm the API is enabled, then disconnect and reconnect so Google grants the current scopes. |
| Users become disconnected after deploy | Restore the prior `GOOGLE_TOKEN_ENCRYPTION_KEY`, or have users reconnect if it was intentionally rotated. |
