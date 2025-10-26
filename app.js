/* Core logic for schedule page */
const TZ = 'Asia/Jakarta';
const fmtDate = (d, opts={}) => new Intl.DateTimeFormat('id-ID', { timeZone: TZ, ...opts }).format(d);
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const bySoonest = (a,b) => new Date(a.start) - new Date(b.start);

const state = {
  events: [],
  now: () => new Date(),
};

function sanitize(text=''){
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function msToParts(ms){
  if (ms < 0) ms = 0;
  const sec = Math.floor(ms/1000);
  const d = Math.floor(sec/86400);
  const h = Math.floor((sec%86400)/3600);
  const m = Math.floor((sec%3600)/60);
  const s = sec%60;
  return {d,h,m,s};
}

function partsToLabel({d,h,m,s}){
  const pad = n => String(n).padStart(2,'0');
  const segs = [];
  if(d) segs.push(`${d} hari`);
  segs.push(`${pad(h)}:${pad(m)}:${pad(s)}`);
  return segs.join(' · ');
}

function renderCountdown(targetISO, el){
  const target = new Date(targetISO);
  function tick(){
    const diff = target - state.now();
    const parts = msToParts(diff);
    el.textContent = partsToLabel(parts);
    if (diff <= 0) {
      clearInterval(timer);
      el.textContent = 'Sedang berlangsung atau akan mulai.';
    }
  }
  tick();
  const timer = setInterval(tick, 1000);
  return timer;
}

function buildCalendarLinks(ev){
  const start = new Date(ev.start);
  const end = ev.end ? new Date(ev.end) : new Date(start.getTime() + 60*60*1000);
  const title = encodeURIComponent(ev.title);
  const details = encodeURIComponent(ev.description || '');
  const location = encodeURIComponent(ev.youtubeUrl || '');

  const gdate = (d) => {
    // format YYYYMMDDTHHMMSSZ (convert from +07:00 to UTC)
    const z = new Date(d);
    const y = z.getUTCFullYear();
    const mo = String(z.getUTCMonth()+1).padStart(2,'0');
    const da = String(z.getUTCDate()).padStart(2,'0');
    const h = String(z.getUTCHours()).padStart(2,'0');
    const mi = String(z.getUTCMinutes()).padStart(2,'0');
    const s = String(z.getUTCSeconds()).padStart(2,'0');
    return `${y}${mo}${da}T${h}${mi}${s}Z`;
  };

  const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${gdate(start)}/${gdate(end)}&details=${details}&location=${location}`;

  const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//YouTube Live Schedule//ID
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:${ev.id || crypto.randomUUID()}
DTSTAMP:${gdate(new Date())}
DTSTART:${gdate(start)}
DTEND:${gdate(end)}
SUMMARY:${ev.title}
DESCRIPTION:${(ev.description || '').replace(/\n/g,'\n')}
URL:${ev.youtubeUrl || ''}
LOCATION:${ev.youtubeUrl || ''}
END:VEVENT
END:VCALENDAR`.replace(/\n/g, "\r\n");

  const icsBlob = new Blob([ics], {type: 'text/calendar'});
  const icsUrl = URL.createObjectURL(icsBlob);
  return { google, icsUrl };
}

function eventItem(ev){
  const start = new Date(ev.start);
  const dateLabel = fmtDate(start, { weekday:'long', day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
  const tags = (ev.tags || []).map(t => `<span class="tag">${sanitize(t)}</span>`).join('');
  const {google, icsUrl} = buildCalendarLinks(ev);
  const li = document.createElement('li');
  li.className = 'event';
  li.innerHTML = `
    <img class="thumb" src="${sanitize(ev.thumbnail || 'images/og-placeholder.png')}" alt="Thumbnail ${sanitize(ev.title)}" loading="lazy">
    <div>
      <h3 class="title">${sanitize(ev.title)}</h3>
      <div class="meta">${dateLabel} WIB</div>
      <div class="tags">${tags}</div>
      <div class="row-actions">
        <a class="btn" href="${google}" target="_blank" rel="noopener">Google Calendar</a>
        <a class="btn" href="${icsUrl}" download="${(ev.id || 'event') + '.ics'}">Unduh ICS</a>
        ${ev.youtubeUrl ? `<a class="btn btn-primary" href="${sanitize(ev.youtubeUrl)}" target="_blank" rel="noopener">Buka di YouTube</a>` : ''}
        ${ev.youtubeUrl ? `<button class="btn watch-here" data-url="${sanitize(ev.youtubeUrl)}" data-title="${sanitize(ev.title)}">Tonton di Sini</button>` : ''}
      </div>
    </div>
    <div class="badge">Durasi: ${ev.end ? Math.round((new Date(ev.end)-start)/60000)+'m' : '—'}</div>
  `;
  li.querySelectorAll('.watch-here').forEach(btn => {
    btn.addEventListener('click', () => openPlayer(btn.dataset.url, btn.dataset.title));
  });
  return li;
}

function renderLists(){
  const now = state.now();
  const upcoming = state.events.filter(e => new Date(e.start) >= now).sort(bySoonest);
  const past = state.events.filter(e => new Date(e.start) < now).sort((a,b)=> new Date(b.start)-new Date(a.start));

  const upList = $('#upcoming-list');
  const paList = $('#past-list');
  upList.innerHTML = '';
  paList.innerHTML = '';
  upcoming.forEach(e => upList.appendChild(eventItem(e)));
  past.forEach(e => paList.appendChild(eventItem(e)));

  // Search filters
  const filter = (input, list, source) => {
    input.addEventListener('input', () => {
      const q = input.value.toLowerCase();
      list.innerHTML = '';
      source.forEach(e => {
        const hay = [e.title, e.description, ...(e.tags || [])].join(' ').toLowerCase();
        if (hay.includes(q)) list.appendChild(eventItem(e));
      });
    });
  };
  filter($('#search-upcoming'), upList, upcoming);
  filter($('#search-past'), paList, past);

  // Next live card
  renderNextLive(upcoming);
}

function renderNextLive(upcoming){
  const wrap = $('#next-live-content');
  wrap.innerHTML = '';
  if (!upcoming.length){
    wrap.innerHTML = '<p>Tidak ada jadwal mendatang. Silakan cek kembali nanti.</p>';
    return;
  }
  const next = upcoming[0];
  const start = new Date(next.start);
  const dateLabel = fmtDate(start, { weekday:'long', day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });

  const box = document.createElement('div');
  box.innerHTML = `
    <h3 class="title">${sanitize(next.title)}</h3>
    <div class="next-meta">
      <span>${dateLabel} WIB</span>
      <span class="badge">Status: ${sanitize(next.status || 'upcoming')}</span>
    </div>
    <div class="countdown" id="countdown">00:00:00</div>
    <div class="actions">
      ${next.youtubeUrl ? `<a class="btn btn-primary" href="${sanitize(next.youtubeUrl)}" target="_blank" rel="noopener">Tonton di YouTube</a>` : ''}
      ${next.youtubeUrl ? `<button id="watchHere" class="btn">Tonton di Sini</button>` : ''}
    </div>
  `;
  wrap.appendChild(box);
  const cEl = $('#countdown');
  renderCountdown(next.start, cEl);

  if (next.youtubeUrl){
    $('#watchHere')?.addEventListener('click', () => openPlayer(next.youtubeUrl, next.title));
  }
}

function openPlayer(url, title){
  const dialog = document.getElementById('playerDialog');
  const wrap = document.getElementById('playerWrap');
  document.getElementById('playerTitle').textContent = title || 'Menonton';
  wrap.innerHTML = '';
  // Lazy create iframe
  const iframe = document.createElement('iframe');
  // Convert youtube watch to embed if needed
  const embedUrl = url.includes('/live/') || url.includes('youtu.be') || url.includes('watch')
    ? toEmbed(url) : url;
  iframe.src = embedUrl;
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  wrap.appendChild(iframe);
  dialog.showModal();
}

function toEmbed(url){
  try{
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.slice(1);
      return `https://www.youtube.com/embed/${id}?autoplay=1`;
    }
    const id = u.searchParams.get('v');
    if (id) return `https://www.youtube.com/embed/${id}?autoplay=1`;
    // live url pattern: /live/VIDEO_ID
    const parts = u.pathname.split('/').filter(Boolean);
    const liveIdx = parts.indexOf('live');
    if (liveIdx !== -1 && parts[liveIdx+1]) {
      return `https://www.youtube.com/embed/${parts[liveIdx+1]}?autoplay=1`;
    }
  }catch{}
  return url;
}

async function load(){
  try{
    const res = await fetch('events.json', {cache:'no-store'});
    const data = await res.json();
    state.events = Array.isArray(data) ? data : [];
    renderLists();
  }catch(e){
    console.error(e);
    $('#next-live-content').innerHTML = '<p>Gagal memuat events.json. Pastikan file tersedia.</p>';
  }
  $('#year').textContent = new Date().getFullYear();
  $('#closeDialog').addEventListener('click', () => {
    document.getElementById('playerDialog').close();
    document.getElementById('playerWrap').innerHTML = '';
  });
}
document.addEventListener('DOMContentLoaded', load);
