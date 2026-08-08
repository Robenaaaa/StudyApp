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
// 창문 클릭 전용: 전체 renderHome() 대신 이미지 src만 바꿔서
// 씬 전체가 다시 그려지며 생기는 미세한 위치 흔들림(리플로우)을 없앰
function toggleDeskWindow(){
  if(noise.playing){
    stopNoiseNodes();
    noise.playing = false;
  } else {
    startNoise();
  }
  const winEl = document.querySelector('[data-layer-key="window2"]');
  if(winEl) winEl.src = noise.playing ? 'assets/windows/창문2.png' : 'assets/windows/창문1.png';
  const noiseBtn = document.getElementById('btnNoiseToggle');
  if(noiseBtn) noiseBtn.textContent = noise.playing ? '⏸ 소리끄기' : '▶ 재생';
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
      new Notification('모모의 하루', { body: `${time} — ${subject} 시간이에요!` });
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
  { key:'window2',     img:null,                          alt:'창문' }, // 클릭(배경음 토글) 상태에 따라 창문1↔창문2
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

    // 편집 모드에선 hotspot-bookshelf도 pointer-events:none 처리돼서 못 누르므로 대신 열어주는 버튼
    const bookshelfBtn = document.createElement('button');
    bookshelfBtn.textContent = '📚 책장 팝업 열기';
    bookshelfBtn.style.cssText = 'position:fixed; top:116px; right:296px; z-index:9999; padding:6px 10px; border-radius:6px; border:none; cursor:pointer;';
    bookshelfBtn.onclick = () => { openBookshelfModal(); };
    document.body.appendChild(bookshelfBtn);
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
        if(l.key === 'window2'){ src = noise.playing ? 'assets/windows/창문2.png' : 'assets/windows/창문1.png'; }
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
        <div class="scene-hotspot hotspot-bookshelf" id="hotspotBookshelf" title="할일·통계·사진첩·식물도감"></div>
        <div class="scene-hotspot hotspot-frame" id="hotspotFrame" title="액자 보기"></div>
      ` : `
        <div class="scene-hotspot hotspot-dog" id="hotspotDog" title="강아지"></div>
      `}
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

  const hotspotBookshelf = document.getElementById('hotspotBookshelf');
  if(hotspotBookshelf) hotspotBookshelf.onclick = openBookshelfModal;
  const hotspotFrame = document.getElementById('hotspotFrame');
  if(hotspotFrame) hotspotFrame.onclick = openFrameModal;
  const hotspotWindow = document.getElementById('hotspotWindow');
  if(hotspotWindow) hotspotWindow.onclick = toggleDeskWindow;
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

/* ---------------- 책장 팝업 (assets/menu/ 이미지를 그대로 표시, 탭 클릭 시 이미지 전환) ---------------- */
const BOOKSHELF_MENU_IMAGES = {
  todo: 'assets/menu/할일.png',
  album: 'assets/menu/사진첩.png',
  plants: 'assets/menu/식물도감.png',
  stats: 'assets/menu/통계.png',
};

let bookshelfActiveTab = 'todo';

function renderBookshelfModalImg(){
  document.getElementById('bookshelfModalImg').src = BOOKSHELF_MENU_IMAGES[bookshelfActiveTab];
  renderBookshelfCalendar();
}

/* 할일 탭 달력: 실제 연-월 이동 + 요일/날짜 표시 (일요일 빨간색) */
const CAL_WEEKDAY_LABELS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
let bookshelfCalYear = new Date().getFullYear();
let bookshelfCalMonth = new Date().getMonth(); // 0-11

let bookshelfCalOverrides = {};
try{ bookshelfCalOverrides = JSON.parse(localStorage.getItem('bookshelfCalOverrides') || '{}'); }catch(e){}

// 요일 열(SUN~SAT) 기본 좌우 위치 — 사용자가 ?layout=edit 에서 맞춘 값, calCol0~calCol6 오버라이드로 추가 조정 가능
const CAL_COL_LEFT_DEFAULTS = [2.46, 14.73, 27.23, 40.84, 53.34, 66.28, 79.23];

// 행(0=요일 헤더, 1~6=주) 기본 위치/높이 — 사용자가 ?layout=edit 에서 맞춘 값, calRow0~calRow6 오버라이드로 추가 조정 가능
const CAL_ROW_HEIGHT_DEFAULTS = [15.81, 18.09, 23.17, 29.52, 33.83, 39.7, 26.99];
const CAL_ROW_TOP_DEFAULTS = { 3: 42.6 }; // 지정 안 된 행은 7등분 기본값(r*100/7) 사용
function getCalRowRect(r){
  const ov = bookshelfCalOverrides['calRow' + r] || {};
  const defaultTop = CAL_ROW_TOP_DEFAULTS[r] !== undefined ? CAL_ROW_TOP_DEFAULTS[r] : r * (100 / 7);
  const top = ov.top !== undefined ? ov.top : defaultTop;
  const height = ov.height !== undefined ? ov.height : CAL_ROW_HEIGHT_DEFAULTS[r];
  return { top, height };
}

function applyBookshelfCalOverrides(){
  document.querySelectorAll('[data-cal-key]').forEach(el => {
    const ov = bookshelfCalOverrides[el.dataset.calKey];
    if(!ov) return;
    if(ov.left !== undefined) el.style.left = ov.left + '%';
    if(ov.top !== undefined) el.style.top = ov.top + '%';
    if(ov.width !== undefined) el.style.width = ov.width + '%';
    if(ov.height !== undefined) el.style.height = ov.height + '%';
  });
}

function updateBookshelfCalEditPanel(){
  const editPanel = document.getElementById('bookshelfCalEditPanel');
  if(!editPanel) return;
  let text = '달력 요소 드래그: 이동\n파란 점: 열 너비 / 노란 점: 행 높이 조절\n\n';
  document.querySelectorAll('[data-cal-key]').forEach(el => {
    const key = el.dataset.calKey;
    const ov = bookshelfCalOverrides[key];
    if(!ov){ text += `${key}: (기본값)\n`; return; }
    const parts = ['left','top','width','height'].filter(k => ov[k] !== undefined).map(k => `${k}:${ov[k]}%`).join(' ');
    text += `${key}: ${parts}\n`;
  });
  editPanel.textContent = text;
}

function saveCalOverride(key, patch){
  const cur = bookshelfCalOverrides[key] || {};
  bookshelfCalOverrides[key] = { ...cur, ...patch };
  localStorage.setItem('bookshelfCalOverrides', JSON.stringify(bookshelfCalOverrides));
  updateBookshelfCalEditPanel();
}

// 요일 열(SUN~SAT): 좌우 드래그로 이동, 파란 점 드래그로 너비 조절.
// renderBookshelfCalendar()가 매번 열 DOM을 새로 만들기 때문에 렌더링마다 다시 호출해서 다시 묶어줌.
function bindBookshelfCalColumnDrag(){
  const gridEl = document.querySelector('[data-cal-key="calGrid"]');
  if(!gridEl) return;

  function positionColHandle(col){
    const handle = col._resizeHandle;
    if(!handle) return;
    const gridRect = gridEl.getBoundingClientRect();
    const rect = col.getBoundingClientRect();
    handle.style.left = (rect.right - gridRect.left) + 'px';
  }

  document.querySelectorAll('.bookshelf-cal-col[data-cal-key]').forEach(col => {
    const key = col.dataset.calKey;
    col.style.cursor = 'move';
    let startX, startLeftPx;
    col.onpointerdown = (e) => {
      e.preventDefault();
      e.stopPropagation(); // gridEl에도 드래그 핸들러가 있어서 버블링되면 gridEl이 포인터 캡처를 가로챔
      const gridRect = gridEl.getBoundingClientRect();
      const rect = col.getBoundingClientRect();
      startX = e.clientX;
      startLeftPx = rect.left - gridRect.left;
      col._dragging = true;
      try{ col.setPointerCapture(e.pointerId); }catch(err){}
    };
    col.onpointermove = (e) => {
      if(!col._dragging) return;
      const gridRect = gridEl.getBoundingClientRect();
      const newLeftPct = (startLeftPx + (e.clientX - startX)) / gridRect.width * 100;
      col.style.left = newLeftPct.toFixed(2) + '%';
      saveCalOverride(key, { left: +newLeftPct.toFixed(2) });
      positionColHandle(col);
    };
    col.onpointerup = () => { col._dragging = false; };

    const handle = document.createElement('div');
    handle.className = 'bookshelf-cal-col-handle';
    handle.style.cssText = 'position:absolute; top:50%; width:10px; height:10px; margin-top:-5px; margin-left:-5px; background:#5cc8ff; border:2px solid #171a2e; border-radius:50%; cursor:ew-resize; z-index:70;';
    gridEl.appendChild(handle);
    col._resizeHandle = handle;
    positionColHandle(col);

    let rStartX, rStartWidthPx;
    handle.onpointerdown = (e) => {
      e.preventDefault(); e.stopPropagation();
      const rect = col.getBoundingClientRect();
      rStartX = e.clientX;
      rStartWidthPx = rect.width;
      handle._resizing = true;
      try{ handle.setPointerCapture(e.pointerId); }catch(err){}
    };
    handle.onpointermove = (e) => {
      if(!handle._resizing) return;
      const gridRect = gridEl.getBoundingClientRect();
      const newWidthPct = Math.max(1, rStartWidthPx + (e.clientX - rStartX)) / gridRect.width * 100;
      col.style.width = newWidthPct.toFixed(2) + '%';
      saveCalOverride(key, { width: +newWidthPct.toFixed(2) });
      positionColHandle(col);
    };
    handle.onpointerup = () => { handle._resizing = false; };
  });
}

// 드래그 중 실제 달력 셀(7개 열의 해당 행)도 같이 움직이게 — renderBookshelfCalendar() 전체를 다시 부르면
// 드래그 중인 손잡이 자체가 DOM에서 사라져 드래그가 끊기므로, 셀 스타일만 가볍게 직접 갱신함
function updateBookshelfCalRowCells(r){
  const rect = getCalRowRect(r);
  document.querySelectorAll('.bookshelf-cal-col').forEach(col => {
    const cell = col.children[r];
    if(cell){ cell.style.top = rect.top + '%'; cell.style.height = rect.height + '%'; }
  });
}

// 행(헤더+6주): 위아래 드래그로 이동, 노란 점 드래그로 높이 조절. 그리드 오른쪽 바깥의 손잡이로 조작.
// 매 렌더링마다 셀이 새로 만들어지므로 손잡이도 매번 새로 만들어서 다시 묶어줌.
function bindBookshelfCalRowDrag(){
  const gridEl = document.querySelector('[data-cal-key="calGrid"]');
  if(!gridEl) return;

  for(let r = 0; r <= 6; r++){
    const key = 'calRow' + r;
    const rect = getCalRowRect(r);

    const handle = document.createElement('div');
    handle.className = 'bookshelf-cal-row-handle';
    handle.dataset.calKey = key;
    handle.style.top = rect.top + '%';
    handle.style.height = rect.height + '%';
    gridEl.appendChild(handle);

    const dot = document.createElement('div');
    dot.className = 'bookshelf-cal-row-resize';
    gridEl.appendChild(dot);

    function positionDot(){
      const gridRect = gridEl.getBoundingClientRect();
      const hRect = handle.getBoundingClientRect();
      dot.style.left = (hRect.left + hRect.width / 2 - gridRect.left) + 'px';
      dot.style.top = (hRect.bottom - gridRect.top) + 'px';
    }
    positionDot();

    let startY, startTopPx;
    handle.onpointerdown = (e) => {
      e.preventDefault(); e.stopPropagation();
      const gridRect = gridEl.getBoundingClientRect();
      const hRect = handle.getBoundingClientRect();
      startY = e.clientY;
      startTopPx = hRect.top - gridRect.top;
      handle._dragging = true;
      try{ handle.setPointerCapture(e.pointerId); }catch(err){}
    };
    handle.onpointermove = (e) => {
      if(!handle._dragging) return;
      const gridRect = gridEl.getBoundingClientRect();
      const newTopPct = (startTopPx + (e.clientY - startY)) / gridRect.height * 100;
      handle.style.top = newTopPct.toFixed(2) + '%';
      saveCalOverride(key, { top: +newTopPct.toFixed(2) });
      updateBookshelfCalRowCells(r);
      positionDot();
    };
    handle.onpointerup = () => { handle._dragging = false; };

    let rStartY, rStartHeightPx;
    dot.onpointerdown = (e) => {
      e.preventDefault(); e.stopPropagation();
      const hRect = handle.getBoundingClientRect();
      rStartY = e.clientY;
      rStartHeightPx = hRect.height;
      dot._resizing = true;
      try{ dot.setPointerCapture(e.pointerId); }catch(err){}
    };
    dot.onpointermove = (e) => {
      if(!dot._resizing) return;
      const gridRect = gridEl.getBoundingClientRect();
      const newHeightPct = Math.max(1, rStartHeightPx + (e.clientY - rStartY)) / gridRect.height * 100;
      handle.style.height = newHeightPct.toFixed(2) + '%';
      saveCalOverride(key, { height: +newHeightPct.toFixed(2) });
      updateBookshelfCalRowCells(r);
      positionDot();
    };
    dot.onpointerup = () => { dot._resizing = false; };
  }
}

function renderBookshelfCalendar(){
  const show = bookshelfActiveTab === 'todo';
  document.getElementById('bookshelfCalendar').classList.toggle('show', show);
  if(!show) return;

  document.getElementById('bookshelfCalLabel').textContent =
    `${bookshelfCalYear}.${String(bookshelfCalMonth + 1).padStart(2, '0')}`;

  const firstWeekday = new Date(bookshelfCalYear, bookshelfCalMonth, 1).getDay();
  const daysInMonth = new Date(bookshelfCalYear, bookshelfCalMonth + 1, 0).getDate();

  // 요일별(SUN~SAT) 열을 각각 독립된 블록으로 렌더링 — 좌우 위치/너비를 열마다 따로 조정할 수 있게
  let html = '';
  for(let c = 0; c < 7; c++){
    const key = 'calCol' + c;
    const ov = bookshelfCalOverrides[key] || {};
    const left = ov.left !== undefined ? ov.left : CAL_COL_LEFT_DEFAULTS[c];
    const width = ov.width !== undefined ? ov.width : (100 / 7);

    const headerRect = getCalRowRect(0);
    let cellsHtml = `<div class="bookshelf-cal-cell header${c === 0 ? ' sun' : ''}" style="top:${headerRect.top}%; height:${headerRect.height}%;">${CAL_WEEKDAY_LABELS[c]}</div>`;
    for(let r = 1; r <= 6; r++){
      const dayNum = (r - 1) * 7 + c - firstWeekday + 1;
      const text = (dayNum >= 1 && dayNum <= daysInMonth) ? dayNum : '';
      const rowRect = getCalRowRect(r);
      cellsHtml += `<div class="bookshelf-cal-cell${c === 0 ? ' sun' : ''}" style="top:${rowRect.top}%; height:${rowRect.height}%;">${text}</div>`;
    }
    html += `<div class="bookshelf-cal-col" data-cal-key="${key}" style="left:${left}%; width:${width}%;">${cellsHtml}</div>`;
  }
  document.getElementById('bookshelfCalGrid').innerHTML = html;
  applyBookshelfCalOverrides();
  if(layoutEditMode) bindBookshelfCalRowDrag();
  if(layoutEditMode) bindBookshelfCalColumnDrag();
}

function bookshelfCalPrevMonth(){
  bookshelfCalMonth--;
  if(bookshelfCalMonth < 0){ bookshelfCalMonth = 11; bookshelfCalYear--; }
  renderBookshelfCalendar();
}
function bookshelfCalNextMonth(){
  bookshelfCalMonth++;
  if(bookshelfCalMonth > 11){ bookshelfCalMonth = 0; bookshelfCalYear++; }
  renderBookshelfCalendar();
}

// 팝업을 브라우저 전체가 아니라 흰 장면(.scene-card = "폰 화면") 정중앙에 맞춤
function positionBookshelfModal(){
  const card = document.querySelector('.scene-card');
  const modal = document.getElementById('bookshelfModal');
  if(!card || !modal) return;
  const r = card.getBoundingClientRect();
  modal.style.left = r.left + 'px';
  modal.style.top = r.top + 'px';
  modal.style.right = 'auto';
  modal.style.bottom = 'auto';
  modal.style.width = r.width + 'px';
  modal.style.height = r.height + 'px';
}

function openBookshelfModal(){
  positionBookshelfModal();
  document.getElementById('bookshelfModal').classList.add('show');
  renderBookshelfModalImg();
  window.addEventListener('resize', positionBookshelfModal);
  if(layoutEditMode) setupBookshelfCalEditor();
}

/* ?layout=edit 모드: 할일 탭 달력 요소(화살표/라벨/그리드) 위치를 드래그로 조정 */
function setupBookshelfCalEditor(){
  const panel = document.querySelector('.bookshelf-modal-panel');
  if(!panel) return;

  let editPanel = document.getElementById('bookshelfCalEditPanel');
  if(!editPanel){
    editPanel = document.createElement('div');
    editPanel.id = 'bookshelfCalEditPanel';
    editPanel.style.cssText = 'position:fixed; top:8px; left:8px; background:rgba(0,0,0,0.85); color:#7be0b0; font:11px/1.5 monospace; padding:10px; z-index:10001; max-width:260px; white-space:pre-wrap; border-radius:8px; pointer-events:none;'; // 정보 표시용일 뿐이라 클릭이 그대로 통과해서 아래 달력 열을 드래그할 수 있어야 함
    document.body.appendChild(editPanel);

    const resetBtn = document.createElement('button');
    resetBtn.textContent = '달력 초기화';
    resetBtn.style.cssText = 'position:fixed; top:8px; left:276px; z-index:10001; padding:6px 10px; border-radius:6px; border:none; cursor:pointer;';
    resetBtn.onclick = () => {
      bookshelfCalOverrides = {};
      localStorage.removeItem('bookshelfCalOverrides');
      renderBookshelfCalendar();
      updateBookshelfCalEditPanel();
    };
    document.body.appendChild(resetBtn);

    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 달력 좌표 복사';
    copyBtn.style.cssText = 'position:fixed; top:44px; left:276px; z-index:10001; padding:6px 10px; border-radius:6px; border:none; cursor:pointer; background:#ffcf5c;';
    copyBtn.onclick = async () => {
      const SEL = { calPrev:'.bookshelf-cal-prev', calNext:'.bookshelf-cal-next', calLabel:'.bookshelf-cal-label', calGrid:'.bookshelf-cal-grid' };
      const lines = Object.entries(bookshelfCalOverrides).map(([key, ov]) => {
        const props = ['left','top','width','height'].filter(k => ov[k] !== undefined).map(k => `${k}:${ov[k]}%;`).join(' ');
        const sel = SEL[key] || `[data-cal-key="${key}"]`; // calCol0~calCol6 (요일 열)
        return `${sel}{ ${props} }`;
      });
      const text = lines.length ? lines.join('\n') : '(변경된 게 없어요)';
      try{
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = '✅ 복사됨!';
      }catch(e){
        copyBtn.textContent = '복사 실패 (아래 확인)';
        alert(text);
      }
      setTimeout(() => { copyBtn.textContent = '📋 달력 좌표 복사'; }, 1500);
    };
    document.body.appendChild(copyBtn);
  }

  // 화살표/라벨: transform:translate(-50%,-50%)로 가운데 정렬되므로 중심점 기준으로 드래그
  ['calPrev', 'calNext', 'calLabel'].forEach(key => {
    const el = document.querySelector(`[data-cal-key="${key}"]`);
    if(!el) return;
    el.onclick = null; // 편집 모드에서는 클릭해도 월 이동 안 되게
    el.style.pointerEvents = 'auto';
    el.style.cursor = 'move';
    let startX, startY, startCenterXPct, startCenterYPct;
    el.onpointerdown = (e) => {
      e.preventDefault();
      const panelRect = panel.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      startCenterXPct = (rect.left + rect.width / 2 - panelRect.left) / panelRect.width * 100;
      startCenterYPct = (rect.top + rect.height / 2 - panelRect.top) / panelRect.height * 100;
      el._dragging = true;
      try{ el.setPointerCapture(e.pointerId); }catch(err){}
    };
    el.onpointermove = (e) => {
      if(!el._dragging) return;
      const panelRect = panel.getBoundingClientRect();
      const newLeftPct = startCenterXPct + (e.clientX - startX) / panelRect.width * 100;
      const newTopPct = startCenterYPct + (e.clientY - startY) / panelRect.height * 100;
      el.style.left = newLeftPct.toFixed(2) + '%';
      el.style.top = newTopPct.toFixed(2) + '%';
      saveCalOverride(key, { left: +newLeftPct.toFixed(2), top: +newTopPct.toFixed(2) });
    };
    el.onpointerup = () => { el._dragging = false; };
  });

  // 그리드: 왼쪽 위 모서리 기준 드래그
  const gridEl = document.querySelector('[data-cal-key="calGrid"]');
  if(gridEl){
    gridEl.style.cursor = 'move';
    let startX, startY, startLeftPx, startTopPx;
    gridEl.onpointerdown = (e) => {
      e.preventDefault();
      const panelRect = panel.getBoundingClientRect();
      const rect = gridEl.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      startLeftPx = rect.left - panelRect.left;
      startTopPx = rect.top - panelRect.top;
      gridEl._dragging = true;
      try{ gridEl.setPointerCapture(e.pointerId); }catch(err){}
    };
    gridEl.onpointermove = (e) => {
      if(!gridEl._dragging) return;
      const panelRect = panel.getBoundingClientRect();
      const newLeftPct = (startLeftPx + (e.clientX - startX)) / panelRect.width * 100;
      const newTopPct = (startTopPx + (e.clientY - startY)) / panelRect.height * 100;
      gridEl.style.left = newLeftPct.toFixed(2) + '%';
      gridEl.style.top = newTopPct.toFixed(2) + '%';
      saveCalOverride('calGrid', { left: +newLeftPct.toFixed(2), top: +newTopPct.toFixed(2) });
    };
    gridEl.onpointerup = () => { gridEl._dragging = false; };
  }

  updateBookshelfCalEditPanel();
}
function closeBookshelfModal(){
  document.getElementById('bookshelfModal').classList.remove('show');
  window.removeEventListener('resize', positionBookshelfModal);
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
  document.querySelectorAll('.bookshelf-tab-hotspot').forEach(el => {
    el.onclick = () => { bookshelfActiveTab = el.dataset.bookshelfTab; renderBookshelfModalImg(); };
  });
  document.getElementById('bookshelfCalPrev').onclick = bookshelfCalPrevMonth;
  document.getElementById('bookshelfCalNext').onclick = bookshelfCalNextMonth;

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
