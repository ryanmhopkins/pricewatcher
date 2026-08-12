const SUPABASE_URL = 'https://hmsldwpcaupanooestfr.supabase.co';
const EDGE_URL = `${SUPABASE_URL}/functions/v1/pricewatcher-api`;
const EMAIL_URL = `${SUPABASE_URL}/functions/v1/pricewatcher-email`;
const PUBLISHABLE_KEY = 'sb_publishable_QCWt9V-_up-ePCszAB9S1A_k2-bPOQj';
const CALLBACK_URL = 'https://plansentry.com/account.html';

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
  $('#forgot-password').hidden = !signingIn;
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


async function emailRequest(action, payload = {}, retry = true) {
  const response = await fetch(EMAIL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ action, ...payload, access_token: accessToken }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && retry && await refreshSession()) return emailRequest(action, payload, false);
  if (!response.ok) throw new Error(data.error || 'Unable to update email alerts.');
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

async function showMember(recovery = false) {
  try {
    const account = await accountRequest();
    authCard.hidden = true;
    memberCard.hidden = false;
    $('#member-email').textContent = account.email || '—';
    $('#settings-email').value = account.email || '';
    $('#member-plan').textContent = String(account.plan || 'free').replace(/^./, (letter) => letter.toUpperCase());
    $('#member-usage').textContent = account.limit === null ? `${account.monitor_count || 0} / Unlimited` : `${account.monitor_count || 0} / ${account.limit || 0}`;
    $('#member-status').textContent = account.subscription_status || ((account.plan || 'free') === 'free' ? 'Free' : 'Active');
    $('#email-frequency').value = account.email_unsubscribed_at ? 'off' : (account.email_frequency || 'immediate');
    $('#email-severity').value = account.email_min_severity || 'low';
    if (recovery) {
      $('#password-msg').textContent = 'Choose a new password below to finish recovering your account.';
      $('#new-password').focus();
    }
  } catch {
    clearSession();
    showAuth();
    setMessage('Your session has expired. Sign in again to continue.', 'error');
  }
}

const hash = new URLSearchParams(location.hash.slice(1));
if (hash.get('access_token')) {
  const recovery = hash.get('type') === 'recovery';
  storeSession({ access_token: hash.get('access_token'), refresh_token: hash.get('refresh_token'), expires_at: Math.floor(Date.now() / 1000) + Number(hash.get('expires_in') || 3600) });
  history.replaceState(null, '', location.pathname + location.search);
  showMember(recovery);
}

$('#tab-signin').addEventListener('click', () => setMode('signin'));
$('#tab-signup').addEventListener('click', () => setMode('signup'));

$('#forgot-password').addEventListener('click', async () => {
  const email = $('#email').value.trim();
  if (!email) {
    setMessage('Enter your email address first, then choose “Forgot your password?”.', 'error');
    $('#email').focus();
    return;
  }
  const button = $('#forgot-password');
  button.disabled = true;
  setMessage('Sending password reset email…', 'loading');
  try {
    await authRequest(`/auth/v1/recover?redirect_to=${encodeURIComponent(CALLBACK_URL)}`, { email });
    setMessage('Password reset email sent. Open the link in your inbox to choose a new password.', 'success');
  } catch (error) {
    setMessage(error.message || 'Unable to send a password reset email.', 'error');
  } finally {
    button.disabled = false;
  }
});

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

$('#email-alert-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  setSettingsMessage('#email-alert-msg', 'Saving email preferences…');
  try {
    const frequency = $('#email-frequency').value;
    await emailRequest('preferences', { frequency, min_severity: $('#email-severity').value, resubscribe: frequency !== 'off' });
    setSettingsMessage('#email-alert-msg', frequency === 'off' ? 'Email alerts turned off.' : 'Email alert preferences saved.', 'success');
  } catch (error) {
    setSettingsMessage('#email-alert-msg', error.message || 'Unable to save email preferences.', 'error');
  } finally {
    button.disabled = false;
  }
});

$('#test-email').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  setSettingsMessage('#email-alert-msg', 'Sending test email…');
  try {
    await emailRequest('test');
    setSettingsMessage('#email-alert-msg', 'Test email sent. Check your inbox.', 'success');
  } catch (error) {
    setSettingsMessage('#email-alert-msg', error.message || 'Unable to send the test email.', 'error');
  } finally {
    button.disabled = false;
  }
});

$('#account-signout').addEventListener('click', async () => {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}` } });
  } catch {
  }
  clearSession();
  showAuth();
  setMode('signin');
  setMessage('You have been signed out.', 'success');
});

setMode(mode);
if (accessToken) {
  showMember();
} else if (purchased) {
  setMode('signup');
  const planName = purchasedPlan ? ` for ${purchasedPlan[0].toUpperCase()}${purchasedPlan.slice(1)}` : '';
  setMessage(`Payment received${planName}. Create your account using the same email address you used at checkout.`, 'success');
}
