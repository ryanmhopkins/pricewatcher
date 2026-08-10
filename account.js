const SUPABASE_URL = 'https://hmsldwpcaupanooestfr.supabase.co';
const EDGE_URL = `${SUPABASE_URL}/functions/v1/pricewatcher-api`;
const PUBLISHABLE_KEY = 'sb_publishable_QCWt9V-_up-ePCszAB9S1A_k2-bPOQj';
const CALLBACK_URL = 'https://pricewatcher-nu.vercel.app/account.html';

let mode = 'signin';
let accessToken = localStorage.getItem('pw_access_token') || '';
let refreshToken = localStorage.getItem('pw_refresh_token') || '';
const $ = (selector) => document.querySelector(selector);
const authCard = $('#auth-card');
const memberCard = $('#member-card');
const message = $('#auth-msg');
const params = new URLSearchParams(location.search);
const purchased = params.get('checkout') === 'success';
const purchasedPlan = params.get('plan');

function setMessage(text, type = '') {
  message.textContent = text;
  message.className = `auth-msg${type ? ` ${type}` : ''}`;
}

function setMode(nextMode) {
  mode = nextMode;
  const signingIn = mode === 'signin';
  const signInTab = $('#tab-signin');
  const signUpTab = $('#tab-signup');
  signInTab.classList.toggle('active', signingIn);
  signUpTab.classList.toggle('active', !signingIn);
  signInTab.setAttribute('aria-selected', String(signingIn));
  signUpTab.setAttribute('aria-selected', String(!signingIn));
  $('#auth-title').textContent = signingIn ? 'Welcome back' : 'Create your workspace';
  $('#auth-copy').textContent = signingIn ? 'Sign in to open your monitoring workspace.' : 'Start with three free monitors. No credit card required.';
  $('#submit-label').textContent = signingIn ? 'Sign in' : 'Create account';
  $('#password').autocomplete = signingIn ? 'current-password' : 'new-password';
  if (!purchased) setMessage('');
}

function storeSession(data) {
  if (data?.access_token) {
    accessToken = data.access_token;
    localStorage.setItem('pw_access_token', data.access_token);
  }
  if (data?.refresh_token) {
    refreshToken = data.refresh_token;
    localStorage.setItem('pw_refresh_token', data.refresh_token);
  }
  if (data?.expires_at) localStorage.setItem('pw_access_expires_at', String(data.expires_at));
}

function clearSession() {
  ['pw_access_token', 'pw_refresh_token', 'pw_access_expires_at'].forEach((key) => localStorage.removeItem(key));
  accessToken = '';
  refreshToken = '';
}

async function authRequest(path, body) {
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}${path}`, {
      method: 'POST',
      headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Unable to reach the sign-in service. Check your connection and try again.');
  }
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // Use the status-based fallback below if the service returns non-JSON.
  }
  if (!response.ok) throw new Error(data.msg || data.message || data.error_description || data.error || `Request failed (${response.status})`);
  return data;
}

async function refreshSession() {
  if (!refreshToken) return false;
  try {
    storeSession(await authRequest('/auth/v1/token?grant_type=refresh_token', { refresh_token: refreshToken }));
    return true;
  } catch {
    return false;
  }
}

async function accountRequest(retry = true) {
  const response = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ action: 'account', access_token: accessToken }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && retry && await refreshSession()) return accountRequest(false);
  if (!response.ok) throw new Error(data.error || 'Unable to load your account.');
  return data;
}

async function updateAuthUser(body, retry = true) {
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Unable to reach the account service. Check your connection and try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && retry && await refreshSession()) return updateAuthUser(body, false);
  if (!response.ok) throw new Error(data.msg || data.message || data.error_description || data.error || 'Unable to update your account.');
  return data;
}

function setSettingsMessage(selector, text, type = '') {
  const element = $(selector);
  element.textContent = text;
  element.className = `settings-msg${type ? ` ${type}` : ''}`;
}

function showAuth() {
  memberCard.hidden = true;
  authCard.hidden = false;
}

async function showMember() {
  try {
    const account = await accountRequest();
    authCard.hidden = true;
    memberCard.hidden = false;
    $('#member-email').textContent = account.email || '—';
    $('#settings-email').value = account.email || '';
    $('#member-plan').textContent = String(account.plan || 'free').replace(/^./, (letter) => letter.toUpperCase());
    $('#member-usage').textContent = `${account.monitor_count || 0} / ${account.limit || 0}`;
    $('#member-status').textContent = account.subscription_status || ((account.plan || 'free') === 'free' ? 'Free' : 'Active');
  } catch {
    clearSession();
    showAuth();
    setMessage('Your session has expired. Sign in again to continue.', 'error');
  }
}

const hash = new URLSearchParams(location.hash.slice(1));
if (hash.get('access_token')) {
  storeSession({ access_token: hash.get('access_token'), refresh_token: hash.get('refresh_token'), expires_at: Math.floor(Date.now() / 1000) + Number(hash.get('expires_in') || 3600) });
  history.replaceState(null, '', location.pathname + location.search);
  showMember();
}

$('#tab-signin').addEventListener('click', () => setMode('signin'));
$('#tab-signup').addEventListener('click', () => setMode('signup'));

$('#auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#submit');
  const email = $('#email').value.trim();
  const password = $('#password').value;
  button.disabled = true;
  setMessage(mode === 'signin' ? 'Signing in…' : 'Creating your account…', 'loading');
  try {
    if (mode === 'signin') {
      storeSession(await authRequest('/auth/v1/token?grant_type=password', { email, password }));
      await showMember();
    } else {
      const data = await authRequest(`/auth/v1/signup?redirect_to=${encodeURIComponent(CALLBACK_URL)}`, { email, password });
      if (data.access_token) {
        storeSession(data);
        await showMember();
      } else {
        setMessage('Account created. Check your inbox to confirm your email, then return here to sign in.', 'success');
      }
    }
  } catch (error) {
    setMessage(error.message || 'Unable to continue. Please try again.', 'error');
  } finally {
    button.disabled = false;
  }
});

$('#email-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  const email = $('#settings-email').value.trim();
  button.disabled = true;
  setSettingsMessage('#email-msg', 'Updating your email…');
  try {
    const user = await updateAuthUser({ email });
    if (user.new_email || (user.email && user.email !== email)) {
      setSettingsMessage('#email-msg', `Confirmation sent to ${email}. Your current email stays active until the change is confirmed.`, 'success');
    } else {
      $('#member-email').textContent = user.email || email;
      setSettingsMessage('#email-msg', 'Email updated.', 'success');
    }
  } catch (error) {
    setSettingsMessage('#email-msg', error.message || 'Unable to update your email.', 'error');
  } finally {
    button.disabled = false;
  }
});

$('#password-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  const password = $('#new-password').value;
  const confirmation = $('#confirm-password').value;
  if (password !== confirmation) {
    setSettingsMessage('#password-msg', 'The passwords do not match.', 'error');
    return;
  }
  button.disabled = true;
  setSettingsMessage('#password-msg', 'Updating your password…');
  try {
    await updateAuthUser({ password });
    event.currentTarget.reset();
    setSettingsMessage('#password-msg', 'Password updated successfully.', 'success');
  } catch (error) {
    setSettingsMessage('#password-msg', error.message || 'Unable to update your password.', 'error');
  } finally {
    button.disabled = false;
  }
});

$('#account-signout').addEventListener('click', async () => {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}` } });
  } catch {
    // Clear the local session even if remote sign-out is unavailable.
  }
  clearSession();
  showAuth();
  setMode('signin');
  setMessage('You have been signed out.', 'success');
});

if (accessToken) {
  showMember();
} else if (purchased) {
  setMode('signup');
  const planName = purchasedPlan ? ` for ${purchasedPlan[0].toUpperCase()}${purchasedPlan.slice(1)}` : '';
  setMessage(`Payment received${planName}. Create your account using the same email address you used at checkout.`, 'success');
}
