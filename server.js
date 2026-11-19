'use strict';

require('dotenv').config();

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const APP_ID = process.env.FB_APP_ID || '';
const APP_SECRET = process.env.FB_APP_SECRET || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const GRAPH_VERSION = process.env.FB_GRAPH_VERSION || 'v27.0';
const APP_ORIGIN = process.env.APP_ORIGIN || `http://localhost:${PORT}`;
const isProduction = process.env.NODE_ENV === 'production';

if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  console.error('Set SESSION_SECRET in .env to a random value of at least 32 characters.');
  process.exit(1);
}

if (isProduction) app.set('trust proxy', 1);

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
}));
app.use(express.json({ limit: '10kb' }));
app.use(session({
  name: 'app.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000
  }
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please try again later.' }
});

function noStore(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

function requireSameOrigin(req, res, next) {
  const origin = req.get('origin');
  let expected;
  try {
    expected = new URL(APP_ORIGIN).origin;
  } catch {
    return res.status(500).json({ error: 'Server origin is misconfigured.' });
  }
  if (!origin || origin !== expected) {
    return res.status(403).json({ error: 'Request origin was not accepted.' });
  }
  next();
}

async function graphGet(pathName, params) {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${pathName}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) {
    throw new Error('Meta returned an unsuccessful response.');
  }
  return result;
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => error ? reject(error) : resolve());
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => error ? reject(error) : resolve());
  });
}

app.get('/api/config', noStore, (req, res) => {
  res.json({
    configured: Boolean(APP_ID && APP_SECRET),
    appId: APP_ID || null,
    graphVersion: GRAPH_VERSION
  });
});

app.get('/api/me', noStore, (req, res) => {
  res.json({ authenticated: Boolean(req.session.user), user: req.session.user || null });
});

app.post('/api/auth/facebook', noStore, authLimiter, requireSameOrigin, async (req, res) => {
  if (!APP_ID || !APP_SECRET) {
    return res.status(503).json({ error: 'Facebook Login is not configured on the server yet.' });
  }

  const userAccessToken = req.body && req.body.accessToken;
  if (typeof userAccessToken !== 'string' || userAccessToken.length < 20 || userAccessToken.length > 4096) {
    return res.status(400).json({ error: 'A valid sign-in response is required.' });
  }

  try {
    // Validate the user token belongs to this exact Meta app.
    const appAccessToken = `${APP_ID}|${APP_SECRET}`;
    const debug = await graphGet('debug_token', {
      input_token: userAccessToken,
      access_token: appAccessToken
    });
    const tokenData = debug.data || {};

    if (
      tokenData.is_valid !== true ||
      String(tokenData.app_id) !== String(APP_ID) ||
      !tokenData.user_id
    ) {
      return res.status(401).json({ error: 'Facebook did not approve this sign-in. Please try again.' });
    }

    // Add appsecret_proof to this server-side Graph API request.
    const appSecretProof = crypto
      .createHmac('sha256', APP_SECRET)
      .update(userAccessToken)
      .digest('hex');

    const profile = await graphGet('me', {
      fields: 'id,name,email,picture.type(large)',
      access_token: userAccessToken,
      appsecret_proof: appSecretProof
    });

    if (!profile.id || String(profile.id) !== String(tokenData.user_id)) {
      return res.status(401).json({ error: 'The Facebook account could not be verified.' });
    }

    // Store only basic profile information in the session, never the access token.
    await regenerateSession(req);
    req.session.user = {
      id: String(profile.id),
      name: typeof profile.name === 'string' ? profile.name : 'Facebook user',
      email: typeof profile.email === 'string' ? profile.email : null,
      picture: profile.picture && profile.picture.data && typeof profile.picture.data.url === 'string'
        ? profile.picture.data.url
        : null
    };
    await saveSession(req);

    return res.json({ authenticated: true, user: req.session.user });
  } catch (error) {
    // Do not log access tokens or raw Graph API URLs.
    console.error('Facebook sign-in verification failed.');
    return res.status(502).json({ error: 'Facebook sign-in could not be verified right now. Please try again.' });
  }
});

app.post('/api/logout', noStore, requireSameOrigin, (req, res) => {
  req.session.destroy((error) => {
    if (error) return res.status(500).json({ error: 'Could not sign out of this site.' });
    res.clearCookie('app.sid', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax'
    });
    return res.json({ signedOut: true });
  });
});

app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: isProduction ? '1h' : 0
}));

app.listen(PORT, () => {
  console.log(`App running at ${APP_ORIGIN}`);
  if (!APP_ID || !APP_SECRET) {
    console.log('Facebook Login is not configured yet. Add FB_APP_ID and FB_APP_SECRET to .env.');
  }
});
