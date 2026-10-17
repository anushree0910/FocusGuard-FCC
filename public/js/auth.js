const EMAIL_RE = /^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

const themeToggle = document.getElementById('theme-toggle');
if (themeToggle) {
  const THEME_ICON = { light: '☀', dark: '☾' };
  const THEME_LABEL = { light: 'Light theme', dark: 'Dark theme' };
  function syncThemeIcon() {
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const target = current === 'dark' ? 'light' : 'dark';
    const icon = themeToggle.querySelector('.theme-icon') || themeToggle;
    icon.textContent = THEME_ICON[target];
    const label = themeToggle.querySelector('.theme-label');
    if (label) label.textContent = THEME_LABEL[target];
    themeToggle.setAttribute('aria-label', 'Switch to ' + target + ' theme');
  }
  syncThemeIcon();
  themeToggle.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('fg-theme', next);
    syncThemeIcon();
  });
}

document.querySelectorAll('.toggle[data-target]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    const hidden = input.type === 'password';
    input.type = hidden ? 'text' : 'password';
    btn.textContent = hidden ? 'Hide' : 'Show';
  });
});

async function postJSON(url, body) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    throw new Error(
      'Cannot reach the server. Run "npm start" in the FCC folder, then open http://localhost:3000 in your browser (not the HTML file directly).'
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

const loginForm = document.getElementById('login-form');
if (loginForm) {
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const remember = document.getElementById('remember');
  const errorLabel = document.getElementById('login-error');
  const submitBtn = loginForm.querySelector('.btn-primary');

  const remembered = localStorage.getItem('focusguard_email');
  if (remembered) {
    email.value = remembered;
    remember.checked = true;
    password.focus();
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorLabel.textContent = '\u00A0';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';
    try {
      const data = await postJSON('/api/auth/login', {
        email: email.value.trim(),
        password: password.value,
      });
      if (remember.checked) localStorage.setItem('focusguard_email', data.user.email);
      else localStorage.removeItem('focusguard_email');
      window.location.href = 'dashboard.html';
    } catch (err) {
      errorLabel.textContent = err.message;
      password.value = '';
      password.focus();
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign in';
    }
  });
}

const registerForm = document.getElementById('register-form');
if (registerForm) {
  const fullName = document.getElementById('full-name');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const confirmPassword = document.getElementById('confirm-password');
  const emailHint = document.getElementById('email-hint');
  const strengthHint = document.getElementById('strength-hint');
  const matchHint = document.getElementById('match-hint');
  const strengthBar = document.getElementById('strength-bar');
  const errorLabel = document.getElementById('register-error');
  const submitBtn = registerForm.querySelector('.btn-primary');

  function strength(pw) {
    if (!pw) return 0;
    if (pw.length < 8) return 1;
    let score = 1;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score;
  }

  const WORDS = ['', 'Weak', 'Fair', 'Good', 'Strong'];

  function setHint(label, text, cls) {
    label.textContent = text || '\u00A0';
    label.className = 'hint' + (cls ? ' ' + cls : '');
  }

  email.addEventListener('input', () => {
    const value = email.value.trim();
    if (!value) setHint(emailHint, '');
    else if (EMAIL_RE.test(value)) setHint(emailHint, 'Valid email format', 'ok');
    else setHint(emailHint, 'Enter a valid email address', 'error');
  });

  function updateMatchHint() {
    if (!confirmPassword.value) setHint(matchHint, '');
    else if (password.value === confirmPassword.value) setHint(matchHint, 'Passwords match', 'ok');
    else setHint(matchHint, 'Passwords do not match', 'error');
  }

  password.addEventListener('input', () => {
    const score = strength(password.value);
    strengthBar.dataset.score = String(score);
    if (!password.value) setHint(strengthHint, '');
    else if (password.value.length < 8) setHint(strengthHint, 'Use at least 8 characters', 'error');
    else {
      const cls = score <= 1 ? 'error' : score === 2 ? 'warn' : 'ok';
      setHint(strengthHint, 'Strength: ' + WORDS[score], cls);
    }
    updateMatchHint();
  });

  confirmPassword.addEventListener('input', updateMatchHint);

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorLabel.textContent = '\u00A0';

    const name = fullName.value.trim();
    const mail = email.value.trim();
    if (!name || name.length > 100) {
      errorLabel.textContent = 'Please enter your name (max 100 characters).';
      return;
    }
    if (!EMAIL_RE.test(mail)) {
      errorLabel.textContent = 'Please enter a valid email address.';
      return;
    }
    if (password.value.length < 8) {
      errorLabel.textContent = 'Use a password with at least 8 characters.';
      return;
    }
    if (password.value !== confirmPassword.value) {
      errorLabel.textContent = 'Passwords do not match.';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account…';
    try {
      await postJSON('/api/auth/register', {
        fullName: name,
        email: mail,
        password: password.value,
      });
      window.location.href = 'dashboard.html';
    } catch (err) {
      errorLabel.textContent = err.message;
      password.value = '';
      confirmPassword.value = '';
      strengthBar.dataset.score = '0';
      setHint(strengthHint, '');
      setHint(matchHint, '');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create account';
    }
  });
}
