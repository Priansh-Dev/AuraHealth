const API_BASE = '';

const LS_TOKEN = 'aura_token';
const LS_USER = 'aura_user';

const welcome = document.getElementById('welcome');
const apptList = document.getElementById('apptList');
const logoutBtn = document.getElementById('logoutBtn');

const menuAppointmentsBtn = document.getElementById('menuAppointmentsBtn');
const menuAvailabilityBtn = document.getElementById('menuAvailabilityBtn');
const appointmentsSection = document.getElementById('appointmentsSection');
const availabilitySection = document.getElementById('availabilitySection');

const apptDate = document.getElementById('apptDate');
const loadApptsBtn = document.getElementById('loadApptsBtn');

const availRules = document.getElementById('availRules');
const addAvailRuleBtn = document.getElementById('addAvailRuleBtn');
const saveAvailBtn = document.getElementById('saveAvailBtn');
const availMsg = document.getElementById('availMsg');

const availMode = document.getElementById('availMode');
const availCap = document.getElementById('availCap');
const availStart = document.getElementById('availStart');
const availEnd = document.getElementById('availEnd');
const addAvailSelectedBtn = document.getElementById('addAvailSelectedBtn');
const selectWeekdaysBtn = document.getElementById('selectWeekdaysBtn');
const clearDaysBtn = document.getElementById('clearDaysBtn');

const unavailMsg = document.getElementById('unavailMsg');
const unavailMode = document.getElementById('unavailMode');
const unavailStart = document.getElementById('unavailStart');
const unavailEnd = document.getElementById('unavailEnd');
const addUnavailBtn = document.getElementById('addUnavailBtn');
const refreshUnavailBtn = document.getElementById('refreshUnavailBtn');
const unavailList = document.getElementById('unavailList');

const slotManageMode = document.getElementById('slotManageMode');
const slotManageDate = document.getElementById('slotManageDate');
const loadSlotsBtn = document.getElementById('loadSlotsBtn');
const slotManageList = document.getElementById('slotManageList');

function token() {
  return localStorage.getItem(LS_TOKEN);
}

function todayKey() {
  const d = new Date();
  const pad2 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function setActiveMenu(which) {
  const isAppt = which === 'appointments';
  if (appointmentsSection) appointmentsSection.style.display = isAppt ? '' : 'none';
  if (availabilitySection) availabilitySection.style.display = isAppt ? 'none' : '';

  if (menuAppointmentsBtn) menuAppointmentsBtn.className = isAppt ? 'btn btn--primary' : 'btn btn--ghost';
  if (menuAvailabilityBtn) menuAvailabilityBtn.className = isAppt ? 'btn btn--ghost' : 'btn btn--primary';
}

function renderUnavailability(items) {
  if (!unavailList) return;
  const arr = Array.isArray(items) ? items : [];
  if (!arr.length) {
    unavailList.innerHTML = '<div class="form__msg" style="color:#64748b; margin-top:0;">No exceptions added.</div>';
    return;
  }

  unavailList.innerHTML = arr
    .map((u) => {
      return `
        <div class="card" style="box-shadow:none; border:1px solid #eef2f7; margin-bottom:10px;">
          <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
            <div>
              <div class="card__kicker">${escapeHtml(u.mode)}</div>
              <div class="card__loc">${escapeHtml(fmtWhen(u.start_at))} → ${escapeHtml(fmtWhen(u.end_at))}</div>
            </div>
            <div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;">
              <button class="btn btn--dark" type="button" data-action="remove-unavail" data-id="${escapeHtml(u.id)}">Remove</button>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

async function loadAppointmentsForDate(dateKey) {
  const t = token();
  const k = String(dateKey || '').trim();
  const q = k ? `?date=${encodeURIComponent(k)}` : '';
  const body = await fetchJSON(`${API_BASE}/api/dashboard/doctor/appointments${q}`, {
    headers: { Authorization: `Bearer ${t}` }
  });
  render(body.data || []);
}

async function loadUnavailability() {
  if (!unavailList) return;
  setUnavailMsg('Loading exceptions...');
  try {
    const body = await fetchJSON(`${API_BASE}/api/availability/me/unavailability`, {
      headers: { ...authHeaders() }
    });
    renderUnavailability(body.data || []);
    setUnavailMsg('');
  } catch (e) {
    renderUnavailability([]);
    setUnavailMsg(e.message);
  }
}

async function addUnavailability() {
  if (!addUnavailBtn) return;
  const mode = unavailMode?.value === 'TELE' ? 'TELE' : 'IN_CLINIC';
  const startVal = String(unavailStart?.value || '').trim();
  const endVal = String(unavailEnd?.value || '').trim();
  if (!startVal || !endVal) {
    setUnavailMsg('Please select block start and end.');
    return;
  }

  const start = new Date(startVal);
  const end = new Date(endVal);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    setUnavailMsg('Invalid start/end time.');
    return;
  }

  setUnavailMsg('Saving...');
  addUnavailBtn.disabled = true;
  try {
    await fetchJSON(`${API_BASE}/api/availability/me/unavailability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ mode, start_at: start.toISOString(), end_at: end.toISOString() })
    });
    setUnavailMsg('Saved. Empty slots in this range were cancelled.');
    await loadUnavailability();
  } catch (e) {
    setUnavailMsg(e.message);
  } finally {
    addUnavailBtn.disabled = false;
  }
}

async function loadSlotsForDate() {
  if (!slotManageList) return;
  const mode = slotManageMode?.value === 'TELE' ? 'TELE' : 'IN_CLINIC';
  const dateKey = String(slotManageDate?.value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    slotManageList.innerHTML = '<div class="form__msg" style="color:#64748b; margin-top:0;">Select a date.</div>';
    return;
  }

  slotManageList.innerHTML = '<div class="form__msg" style="color:#64748b; margin-top:0;">Loading slots...</div>';
  try {
    const body = await fetchJSON(
      `${API_BASE}/api/availability/me/slots?mode=${encodeURIComponent(mode)}&date=${encodeURIComponent(dateKey)}`,
      { headers: { ...authHeaders() } }
    );
    const arr = Array.isArray(body.data) ? body.data : [];
    if (!arr.length) {
      slotManageList.innerHTML = '<div class="form__msg" style="color:#64748b; margin-top:0;">No slots on this day.</div>';
      return;
    }

    slotManageList.innerHTML = arr
      .map((s) => {
        const ds = new Date(s.slot_start);
        const de = new Date(s.slot_end);
        const t1 = Number.isFinite(ds.getTime()) ? ds.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : String(s.slot_start);
        const t2 = Number.isFinite(de.getTime()) ? de.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : String(s.slot_end);
        const time = `${t1} - ${t2}`;
        const cap = Number(s.capacity);
        const booked = Number(s.booked_count);
        const status = String(s.status || 'ACTIVE');
        const canCancel = status === 'ACTIVE' && Number.isFinite(booked) && booked === 0;
        const cancelBtn = canCancel
          ? `<button class="btn btn--dark" type="button" data-action="cancel-slot" data-id="${escapeHtml(s.id)}">Cancel</button>`
          : '';
        const meta = `${Number.isFinite(booked) ? booked : '?'} / ${Number.isFinite(cap) ? cap : '?'}`;

        return `
          <div class="card" style="box-shadow:none; border:1px solid #eef2f7; margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
              <div>
                <div class="card__kicker">${escapeHtml(time)} • ${escapeHtml(mode)}</div>
                <div class="card__loc">Bookings: ${escapeHtml(meta)} • Status: ${escapeHtml(status)}</div>
              </div>
              <div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;">
                ${cancelBtn}
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  } catch (e) {
    slotManageList.innerHTML = `<div class="form__msg" style="color:#64748b; margin-top:0;">${escapeHtml(e.message)}</div>`;
  }
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

function setAvailMsg(m) {
  if (!availMsg) return;
  availMsg.textContent = m || '';
}

function setUnavailMsg(m) {
  if (!unavailMsg) return;
  unavailMsg.textContent = m || '';
}

function toLocalInputValue(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (!Number.isFinite(dt.getTime())) return '';
  const pad2 = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}T${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
}

function fmtWhen(s) {
  const dt = new Date(s);
  return Number.isFinite(dt.getTime()) ? dt.toLocaleString() : String(s);
}

function dowLabel(d) {
  const map = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const n = Number(d);
  return Number.isFinite(n) && n >= 0 && n <= 6 ? map[n] : String(d);
}

function ruleRowHtml(rule) {
  const id = rule?.id ? String(rule.id) : '';
  const mode = rule?.mode === 'TELE' ? 'TELE' : 'IN_CLINIC';
  const day = Number.isFinite(Number(rule?.day_of_week)) ? String(Number(rule.day_of_week)) : '1';
  const start = String(rule?.start_time || '10:00').slice(0, 5);
  const end = String(rule?.end_time || '10:30').slice(0, 5);
  const cap = Number.isFinite(Number(rule?.capacity_per_slot)) ? String(Number(rule.capacity_per_slot)) : '1';

  return `
    <div class="card" style="box-shadow:none; border:1px solid #eef2f7; margin-bottom:10px;">
      <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
        <input type="hidden" data-field="id" value="${escapeHtml(id)}" />

        <label class="field" style="margin:0; min-width:140px;">
          <span class="field__label">Mode</span>
          <select class="field__input" data-field="mode" style="height:44px;">
            <option value="IN_CLINIC" ${mode === 'IN_CLINIC' ? 'selected' : ''}>IN_CLINIC</option>
            <option value="TELE" ${mode === 'TELE' ? 'selected' : ''}>TELE</option>
          </select>
        </label>

        <label class="field" style="margin:0; min-width:150px;">
          <span class="field__label">Day</span>
          <select class="field__input" data-field="day_of_week" style="height:44px;">
            <option value="0" ${day === '0' ? 'selected' : ''}>${dowLabel(0)}</option>
            <option value="1" ${day === '1' ? 'selected' : ''}>${dowLabel(1)}</option>
            <option value="2" ${day === '2' ? 'selected' : ''}>${dowLabel(2)}</option>
            <option value="3" ${day === '3' ? 'selected' : ''}>${dowLabel(3)}</option>
            <option value="4" ${day === '4' ? 'selected' : ''}>${dowLabel(4)}</option>
            <option value="5" ${day === '5' ? 'selected' : ''}>${dowLabel(5)}</option>
            <option value="6" ${day === '6' ? 'selected' : ''}>${dowLabel(6)}</option>
          </select>
        </label>

        <label class="field" style="margin:0; min-width:130px;">
          <span class="field__label">Start</span>
          <input class="field__input" data-field="start_time" type="time" value="${escapeHtml(start)}" />
        </label>

        <label class="field" style="margin:0; min-width:130px;">
          <span class="field__label">End</span>
          <input class="field__input" data-field="end_time" type="time" value="${escapeHtml(end)}" />
        </label>

        <label class="field" style="margin:0; min-width:140px;">
          <span class="field__label">Capacity / 30 min</span>
          <input class="field__input" data-field="capacity_per_slot" type="number" min="1" max="50" value="${escapeHtml(cap)}" />
        </label>

        <button class="btn btn--dark" type="button" data-action="remove-rule">Remove</button>
      </div>
    </div>
  `;
}

function renderAvailRules(rules) {
  if (!availRules) return;
  const arr = Array.isArray(rules) ? rules : [];
  availRules.innerHTML = arr.length ? arr.map(ruleRowHtml).join('') : '<div class="form__msg" style="color:#64748b; margin-top:0;">No rules yet. Click “Add rule”.</div>';
}

function readAvailRulesFromUI() {
  if (!availRules) return [];
  const cards = Array.from(availRules.querySelectorAll('div.card'));
  const out = [];
  for (const c of cards) {
    const get = (name) => c.querySelector(`[data-field="${name}"]`)?.value;
    const mode = get('mode');
    const day_of_week = Number(get('day_of_week'));
    const start_time = get('start_time');
    const end_time = get('end_time');
    const capacity_per_slot = Number(get('capacity_per_slot'));

    if (!mode || !Number.isFinite(day_of_week) || !start_time || !end_time || !Number.isFinite(capacity_per_slot)) {
      continue;
    }

    out.push({
      mode,
      day_of_week,
      start_time,
      end_time,
      slot_minutes: 30,
      capacity_per_slot
    });
  }
  return out;
}

function getSelectedDays() {
  return Array.from(document.querySelectorAll('input.availDay:checked'))
    .map((el) => Number(el.value))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6);
}

function setSelectedDays(days) {
  const set = new Set(days);
  for (const el of Array.from(document.querySelectorAll('input.availDay'))) {
    const v = Number(el.value);
    el.checked = set.has(v);
  }
}

async function loadAvailability() {
  if (!availRules) return;
  setAvailMsg('Loading availability...');
  try {
    const body = await fetchJSON(`${API_BASE}/api/availability/me`, {
      headers: { ...authHeaders() }
    });
    renderAvailRules(body.data || []);
    setAvailMsg('');
  } catch (e) {
    renderAvailRules([]);
    setAvailMsg(e.message);
  }
}

async function saveAvailability() {
  if (!saveAvailBtn) return;
  const rules = readAvailRulesFromUI();
  if (!rules.length) {
    setAvailMsg('Please add at least one rule.');
    return;
  }

  setAvailMsg('Saving...');
  saveAvailBtn.disabled = true;
  try {
    await fetchJSON(`${API_BASE}/api/availability/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ rules })
    });
    setAvailMsg('Saved. Slots generated for next 7 days.');
  } catch (e) {
    setAvailMsg(e.message);
  } finally {
    saveAvailBtn.disabled = false;
  }
}

function render(appts) {
  if (!appts.length) {
    apptList.innerHTML = '<div class="form__msg" style="color:#64748b;">No appointments found.</div>';
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

  setActiveMenu('appointments');

  const u = getUser();
  if (!u || u.role !== 'DOCTOR') {
    location.href = '/';
    return;
  }

  welcome.textContent = `Welcome, ${u.fullName} • ${u.specialty}`;

  if (apptDate && !apptDate.value) apptDate.value = todayKey();
  await loadAppointmentsForDate(apptDate?.value || '');

  await loadAvailability();

  const now = new Date();
  if (unavailStart && !unavailStart.value) unavailStart.value = toLocalInputValue(now);
  if (unavailEnd && !unavailEnd.value) unavailEnd.value = toLocalInputValue(new Date(now.getTime() + 60 * 60 * 1000));
  if (slotManageDate && !slotManageDate.value) slotManageDate.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  await loadUnavailability();
}

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_USER);
  location.href = '/';
});

load().catch((err) => {
  apptList.textContent = err.message;
});

menuAppointmentsBtn?.addEventListener('click', () => {
  setActiveMenu('appointments');
});

menuAvailabilityBtn?.addEventListener('click', () => {
  setActiveMenu('availability');
});

loadApptsBtn?.addEventListener('click', () => {
  const k = String(apptDate?.value || '').trim();
  loadAppointmentsForDate(k).catch((e) => {
    apptList.innerHTML = `<div class="form__msg" style="color:#64748b;">${escapeHtml(e.message)}</div>`;
  });
});

addAvailRuleBtn?.addEventListener('click', () => {
  const existing = Array.from(availRules?.querySelectorAll('div.card') || []).map(() => ({}));
  const rows = (existing.length ? readAvailRulesFromUI() : []).concat([
    { mode: 'IN_CLINIC', day_of_week: 1, start_time: '10:00', end_time: '12:00', slot_minutes: 30, capacity_per_slot: 1 }
  ]);
  renderAvailRules(rows);
  setAvailMsg('');
});

selectWeekdaysBtn?.addEventListener('click', () => {
  setSelectedDays([1, 2, 3, 4, 5]);
});

clearDaysBtn?.addEventListener('click', () => {
  setSelectedDays([]);
});

addAvailSelectedBtn?.addEventListener('click', () => {
  const mode = availMode?.value === 'TELE' ? 'TELE' : 'IN_CLINIC';
  const cap = Number(availCap?.value);
  const start = String(availStart?.value || '').trim();
  const end = String(availEnd?.value || '').trim();
  const days = getSelectedDays();

  if (!days.length) {
    setAvailMsg('Please select at least one day.');
    return;
  }
  if (!start || !end) {
    setAvailMsg('Please select start and end time.');
    return;
  }
  if (!Number.isFinite(cap) || cap <= 0) {
    setAvailMsg('Please enter a valid capacity.');
    return;
  }

  const current = readAvailRulesFromUI();
  for (const d of days) {
    current.push({
      mode,
      day_of_week: d,
      start_time: start,
      end_time: end,
      slot_minutes: 30,
      capacity_per_slot: cap
    });
  }

  renderAvailRules(current);
  setAvailMsg('');
});

availRules?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action="remove-rule"]');
  if (!btn) return;
  const card = btn.closest('div.card');
  if (!card) return;
  card.remove();
  if (!availRules.querySelector('div.card')) {
    renderAvailRules([]);
  }
});

saveAvailBtn?.addEventListener('click', () => {
  saveAvailability();
});

addUnavailBtn?.addEventListener('click', () => {
  addUnavailability();
});

refreshUnavailBtn?.addEventListener('click', () => {
  loadUnavailability();
});

loadSlotsBtn?.addEventListener('click', () => {
  loadSlotsForDate();
});

unavailList?.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action="remove-unavail"]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  if (!Number.isFinite(id)) return;
  btn.disabled = true;
  try {
    await fetchJSON(`${API_BASE}/api/availability/me/unavailability/${id}`, {
      method: 'DELETE',
      headers: { ...authHeaders() }
    });
    await loadUnavailability();
  } catch (err) {
    btn.disabled = false;
    alert(err.message);
  }
});

slotManageList?.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action="cancel-slot"]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  if (!Number.isFinite(id)) return;
  btn.disabled = true;
  try {
    await fetchJSON(`${API_BASE}/api/availability/me/slots/${id}/cancel`, {
      method: 'POST',
      headers: { ...authHeaders() }
    });
    await loadSlotsForDate();
  } catch (err) {
    btn.disabled = false;
    alert(err.message);
  }
});
