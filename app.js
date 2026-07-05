/* ============================================
   유령집사의 공부방 — app.js
   ============================================ */

const STORAGE_KEY = 'ghostStudyApp_v1';
const WEEKDAY_LABELS = ['일','월','화','수','목','금','토']; // JS getDay() index 0-6
const KOR_WEEKDAY_ORDER = [1,2,3,4,5,6,0]; // 월~일 표시 순서 (getDay 기준)

const MASCOT_IMG = 'assets/mascot.png';
const SHOP_ITEMS = [
  { id:'g1', type:'ghost', img:MASCOT_IMG, filter:'none', name:'기본 구름이', price:0 },
  { id:'g2', type:'ghost', img:MASCOT_IMG, filter:'hue-rotate(300deg) saturate(1.6)', name:'핑크 구름이', price:30 },
  { id:'g3', type:'ghost', img:MASCOT_IMG, filter:'hue-rotate(130deg) saturate(1.4)', name:'민트 구름이', price:30 },
  { id:'g4', type:'ghost', img:MASCOT_IMG, filter:'hue-rotate(200deg) saturate(1.6)', accessory:'🎀', name:'리본 블루 구름이', price:50 },
  { id:'g5', type:'ghost', img:MASCOT_IMG, filter:'sepia(0.6) hue-rotate(-20deg) saturate(2)', accessory:'🕶️', name:'선글라스 골드 구름이', price:80 },
  { id:'g6', type:'ghost', img:MASCOT_IMG, filter:'invert(0.85) hue-rotate(180deg)', accessory:'👑', name:'왕관 블랙 구름이', price:80 },
  { id:'d1', type:'deco', emoji:'🪴', name:'화분', price:20 },
  { id:'d2', type:'deco', emoji:'🕯️', name:'촛불', price:20 },
  { id:'d3', type:'deco', emoji:'📚', name:'책더미', price:25 },
  { id:'d4', type:'deco', emoji:'🖼️', name:'액자', price:25 },
  { id:'d5', type:'deco', emoji:'🛋️', name:'소파', price:40 },
  { id:'d6', type:'deco', emoji:'🎐', name:'풍경', price:35 },
  { id:'d7', type:'deco', emoji:'🕰️', name:'괘종시계', price:45 },
  { id:'d8', type:'deco', emoji:'🧸', name:'곰인형', price:30 },
];
const MAX_DECO_SLOTS = 3;

const AFFIRMATIONS = [
  '오늘의 나는 어제보다 조금 더 단단해요.',
  '천천히 가도 괜찮아, 멈추지만 않으면 돼.',
  '비 오는 날엔 집중이 더 잘 돼요.',
  '작은 발걸음도 매일 조금씩 쌓여가요.',
  '지금 이 순간의 노력이 쌓이고 있어요.'
];

/* ---------------- 데이터 ---------------- */
function defaultData(){
  return {
    coins: 0,
    todos: [],          // {id, text, type:'once'|'repeat', date, repeatDays:[], createdDate, completions:{dateKey:{done:true, coinCredited:false}}}
    timetable: [],       // {id, day, time, subject, alarm, lastFiredDate}
    owned: ['g1'],
    equipped: { ghost:'g1', decos: [] },
    studyLog: {},         // dateKey -> minutes
    pomodoroCount: 0,
    customAffirmation: '',
    ddayList: [],         // {id, label, date}
    noiseSettings: { type:'rain', volume:0.4 }
  };
}

let data = loadData();

function loadData(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultData();
    const parsed = JSON.parse(raw);
    return Object.assign(defaultData(), parsed);
  }catch(e){
    console.error('load error', e);
    return defaultData();
  }
}
function saveData(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/* ---------------- 날짜 유틸 ---------------- */
function todayKey(d = new Date()){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function keyToDate(key){
  const [y,m,d] = key.split('-').map(Number);
  return new Date(y, m-1, d);
}
function addDays(dateKey, n){
  const d = keyToDate(dateKey);
  d.setDate(d.getDate()+n);
  return todayKey(d);
}
function weekdayOfKey(key){
  return keyToDate(key).getDay();
}
function nowHM(){
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

/* ---------------- 할일 로직 ---------------- */
function isTodoDueOn(todo, dateKey){
  if(todo.type === 'once') return todo.date === dateKey;
  if(todo.type === 'repeat'){
    if(dateKey < todo.createdDate) return false;
    return todo.repeatDays.includes(weekdayOfKey(dateKey));
  }
  return false;
}
function getTodosDueOn(dateKey){
  return data.todos.filter(t => isTodoDueOn(t, dateKey));
}
function getCompletionRate(dateKey){
  const due = getTodosDueOn(dateKey);
  if(due.length === 0) return null;
  const done = due.filter(t => t.completions[dateKey]?.done).length;
  return { done, total: due.length, rate: Math.round((done/due.length)*100) };
}

let justCompletedId = null;

function toggleTodoComplete(id, dateKey){
  const today = todayKey();
  dateKey = dateKey || today;
  if(dateKey !== today){ showToast('할일은 당일에만 체크할 수 있어요'); return; }
  const todo = data.todos.find(t => t.id === id);
  if(!todo) return;
  if(!isTodoDueOn(todo, dateKey)) return; // 그 날짜 할일이 아니면 무시

  if(todo.completions[dateKey]?.done){
    delete todo.completions[dateKey];
  } else {
    todo.completions[dateKey] = { done:true, coinCredited:false };
    justCompletedId = id;
  }
  saveData();
  renderTodo();
}

function deleteTodo(id){
  data.todos = data.todos.filter(t => t.id !== id);
  saveData();
  renderTodo();
}

function processCoinCredits(){
  const today = todayKey();
  let credited = 0;
  data.todos.forEach(todo => {
    Object.keys(todo.completions).forEach(dateKey => {
      const c = todo.completions[dateKey];
      if(c.done && !c.coinCredited && dateKey < today){
        data.coins += 1;
        c.coinCredited = true;
        credited += 1;
      }
    });
  });
  if(credited > 0){
    saveData();
    showToast(`🪙 완료한 할일 코인 ${credited}개가 적립되었어요!`);
  }
}

/* ---------------- 코인/상점 ---------------- */
function purchaseItem(itemId){
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if(!item) return;
  if(data.owned.includes(itemId)){ return; }
  if(data.coins < item.price){ showToast('코인이 부족해요 🪙'); return; }
  data.coins -= item.price;
  data.owned.push(itemId);
  saveData();
  showToast(`${item.emoji} ${item.name} 구매 완료!`);
  renderShop();
  updateCoinBadge();
}
function equipItem(itemId){
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if(!item || !data.owned.includes(itemId)) return;
  if(item.type === 'ghost'){
    data.equipped.ghost = itemId;
  } else {
    const decos = data.equipped.decos;
    const idx = decos.indexOf(itemId);
    if(idx >= 0){
      decos.splice(idx,1);
    } else {
      if(decos.length >= MAX_DECO_SLOTS){
        showToast(`방 꾸미기는 최대 ${MAX_DECO_SLOTS}개까지 놓을 수 있어요`);
        return;
      }
      decos.push(itemId);
    }
  }
  saveData();
  renderShop();
  renderHome();
}

/* ---------------- 타이머 ---------------- */
const timer = {
  mode: 'pomodoro',        // 'pomodoro' | 'basic'
  phase: 'work',           // pomodoro: 'work' | 'break'
  running: false,
  pomWorkSec: 25*60,
  pomBreakSec: 5*60,
  remaining: 25*60,
  basicElapsed: 0,
  intervalId: null
};

function timerFormat(sec){
  const m = Math.floor(sec/60);
  const s = sec % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function startTimer(){
  if(timer.running) return;
  timer.running = true;
  timer.intervalId = setInterval(tickTimer, 1000);
}
function pauseTimer(){
  timer.running = false;
  clearInterval(timer.intervalId);
}
function resetTimer(){
  pauseTimer();
  if(timer.mode === 'pomodoro'){
    timer.phase = 'work';
    timer.remaining = timer.pomWorkSec;
  } else {
    timer.basicElapsed = 0;
  }
  updateTimerDOM();
}
function switchTimerMode(mode){
  pauseTimer();
  timer.mode = mode;
  timer.phase = 'work';
  timer.remaining = timer.pomWorkSec;
  timer.basicElapsed = 0;
  renderHome();
}
function logStudyMinutes(min){
  if(min <= 0) return;
  const today = todayKey();
  data.studyLog[today] = (data.studyLog[today] || 0) + min;
  saveData();
}
function tickTimer(){
  if(timer.mode === 'pomodoro'){
    timer.remaining -= 1;
    if(timer.remaining <= 0){
      if(timer.phase === 'work'){
        logStudyMinutes(25);
        data.pomodoroCount += 1;
        saveData();
        timer.phase = 'break';
        timer.remaining = timer.pomBreakSec;
        showToast('🍅 한 뽀모도로 완료! 5분 휴식할게요');
      } else {
        timer.phase = 'work';
        timer.remaining = timer.pomWorkSec;
        showToast('휴식 끝! 다시 집중해볼까요? 🐕');
      }
    }
  } else {
    timer.basicElapsed += 1;
  }
  updateTimerDOM();
}
function stopBasicAndLog(){
  const min = Math.floor(timer.basicElapsed/60);
  pauseTimer();
  if(min > 0) logStudyMinutes(min);
  timer.basicElapsed = 0;
  showToast(min > 0 ? `공부 시간 ${min}분이 기록되었어요` : '기록할 시간이 없어요');
  updateTimerDOM();
  renderStats();
}
function updateTimerDOM(){
  const disp = document.getElementById('timerDisplay');
  if(!disp) return; // 홈 탭이 아니면 스킵
  const numEl = disp.querySelector('.timer-num');
  const sub = document.getElementById('timerSub');
  if(timer.mode === 'pomodoro'){
    if(numEl) numEl.textContent = timerFormat(timer.remaining);
    if(sub) sub.textContent = timer.phase === 'work' ? '집중' : '휴식';
  } else {
    if(numEl) numEl.textContent = timerFormat(timer.basicElapsed);
  }
}

/* ---------------- 백색소음 / 빗소리 ---------------- */
const noise = {
  ctx: null,
  source: null,
  gain: null,
  playing: false,
  type: data.noiseSettings.type,
  volume: data.noiseSettings.volume
};

function makeNoiseBuffer(ctx){
  const bufferSize = 2 * ctx.sampleRate;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = buffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++){ output[i] = Math.random()*2 - 1; }
  return buffer;
}
function stopNoiseNodes(){
  if(noise.source){
    try{ noise.source.stop(); }catch(e){}
    noise.source.disconnect();
    noise.source = null;
  }
}
function startNoise(){
  if(!noise.ctx){
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx){ showToast('이 브라우저는 오디오를 지원하지 않아요'); return; }
    noise.ctx = new Ctx();
  }
  if(noise.ctx.state === 'suspended') noise.ctx.resume();
  stopNoiseNodes();

  const ctx = noise.ctx;
  const source = ctx.createBufferSource();
  source.buffer = makeNoiseBuffer(ctx);
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  if(noise.type === 'rain'){
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.6;
  } else {
    filter.type = 'allpass';
  }

  const gain = ctx.createGain();
  gain.gain.value = noise.volume;

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start();

  noise.source = source;
  noise.gain = gain;
  noise.playing = true;
}
function toggleNoise(){
  if(noise.playing){
    stopNoiseNodes();
    noise.playing = false;
  } else {
    startNoise();
  }
  renderHome();
}
function setNoiseType(type){
  noise.type = type;
  data.noiseSettings.type = type;
  saveData();
  if(noise.playing) startNoise();
}
function setNoiseVolume(v){
  noise.volume = v;
  data.noiseSettings.volume = v;
  if(noise.gain) noise.gain.gain.value = v;
  saveData();
}

/* ---------------- 시간표 / 알람 ---------------- */
function addTimetableItem(day, time, subject, alarm){
  data.timetable.push({
    id: 'tt_' + Date.now(),
    day: Number(day),
    time,
    subject,
    alarm,
    lastFiredDate: null
  });
  saveData();
  renderTimetable();
}
function deleteTimetableItem(id){
  data.timetable = data.timetable.filter(t => t.id !== id);
  saveData();
  renderTimetable();
}
function toggleTimetableAlarm(id){
  const item = data.timetable.find(t => t.id === id);
  if(!item) return;
  item.alarm = !item.alarm;
  saveData();
  renderTimetable();
}

let notifPermissionAsked = false;
function requestNotifPermission(){
  if(!('Notification' in window)){
    showToast('이 브라우저는 알림을 지원하지 않아요');
    return;
  }
  Notification.requestPermission().then(perm => {
    if(perm === 'granted') showToast('알림이 켜졌어요 🔔');
    else showToast('알림 권한이 거부되었어요');
    renderTimetable();
  });
}

function checkScheduleAlarms(){
  const now = new Date();
  const today = todayKey(now);
  const hm = nowHM();
  const day = now.getDay();
  data.timetable.forEach(item => {
    if(item.alarm && item.day === day && item.time === hm && item.lastFiredDate !== today){
      item.lastFiredDate = today;
      fireAlarm(item.subject, item.time);
    }
  });
  saveData();
}
function fireAlarm(subject, time){
  showToast(`🔔 ${time} — "${subject}" 시간이에요!`);
  if('Notification' in window && Notification.permission === 'granted'){
    try{
      new Notification('유령집사의 공부방', { body: `${time} — ${subject} 시간이에요!` });
    }catch(e){}
  }
  if(navigator.vibrate) navigator.vibrate([200,100,200]);
}

/* ---------------- 렌더링 ---------------- */
let currentTab = 'home';

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._tid);
  showToast._tid = setTimeout(()=> t.classList.remove('show'), 2400);
}
function updateCoinBadge(){
  document.getElementById('coinAmount').textContent = data.coins;
}

const HOME_SCENE_IMG = 'assets/home-scene.png';

function updateClockOverlay(){
  const el = document.getElementById('sceneClock');
  if(!el) return;
  const now = new Date();
  let h = now.getHours();
  const ampm = h >= 12 ? '오후' : '오전';
  h = h % 12; if(h === 0) h = 12;
  const m = String(now.getMinutes()).padStart(2,'0');
  el.innerHTML = `<span class="clock-ampm">${ampm}</span><span class="clock-time">${h}:${m}</span>`;
}

function renderHome(){
  const today = todayKey();

  document.getElementById('mainView').innerHTML = `
    <div class="scene-card">
      <img src="${HOME_SCENE_IMG}" class="scene-img" alt="공부방 풍경">
      <div class="scene-clock" id="sceneClock"></div>
      <div class="scene-timer-overlay" id="timerDisplay">
        <div class="timer-num">${timer.mode==='pomodoro' ? timerFormat(timer.remaining) : timerFormat(timer.basicElapsed)}</div>
        <div class="timer-cap" id="timerSub">${timer.mode==='pomodoro' ? (timer.phase==='work' ? '집중' : '휴식') : '경과'}</div>
      </div>
    </div>

    <div class="card home-controls">
      <div class="home-controls-col">
        <div class="timer-modes">
          <button class="mode-btn ${timer.mode==='pomodoro'?'active':''}" id="modePomodoro">뽀모도로</button>
          <button class="mode-btn ${timer.mode==='basic'?'active':''}" id="modeBasic">기본 타이머</button>
        </div>
        <div class="timer-controls">
          ${timer.running
            ? `<button class="btn btn-ghost btn-block" id="btnPause">일시정지</button>`
            : `<button class="btn btn-primary btn-block" id="btnStart">시작</button>`}
          ${timer.mode==='basic'
            ? `<button class="btn btn-danger" id="btnStopLog">정지·기록</button>`
            : `<button class="btn btn-ghost" id="btnReset">리셋</button>`}
        </div>
        <div class="muted" style="margin-top:10px;">오늘 뽀모도로 ${data.pomodoroCount}회 · 오늘 공부 ${data.studyLog[today]||0}분</div>
      </div>
      <div class="home-controls-col noise-col">
        <div class="section-title" style="margin-bottom:8px;">🎧 백색소음</div>
        <div class="noise-row" style="margin-top:0; padding-top:0; border-top:none;">
          <button class="btn btn-ghost btn-sm" id="btnNoiseToggle">${noise.playing ? '⏸ 소리끄기' : '▶ 재생'}</button>
          <select class="noise-select" id="noiseType">
            <option value="rain" ${noise.type==='rain'?'selected':''}>🌧️ 빗소리</option>
            <option value="white" ${noise.type==='white'?'selected':''}>📻 화이트노이즈</option>
          </select>
          <input type="range" id="noiseVolume" min="0" max="1" step="0.05" value="${noise.volume}">
        </div>
      </div>
    </div>
  `;

  updateClockOverlay();

  document.getElementById('modePomodoro').onclick = () => switchTimerMode('pomodoro');
  document.getElementById('modeBasic').onclick = () => switchTimerMode('basic');
  if(timer.running){
    document.getElementById('btnPause').onclick = () => { pauseTimer(); renderHome(); };
  } else {
    document.getElementById('btnStart').onclick = () => { startTimer(); renderHome(); };
  }
  if(timer.mode === 'basic'){
    document.getElementById('btnStopLog').onclick = stopBasicAndLog;
  } else {
    document.getElementById('btnReset').onclick = () => { resetTimer(); renderHome(); };
  }

  document.getElementById('btnNoiseToggle').onclick = toggleNoise;
  document.getElementById('noiseType').onchange = (e) => setNoiseType(e.target.value);
  document.getElementById('noiseVolume').oninput = (e) => setNoiseVolume(Number(e.target.value));
}

let calendarViewMonth = new Date(); // 현재 달력에 보여지는 달
let selectedDate = todayKey();       // 달력에서 선택된 날짜

function daysInMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0).getDate(); }

function renderCalendar(){
  const y = calendarViewMonth.getFullYear();
  const m = calendarViewMonth.getMonth();
  const firstWeekday = new Date(y, m, 1).getDay();
  const totalDays = daysInMonth(calendarViewMonth);
  const today = todayKey();

  let cells = '';
  for(let i=0;i<firstWeekday;i++) cells += `<div class="cal-cell blank"></div>`;
  for(let day=1; day<=totalDays; day++){
    const dateKey = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const rate = getCompletionRate(dateKey);
    let dotClass = '';
    if(rate){
      dotClass = rate.rate === 100 ? 'dot-full' : (rate.done > 0 ? 'dot-partial' : 'dot-none');
    }
    const classes = ['cal-cell'];
    if(dateKey === today) classes.push('today');
    if(dateKey === selectedDate) classes.push('selected');
    cells += `<div class="${classes.join(' ')}" data-date="${dateKey}">
      <span class="cal-daynum">${day}</span>
      ${rate ? `<span class="cal-dot ${dotClass}"></span>` : ''}
    </div>`;
  }

  return `
    <div class="card">
      <div class="cal-header">
        <button class="btn btn-ghost btn-sm" id="calPrev">◀</button>
        <div class="cal-title">${y}년 ${m+1}월</div>
        <button class="btn btn-ghost btn-sm" id="calNext">▶</button>
      </div>
      <div class="cal-grid cal-weekday-row">
        ${WEEKDAY_LABELS.map(l => `<div class="cal-cell-label">${l}</div>`).join('')}
      </div>
      <div class="cal-grid">${cells}</div>
      <div class="cal-legend">
        <span><i class="cal-dot dot-full"></i>완료</span>
        <span><i class="cal-dot dot-partial"></i>일부</span>
        <span><i class="cal-dot dot-none"></i>미완료</span>
      </div>
    </div>`;
}

function renderTodo(){
  const today = todayKey();
  const dueSelected = getTodosDueOn(selectedDate);
  const rate = getCompletionRate(selectedDate);
  const isToday = selectedDate === today;
  const dateLabel = `${selectedDate} (${WEEKDAY_LABELS[weekdayOfKey(selectedDate)]})${isToday ? ' · 오늘' : ''}`;

  function todoRow(t){
    const isDone = !!t.completions[selectedDate]?.done;
    const highlight = (justCompletedId === t.id && isDone);
    const metaText = t.type === 'repeat'
      ? '반복: ' + t.repeatDays.slice().sort().map(d=>WEEKDAY_LABELS[d]).join(',')
      : t.date;
    return `
      <div class="todo-item">
        <div class="todo-check ${isDone?'done':''} ${isToday?'':'locked'}" data-id="${t.id}">${isDone?'✓':''}</div>
        <div style="flex:1;">
          <div class="todo-text ${highlight?'done-hl':''}">${escapeHtml(t.text)}</div>
          <div class="todo-meta">${metaText}</div>
        </div>
        <button class="todo-del" data-del="${t.id}">✕</button>
      </div>`;
  }
  justCompletedId = null; // 애니메이션 1회만 재생

  document.getElementById('mainView').innerHTML = `
    ${renderCalendar()}

    <div class="card">
      <div class="section-title">📅 ${dateLabel}</div>
      ${rate ? `
      <div class="progress-wrap">
        <div class="progress-top"><span>${rate.done} / ${rate.total} 완료</span><span>${rate.rate}%</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${rate.rate}%"></div></div>
      </div>` : `<div class="empty-state">이 날짜엔 할일이 없어요</div>`}
      ${!isToday && dueSelected.length ? `<div class="muted" style="text-align:center; margin-top:8px;">체크는 오늘만 가능해요</div>` : ''}
      <div class="todo-list">
        ${dueSelected.map(todoRow).join('')}
      </div>
    </div>

    <div class="card">
      <div class="section-title">➕ 할일 추가</div>
      <div class="type-toggle">
        <button class="type-btn active" id="typeOnce">한 번</button>
        <button class="type-btn" id="typeRepeat">반복</button>
      </div>
      <input class="input" id="todoText" placeholder="할일을 입력하세요" style="margin-top:10px;">
      <div id="onceFields">
        <input class="input" type="date" id="todoDate" value="${selectedDate}" style="margin-top:10px;">
      </div>
      <div id="repeatFields" style="display:none; margin-top:10px;">
        <div class="repeat-days" id="repeatDays">
          ${KOR_WEEKDAY_ORDER.map(d => `<div class="day-chip" data-day="${d}">${WEEKDAY_LABELS[d]}</div>`).join('')}
        </div>
      </div>
      <button class="btn btn-primary btn-block" id="btnAddTodo" style="margin-top:12px;">추가하기</button>
    </div>
  `;

  document.getElementById('calPrev').onclick = () => {
    calendarViewMonth.setMonth(calendarViewMonth.getMonth()-1);
    renderTodo();
  };
  document.getElementById('calNext').onclick = () => {
    calendarViewMonth.setMonth(calendarViewMonth.getMonth()+1);
    renderTodo();
  };
  document.querySelectorAll('.cal-cell[data-date]').forEach(el => {
    el.onclick = () => { selectedDate = el.dataset.date; renderTodo(); };
  });

  document.querySelectorAll('.todo-check').forEach(el => {
    el.onclick = () => toggleTodoComplete(el.dataset.id, selectedDate);
  });
  document.querySelectorAll('[data-del]').forEach(el => {
    el.onclick = () => { if(confirm('이 할일을 삭제할까요?')) deleteTodo(el.dataset.del); };
  });

  let addType = 'once';
  let selectedDays = new Set();
  document.getElementById('typeOnce').onclick = () => {
    addType = 'once';
    document.getElementById('typeOnce').classList.add('active');
    document.getElementById('typeRepeat').classList.remove('active');
    document.getElementById('onceFields').style.display = '';
    document.getElementById('repeatFields').style.display = 'none';
  };
  document.getElementById('typeRepeat').onclick = () => {
    addType = 'repeat';
    document.getElementById('typeRepeat').classList.add('active');
    document.getElementById('typeOnce').classList.remove('active');
    document.getElementById('onceFields').style.display = 'none';
    document.getElementById('repeatFields').style.display = '';
  };
  document.querySelectorAll('.day-chip').forEach(chip => {
    chip.onclick = () => {
      const d = Number(chip.dataset.day);
      if(selectedDays.has(d)){ selectedDays.delete(d); chip.classList.remove('sel'); }
      else { selectedDays.add(d); chip.classList.add('sel'); }
    };
  });
  document.getElementById('btnAddTodo').onclick = () => {
    const text = document.getElementById('todoText').value.trim();
    if(!text){ showToast('할일 내용을 입력해주세요'); return; }
    if(addType === 'once'){
      const date = document.getElementById('todoDate').value || selectedDate;
      data.todos.push({ id:'td_'+Date.now(), text, type:'once', date, createdDate:today, completions:{} });
    } else {
      if(selectedDays.size === 0){ showToast('반복 요일을 선택해주세요'); return; }
      data.todos.push({ id:'td_'+Date.now(), text, type:'repeat', repeatDays:[...selectedDays], createdDate:today, completions:{} });
    }
    saveData();
    renderTodo();
  };
}

let selectedTTId = null;

function renderTimetable(){
  let minHour = 8, maxHour = 21;
  data.timetable.forEach(it => {
    const h = parseInt(it.time.split(':')[0], 10);
    if(h < minHour) minHour = h;
    if(h > maxHour) maxHour = h;
  });
  const hours = [];
  for(let h=minHour; h<=maxHour; h++) hours.push(h);

  const todayWeekday = new Date().getDay();

  function itemsAt(day, hour){
    return data.timetable.filter(it => it.day === day && parseInt(it.time.split(':')[0],10) === hour);
  }

  let gridHtml = `<div class="tt-grid">`;
  gridHtml += `<div class="tt-grid-cell tt-grid-header"></div>`;
  KOR_WEEKDAY_ORDER.forEach(d => {
    gridHtml += `<div class="tt-grid-cell tt-grid-header ${d===todayWeekday?'tt-today-col':''}">${WEEKDAY_LABELS[d]}</div>`;
  });
  hours.forEach(h => {
    gridHtml += `<div class="tt-grid-cell tt-grid-time">${String(h).padStart(2,'0')}:00</div>`;
    KOR_WEEKDAY_ORDER.forEach(d => {
      const items = itemsAt(d, h);
      gridHtml += `<div class="tt-grid-cell ${d===todayWeekday?'tt-today-col':''}">
        ${items.map(it => `<div class="tt-grid-item ${it.alarm?'alarm-on':''} ${selectedTTId===it.id?'sel':''}" data-select="${it.id}">${escapeHtml(it.subject)}<br><span style="opacity:.7">${it.time}</span></div>`).join('')}
      </div>`;
    });
  });
  gridHtml += `</div>`;

  const selectedItem = data.timetable.find(t => t.id === selectedTTId);
  const detailHtml = selectedItem ? `
    <div class="card">
      <div class="section-title">${escapeHtml(selectedItem.subject)}</div>
      <div class="muted">${WEEKDAY_LABELS[selectedItem.day]}요일 · ${selectedItem.time}</div>
      <div style="display:flex; gap:8px; margin-top:12px;">
        <button class="btn btn-ghost" id="btnToggleAlarmSel">${selectedItem.alarm?'🔔 알람 켜짐':'🔕 알람 꺼짐'}</button>
        <button class="btn btn-danger" id="btnDeleteSel">삭제</button>
      </div>
    </div>` : '';

  const permBanner = ('Notification' in window && Notification.permission !== 'granted')
    ? `<button class="btn btn-ghost btn-block" id="btnNotifPerm" style="margin-bottom:12px;">🔔 알림 권한 허용하기</button>`
    : '';

  document.getElementById('mainView').innerHTML = `
    <div class="card">
      <div class="section-title">🗓️ 시간표</div>
      ${permBanner}
      ${gridHtml}
      <div class="muted" style="margin-top:8px; text-align:center;">수업을 탭하면 상세정보가 보여요</div>
    </div>

    ${detailHtml}

    <div class="card">
      <div class="section-title">➕ 수업 추가</div>
      <select class="input" id="ttDay">
        ${KOR_WEEKDAY_ORDER.map(d => `<option value="${d}">${WEEKDAY_LABELS[d]}요일</option>`).join('')}
      </select>
      <input class="input" type="time" id="ttTime" value="09:00" style="margin-top:10px;">
      <input class="input" id="ttSubject" placeholder="과목명 (예: 수학)" style="margin-top:10px;">
      <label style="display:flex; align-items:center; gap:8px; margin-top:10px; font-size:13px; color:var(--muted);">
        <input type="checkbox" id="ttAlarm" checked style="width:16px;height:16px;"> 알람 울리기
      </label>
      <button class="btn btn-primary btn-block" id="btnAddTT" style="margin-top:12px;">추가하기</button>
    </div>
  `;

  const permBtn = document.getElementById('btnNotifPerm');
  if(permBtn) permBtn.onclick = requestNotifPermission;

  document.querySelectorAll('[data-select]').forEach(el => {
    el.onclick = () => { selectedTTId = (selectedTTId === el.dataset.select) ? null : el.dataset.select; renderTimetable(); };
  });
  const btnToggle = document.getElementById('btnToggleAlarmSel');
  if(btnToggle) btnToggle.onclick = () => toggleTimetableAlarm(selectedTTId);
  const btnDel = document.getElementById('btnDeleteSel');
  if(btnDel) btnDel.onclick = () => { const id = selectedItem.id; selectedTTId = null; deleteTimetableItem(id); };

  document.getElementById('btnAddTT').onclick = () => {
    const subject = document.getElementById('ttSubject').value.trim();
    if(!subject){ showToast('과목명을 입력해주세요'); return; }
    addTimetableItem(
      document.getElementById('ttDay').value,
      document.getElementById('ttTime').value,
      subject,
      document.getElementById('ttAlarm').checked
    );
  };
}

function renderShop(){
  const ghosts = SHOP_ITEMS.filter(i => i.type === 'ghost');
  const decos = SHOP_ITEMS.filter(i => i.type === 'deco');

  function itemCard(item){
    const owned = data.owned.includes(item.id);
    const equipped = item.type === 'ghost'
      ? data.equipped.ghost === item.id
      : data.equipped.decos.includes(item.id);
    const preview = item.type === 'ghost'
      ? mascotHtml(item, 56, false)
      : `<span class="shop-item-emoji">${item.emoji}</span>`;
    return `
      <div class="shop-item ${owned?'owned':''}">
        <div style="display:flex; justify-content:center;">${preview}</div>
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-price">${owned ? (equipped?'착용중':'보유중') : `🪙 ${item.price}`}</div>
        ${owned
          ? `<button class="btn ${equipped?'btn-primary':'btn-ghost'} btn-sm" data-equip="${item.id}">${equipped?'착용중':'착용하기'}</button>`
          : `<button class="btn btn-primary btn-sm" data-buy="${item.id}">구매하기</button>`}
      </div>`;
  }

  document.getElementById('mainView').innerHTML = `
    <div class="card">
      <div class="section-title">🐕 캐릭터</div>
      <div class="shop-grid">${ghosts.map(itemCard).join('')}</div>
    </div>
    <div class="card">
      <div class="section-title">🛋️ 방 꾸미기 <span class="muted" style="font-weight:400;">(최대 ${MAX_DECO_SLOTS}개 착용)</span></div>
      <div class="shop-grid">${decos.map(itemCard).join('')}</div>
    </div>
  `;
  document.querySelectorAll('[data-buy]').forEach(el => el.onclick = () => purchaseItem(el.dataset.buy));
  document.querySelectorAll('[data-equip]').forEach(el => el.onclick = () => equipItem(el.dataset.equip));
}

function renderStats(){
  const today = todayKey();
  let weekMinutes = 0;
  const bars = [];
  for(let i=6;i>=0;i--){
    const key = addDays(today, -i);
    const min = data.studyLog[key] || 0;
    weekMinutes += min;
    const rate = getCompletionRate(key);
    bars.push({ key, min, rate: rate ? rate.rate : null });
  }
  const maxMin = Math.max(...bars.map(b=>b.min), 60);

  // streak: 완성률 100%인 연속일수 (오늘 포함, 뒤에서부터)
  let streak = 0;
  for(let i=0;i<365;i++){
    const key = addDays(today, -i);
    const rate = getCompletionRate(key);
    if(rate === null){ if(i===0) continue; else break; }
    if(rate.rate === 100) streak++;
    else break;
  }

  document.getElementById('mainView').innerHTML = `
    <div class="stat-grid">
      <div class="stat-box"><div class="stat-num">${data.studyLog[today]||0}<span style="font-size:13px;">분</span></div><div class="stat-label">오늘 공부시간</div></div>
      <div class="stat-box"><div class="stat-num">${weekMinutes}<span style="font-size:13px;">분</span></div><div class="stat-label">이번주 총 공부시간</div></div>
      <div class="stat-box"><div class="stat-num">${streak}<span style="font-size:13px;">일</span></div><div class="stat-label">완벽 완료 스트릭</div></div>
      <div class="stat-box"><div class="stat-num">🪙${data.coins}</div><div class="stat-label">보유 코인</div></div>
    </div>
    <div class="card" style="margin-top:14px;">
      <div class="section-title">📊 최근 7일 공부시간</div>
      ${bars.map(b => `
        <div class="bar-row">
          <span class="bar-label">${WEEKDAY_LABELS[weekdayOfKey(b.key)]}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100,(b.min/maxMin)*100)}%"></div></div>
          <span class="muted" style="width:38px; text-align:right; font-size:11px;">${b.min}분</span>
        </div>
      `).join('')}
    </div>
    <div class="card" style="margin-top:14px;">
      <div class="section-title">✅ 최근 7일 할일 완성률</div>
      ${bars.map(b => `
        <div class="bar-row">
          <span class="bar-label">${WEEKDAY_LABELS[weekdayOfKey(b.key)]}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${b.rate ?? 0}%; background: linear-gradient(90deg, var(--good), #4fd1a5);"></div></div>
          <span class="muted" style="width:38px; text-align:right; font-size:11px;">${b.rate===null ? '-' : b.rate+'%'}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function mascotHtml(item, sizePx, bob){
  const filter = item?.filter || 'none';
  const accessory = item?.accessory || '';
  return `
    <div class="mascot-wrap ${bob?'mascot-bob':''}" style="width:${sizePx}px;">
      <img src="${MASCOT_IMG}" class="mascot-img" style="filter:${filter}" alt="캐릭터">
      ${accessory ? `<span class="mascot-accessory">${accessory}</span>` : ''}
    </div>`;
}

/* ---------------- 탭 전환 ---------------- */
const renderers = { home: renderHome, todo: renderTodo, timetable: renderTimetable, shop: renderShop, stats: renderStats };

function switchTab(tab){
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  renderers[tab]();
}

/* ---------------- 빗줄기 배경 생성 ---------------- */
function initRain(){
  const layer = document.getElementById('rainLayer');
  const count = 34;
  for(let i=0;i<count;i++){
    const drop = document.createElement('div');
    drop.className = 'drop';
    drop.style.left = Math.random()*100 + '%';
    drop.style.animationDuration = (0.7 + Math.random()*0.9) + 's';
    drop.style.animationDelay = (Math.random()*2) + 's';
    drop.style.opacity = 0.15 + Math.random()*0.3;
    layer.appendChild(drop);
  }
}

/* ---------------- 초기화 ---------------- */
function init(){
  initRain();
  processCoinCredits();
  updateCoinBadge();
  switchTab('home');

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });

  setInterval(checkScheduleAlarms, 15000);
  checkScheduleAlarms();

  setInterval(updateClockOverlay, 15000);

  const fsBtn = document.getElementById('fullscreenBtn');
  if(fsBtn){
    fsBtn.onclick = () => {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      const doLock = () => {
        if(screen.orientation && screen.orientation.lock){
          screen.orientation.lock('landscape').catch(()=>{});
        }
      };
      if(req){
        req.call(el).then(doLock).catch(doLock);
      } else {
        doLock();
      }
    };
  }

  // 자정 넘어가면 코인 정산 다시 체크 (앱을 계속 켜둔 경우 대비)
  setInterval(() => {
    processCoinCredits();
    updateCoinBadge();
  }, 60000);
}

document.addEventListener('DOMContentLoaded', init);
