# Facebook Login integration (safe popup flow)

This project replaces the original static form with a real Meta/Facebook Login integration.
It does **not** ask for, receive, store, or forward a Facebook password or OTP. The Facebook
JavaScript SDK opens Meta's own sign-in dialog; Meta handles the password and any two-factor
verification that it decides is required. The server verifies the returned access token and
creates a session for this app.

## What works

- Official Facebook Login via the Meta JavaScript SDK.
- Facebook's own sign-in / security dialog (popup where the browser supports it).
- Server-side access-token validation against this app ID.
- Optional profile name, email, and profile picture (only fields Meta makes available).
- HttpOnly session cookie, same-origin checks, sign-in rate limiting, and sign out of this app.
- The app stores profile details in its session, **not** the Facebook access token.

Meta controls the sign-in and OTP experience. An app cannot force Facebook to send an OTP on
every sign-in, and this project intentionally has no local OTP or password fields. Some browser
or device configurations may open the Meta dialog in a separate tab/window or use a Meta app.
The app cannot guarantee that Meta's own sign-in UI always appears in a popup.

## Requirements

- Node.js 20 or newer.
- A Meta developer app configured for Facebook Login on the Web.
- A website origin that you control. Use HTTPS when deployed publicly.

## Setup

1. Create or select an app in [Meta for Developers](https://developers.facebook.com/apps/).
2. Add/configure **Facebook Login** for the Web platform in the app dashboard.
3. Configure the app's domain and website URL to match where this project will run. During local
   development, use `http://localhost:3000` where Meta's current app settings permit it.
4. Copy `.env.example` to `.env`.
5. Fill in `FB_APP_ID` and `FB_APP_SECRET` from the Meta app's **Settings → Basic** page.
6. Set `APP_ORIGIN` to the exact origin used in your browser, such as `http://localhost:3000`.
7. Set `SESSION_SECRET` to a long random value (at least 32 characters). Keep `.env` private.
8. Install and run:

   ```bash
   npm install
   npm start
   ```

9. Open `http://localhost:3000` and press **Continue with Facebook**. Meta will show its own
   authorization screen. If the app is still in development mode, the Facebook account used for
   testing may need to be assigned an app role in the Meta dashboard.

## Important deployment notes

- Never put `FB_APP_SECRET` or `SESSION_SECRET` in frontend JavaScript, HTML, a public repository,
  or a client-side app. Set them as private environment variables on your hosting provider.
- Public deployments must use HTTPS and the matching `APP_ORIGIN`.
- This starter uses Express's in-memory session store, which is for local testing only. Before
  production use, configure a persistent session store such as Redis and review Meta's current
  platform, privacy, and app-review requirements.
- The Facebook Login dialog and two-factor prompts are controlled by Meta. This app cannot view,
  change, or bypass those prompts.
- Signing out here ends the session on this app only; it does not sign the user out of Facebook.

## Useful official documentation

- Facebook JavaScript SDK quickstart: https://developers.facebook.com/docs/javascript/quickstart/
- Facebook Login: https://developers.facebook.com/docs/facebook-login/
- Token debugging / validation: https://developers.facebook.com/docs/facebook-login/guides/access-tokens/debugging/
- Graph API versioning: https://developers.facebook.com/docs/graph-api/guides/versioning/
