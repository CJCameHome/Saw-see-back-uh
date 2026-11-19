'use strict';

const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const statusText = document.getElementById('status');
const signedInStatus = document.getElementById('signed-in-status');
const signedOutView = document.getElementById('signed-out-view');
const signedInView = document.getElementById('signed-in-view');
const profileName = document.getElementById('profile-name');
const profileEmail = document.getElementById('profile-email');
const profilePicture = document.getElementById('profile-picture');
const profileFallback = document.getElementById('profile-fallback');

let sdkReady = false;
let appConfigured = false;

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle('error', isError);
}

function showSignedIn(user) {
  signedOutView.hidden = true;
  signedInView.hidden = false;
  profileName.textContent = user.name || 'Facebook user';
  profileEmail.textContent = user.email || 'Email was not shared';
  if (user.picture) {
    profilePicture.src = user.picture;
    profilePicture.hidden = false;
    profileFallback.hidden = true;
  } else {
    profilePicture.hidden = true;
    profileFallback.hidden = false;
  }
}

function showSignedOut(message = '') {
  signedInView.hidden = true;
  signedOutView.hidden = false;
  if (message) setStatus(message);
}

async function loadExistingSession() {
  const response = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error('Could not check the current session.');
  const data = await response.json();
  if (data.authenticated && data.user) showSignedIn(data.user);
}

async function completeLogin(accessToken) {
  setStatus('Verifying your Facebook sign-in securely…');
  const response = await fetch('/api/auth/facebook', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ accessToken })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.authenticated || !data.user) {
    throw new Error(data.error || 'Sign-in could not be completed.');
  }
  showSignedIn(data.user);
}

loginButton.addEventListener('click', () => {
  if (!sdkReady || !appConfigured || !window.FB) {
    setStatus('Facebook Login is not ready. Check the app setup and try again.', true);
    return;
  }

  loginButton.disabled = true;
  setStatus('Opening Facebook’s secure sign-in dialog…');

  // FB.login opens Meta's own authorization dialog. Meta handles the password
  // and any account security / two-factor challenge; this page never receives them.
  window.FB.login(async (response) => {
    try {
      const token = response && response.authResponse && response.authResponse.accessToken;
      if (!token) {
        setStatus('Sign-in was cancelled or not approved. You can try again.', true);
        return;
      }
      await completeLogin(token);
    } catch (error) {
      setStatus(error.message || 'Sign-in failed. Please try again.', true);
    } finally {
      loginButton.disabled = false;
    }
  }, { scope: 'public_profile,email', return_scopes: true });
});

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  signedInStatus.textContent = 'Signing out…';
  try {
    const response = await fetch('/api/logout', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.signedOut) throw new Error(data.error || 'Sign-out failed.');
    signedInStatus.textContent = '';
    showSignedOut('You have signed out of this app.');
  } catch (error) {
    signedInStatus.textContent = error.message || 'Could not sign out.';
  } finally {
    logoutButton.disabled = false;
  }
});

async function initialize() {
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load app settings.');
    const config = await response.json();
    appConfigured = Boolean(config.configured && config.appId);

    if (!appConfigured) {
      setStatus('Setup needed: add your Meta App ID and App Secret to the server .env file.', true);
      await loadExistingSession();
      return;
    }

    await new Promise((resolve, reject) => {
      window.fbAsyncInit = () => {
        try {
          window.FB.init({
            appId: config.appId,
            cookie: true,
            xfbml: false,
            version: config.graphVersion || 'v27.0'
          });
          sdkReady = true;
          loginButton.disabled = false;
          setStatus('Ready. Facebook will handle your secure sign-in.');
          resolve();
        } catch (error) {
          reject(error);
        }
      };

      const sdk = document.createElement('script');
      sdk.id = 'facebook-jssdk';
      sdk.src = 'https://connect.facebook.net/en_US/sdk.js';
      sdk.async = true;
      sdk.defer = true;
      sdk.crossOrigin = 'anonymous';
      sdk.onerror = () => reject(new Error('Could not load Facebook Login. Check your internet connection.'));
      document.head.appendChild(sdk);
    });

    await loadExistingSession();
  } catch (error) {
    setStatus(error.message || 'Could not initialize sign-in.', true);
  }
}

initialize();
