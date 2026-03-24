const API_BASE = '';

const doctorsGrid = document.getElementById('doctorsGrid');
const citySelect = document.getElementById('citySelect');

const patientLoginBtn = document.getElementById('patientLoginBtn');
const doctorJoinBtn = document.getElementById('doctorJoinBtn');

const bookingModal = document.getElementById('bookingModal');
const bookingForm = document.getElementById('bookingForm');
const bookingMsg = document.getElementById('bookingMsg');

const doctorIdEl = document.getElementById('doctorId');
const bookingModeEl = document.getElementById('bookingMode');
const slotIdEl = document.getElementById('slotId');
const slotPicker = document.getElementById('slotPicker');
const dateTimeFallbackRow = document.getElementById('dateTimeFallbackRow');

const bookingKicker = document.getElementById('bookingKicker');
const bookingMeta = document.getElementById('bookingMeta');

const dateInput = document.getElementById('dateInput');
const timeInput = document.getElementById('timeInput');

let slotState = {
  slotsByDate: new Map(),
  orderedDates: [],
  selectedDate: null
};

const aiForm = document.getElementById('aiForm');
const aiResult = document.getElementById('aiResult');

const authModal = document.getElementById('authModal');
const authForm = document.getElementById('authForm');
const authMsg = document.getElementById('authMsg');
const authRoleEl = document.getElementById('authRole');
const authModeEl = document.getElementById('authMode');
const authKicker = document.getElementById('authKicker');
const authMeta = document.getElementById('authMeta');
const authTitle = document.getElementById('authTitle');
const authSwitchBtn = document.getElementById('authSwitchBtn');
const authSubmitBtn = document.getElementById('authSubmitBtn');

const authNameRow = document.getElementById('authNameRow');
const doctorExtraRow = document.getElementById('doctorExtraRow');

const authFullName = document.getElementById('authFullName');
const authPhone = document.getElementById('authPhone');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authSpecialty = document.getElementById('authSpecialty');
const authCity = document.getElementById('authCity');

const LS_TOKEN = 'aura_token';
const LS_USER = 'aura_user';

aIFormSafe();
initAuthUI();

function aIFormSafe() {
  if (!aiForm) return;
  aiForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = (document.getElementById('symptomInput').value || '').trim();
    if (!v) return;

    aiResult.classList.add('is-visible');
    aiResult.textContent = 'Aura AI is analyzing your symptoms...';

    const city = citySelect.value;

    fetchJSON(`${API_BASE}/api/ai/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symptoms: v, city })
    })
      .then((body) => {
        const data = body.data;
        const specs = (data.matchedSpecialties || []).filter(Boolean);
        const specialistLabel = specs.length ? specs.join(' / ') : 'General Physician';
        aiResult.innerHTML = `Recommended specialist: <strong>${specialistLabel}</strong>. Showing available doctors below.`;

        const doctors = data.doctors || [];
        renderDoctors(doctors);

        document.querySelector('.section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
      .catch((err) => {
        aiResult.textContent = err.message;
      });
  });
}

function openModal() {
  bookingModal.classList.add('is-open');
  bookingModal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  bookingModal.classList.remove('is-open');
  bookingModal.setAttribute('aria-hidden', 'true');
  bookingMsg.textContent = '';
  bookingForm.reset();
}

function openAuthModal() {
  authModal.classList.add('is-open');
  authModal.setAttribute('aria-hidden', 'false');
}

function closeAuthModal() {
  authModal.classList.remove('is-open');
  authModal.setAttribute('aria-hidden', 'true');
  authMsg.textContent = '';
  authForm.reset();
}

bookingModal.addEventListener('click', (e) => {
  const t = e.target;
  if (t && t.dataset && t.dataset.close === 'true') closeModal();
});

authModal.addEventListener('click', (e) => {
  const t = e.target;
  if (t && t.dataset && t.dataset.close === 'true') closeAuthModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && bookingModal.classList.contains('is-open')) closeModal();
  if (e.key === 'Escape' && authModal.classList.contains('is-open')) closeAuthModal();
});

function getTodayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

dateInput.min = getTodayISO();

function pad2(n) {
  return String(n).padStart(2, '0');
}

function getNowTimeHHMM() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function syncTimeMinForSelectedDate() {
  const today = getTodayISO();
  const selected = dateInput.value;

  if (selected && selected === today) {
    timeInput.min = getNowTimeHHMM();
  } else {
    timeInput.min = '';
  }

  if (timeInput.value && timeInput.min && timeInput.value < timeInput.min) {
    timeInput.value = '';
  }
}

dateInput.addEventListener('change', syncTimeMinForSelectedDate);
timeInput.addEventListener('focus', syncTimeMinForSelectedDate);

function fmtDayLabel(d) {
  const dt = new Date(d);
  if (!Number.isFinite(dt.getTime())) return String(d);
  return dt.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function fmtTimeLabel(d) {
  const dt = new Date(d);
  if (!Number.isFinite(dt.getTime())) return String(d);
  return dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function fmtDateKey(d) {
  // Local date key YYYY-MM-DD
  const dt = d instanceof Date ? d : new Date(d);
  if (!Number.isFinite(dt.getTime())) return null;
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function fmtShortDateLabel(dateKey) {
  const dt = new Date(`${dateKey}T00:00:00`);
  if (!Number.isFinite(dt.getTime())) return String(dateKey);
  const weekday = dt.toLocaleDateString(undefined, { weekday: 'short' });
  const day = dt.toLocaleDateString(undefined, { day: '2-digit' });
  const month = dt.toLocaleDateString(undefined, { month: 'short' });
  return { weekday, day, month };
}

function clearSlotSelection() {
  if (slotIdEl) slotIdEl.value = '';
  slotPicker?.querySelectorAll('.slotbtn.is-selected')?.forEach((b) => b.classList.remove('is-selected'));
}

function clearDateSelection() {
  slotPicker?.querySelectorAll('.slotdatebtn.is-selected')?.forEach((b) => b.classList.remove('is-selected'));
}

function setFallbackVisible(v) {
  if (!dateTimeFallbackRow) return;
  dateTimeFallbackRow.style.display = v ? '' : 'none';
  if (v) {
    dateInput.required = true;
    timeInput.required = true;
  } else {
    dateInput.required = false;
    timeInput.required = false;
  }
}

function renderSlotCalendar(slots) {
  if (!slotPicker) return;
  clearSlotSelection();

  slotState = {
    slotsByDate: new Map(),
    orderedDates: [],
    selectedDate: null
  };

  if (!Array.isArray(slots) || !slots.length) {
    slotPicker.innerHTML = '<div class="form__msg" style="color:#64748b; margin-top:0;">No slots available for the next 7 days.</div>';
    return;
  }

  for (const s of slots) {
    const k = fmtDateKey(s.slot_start);
    if (!k) continue;
    if (!slotState.slotsByDate.has(k)) slotState.slotsByDate.set(k, []);
    slotState.slotsByDate.get(k).push(s);
  }

  slotState.orderedDates = Array.from(slotState.slotsByDate.keys()).sort((a, b) => a.localeCompare(b));
  slotState.selectedDate = slotState.orderedDates[0] || null;

  const dateTiles = slotState.orderedDates
    .map((k) => {
      const meta = fmtShortDateLabel(k);
      const sel = k === slotState.selectedDate ? ' is-selected' : '';
      return `
        <button type="button" class="slotdatebtn${sel}" data-date-key="${k}">
          <div class="slotdatebtn__wk">${meta.weekday}</div>
          <div class="slotdatebtn__day">${meta.day}</div>
          <div class="slotdatebtn__mo">${meta.month}</div>
        </button>
      `;
    })
    .join('');

  slotPicker.innerHTML = `
    <div class="slotcal">
      <div class="slotcal__grid">${dateTiles}</div>
    </div>
    <div class="slotsview" id="slotsView"></div>
  `;

  renderSlotsForSelectedDate();
}

function renderSlotsForSelectedDate() {
  if (!slotPicker) return;
  const view = slotPicker.querySelector('#slotsView');
  if (!view) return;

  clearSlotSelection();

  const k = slotState.selectedDate;
  if (!k) {
    view.innerHTML = '<div class="form__msg" style="color:#64748b; margin-top:0;">Select a date to view slots.</div>';
    return;
  }

  const items = (slotState.slotsByDate.get(k) || []).slice().sort((a, b) => String(a.slot_start).localeCompare(String(b.slot_start)));
  const dayLabel = items.length ? fmtDayLabel(items[0].slot_start) : k;

  const btns = items
    .map((s) => {
      const left = Number(s.capacity) - Number(s.booked_count);
      const leftSafe = Number.isFinite(left) ? Math.max(0, left) : null;
      const t1 = fmtTimeLabel(s.slot_start);
      const t2 = fmtTimeLabel(s.slot_end);
      const timeStr = `${t1}-${t2}`;
      const suffix = leftSafe != null ? ` • ${leftSafe} left` : '';
      return `<button type="button" class="slotbtn" data-slot-id="${s.id}">${timeStr}${suffix}</button>`;
    })
    .join('');

  view.innerHTML = `
    <div class="slotday slotday--single">
      <div class="slotday__title">${dayLabel}</div>
      <div class="slotday__grid">${btns || '<div class="form__msg" style="color:#64748b; margin-top:0;">No slots on this day.</div>'}</div>
    </div>
  `;
}

async function loadSlotsForBooking() {
  if (!slotPicker) return;
  const doctorId = Number(doctorIdEl.value);
  const mode = bookingModeEl.value;
  if (!Number.isFinite(doctorId) || (mode !== 'IN_CLINIC' && mode !== 'TELE')) return;

  slotPicker.innerHTML = '<div class="form__msg" style="color:#64748b; margin-top:0;">Loading slots...</div>';
  setFallbackVisible(false);

  try {
    const body = await fetchJSON(`${API_BASE}/api/availability/doctor/${doctorId}/slots?mode=${encodeURIComponent(mode)}`);
    renderSlotCalendar(body.data || []);
  } catch {
    // If slots API fails (e.g. migration not run yet), fall back to old date/time booking
    slotPicker.innerHTML = '<div class="form__msg" style="color:#64748b; margin-top:0;">Slots are unavailable right now. Use date/time to book.</div>';
    setFallbackVisible(true);
    syncTimeMinForSelectedDate();
  }
}

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const msg = body && body.error ? body.error : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body;
}

function setSession(token, user) {
  if (token) localStorage.setItem(LS_TOKEN, token);
  if (user) localStorage.setItem(LS_USER, JSON.stringify(user));
  updateTopbar();
}

function clearSession() {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_USER);
  updateTopbar();
}

function getToken() {
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

function updateTopbar() {
  const user = getUser();
  if (!user) {
    patientLoginBtn.textContent = 'Patient Login';
    doctorJoinBtn.textContent = 'Doctor Join';
    return;
  }

  if (user.role === 'PATIENT') {
    patientLoginBtn.textContent = 'Dashboard';
    doctorJoinBtn.textContent = 'Logout';
  } else {
    patientLoginBtn.textContent = 'Dashboard';
    doctorJoinBtn.textContent = 'Logout';
  }
}

function setAuthView(role, mode) {
  authRoleEl.value = role;
  authModeEl.value = mode;

  authMsg.textContent = '';

  const isRegister = mode === 'REGISTER';
  const isDoctor = role === 'DOCTOR';

  authKicker.textContent = isDoctor ? 'Doctor' : 'Patient';
  authTitle.textContent = isRegister ? 'Create Account' : 'Login';
  authMeta.textContent = isDoctor ? 'Manage your profile and consultations' : 'Book appointments faster';

  authNameRow.style.display = isRegister ? '' : 'none';
  doctorExtraRow.style.display = isDoctor && isRegister ? '' : 'none';

  authSubmitBtn.textContent = isRegister ? 'Create account' : 'Login';
  authSwitchBtn.textContent = isRegister ? 'I already have an account' : 'Create account';
}

function initAuthUI() {
  updateTopbar();

  const user = getUser();
  if (user && user.role === 'DOCTOR' && location.pathname === '/') {
    location.replace('/doctor.html');
    return;
  }

  patientLoginBtn.addEventListener('click', () => {
    const u = getUser();
    if (u) {
      if (u.role === 'PATIENT') location.href = '/patient.html';
      else if (u.role === 'DOCTOR') location.href = '/doctor.html';
      return;
    }

    openAuthModal();
    setAuthView('PATIENT', 'LOGIN');
  });

  doctorJoinBtn.addEventListener('click', () => {
    const u = getUser();
    if (u) {
      clearSession();
      return;
    }

    openAuthModal();
    setAuthView('DOCTOR', 'REGISTER');
  });

  authSwitchBtn.addEventListener('click', () => {
    const role = authRoleEl.value;
    const mode = authModeEl.value === 'REGISTER' ? 'LOGIN' : 'REGISTER';
    setAuthView(role, mode);
  });

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const role = authRoleEl.value;
    const mode = authModeEl.value;

    const email = authEmail.value.trim();
    const password = authPassword.value;

    const payload = { email, password };
    if (mode === 'REGISTER') {
      payload.fullName = authFullName.value.trim();
      payload.phone = authPhone.value.trim();

      if (role === 'DOCTOR') {
        payload.specialty = authSpecialty.value.trim();
        payload.city = authCity.value.trim();
      }
    }

    const path =
      role === 'PATIENT'
        ? mode === 'REGISTER'
          ? '/api/auth/patient/register'
          : '/api/auth/patient/login'
        : mode === 'REGISTER'
          ? '/api/auth/doctor/register'
          : '/api/auth/doctor/login';

    authMsg.textContent = 'Please wait...';

    try {
      const body = await fetchJSON(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      setSession(body.data.token, body.data.user);
      authMsg.textContent = 'Success.';
      const role = body?.data?.user?.role;
      setTimeout(() => {
        closeAuthModal();
        if (role === 'PATIENT') location.href = '/patient.html';
        else if (role === 'DOCTOR') location.href = '/doctor.html';
      }, 600);
    } catch (err) {
      authMsg.textContent = err.message;
    }
  });
}

function toTitleCase(s) {
  return String(s || '')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function renderDoctors(doctors) {
  doctorsGrid.innerHTML = '';

  if (!doctors.length) {
    doctorsGrid.innerHTML = '<div class="card">No doctors found.</div>';
    return;
  }

  for (const d of doctors) {
    const card = document.createElement('div');
    card.className = 'card';

    const specialty = toTitleCase(d.specialty);

    card.innerHTML = `
      <div class="card__head">
        <div class="avatar">${d.avatar_url ? `<img src="${d.avatar_url}" alt="" />` : ''}</div>
        <div>
          <div class="card__kicker">${specialty}</div>
          <div class="card__name">${d.full_name}</div>
          <div class="card__loc">${d.city}</div>
        </div>
      </div>

      <div class="card__rating">
        <span class="star">★</span>
        <span>${Number(d.rating).toFixed(1)}</span>
        <span class="card__reviews">(${Number(d.review_count)}+ reviews)</span>
      </div>

      <div class="card__actions">
        <button class="btn btn--primary" data-action="book" data-id="${d.id}">Book Appointment</button>
        <button class="btn btn--ghost" data-action="tele" data-id="${d.id}">Tele-consult</button>
      </div>
    `;

    doctorsGrid.appendChild(card);
  }
}

function uniqueCities(doctors) {
  const s = new Set();
  for (const d of doctors) s.add(d.city);
  return Array.from(s).sort((a, b) => a.localeCompare(b));
}

function setCityOptions(cities) {
  const current = citySelect.value;
  citySelect.innerHTML = '<option value="">Select City</option>';
  for (const c of cities) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    citySelect.appendChild(opt);
  }
  citySelect.value = current;
}

async function loadDoctors() {
  const city = citySelect.value;
  const q = city ? `?city=${encodeURIComponent(city)}` : '';

  const body = await fetchJSON(`${API_BASE}/api/doctors${q}`);
  const doctors = body.data || [];

  setCityOptions(uniqueCities(doctors.length ? doctors : await fetchAllDoctors()));
  renderDoctors(doctors);
}

async function fetchAllDoctors() {
  const body = await fetchJSON(`${API_BASE}/api/doctors`);
  return body.data || [];
}

citySelect.addEventListener('change', () => {
  loadDoctors().catch((err) => {
    doctorsGrid.innerHTML = `<div class="card">${err.message}</div>`;
  });
});

doctorsGrid.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;

  const id = Number(btn.dataset.id);
  const action = btn.dataset.action;

  const body = await fetchJSON(`${API_BASE}/api/doctors/${id}`);
  const d = body.data;

  doctorIdEl.value = String(d.id);
  bookingModeEl.value = action === 'tele' ? 'TELE' : 'IN_CLINIC';

  bookingKicker.textContent = action === 'tele' ? 'Tele-consult' : 'In-clinic';
  document.getElementById('bookingTitle').textContent = 'Book Appointment';
  bookingMeta.textContent = `${d.full_name} • ${toTitleCase(d.specialty)} • ${d.city}`;

  const user = getUser();
  if (!user || user.role !== 'PATIENT') {
    openAuthModal();
    setAuthView('PATIENT', 'LOGIN');
    return;
  }

  document.getElementById('patientFullName').value = user.fullName || '';
  document.getElementById('patientEmail').value = user.email || '';
  document.getElementById('patientPhone').value = user.phone || '';

  clearSlotSelection();
  await loadSlotsForBooking();
  syncTimeMinForSelectedDate();
  openModal();
});

slotPicker?.addEventListener('click', (e) => {
  const dateBtn = e.target.closest('button[data-date-key]');
  if (dateBtn) {
    const k = dateBtn.dataset.dateKey;
    if (k && k !== slotState.selectedDate) {
      slotState.selectedDate = k;
      clearDateSelection();
      dateBtn.classList.add('is-selected');
      renderSlotsForSelectedDate();
    }
    return;
  }

  const slotBtn = e.target.closest('button[data-slot-id]');
  if (!slotBtn) return;
  clearSlotSelection();
  slotBtn.classList.add('is-selected');
  if (slotIdEl) slotIdEl.value = slotBtn.dataset.slotId;
});

bookingForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const t = getToken();
  const user = getUser();
  if (!t || !user || user.role !== 'PATIENT') {
    closeModal();
    openAuthModal();
    setAuthView('PATIENT', 'LOGIN');
    return;
  }

  const doctorId = Number(doctorIdEl.value);
  const mode = bookingModeEl.value;

  const patientFullName = document.getElementById('patientFullName').value.trim();
  const patientEmail = document.getElementById('patientEmail').value.trim();
  const patientPhone = document.getElementById('patientPhone').value.trim();

  const date = document.getElementById('dateInput').value;
  const time = document.getElementById('timeInput').value;
  const notes = document.getElementById('notesInput').value.trim();

  const selectedSlotId = slotIdEl && slotIdEl.value ? Number(slotIdEl.value) : null;
  if (selectedSlotId != null && !Number.isFinite(selectedSlotId)) {
    bookingMsg.textContent = 'Invalid slot selection.';
    return;
  }

  let scheduledAt = null;
  if (!selectedSlotId) {
    if (!date || !time) {
      bookingMsg.textContent = 'Please select a slot (or choose date/time).';
      return;
    }

    scheduledAt = `${date} ${time}:00`;
    const scheduledDate = new Date(`${date}T${time}:00`);
    if (!Number.isFinite(scheduledDate.getTime())) {
      bookingMsg.textContent = 'Invalid date/time.';
      return;
    }
    if (scheduledDate.getTime() < Date.now()) {
      bookingMsg.textContent = 'Please select a future date/time.';
      return;
    }
  }

  bookingMsg.textContent = 'Booking...';

  try {
    const result = await fetchJSON(`${API_BASE}/api/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({
        doctorId,
        mode,
        scheduledAt,
        slotId: selectedSlotId,
        notes,
        patientFullName,
        patientPhone
      })
    });

    if (mode === 'TELE') {
      const link = result?.data?.joinUrl;
      bookingMsg.innerHTML = link
        ? `Tele-consult request sent. <a href="${link}">Open waiting room</a>`
        : 'Tele-consult request sent. Wait for doctor acceptance in Dashboard.';
      setTimeout(() => {
        closeModal();
        location.href = '/patient.html';
      }, 900);
      return;
    }

    bookingMsg.textContent = 'Appointment booked successfully.';
    setTimeout(() => closeModal(), 900);
  } catch (err) {
    bookingMsg.textContent = err.message;
  }
});

loadDoctors().catch((err) => {
  doctorsGrid.innerHTML = `<div class="card">${err.message}</div>`;
});
