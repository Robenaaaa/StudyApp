/* ============================================
   유령집사의 공부방 — app.js
   ============================================ */

const STORAGE_KEY = 'ghostStudyApp_v1';
const WEEKDAY_LABELS = ['일','월','화','수','목','금','토']; // JS getDay() index 0-6
const KOR_WEEKDAY_ORDER = [1,2,3,4,5,6,0]; // 월~일 표시 순서 (getDay 기준)

const SHOP_ITEMS = [
  { id:'d1', type:'deco', emoji:'🪴', name:'화분', price:0 },
  { id:'d2', type:'deco', emoji:'🕯️', name:'촛불', price:0 },
  { id:'d3', type:'deco', emoji:'📚', name:'책더미', price:0 },
  { id:'d4', type:'deco', emoji:'🖼️', name:'액자', price:0 },
  { id:'d5', type:'deco', emoji:'🛋️', name:'소파', price:0 },
  { id:'d6', type:'deco', emoji:'🎐', name:'풍경', price:0 },
  { id:'d7', type:'deco', emoji:'🕰️', name:'괘종시계', price:0 },
  { id:'d8', type:'deco', emoji:'🧸', name:'곰인형', price:0 },
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
    owned: [],
    equipped: { decos: [] },
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

function setTodoCompletion(id, dateKey){
  const today = todayKey();
  dateKey = dateKey || today;
  if(dateKey !== today){ showToast('할일은 당일에만 체크할 수 있어요'); return false; }
  const todo = data.todos.find(t => t.id === id);
  if(!todo) return false;
  if(!isTodoDueOn(todo, dateKey)) return false; // 그 날짜 할일이 아니면 무시

  if(todo.completions[dateKey]?.done){
    delete todo.completions[dateKey];
  } else {
    todo.completions[dateKey] = { done:true, coinCredited:false };
    justCompletedId = id;
  }
  saveData();
  return true;
}
function toggleTodoComplete(id, dateKey){
  if(setTodoCompletion(id, dateKey)) renderTodo();
}
function toggleTodoCompleteInModal(id){
  if(setTodoCompletion(id, todayKey())) renderBookshelfModalBody();
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
  saveData();
  renderShop();
  renderHome();
}

/* ---------------- 타이머 ---------------- */
const timer = {
  mode: 'basic',           // 'pomodoro' | 'basic' — 모드 전환 버튼이 숨겨져 있어 항상 기본(누적) 타이머로 사용
  phase: 'work',           // pomodoro: 'work' | 'break'
  running: false,
  pomWorkSec: 25*60,
  pomBreakSec: 5*60,
  remaining: 25*60,
  basicElapsed: 0,
  intervalId: null
};

function timerFormatHMS(sec){
  const h = Math.floor(sec/3600);
  const m = Math.floor((sec%3600)/60);
  const s = sec % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
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
  updateSceneStopwatch();
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
  updateSceneStopwatch();
}
function stopBasicAndLog(){
  const min = Math.floor(timer.basicElapsed/60);
  pauseTimer();
  if(min > 0) logStudyMinutes(min);
  timer.basicElapsed = 0;
  showToast(min > 0 ? `공부 시간 ${min}분이 기록되었어요` : '기록할 시간이 없어요');
  updateSceneStopwatch();
  renderStats();
}

/* ---------------- 배경음 ---------------- */
// 소리를 추가하려면 이 목록에 항목만 더하면 됩니다 (파일은 assets/audio/에 추가).
// 드롭다운도 이 목록에서 자동으로 만들어집니다.
const NOISE_SOURCES = {
  rain: { label: '🌧️ 빗소리', src: 'assets/audio/rain.mp3' },
};

const noise = {
  audioEl: null,
  playing: false,
  type: NOISE_SOURCES[data.noiseSettings.type] ? data.noiseSettings.type : 'rain',
  volume: data.noiseSettings.volume
};

function stopNoiseNodes(){
  if(noise.audioEl){
    noise.audioEl.pause();
    noise.audioEl.src = '';
    noise.audioEl = null;
  }
}
function startNoise(){
  stopNoiseNodes();
  const audio = new Audio(NOISE_SOURCES[noise.type].src);
  audio.loop = true;
  audio.volume = noise.volume;
  audio.play().catch(() => showToast('오디오 재생에 실패했어요'));
  noise.audioEl = audio;
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
  if(noise.audioEl) noise.audioEl.volume = v;
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

// 공부방 배경은 레이어별 개별 이미지로 구성됩니다. 항목 추가/교체 시 이 폴더 안의
// 파일 경로만 바꿔 끼우면 됩니다 (레이어 순서는 배열 순서 = z-order, 뒤→앞).
// 위치 좌표는 assets/0_ 소품자리 설정 시필요_.png 배치를 기준으로 산출했습니다.
// 액자 사진은 여러 장을 순환할 수 있도록 배열로 관리합니다. frame 폴더에 그림을 추가하면
// 여기 목록에 경로만 더해주면 액자 클릭 → 사진변경 버튼으로 순환됩니다.
const FRAME_PHOTOS = [
  'assets/frame/액자.png',
];
let framePhotoIndex = 0;
function currentFramePhoto(){ return FRAME_PHOTOS[framePhotoIndex]; }

const ROOM_LAYERS = [
  { key:'background', img:'assets/background/배경.png', alt:'방 배경' },
  { key:'window',     img:'assets/windows/창문1.png',    alt:'창문' },
  { key:'plant',       img:'assets/plant/화분1.png',      alt:'화분' },
  { key:'frame',       img:null,                          alt:'액자' }, // currentFramePhoto()에서 선택
  { key:'clock',       img:'assets/clock/시계.png',       alt:'시계' },
  { key:'book',        img:'assets/book/책장.png',        alt:'책장' },
  { key:'cushion',     img:'assets/cushion/방석.png',      alt:'방석' },
  { key:'toy',         img:null,                          alt:'장난감' }, // 상태에 따라 TOY_IMG에서 선택
  { key:'dog',         img:'assets/dog/강아지1.png',       alt:'강아지' },
];

// 강아지를 클릭하면 이 "책상" 화면으로 전환됩니다. frame/clock/book은 홈 화면과
// 같은 좌표를 그대로 씁니다(같은 벽에 걸린 같은 소품이라 위치가 동일).
const DESK_LAYERS = [
  { key:'background', img:'assets/background/배경.png', alt:'방 배경' },
  { key:'window2',     img:'assets/windows/창문2.png',    alt:'창문' },
  { key:'frame',       img:null,                          alt:'액자' }, // currentFramePhoto()에서 선택 (홈과 공유)
  { key:'clock',       img:'assets/clock/시계.png',       alt:'시계' }, // 홈과 같은 좌표
  { key:'book',        img:'assets/book/책장.png',        alt:'책장' }, // 홈과 같은 좌표
  { key:'deskdog',     img:'assets/dog/강아지2.png',       alt:'책상에 앉은 강아지' },
  { key:'deskplant',   img:'assets/plant/화분1.png',      alt:'화분' }, // 책상보다 앞에 오도록 강아지(책상 포함) 뒤에 배치
  { key:'desktoy',     img:'assets/toy/장난감.png',        alt:'장난감' }, // 홈 화면의 toy와 별개 좌표
  { key:'hand',        img:'assets/hand/손.png',          alt:'연필 쥔 손' },
  { key:'cup',         img:'assets/cup/컵.png',           alt:'컵' },
];

let dogAtDesk = false;
function toggleDogPose(){
  dogAtDesk = !dogAtDesk;
  renderHome();
}

// 장난감을 클릭하면 책장 빈 칸으로 자리를 옮깁니다 (뒷모습 그림이 생기면 TOY_IMG.shelf에 채워 넣어 확장 가능).
const TOY_IMG = {
  default: 'assets/toy/장난감.png',
  shelf: 'assets/toy/장난감.png',
};
let toyOnShelf = false;
function toggleToyPlacement(){
  toyOnShelf = !toyOnShelf;
  renderHome();
}

// ---------------- 배치 편집 모드 (?layout=edit) ----------------
// 자동/수동 좌표 추정이 잘 안 맞을 때, 참고 이미지를 반투명하게 겹쳐두고
// 소품을 마우스로 직접 끌어서 위치를 맞추기 위한 도구입니다.
// URL에 ?layout=edit 을 붙이면 켜지고, 드래그한 좌표는 바로 화면(모든 모드)에 반영 + localStorage에 저장됩니다.
const layoutEditMode = new URLSearchParams(location.search).get('layout') === 'edit';
let layoutOverrides = {};
try{ layoutOverrides = JSON.parse(localStorage.getItem('layoutOverrides') || '{}'); }catch(e){}

function setupLayoutEditor(){
  const card = document.querySelector('.scene-card');
  if(!card) return;

  // 히트스팟(책장/액자/창문/강아지 클릭 영역)이 위에 겹쳐 있어서 드래그를 가로채므로 끔
  document.querySelectorAll('.scene-hotspot').forEach(h => { h.style.pointerEvents = 'none'; });

  if(!document.getElementById('layoutRefOverlay')){
    const img = document.createElement('img');
    img.id = 'layoutRefOverlay';
    img.src = dogAtDesk ? 'assets/1_첫화면 복사본.png' : 'assets/0_ 소품자리 설정 시필요_.png';
    img.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; opacity:0.45; pointer-events:none; z-index:50;';
    card.appendChild(img);
  }

  let panel = document.getElementById('layoutPanel');
  if(!panel){
    panel = document.createElement('div');
    panel.id = 'layoutPanel';
    panel.style.cssText = 'position:fixed; top:8px; right:8px; background:rgba(0,0,0,0.85); color:#7be0b0; font:11px/1.5 monospace; padding:10px; z-index:9999; max-width:280px; white-space:pre-wrap; max-height:70vh; overflow:auto; border-radius:8px;';
    document.body.appendChild(panel);
    const resetBtn = document.createElement('button');
    resetBtn.textContent = '초기화 (전부 원래대로)';
    resetBtn.style.cssText = 'position:fixed; top:8px; right:296px; z-index:9999; padding:6px 10px; border-radius:6px; border:none; cursor:pointer;';
    resetBtn.onclick = () => {
      layoutOverrides = {};
      localStorage.removeItem('layoutOverrides');
      renderHome();
    };
    document.body.appendChild(resetBtn);

    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 복사하기 (다 맞춘 후)';
    copyBtn.style.cssText = 'position:fixed; top:44px; right:296px; z-index:9999; padding:6px 10px; border-radius:6px; border:none; cursor:pointer; background:#ffcf5c;';
    copyBtn.onclick = async () => {
      const TEXT_LAYER_SELECTORS = { bigClock: '.scene-big-clock', stopwatchBtn: '.scene-stopwatch-btn' };
      const lines = Object.entries(layoutOverrides).map(([key, ov]) => {
        if(TEXT_LAYER_SELECTORS[key]){
          const props = ['left','top']
            .filter(k => ov[k] !== undefined)
            .map(k => `${k}:${ov[k]}%;`)
            .join(' ');
          const fontSize = ov.fontSize !== undefined ? ` font-size:${ov.fontSize}cqw;` : '';
          return `${TEXT_LAYER_SELECTORS[key]}{ ${props}${fontSize} }`;
        }
        const props = ['left','top','width','height']
          .filter(k => ov[k] !== undefined)
          .map(k => `${k}:${ov[k]}%;`)
          .join(' ');
        return `.layer-${key}{ ${props} }`;
      });
      const text = lines.length ? lines.join('\n') : '(변경된 게 없어요)';
      try{
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = '✅ 복사됨!';
      }catch(e){
        copyBtn.textContent = '복사 실패 (아래 확인)';
        alert(text);
      }
      setTimeout(() => { copyBtn.textContent = '📋 복사하기 (다 맞춘 후)'; }, 1500);
    };
    document.body.appendChild(copyBtn);

    const sceneBtn = document.createElement('button');
    sceneBtn.textContent = '🐶 홈/책상 전환';
    sceneBtn.style.cssText = 'position:fixed; top:80px; right:296px; z-index:9999; padding:6px 10px; border-radius:6px; border:none; cursor:pointer;';
    sceneBtn.onclick = () => { toggleDogPose(); };
    document.body.appendChild(sceneBtn);
  }

  function updatePanel(){
    let text = '드래그: 이동 / 노란 점: 크기 조절\n(참고 이미지 45% 겹쳐 보임)\n\n';
    document.querySelectorAll('.scene-layer[data-layer-key], .scene-text-layer[data-text-key]').forEach(el => {
      const key = el.dataset.layerKey || el.dataset.textKey;
      const ov = layoutOverrides[key];
      if(!ov){ text += `${key}: (기본값)\n`; return; }
      const parts = ['left','top','width','height','fontSize']
        .filter(k => ov[k] !== undefined)
        .map(k => `${k}:${ov[k]}${k==='fontSize'?'cqw':'%'}`)
        .join(' ');
      text += `${key}: ${parts}\n`;
    });
    panel.textContent = text;
  }

  function saveOverride(key, patch){
    const cur = layoutOverrides[key] || {};
    layoutOverrides[key] = { ...cur, ...patch };
    localStorage.setItem('layoutOverrides', JSON.stringify(layoutOverrides));
    updatePanel();
  }

  function positionHandle(handle, el){
    const cardRect = card.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    handle.style.left = (rect.right - cardRect.left) + 'px';
    handle.style.top = (rect.bottom - cardRect.top) + 'px';
  }

  let dragEl = null, startX, startY, startLeftPx, startTopPx;
  let resizeEl = null, rStartX, rStartY, rStartWidthPx, rStartHeightPx, rHandle;

  document.querySelectorAll('.scene-layer[data-layer-key]').forEach(el => {
    el.style.pointerEvents = 'auto';
    el.style.cursor = 'move';

    el.onpointerdown = (e) => {
      e.preventDefault();
      dragEl = el;
      const cardRect = card.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      const rect = el.getBoundingClientRect();
      startLeftPx = rect.left - cardRect.left;
      startTopPx = rect.top - cardRect.top;
      el.setPointerCapture(e.pointerId);
    };
    el.onpointermove = (e) => {
      if(dragEl !== el) return;
      const cardRect = card.getBoundingClientRect();
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const newLeftPct = (startLeftPx + dx) / cardRect.width * 100;
      const newTopPct = (startTopPx + dy) / cardRect.height * 100;
      el.style.left = newLeftPct.toFixed(2) + '%';
      el.style.top = newTopPct.toFixed(2) + '%';
      saveOverride(el.dataset.layerKey, { left: +newLeftPct.toFixed(2), top: +newTopPct.toFixed(2) });
      if(el._resizeHandle) positionHandle(el._resizeHandle, el);
    };
    el.onpointerup = () => { dragEl = null; };

    // 크기 조절 핸들 (요소 우하단 모서리, 노란 점)
    const handle = document.createElement('div');
    handle.className = 'layout-resize-handle';
    handle.style.cssText = 'position:absolute; width:12px; height:12px; margin-left:-6px; margin-top:-6px; background:#ffcf5c; border:2px solid #171a2e; border-radius:50%; cursor:nwse-resize; z-index:60; pointer-events:auto;';
    card.appendChild(handle);
    el._resizeHandle = handle;
    positionHandle(handle, el);

    handle.onpointerdown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      resizeEl = el;
      rHandle = handle;
      const rect = el.getBoundingClientRect();
      rStartX = e.clientX; rStartY = e.clientY;
      rStartWidthPx = rect.width;
      rStartHeightPx = rect.height;
      handle.setPointerCapture(e.pointerId);
    };
    handle.onpointermove = (e) => {
      if(resizeEl !== el) return;
      const cardRect = card.getBoundingClientRect();
      const dx = e.clientX - rStartX;
      const dy = e.clientY - rStartY;
      const newWidthPct = Math.max(1, rStartWidthPx + dx) / cardRect.width * 100;
      const newHeightPct = Math.max(1, rStartHeightPx + dy) / cardRect.height * 100;
      el.style.width = newWidthPct.toFixed(2) + '%';
      el.style.height = newHeightPct.toFixed(2) + '%';
      saveOverride(el.dataset.layerKey, { width: +newWidthPct.toFixed(2), height: +newHeightPct.toFixed(2) });
      positionHandle(handle, el);
    };
    handle.onpointerup = () => { resizeEl = null; };
  });

  // 텍스트 요소(시:분:초 표시, 재생/정지 버튼): left는 가운데 정렬 기준이라
  // 이미지 레이어와 달리 요소의 중심 x좌표를 기준으로 이동을 계산함
  let dragTextEl = null, tStartX, tStartY, tStartCenterXPx, tStartTopPx;
  let resizeTextEl = null, rtStartX, rtStartFontSizeCqw;

  document.querySelectorAll('.scene-text-layer[data-text-key]').forEach(el => {
    el.style.pointerEvents = 'auto';
    el.style.cursor = 'move';

    el.onpointerdown = (e) => {
      e.preventDefault();
      dragTextEl = el;
      const cardRect = card.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      tStartX = e.clientX; tStartY = e.clientY;
      tStartCenterXPx = rect.left + rect.width / 2 - cardRect.left;
      tStartTopPx = rect.top - cardRect.top;
      el.setPointerCapture(e.pointerId);
    };
    el.onpointermove = (e) => {
      if(dragTextEl !== el) return;
      const cardRect = card.getBoundingClientRect();
      const dx = e.clientX - tStartX;
      const dy = e.clientY - tStartY;
      const newLeftPct = (tStartCenterXPx + dx) / cardRect.width * 100;
      const newTopPct = (tStartTopPx + dy) / cardRect.height * 100;
      el.style.left = newLeftPct.toFixed(2) + '%';
      el.style.top = newTopPct.toFixed(2) + '%';
      saveOverride(el.dataset.textKey, { left: +newLeftPct.toFixed(2), top: +newTopPct.toFixed(2) });
      if(el._resizeHandle) positionHandle(el._resizeHandle, el);
    };
    el.onpointerup = () => { dragTextEl = null; };

    // 크기 조절 핸들: 글자 크기(font-size)를 cqw 단위로 조절 (좌우로 드래그)
    const handle = document.createElement('div');
    handle.className = 'layout-resize-handle';
    handle.style.cssText = 'position:absolute; width:12px; height:12px; margin-left:-6px; margin-top:-6px; background:#5cc8ff; border:2px solid #171a2e; border-radius:50%; cursor:ew-resize; z-index:60; pointer-events:auto;';
    card.appendChild(handle);
    el._resizeHandle = handle;
    positionHandle(handle, el);

    handle.onpointerdown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      resizeTextEl = el;
      rtStartX = e.clientX;
      const cardRect = card.getBoundingClientRect();
      const ov = layoutOverrides[el.dataset.textKey];
      rtStartFontSizeCqw = ov && ov.fontSize !== undefined
        ? ov.fontSize
        : parseFloat(getComputedStyle(el).fontSize) / cardRect.width * 100;
      handle.setPointerCapture(e.pointerId);
    };
    handle.onpointermove = (e) => {
      if(resizeTextEl !== el) return;
      const cardRect = card.getBoundingClientRect();
      const dx = e.clientX - rtStartX;
      const newFontSizeCqw = Math.max(0.5, rtStartFontSizeCqw + dx / cardRect.width * 100);
      el.style.fontSize = newFontSizeCqw.toFixed(2) + 'cqw';
      saveOverride(el.dataset.textKey, { fontSize: +newFontSizeCqw.toFixed(2) });
      positionHandle(handle, el);
    };
    handle.onpointerup = () => { resizeTextEl = null; };
  });

  updatePanel();
}

function updateSceneStopwatch(){
  const el = document.getElementById('sceneBigClock');
  if(el) el.textContent = timerFormatHMS(timer.basicElapsed);
  const btn = document.getElementById('sceneStopwatchBtn');
  if(btn) btn.textContent = timer.running ? '⏸ 정지' : '▶ 재생';
}

function renderHome(){
  const today = todayKey();

  const activeLayers = dogAtDesk ? DESK_LAYERS : ROOM_LAYERS;

  document.getElementById('mainView').innerHTML = `
    <div class="scene-card">
      ${activeLayers.map(l => {
        let src = l.img;
        let id = '';
        let extraClass = '';
        if(l.key === 'frame'){ src = currentFramePhoto(); }
        if(l.key === 'toy'){
          src = TOY_IMG[toyOnShelf ? 'shelf' : 'default'];
          id = ' id="sceneToy"';
          extraClass = toyOnShelf ? ' toy-on-shelf' : '';
        }
        if(l.key === 'hand' && timer.running){
          extraClass = ' writing';
        }
        const ov = layoutOverrides[l.key];
        const ovStyle = ov
          ? ` style="${ov.left!==undefined?`left:${ov.left}%;`:''}${ov.top!==undefined?`top:${ov.top}%;`:''}${ov.width!==undefined?`width:${ov.width}%;`:''}${ov.height!==undefined?`height:${ov.height}%;`:''}"`
          : '';
        return `<img src="${src}" class="scene-layer layer-${l.key}${extraClass}"${id} data-layer-key="${l.key}"${ovStyle} alt="${l.alt}">`;
      }).join('')}
      ${dogAtDesk ? `
        <div class="scene-hotspot hotspot-window2" id="hotspotWindow" title="배경음 재생/정지"></div>
        <div class="scene-hotspot hotspot-deskdog" id="hotspotDog" title="강아지 (홈으로)"></div>
      ` : `
        <div class="scene-hotspot hotspot-window" id="hotspotWindow" title="배경음 재생/정지"></div>
        <div class="scene-hotspot hotspot-dog" id="hotspotDog" title="강아지"></div>
      `}
      <div class="scene-hotspot hotspot-bookshelf" id="hotspotBookshelf" title="할일·통계·사진첩·식물도감"></div>
      <div class="scene-hotspot hotspot-frame" id="hotspotFrame" title="액자 보기"></div>
      ${dogAtDesk ? (() => {
        const clockOv = layoutOverrides['bigClock'];
        const clockStyle = clockOv
          ? ` style="${clockOv.left!==undefined?`left:${clockOv.left}%;`:''}${clockOv.top!==undefined?`top:${clockOv.top}%;`:''}${clockOv.fontSize!==undefined?`font-size:${clockOv.fontSize}cqw;`:''}"`
          : '';
        const btnOv = layoutOverrides['stopwatchBtn'];
        const btnStyle = btnOv
          ? ` style="${btnOv.left!==undefined?`left:${btnOv.left}%;`:''}${btnOv.top!==undefined?`top:${btnOv.top}%;`:''}${btnOv.fontSize!==undefined?`font-size:${btnOv.fontSize}cqw;`:''}"`
          : '';
        return `
        <div class="scene-big-clock scene-text-layer" id="sceneBigClock" data-text-key="bigClock"${clockStyle}></div>
        <button class="scene-stopwatch-btn scene-text-layer" id="sceneStopwatchBtn" data-text-key="stopwatchBtn"${btnStyle}>${timer.running ? '⏸ 정지' : '▶ 재생'}</button>`;
      })() : ''}
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
        <div class="section-title" style="margin-bottom:8px;">🎧 배경음</div>
        <div class="noise-row" style="margin-top:0; padding-top:0; border-top:none;">
          <button class="btn btn-ghost btn-sm" id="btnNoiseToggle">${noise.playing ? '⏸ 소리끄기' : '▶ 재생'}</button>
          <select class="noise-select" id="noiseType">
            ${Object.entries(NOISE_SOURCES).map(([key, s]) => `<option value="${key}" ${noise.type===key?'selected':''}>${s.label}</option>`).join('')}
          </select>
          <input type="range" id="noiseVolume" min="0" max="1" step="0.05" value="${noise.volume}">
        </div>
      </div>
    </div>
  `;

  updateSceneStopwatch();
  if(layoutEditMode) setupLayoutEditor();

  document.getElementById('hotspotBookshelf').onclick = openBookshelfModal;
  document.getElementById('hotspotFrame').onclick = openFrameModal;
  document.getElementById('hotspotWindow').onclick = toggleNoise;
  document.getElementById('hotspotDog').onclick = toggleDogPose;
  const sceneToyEl = document.getElementById('sceneToy');
  if(sceneToyEl) sceneToyEl.onclick = toggleToyPlacement;
  const sceneStopwatchBtn = document.getElementById('sceneStopwatchBtn');
  if(sceneStopwatchBtn) sceneStopwatchBtn.onclick = () => {
    if(timer.running) pauseTimer(); else startTimer();
    renderHome();
  };

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
  const decos = SHOP_ITEMS.filter(i => i.type === 'deco');

  function itemCard(item){
    const owned = data.owned.includes(item.id);
    const equipped = data.equipped.decos.includes(item.id);
    return `
      <div class="shop-item ${owned?'owned':''}">
        <div style="display:flex; justify-content:center;"><span class="shop-item-emoji">${item.emoji}</span></div>
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-price">${owned ? (equipped?'착용중':'보유중') : `🪙 ${item.price}`}</div>
        ${owned
          ? `<button class="btn ${equipped?'btn-primary':'btn-ghost'} btn-sm" data-equip="${item.id}">${equipped?'착용중':'착용하기'}</button>`
          : `<button class="btn btn-primary btn-sm" data-buy="${item.id}">구매하기</button>`}
      </div>`;
  }

  document.getElementById('mainView').innerHTML = `
    <div class="card">
      <div class="section-title">🛋️ 방 꾸미기 <span class="muted" style="font-weight:400;">(최대 ${MAX_DECO_SLOTS}개 착용)</span></div>
      <div class="shop-grid">${decos.map(itemCard).join('')}</div>
    </div>
  `;
  document.querySelectorAll('[data-buy]').forEach(el => el.onclick = () => purchaseItem(el.dataset.buy));
  document.querySelectorAll('[data-equip]').forEach(el => el.onclick = () => equipItem(el.dataset.equip));
}

function statsContentHtml(){
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

  return `
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

function renderStats(){
  document.getElementById('mainView').innerHTML = statsContentHtml();
}

/* ---------------- 책장 팝업 (오늘의 할일 / 통계 / 사진첩 / 식물도감) ---------------- */
function todoTabHtml(){
  const today = todayKey();
  const due = getTodosDueOn(today);
  const rate = getCompletionRate(today);
  return `
    ${rate ? `
    <div class="progress-wrap">
      <div class="progress-top"><span>${rate.done} / ${rate.total} 완료</span><span>${rate.rate}%</span></div>
      <div class="progress-track"><div class="progress-fill" style="width:${rate.rate}%"></div></div>
    </div>` : `<div class="empty-state">오늘은 할일이 없어요</div>`}
    <div class="todo-list" style="margin-top:12px;">
      ${due.map(t => {
        const isDone = !!t.completions[today]?.done;
        return `
        <div class="todo-item">
          <div class="todo-check ${isDone?'done':''}" data-modal-todo-id="${t.id}">${isDone?'✓':''}</div>
          <div style="flex:1;">
            <div class="todo-text">${escapeHtml(t.text)}</div>
          </div>
        </div>`;
      }).join('')}
    </div>
  `;
}
function albumTabHtml(){
  return `
    <div class="photo-album-grid">
      ${FRAME_PHOTOS.map(src => `<div class="photo-album-item"><img src="${src}" alt="액자 사진"></div>`).join('')}
    </div>
  `;
}
function plantsTabHtml(){
  return `<div class="empty-state">🌱 공부 기록에 따라 식물이 자라는 성장 시스템을 준비 중이에요.<br>조금만 기다려주세요!</div>`;
}
function bookshelfTabContentHtml(tab){
  if(tab === 'todo') return todoTabHtml();
  if(tab === 'stats') return statsContentHtml();
  if(tab === 'album') return albumTabHtml();
  if(tab === 'plants') return plantsTabHtml();
  return '';
}

let bookshelfActiveTab = 'todo';

function renderBookshelfModalBody(){
  document.getElementById('bookshelfModalBody').innerHTML = bookshelfTabContentHtml(bookshelfActiveTab);
  document.querySelectorAll('.modal-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.bookshelfTab === bookshelfActiveTab);
  });
  if(bookshelfActiveTab === 'todo'){
    document.querySelectorAll('[data-modal-todo-id]').forEach(el => {
      el.onclick = () => toggleTodoCompleteInModal(el.dataset.modalTodoId);
    });
  }
}

function openBookshelfModal(){
  document.getElementById('bookshelfModal').classList.add('show');
  renderBookshelfModalBody();
}
function closeBookshelfModal(){
  document.getElementById('bookshelfModal').classList.remove('show');
}

const FRAME_MODAL_SIZE_RATIO = 0.72; // 화면에서 액자 사진이 차지하는 최대 비율 (가로세로 비율은 유지)

function sizeFrameModalImg(){
  const img = document.getElementById('frameModalImg');
  if(!img.naturalWidth) return;
  const maxW = window.innerWidth * FRAME_MODAL_SIZE_RATIO;
  const maxH = window.innerHeight * FRAME_MODAL_SIZE_RATIO;
  const ratio = img.naturalWidth / img.naturalHeight;
  let w = maxW, h = maxW / ratio;
  if(h > maxH){ h = maxH; w = maxH * ratio; }
  img.style.width = w + 'px';
  img.style.height = h + 'px';
}

function openFrameModal(){
  const img = document.getElementById('frameModalImg');
  img.onload = sizeFrameModalImg;
  img.src = currentFramePhoto();
  if(img.complete && img.naturalWidth) sizeFrameModalImg();
  document.getElementById('frameModal').classList.add('show');
}
function closeFrameModal(){
  document.getElementById('frameModal').classList.remove('show');
}
function cycleFramePhoto(){
  if(FRAME_PHOTOS.length < 2){
    showToast('아직 액자 사진이 한 장뿐이에요 🖼️');
    return;
  }
  framePhotoIndex = (framePhotoIndex + 1) % FRAME_PHOTOS.length;
  const img = document.getElementById('frameModalImg');
  img.onload = sizeFrameModalImg;
  img.src = currentFramePhoto();
  const sceneFrame = document.querySelector('.layer-frame');
  if(sceneFrame) sceneFrame.src = currentFramePhoto();
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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

  document.getElementById('bookshelfModalClose').onclick = closeBookshelfModal;
  document.getElementById('bookshelfModal').addEventListener('click', (e) => {
    if(e.target.id === 'bookshelfModal') closeBookshelfModal();
  });
  document.querySelectorAll('.modal-tab-btn').forEach(btn => {
    btn.onclick = () => { bookshelfActiveTab = btn.dataset.bookshelfTab; renderBookshelfModalBody(); };
  });

  document.getElementById('frameModalClose').onclick = closeFrameModal;
  document.getElementById('frameModalChangeBtn').onclick = cycleFramePhoto;
  document.getElementById('frameModal').addEventListener('click', (e) => {
    if(e.target.id === 'frameModal') closeFrameModal();
  });

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
