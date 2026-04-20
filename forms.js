/**
 * BRG Forms — UTM capture + form submission handlers
 */

// ============ CONFIG ============
const WORKER_URL = 'https://brg-subscribe.solitary-firefly-c160.workers.dev/subscribe';
const WEB3FORMS_KEY = '31b42702-178e-46d2-94ab-57fb7feb212a';

// ============ UTM CAPTURE ============
(function captureUTMs() {
  const params = new URLSearchParams(window.location.search);
  const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  utmKeys.forEach(key => {
    const val = params.get(key);
    if (val) sessionStorage.setItem(key, val);
  });
  if (!sessionStorage.getItem('landing_path')) {
    sessionStorage.setItem('landing_path', window.location.pathname);
  }
  if (!sessionStorage.getItem('referrer') && document.referrer) {
    sessionStorage.setItem('referrer', document.referrer);
  }
})();

function getUTMData() {
  return {
    utm_source: sessionStorage.getItem('utm_source') || '',
    utm_medium: sessionStorage.getItem('utm_medium') || '',
    utm_campaign: sessionStorage.getItem('utm_campaign') || '',
    utm_content: sessionStorage.getItem('utm_content') || '',
    utm_term: sessionStorage.getItem('utm_term') || '',
    landing_path: sessionStorage.getItem('landing_path') || '',
    referrer: sessionStorage.getItem('referrer') || '',
  };
}

// ============ SUBSCRIBE (Hero + Workshop Waitlist) ============
async function subscribeEmail(email, source) {
  const utms = getUTMData();
  try {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source, ...utms })
    });
    const data = await res.json();
    if (res.ok && data.success) return { success: true };
    if (data.error === 'resubscribe_required') {
      return { success: false, message: 'This email was previously unsubscribed. Check your inbox for resubscription options.' };
    }
    return { success: false, message: 'Something went wrong. Please try again.' };
  } catch (err) {
    console.error('Subscribe error:', err);
    return { success: false, message: 'Connection error. Please try again.' };
  }
}

// ============ HERO EMAIL BAR ============
async function submitHeroEmail() {
  const input = document.getElementById('heroEmailInput');
  const btn = input.parentElement.querySelector('button');
  if (!input.value || !input.value.includes('@')) {
    input.style.borderColor = '#c0392b';
    input.addEventListener('input', () => { input.style.borderColor = ''; }, { once: true });
    return;
  }
  btn.textContent = 'Sending...';
  btn.disabled = true;
  const result = await subscribeEmail(input.value, 'hero_home');
  if (result.success) {
    document.getElementById('heroEmailContent').style.display = 'none';
    document.getElementById('heroEmailSuccess').style.display = 'block';
  } else {
    btn.textContent = 'Subscribe';
    btn.disabled = false;
    input.style.borderColor = '#c0392b';
    alert(result.message || 'Something went wrong. Please try again.');
  }
}

function dismissHeroEmail() {
  document.getElementById('heroEmail').classList.add('dismissed');
}

// ============ WORKSHOP WAITLIST ============
async function submitWaitlist() {
  const input = document.getElementById('waitlistEmail');
  const btn = input.parentElement.querySelector('button');
  if (!input.value || !input.value.includes('@')) {
    input.style.borderColor = '#c0392b';
    input.addEventListener('input', () => { input.style.borderColor = ''; }, { once: true });
    return;
  }
  btn.textContent = 'Sending...';
  btn.disabled = true;
  const result = await subscribeEmail(input.value, 'workshop_waitlist');
  if (result.success) {
    document.getElementById('waitlistContent').style.display = 'none';
    document.getElementById('waitlistSuccess').style.display = 'block';
  } else {
    btn.textContent = 'Notify Me';
    btn.disabled = false;
    input.style.borderColor = '#c0392b';
    alert(result.message || 'Something went wrong. Please try again.');
  }
}

// ============ CONTACT FORM (Web3Forms) ============
async function submitContactForm(formEl) {
  const btn = formEl.querySelector('button[type="submit"]');
  const formData = new FormData(formEl);
  const utms = getUTMData();
  const payload = {
    access_key: WEB3FORMS_KEY,
    subject: 'New inquiry from BRG website',
    from_name: formData.get('name') || 'Website Visitor',
    name: formData.get('name') || '',
    email: formData.get('email') || '',
    company: formData.get('company') || '',
    role: formData.get('role') || '',
    message: formData.get('message') || '',
    utm_source: utms.utm_source,
    utm_medium: utms.utm_medium,
    utm_campaign: utms.utm_campaign,
    landing_path: utms.landing_path,
    referrer: utms.referrer,
    botcheck: ''
  };
  btn.textContent = 'Sending...';
  btn.disabled = true;
  try {
    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      formEl.style.display = 'none';
      document.getElementById('formSuccess').style.display = 'block';
      if (formData.get('email')) {
        subscribeEmail(formData.get('email'), 'contact_form').catch(() => {});
      }
    } else {
      btn.textContent = 'Send It';
      btn.disabled = false;
      alert('Something went wrong. Please try again or email us directly.');
    }
  } catch (err) {
    console.error('Contact form error:', err);
    btn.textContent = 'Send It';
    btn.disabled = false;
    alert('Connection error. Please try again or email us directly at m.loftin@bowieRG.com');
  }
}
