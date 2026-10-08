(() => {
  'use strict';

  // ---------- State ----------
  let ROLE = null;
  let TT = null;            // timetable from server
  let DATA = { attendance: {}, deadlines: [] };
  let view = 'overview';
  let selDay = null;        // 'YYYY-MM-DD' for timetable tab
  let attCourse = 'ALL';
  let dlFilter = 'upcoming';
  let loginMode = 'view';
  let COURSE = {};
  const app = document.getElementById('app');

  // ---------- Time helpers (all IST) ----------
  const IST = 'Asia/Kolkata';
  const ms = (d, t) => Date.parse(`${d}T${t}:00+05:30`);
  const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(new Date());
  const addDays = (d, n) => { const x = new Date(`${d}T12:00:00+05:30`); x.setUTCDate(x.getUTCDate() + n); return new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(x); };
  const dow = (d) => new Date(`${d}T12:00:00+05:30`).getUTCDay(); // 0 Sun
  const fmtDay = (d, opts) => new Intl.DateTimeFormat('en-IN', { timeZone: IST, ...opts }).format(new Date(`${d}T12:00:00+05:30`));
  const fmt12 = (t) => { let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')} ${ap}`; };
  const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
  function dur(msLeft) {
    const m = Math.max(0, Math.round(msLeft / 60000));
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), r = m % 60;
    if (h < 24) return r ? `${h}h ${r}m` : `${h}h`;
    const d = Math.round(h / 24);
    return `${d} day${d === 1 ? '' : 's'}`;
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isOwner = () => ROLE === 'owner';

  // ---------- Derived data ----------
  function sessStatus(s, now = Date.now()) {
    const a = ms(s.d, s.s), b = ms(s.d, s.e);
    const present = !!DATA.attendance[s.id];
    if (now < a) return 'upcoming';
    if (now < b) return present ? 'present' : 'live';
    return present ? 'present' : 'absent';
  }

  function courseStats(code, now = Date.now()) {
    const c = COURSE[code];
    const list = TT.sessions.filter((s) => s.c === code);
    let held = 0, present = 0;
    for (const s of list) {
      const ended = ms(s.d, s.e) <= now;
      if (ended) { held++; if (DATA.attendance[s.id]) present++; }
    }
    const missed = held - present;
    const left = c.allowedMisses - missed;
    const pct = held ? Math.round((present / held) * 100) : null;
    return { total: list.length, held, present, missed, left, pct, allowed: c.allowedMisses, remaining: list.length - held };
  }

  const holidaysOn = (d) => TT.holidays.filter((h) => h.d === d);
  const examOn = (d) => TT.exams.find((e) => d >= e.start && d <= e.end);

  // ---------- API ----------
  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
    let json = {};
    try { json = await res.json(); } catch {}
    if (!res.ok) { const e = new Error(json.error || `Request failed (${res.status})`); e.status = res.status; throw e; }
    return json;
  }

  async function load() {
    try {
      const r = await api('/api/state');
      ROLE = r.role; TT = r.timetable; DATA = r.data;
      COURSE = Object.fromEntries(TT.courses.map((c) => [c.code, c]));
      if (!selDay) selDay = defaultDay();
      render();
    } catch (e) {
      if (e.status === 401) { ROLE = null; renderLogin(); }
      else { app.innerHTML = `<div class="wrap"><p class="empty">${esc(e.message)}</p><button class="btn primary" id="retry">Try again</button></div>`; document.getElementById('retry').onclick = load; }
    }
  }

  async function refresh() {
    if (!ROLE || document.hidden || document.querySelector('.scrim')) return;
    try { const r = await api('/api/state'); DATA = r.data; ROLE = r.role; render(); }
    catch (e) { if (e.status === 401) { ROLE = null; renderLogin(); } }
  }

  async function change(body, optimistic) {
    const before = JSON.parse(JSON.stringify(DATA));
    if (optimistic) { optimistic(); render(); }
    try { const r = await api('/api/state', { method: 'POST', body }); DATA = r.data; render(); return true; }
    catch (e) { DATA = before; render(); toast(e.message); return false; }
  }

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---------- Login ----------
  function renderLogin(errMsg = '') {
    const edit = loginMode === 'edit';
    app.innerHTML = `
      <main class="login">
        <div class="mark-big" aria-hidden="true">II</div>
        <h1>Term II</h1>
        <p>${edit ? 'Sign in to mark attendance and add deadlines.' : 'Enter the PIN to see the timetable, attendance and deadlines.'}</p>
        <form id="lf" autocomplete="off">
          <div class="field">
            <label for="sec">${edit ? 'Password' : 'PIN'}</label>
            ${edit
              ? '<input id="sec" class="pw" type="password" autocomplete="current-password" required>'
              : '<input id="sec" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" required>'}
          </div>
          <p class="err" id="lerr">${esc(errMsg)}</p>
          <button class="btn primary" type="submit">${edit ? 'Sign in to edit' : 'Open'}</button>
        </form>
        <button class="switch" id="sw">${edit ? 'Just viewing? Use the PIN' : 'Tharun? Sign in to edit'}</button>
      </main>`;
    const input = document.getElementById('sec');
    input.focus();
    document.getElementById('sw').onclick = () => { loginMode = edit ? 'view' : 'edit'; renderLogin(); };
    document.getElementById('lf').onsubmit = async (ev) => {
      ev.preventDefault();
      const btn = ev.target.querySelector('button'); btn.disabled = true;
      try { await api('/api/login', { method: 'POST', body: { mode: loginMode, secret: input.value } }); await load(); }
      catch (e) { renderLogin(e.message); }
    };
  }

  async function logout() {
    try { await api('/api/logout', { method: 'POST' }); } catch {}
    ROLE = null; loginMode = 'view'; renderLogin();
  }

  // ---------- Shell ----------
  const ICONS = {
    overview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
    timetable: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>',
    attendance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>',
    deadlines: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg>',
  };
  const TAB_LABEL = { overview: 'Overview', timetable: 'Timetable', attendance: 'Attendance', deadlines: 'Deadlines' };

  function render() {
    if (!ROLE || !TT) return;
    const scrollY = window.scrollY;
    const body = { overview: viewOverview, timetable: viewTimetable, attendance: viewAttendance, deadlines: viewDeadlines }[view]();
    app.innerHTML = `
      <div class="wrap">
        <header class="top">
          <div>
            <h1>${esc(TAB_LABEL[view])}</h1>
            <div class="sub">${esc(fmtDay(todayIST(), { weekday: 'long', day: 'numeric', month: 'long' }))}</div>
          </div>
          ${isOwner() ? '' : '<span class="chip view">View only</span>'}
        </header>
        ${body}
        <p class="foot">Term II, PGP 30 Section B. <button data-act="logout">Sign out</button></p>
      </div>
      ${isOwner() && view === 'deadlines' ? '<button class="fab" data-act="add-dl">+ Add deadline</button>' : ''}
      <nav class="tabs" aria-label="Sections">
        ${Object.keys(TAB_LABEL).map((k) => `<button data-tab="${k}" ${view === k ? 'aria-current="page"' : ''}>${ICONS[k]}<span>${TAB_LABEL[k]}</span></button>`).join('')}
      </nav>`;
    window.scrollTo(0, scrollY);
  }

  // ---------- Overview ----------
  function termStrip() {
    const today = todayIST();
    const [mid, end] = TT.exams;
    let count, unit, what, then = '';
    const inExam = examOn(today);
    if (inExam) {
      const dayN = daysBetween(inExam.start, today) + 1, total = daysBetween(inExam.start, inExam.end) + 1;
      count = `Day ${dayN}`; unit = `of ${total}`; what = `${inExam.name} are on`;
      if (inExam.key === 'mid') then = `End-terms start in ${daysBetween(today, end.start)} days`;
    } else if (today < mid.start) {
      const n = daysBetween(today, mid.start); count = n; unit = n === 1 ? 'day' : 'days';
      what = `to midterms (${fmtDay(mid.start, { day: 'numeric', month: 'short' })}–${fmtDay(mid.end, { day: 'numeric', month: 'short' })})`;
      then = `End-terms in ${daysBetween(today, end.start)} days (${fmtDay(end.start, { day: 'numeric', month: 'short' })}–${fmtDay(end.end, { day: 'numeric', month: 'short' })})`;
    } else if (today < end.start) {
      const n = daysBetween(today, end.start); count = n; unit = n === 1 ? 'day' : 'days';
      what = `to end-terms (${fmtDay(end.start, { day: 'numeric', month: 'short' })}–${fmtDay(end.end, { day: 'numeric', month: 'short' })})`;
      then = 'Midterms are done.';
    } else { count = 'Done'; unit = ''; what = 'Term II is over.'; }

    const s = TT.term.start, e = TT.term.end, span = daysBetween(s, e);
    const pos = (d) => Math.min(100, Math.max(0, (daysBetween(s, d) / span) * 100));
    const w = (a, b) => ((daysBetween(a, b) + 1) / span) * 100;
    const tp = pos(today);
    return `
      <section class="term" aria-label="Exam countdown">
        <div class="count">${esc(count)}<small>${esc(unit)}</small></div>
        <div class="what">${esc(what)}</div>
        ${then ? `<div class="then">${esc(then)}</div>` : ''}
        <div class="rail" aria-hidden="true">
          <div class="base"></div>
          <div class="done" style="width:${tp}%"></div>
          ${TT.exams.map((x) => `<div class="exam" style="left:${pos(x.start)}%;width:${w(x.start, x.end)}%"></div>`).join('')}
          ${today >= s && today <= e ? `<div class="today" style="left:${tp}%"></div>` : ''}
        </div>
        <div class="rail-labels"><span>${esc(fmtDay(s, { day: 'numeric', month: 'short' }))}</span><span>${esc(fmtDay(e, { day: 'numeric', month: 'short' }))}</span></div>
      </section>`;
  }

  function nowPanel() {
    const now = Date.now();
    const sorted = TT.sessions;
    const live = sorted.find((s) => ms(s.d, s.s) <= now && now < ms(s.d, s.e));
    const next = sorted.find((s) => ms(s.d, s.s) > now);
    const s = live || next;
    if (!s) return '<div class="empty">No more classes this term.</div>';
    const c = COURSE[s.c];
    const st = sessStatus(s, now);
    const hol = holidaysOn(s.d).filter((h) => h.public);
    let state;
    if (live) state = `<div class="state live">In class now, ends in ${esc(dur(ms(s.d, s.e) - now))}</div>`;
    else state = `<div class="state">Next class ${s.d === todayIST() ? 'today' : esc(fmtDay(s.d, { weekday: 'short', day: 'numeric', month: 'short' }))}, starts in ${esc(dur(ms(s.d, s.s) - now))}</div>`;
    const btns = isOwner() ? `
      <div class="actions">
        ${live ? (st === 'present'
          ? `<button class="btn good" data-act="mark" data-id="${s.id}" data-p="0">Present ✓ (undo)</button>`
          : `<button class="btn primary" data-act="mark" data-id="${s.id}" data-p="1">Mark present</button>`) : ''}
        <button class="btn" data-act="add-dl" data-course="${s.c}">+ Add deadline for ${esc(s.c)}</button>
      </div>` : '';
    return `
      <section class="now" style="--cc:${c.color}">
        ${state}
        <h3>${esc(c.name)}</h3>
        <div class="meta">Session ${s.n} of ${c.sessions}. ${esc(fmt12(s.s))} to ${esc(fmt12(s.e))} in ${esc(s.r)}. ${esc(c.faculty)}</div>
        ${hol.length ? `<div class="flag">⚑ ${esc(hol.map((h) => h.name).join(', '))} (public holiday)</div>` : ''}
        ${btns}
      </section>`;
  }

  function classRow(s, now = Date.now()) {
    const c = COURSE[s.c];
    const st = sessStatus(s, now);
    const label = { present: 'Present', absent: 'Absent', upcoming: 'Upcoming', live: 'Now' }[st];
    const canMark = isOwner() && st !== 'upcoming';
    const toPresent = st === 'present' ? 0 : 1;
    const btn = canMark
      ? `<button class="mark ${st}" data-act="mark" data-id="${s.id}" data-p="${toPresent}" aria-label="${esc(c.code)} session ${s.n}: ${label}. Tap to mark ${toPresent ? 'present' : 'absent'}">${st === 'live' ? 'Mark present' : label}</button>`
      : `<span class="mark ${st}" style="display:inline-flex;align-items:center;justify-content:center">${label}</span>`;
    return `
      <div class="row ${st}" style="--cc:${c.color}">
        <span class="bar"></span>
        <div>
          <div class="t">${esc(c.name)}</div>
          <div class="m"><span class="time">${esc(fmt12(s.s))}–${esc(fmt12(s.e))}</span>, ${esc(s.r)}, session ${s.n}</div>
        </div>
        ${btn}
      </div>`;
  }

  function attendanceRows() {
    return `<div class="list">${TT.courses.map((c) => {
      const st = courseStats(c.code);
      const used = Math.min(st.missed, st.allowed);
      const over = Math.max(0, st.missed - st.allowed);
      const pips = Array.from({ length: st.allowed }, (_, i) => `<span class="pip ${i < used ? 'used' : ''}"></span>`).join('') + Array.from({ length: over }, () => '<span class="pip over"></span>').join('');
      const cls = st.left < 0 ? 'bad' : st.left <= 1 ? 'warn' : 'ok';
      const leftTxt = st.left < 0 ? `${-st.left} over the limit` : `${st.left} of ${st.allowed} misses left`;
      return `
        <button class="att" data-act="open-course" data-course="${c.code}" style="--cc:${c.color}">
          <span class="bar"></span>
          <div>
            <div class="name">${esc(c.name)}</div>
            <div class="pips" aria-label="${esc(leftTxt)}">${pips}<span class="left ${cls}">${esc(leftTxt)}</span></div>
          </div>
          <div class="pct">${st.pct === null ? '–' : `${st.pct}%`}<small>${st.present}/${st.held} held</small></div>
        </button>`;
    }).join('')}</div>`;
  }

  function dueInfo(d) {
    const t = ms(d.due.slice(0, 10), d.due.slice(11, 16));
    const diff = t - Date.now();
    if (d.done) return { cls: 'later', txt: 'Done' };
    if (diff < 0) return { cls: 'over', txt: `Overdue ${dur(-diff)}` };
    if (diff < 48 * 3600e3) return { cls: 'soon', txt: `Due in ${dur(diff)}` };
    return { cls: 'later', txt: fmtDay(d.due.slice(0, 10), { day: 'numeric', month: 'short' }) };
  }

  function deadlineRow(d) {
    const c = COURSE[d.course];
    const color = c ? c.color : 'var(--muted)';
    const due = dueInfo(d);
    const when = `${fmtDay(d.due.slice(0, 10), { weekday: 'short', day: 'numeric', month: 'short' })}, ${fmt12(d.due.slice(11, 16))}`;
    const inner = `
        <div class="t">${esc(d.title)}</div>
        <div class="m">${esc(c ? c.code : 'General')}, ${esc(d.type)}, ${esc(when)}</div>
        ${d.remarks ? `<div class="r">${esc(d.remarks)}</div>` : ''}`;
    return `
      <div class="dl ${d.done ? 'done' : ''}" style="--cc:${color}">
        <span class="bar"></span>
        <button class="tick ${d.done ? 'on' : ''}" ${isOwner() ? `data-act="tick" data-id="${esc(d.id)}" data-done="${d.done ? 0 : 1}"` : 'disabled'} aria-label="${d.done ? 'Mark not done' : 'Mark done'}">${d.done ? '✓' : ''}</button>
        ${isOwner() ? `<button class="open" data-act="edit-dl" data-id="${esc(d.id)}">${inner}</button>` : `<div>${inner}</div>`}
        <div class="due ${due.cls}">${esc(due.txt)}</div>
      </div>`;
  }

  const sortDl = (a, b) => a.due.localeCompare(b.due);

  function viewOverview() {
    const today = todayIST();
    const todays = TT.sessions.filter((s) => s.d === today);
    const upcoming = DATA.deadlines.filter((d) => !d.done).sort(sortDl).slice(0, 5);
    const hol = holidaysOn(today);
    return `
      ${termStrip()}
      ${nowPanel()}
      <div class="sec"><h2>Today's classes</h2>${todays.length ? '' : ''}</div>
      ${hol.length ? `<div class="banner hol">⚑ ${esc(hol.map((h) => h.name + (h.public ? ' (public holiday)' : '')).join(', '))}</div>` : ''}
      ${todays.length ? `<div class="list">${todays.map((s) => classRow(s)).join('')}</div>` : '<div class="empty">No classes today.</div>'}
      <div class="sec"><h2>Attendance</h2><button class="link" data-tab="attendance">See all classes</button></div>
      ${attendanceRows()}
      <div class="sec"><h2>Upcoming deadlines</h2>${isOwner() ? '<button class="link" data-act="add-dl">+ Add</button>' : ''}</div>
      ${upcoming.length ? `<div class="list">${upcoming.map(deadlineRow).join('')}</div>` : `<div class="empty">${isOwner() ? 'No deadlines yet. Add one when a course announces it.' : 'No deadlines right now.'}</div>`}
    `;
  }

  // ---------- Timetable ----------
  function defaultDay() {
    const t = todayIST();
    if (t < TT.term.start) return TT.term.start;
    if (t > TT.term.end) return TT.term.end;
    return t;
  }

  function viewTimetable() {
    const today = todayIST();
    const back = (dow(selDay) + 6) % 7; // Monday start
    const monday = addDays(selDay, -back);
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const strip = days.map((d) => {
      const ses = TT.sessions.filter((s) => s.d === d);
      const ex = examOn(d), hol = holidaysOn(d).some((h) => h.public);
      return `<button class="day ${ex ? 'exam' : ''} ${hol ? 'hol' : ''} ${d === today ? 'today' : ''}" data-act="day" data-d="${d}" aria-pressed="${d === selDay}" aria-label="${esc(fmtDay(d, { weekday: 'long', day: 'numeric', month: 'long' }))}, ${ses.length} classes">
        <span class="dn">${esc(fmtDay(d, { weekday: 'short' }))}</span><span class="dd">${esc(fmtDay(d, { day: 'numeric' }))}</span>
        <span class="dots">${ses.map((s) => `<i style="--cc:${COURSE[s.c].color}"></i>`).join('')}</span>
      </button>`;
    }).join('');
    const ses = TT.sessions.filter((s) => s.d === selDay);
    const ex = examOn(selDay), hols = holidaysOn(selDay);
    const dls = DATA.deadlines.filter((d) => d.due.slice(0, 10) === selDay).sort(sortDl);
    return `
      <div class="seg"><button data-act="jump" data-d="${defaultDay()}">Today</button>
        ${TT.exams.map((x) => `<button data-act="jump" data-d="${x.start}">${esc(x.name)}</button>`).join('')}
      </div>
      <div class="week">
        <button class="nav" data-act="week" data-n="-7" aria-label="Previous week">‹</button>
        ${strip}
        <button class="nav" data-act="week" data-n="7" aria-label="Next week">›</button>
      </div>
      <div class="dayhead">${esc(fmtDay(selDay, { weekday: 'long', day: 'numeric', month: 'long' }))}</div>
      ${ex ? `<div class="banner exam">${esc(ex.name)}, day ${daysBetween(ex.start, selDay) + 1} of ${daysBetween(ex.start, ex.end) + 1}</div>` : ''}
      ${hols.map((h) => `<div class="banner hol">⚑ ${esc(h.name)}${h.public ? ' (public holiday)' : ''}</div>`).join('')}
      ${ses.length ? `<div class="list">${ses.map((s) => classRow(s)).join('')}</div>` : `<div class="empty">${ex ? 'Exam day. No classes.' : 'No classes on this day.'}</div>`}
      ${dls.length ? `<div class="sec"><h2>Due this day</h2></div><div class="list">${dls.map(deadlineRow).join('')}</div>` : ''}
    `;
  }

  // ---------- Attendance ----------
  function viewAttendance() {
    const seg = `<div class="seg">
      <button data-act="att-course" data-course="ALL" aria-pressed="${attCourse === 'ALL'}">All courses</button>
      ${TT.courses.map((c) => `<button data-act="att-course" data-course="${c.code}" aria-pressed="${attCourse === c.code}">${esc(c.code)}</button>`).join('')}
    </div>`;
    if (attCourse === 'ALL') {
      const tot = TT.courses.reduce((a, c) => { const s = courseStats(c.code); a.p += s.present; a.h += s.held; return a; }, { p: 0, h: 0 });
      return `${seg}
        <div class="csum" style="--cc:var(--forest)">
          <h3>All courses</h3>
          <div class="fac">Classes stay Absent until marked Present. Upcoming classes don't count.</div>
          <div class="stats">
            <div><b>${tot.h ? Math.round((tot.p / tot.h) * 100) + '%' : '–'}</b><span>overall</span></div>
            <div><b>${tot.p}</b><span>present</span></div>
            <div><b>${tot.h - tot.p}</b><span>missed</span></div>
          </div>
        </div>
        ${attendanceRows()}`;
    }
    const c = COURSE[attCourse], st = courseStats(attCourse);
    const list = TT.sessions.filter((s) => s.c === attCourse);
    const now = Date.now();
    const past = list.filter((s) => ms(s.d, s.s) <= now).reverse();
    const future = list.filter((s) => ms(s.d, s.s) > now);
    const rowFor = (s) => {
      const r = classRow(s, now);
      return r.replace('<div class="t">' + esc(c.name) + '</div>', `<div class="t">Session ${s.n}, ${esc(fmtDay(s.d, { weekday: 'short', day: 'numeric', month: 'short' }))}</div>`).replace(`, session ${s.n}</div>`, '</div>');
    };
    const leftCls = st.left < 0 ? 'var(--absent)' : st.left <= 1 ? 'var(--amber)' : 'var(--present)';
    return `${seg}
      <div class="csum" style="--cc:${c.color}">
        <h3>${esc(c.name)}</h3>
        <div class="fac">${esc(c.faculty)}. ${c.credits} credits, ${c.sessions} sessions, ${c.allowedMisses} misses allowed.</div>
        <div class="stats">
          <div><b>${st.pct === null ? '–' : st.pct + '%'}</b><span>attendance</span></div>
          <div><b>${st.present}/${st.held}</b><span>present/held</span></div>
          <div><b style="color:${leftCls}">${st.left}</b><span>misses left</span></div>
        </div>
      </div>
      <div class="sec"><h2>Held so far</h2></div>
      ${past.length ? `<div class="list">${past.map(rowFor).join('')}</div>` : '<div class="empty">No classes held yet.</div>'}
      <div class="sec"><h2>Coming up (${future.length})</h2></div>
      ${future.length ? `<div class="list">${future.map(rowFor).join('')}</div>` : '<div class="empty">All sessions done.</div>'}
    `;
  }

  // ---------- Deadlines ----------
  function viewDeadlines() {
    const all = [...DATA.deadlines].sort(sortDl);
    const list = dlFilter === 'upcoming' ? all.filter((d) => !d.done) : dlFilter === 'done' ? all.filter((d) => d.done).reverse() : all;
    const seg = `<div class="seg">
      ${[['upcoming', 'To do'], ['done', 'Done'], ['all', 'All']].map(([k, l]) => `<button data-act="dl-filter" data-f="${k}" aria-pressed="${dlFilter === k}">${l} (${k === 'upcoming' ? all.filter((d) => !d.done).length : k === 'done' ? all.filter((d) => d.done).length : all.length})</button>`).join('')}
    </div>`;
    const empty = dlFilter === 'done' ? 'Nothing ticked off yet.' : isOwner() ? 'No deadlines yet. Tap "+ Add deadline" to add one.' : 'No deadlines right now.';
    return `${seg}${list.length ? `<div class="list">${list.map(deadlineRow).join('')}</div>` : `<div class="empty">${empty}</div>`}`;
  }

  function openDeadlineForm(existing, presetCourse) {
    const d = existing || { course: presetCourse || TT.courses[0].code, title: '', due: '', type: 'Assignment', remarks: '', done: false };
    const date = d.due ? d.due.slice(0, 10) : todayIST();
    const time = d.due ? d.due.slice(11, 16) : '23:59';
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.innerHTML = `
      <form class="sheet" role="dialog" aria-modal="true" aria-labelledby="fh">
        <h2 id="fh">${existing ? 'Edit deadline' : 'Add deadline'}</h2>
        <div class="field"><label for="f-course">Course</label>
          <select id="f-course">${TT.courses.map((c) => `<option value="${c.code}" ${c.code === d.course ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}<option value="GEN" ${d.course === 'GEN' ? 'selected' : ''}>General (not a course)</option></select></div>
        <div class="field"><label for="f-title">Title</label><input id="f-title" maxlength="200" value="${esc(d.title)}" placeholder="e.g. Case write-up: Tata Steel" required></div>
        <div class="two">
          <div class="field"><label for="f-date">Due date</label><input id="f-date" type="date" value="${date}" required></div>
          <div class="field"><label for="f-time">Due time</label><input id="f-time" type="time" value="${time}" required></div>
        </div>
        <div class="field"><label for="f-type">Type</label>
          <select id="f-type">${['Assignment', 'Quiz', 'Project', 'Presentation', 'Other'].map((t) => `<option ${t === d.type ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="field"><label for="f-rem">Remarks</label><textarea id="f-rem" maxlength="1000" placeholder="Group, submission link, word limit…">${esc(d.remarks)}</textarea></div>
        ${existing ? `<label class="check"><input type="checkbox" id="f-done" ${d.done ? 'checked' : ''}> Done</label>` : ''}
        <p class="err" id="ferr"></p>
        <div class="actions">
          ${existing ? '<button type="button" class="btn danger" id="f-del">Delete</button>' : '<span></span>'}
          <div style="display:flex;gap:8px">
            <button type="button" class="btn" id="f-cancel">Cancel</button>
            <button type="submit" class="btn primary">${existing ? 'Save changes' : 'Add deadline'}</button>
          </div>
        </div>
      </form>`;
    document.body.appendChild(scrim);
    document.body.style.overflow = 'hidden';
    const close = () => { scrim.remove(); document.body.style.overflow = ''; };
    scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
    scrim.querySelector('#f-cancel').onclick = close;
    document.addEventListener('keydown', function esc_(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc_); } });
    if (!existing) scrim.querySelector('#f-title').focus();
    if (existing) scrim.querySelector('#f-del').onclick = async () => {
      if (!confirm(`Delete "${d.title}"?`)) return;
      close();
      if (await change({ op: 'deleteDeadline', id: d.id }, () => { DATA.deadlines = DATA.deadlines.filter((x) => x.id !== d.id); })) toast('Deadline deleted');
    };
    scrim.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const payload = {
        id: existing?.id,
        course: scrim.querySelector('#f-course').value,
        title: scrim.querySelector('#f-title').value.trim(),
        due: `${scrim.querySelector('#f-date').value}T${scrim.querySelector('#f-time').value}`,
        type: scrim.querySelector('#f-type').value,
        remarks: scrim.querySelector('#f-rem').value.trim(),
        done: existing ? scrim.querySelector('#f-done').checked : false,
      };
      if (!payload.title) { scrim.querySelector('#ferr').textContent = 'Add a title for the deadline.'; return; }
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(payload.due)) { scrim.querySelector('#ferr').textContent = 'Pick a due date and time.'; return; }
      const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        const r = await api('/api/state', { method: 'POST', body: { op: 'saveDeadline', deadline: payload } });
        DATA = r.data; close(); render(); toast(existing ? 'Changes saved' : 'Deadline added');
      } catch (err) { scrim.querySelector('#ferr').textContent = err.message; btn.disabled = false; }
    };
  }

  // ---------- Events ----------
  app.addEventListener('click', async (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { view = tab.dataset.tab; window.scrollTo(0, 0); render(); return; }
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'logout') return logout();
    if (act === 'mark') {
      if (!isOwner()) return;
      const id = el.dataset.id, p = el.dataset.p === '1';
      await change({ op: 'mark', id, present: p }, () => { if (p) DATA.attendance[id] = true; else delete DATA.attendance[id]; });
      return;
    }
    if (act === 'add-dl') { if (isOwner()) openDeadlineForm(null, el.dataset.course); return; }
    if (act === 'edit-dl') { const d = DATA.deadlines.find((x) => x.id === el.dataset.id); if (d && isOwner()) openDeadlineForm(d); return; }
    if (act === 'tick') {
      if (!isOwner()) return;
      const id = el.dataset.id, done = el.dataset.done === '1';
      await change({ op: 'toggleDone', id, done }, () => { const d = DATA.deadlines.find((x) => x.id === id); if (d) d.done = done; });
      return;
    }
    if (act === 'open-course') { attCourse = el.dataset.course; view = 'attendance'; window.scrollTo(0, 0); render(); return; }
    if (act === 'att-course') { attCourse = el.dataset.course; render(); return; }
    if (act === 'dl-filter') { dlFilter = el.dataset.f; render(); return; }
    if (act === 'day' || act === 'jump') { selDay = el.dataset.d; render(); return; }
    if (act === 'week') { selDay = addDays(selDay, Number(el.dataset.n)); render(); return; }
  });

  setInterval(() => { if (ROLE && !document.querySelector('.scrim')) render(); }, 30000);
  setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

  load();
})();
