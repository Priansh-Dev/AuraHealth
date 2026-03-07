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

function authHeaders() {
  const t = token();
  return t ? { Authorization: `Bearer ${t}` } : {};
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
      const isTele = a.mode === 'TELE';
      const accepted = isTele && a.room_id;
      const acceptBtn = isTele && !accepted ? `<button class="btn btn--primary" data-action="accept" data-id="${a.id}">Accept</button>` : '';
      const join = accepted ? `<a class="btn btn--ghost" href="/teleconsult.html?appt=${encodeURIComponent(String(a.id))}">Join</a>` : '';
      const completeBtn = accepted ? `<button class="btn btn--dark" data-action="complete" data-id="${a.id}">Mark Completed</button>` : '';
      const right = isTele ? `${acceptBtn}${join}${completeBtn}` : '';

      return `
        <div class="card" style="box-shadow:none; border:1px solid #eef2f7; margin-bottom:10px;">
          <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
            <div>
              <div class="card__kicker">${escapeHtml(a.mode)}</div>
              <div class="card__name">${escapeHtml(a.patient_name)}</div>
              <div class="card__loc">${escapeHtml(a.patient_email)} • ${escapeHtml(a.patient_phone)}</div>
              <div class="card__loc">${escapeHtml(when)}</div>
            </div>
            <div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;">${right}</div>
          </div>
        </div>
      `;
    })
    .join('');
}

apptList.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;

  const id = Number(btn.dataset.id);
  const action = btn.dataset.action;
  if (!Number.isFinite(id)) return;

  try {
    if (action === 'accept') {
      btn.disabled = true;
      await fetchJSON(`${API_BASE}/api/appointments/${id}/accept`, {
        method: 'POST',
        headers: { ...authHeaders() }
      });
      await load();
      return;
    }

    if (action === 'complete') {
      btn.disabled = true;
      await fetchJSON(`${API_BASE}/api/appointments/${id}/complete`, {
        method: 'POST',
        headers: { ...authHeaders() }
      });
      await load();
      return;
    }
  } catch (err) {
    btn.disabled = false;
    alert(err.message);
  }
});

async function load() {
  const t = token();
  if (!t) {
    location.href = '/';
    return;
  }

  const u = getUser();
  if (!u || u.role !== 'DOCTOR') {
    location.href = '/';
    return;
  }

  welcome.textContent = `Welcome, ${u.fullName} • ${u.specialty}`;

  const body = await fetchJSON(`${API_BASE}/api/dashboard/doctor/appointments`, {
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
