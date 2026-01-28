const API_BASE = '';

const LS_TOKEN = 'aura_token';
const LS_USER = 'aura_user';

const welcome = document.getElementById('welcome');
const apptList = document.getElementById('apptList');
const logoutBtn = document.getElementById('logoutBtn');

function token() {
  return localStorage.getItem(LS_TOKEN);
}

function getUser() {
  try {
    const raw = localStorage.getItem(LS_USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function render(appts) {
  if (!appts.length) {
    apptList.innerHTML = '<div class="form__msg" style="color:#64748b;">No upcoming appointments.</div>';
    return;
  }

  apptList.innerHTML = appts
    .map((a) => {
      const dt = new Date(a.scheduled_at);
      const when = isNaN(dt.getTime()) ? a.scheduled_at : dt.toLocaleString();
      const join = a.mode === 'TELE' && a.room_id ? `<a href="/teleconsult.html?room=${encodeURIComponent(a.room_id)}">Join</a>` : '';

      return `
        <div class="card" style="box-shadow:none; border:1px solid #eef2f7; margin-bottom:10px;">
          <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
            <div>
              <div class="card__kicker">${escapeHtml(a.mode)}</div>
              <div class="card__name">${escapeHtml(a.doctor_name)} • ${escapeHtml(a.doctor_specialty)}</div>
              <div class="card__loc">${escapeHtml(a.doctor_city)} • ${escapeHtml(when)}</div>
            </div>
            <div style="font-weight:800; color:#0f172a;">${join}</div>
          </div>
        </div>
      `;
    })
    .join('');
}

async function load() {
  const t = token();
  if (!t) {
    location.href = '/';
    return;
  }

  const u = getUser();
  if (!u || u.role !== 'PATIENT') {
    location.href = '/';
    return;
  }

  welcome.textContent = `Welcome, ${u.fullName}`;

  const body = await fetchJSON(`${API_BASE}/api/dashboard/patient/appointments`, {
    headers: { Authorization: `Bearer ${t}` }
  });

  render(body.data || []);
}

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_USER);
  location.href = '/';
});

load().catch((err) => {
  apptList.textContent = err.message;
});
