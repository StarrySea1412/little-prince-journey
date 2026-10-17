(function () {
  "use strict";

  var KEY = "little-prince-journey:v2";
  var byId = function (id) { return document.getElementById(id); };
  var chapters = Array.prototype.slice.call(document.querySelectorAll(".chapter"));
  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var reduce = motionQuery.matches;
  try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch (error) { /* Some embedded browsers keep this read-only. */ }
  var descriptions = ["换一种眼光，看见帽子里的秘密", "照料玫瑰，记住属于你的黄昏", "拔掉幼苗，给小小星球梳洗", "向玫瑰告别，乘候鸟启程", "拜访六个大人，收集不同的答案", "穿过沙漠，寻找独一无二", "慢慢靠近，让陌生变成牵挂", "转动辘轳，找到沙漠里的礼物", "点亮星星，把笑声带回家"];
  var initial = { lastChapter: null, draw: false, rose: false, pulled: [], planets: [], fox: 0, well: false, stars: [], sound: false };
  var state = Object.assign({}, initial);
  function validIndex(value, max) { return Number.isInteger(value) && value >= 0 && value <= max; }
  function indices(value, max) {
    return Array.isArray(value) ? value.filter(function (v, i, all) { return validIndex(v, max) && all.indexOf(v) === i; }).sort(function (a, b) { return a - b; }) : [];
  }
  try {
    var saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
      state.lastChapter = validIndex(saved.lastChapter, 8) ? saved.lastChapter : null;
      ["draw", "rose", "well", "sound"].forEach(function (key) { state[key] = typeof saved[key] === "boolean" ? saved[key] : false; });
      state.pulled = indices(saved.pulled, 2); state.planets = indices(saved.planets, 5); state.stars = indices(saved.stars, 6);
      state.fox = validIndex(saved.fox, 6) ? saved.fox : 0;
    }
  } catch (error) { /* Private browsing and malformed saves must not block the story. */ }
  var saveTimer = 0;
  var lastSaved = JSON.stringify(state);
  function flushSave() {
    clearTimeout(saveTimer);
    var serialized = JSON.stringify(state);
    if (serialized === lastSaved) return;
    try { localStorage.setItem(KEY, serialized); lastSaved = serialized; } catch (error) { /* The journey also works without storage. */ }
  }
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(flushSave, 300); }
  window.addEventListener("pagehide", flushSave);
  function say(message) { if (byId("journeyStatus")) byId("journeyStatus").textContent = message; }
  function live(id) { var el = byId(id); if (el) { el.setAttribute("aria-live", "polite"); el.setAttribute("aria-atomic", "true"); } }
  ["drawLine", "roseLine", "baobabCount", "miniCap", "foxLine", "wellLine", "starCount"].forEach(live);

  /* One audio context, unlocked only by an explicit sound or interaction gesture. */
  var audioContext = null, activeOscillators = [];
  function stopActiveAudio() {
    activeOscillators.slice().forEach(function (entry) {
      try { entry.oscillator.stop(); } catch (error) { /* Already stopped. */ }
      try { entry.oscillator.disconnect(); entry.gain.disconnect(); } catch (error) { /* Already disconnected. */ }
    });
    activeOscillators = [];
  }
  function chime(frequency, duration, volume) {
    if (!state.sound || document.hidden) return;
    try {
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      audioContext = audioContext || new AudioContextClass();
      if (audioContext.state === "suspended") audioContext.resume().catch(function () {});
      var oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      var now = audioContext.currentTime, length = duration || 0.8;
      oscillator.type = "sine"; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume || 0.07, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      var entry = { oscillator: oscillator, gain: gain };
      activeOscillators.push(entry);
      oscillator.onended = function () {
        activeOscillators = activeOscillators.filter(function (item) { return item !== entry; });
        try { oscillator.disconnect(); gain.disconnect(); } catch (error) { /* Already disconnected. */ }
      };
      oscillator.start(now); oscillator.stop(now + length + 0.08);
    } catch (error) { /* Unsupported and silent audio environments remain usable. */ }
  }
  function renderSound() {
    var button = byId("soundBtn");
    if (button) { button.setAttribute("aria-pressed", String(state.sound)); button.setAttribute("aria-label", state.sound ? "关闭声音" : "开启声音"); }
    if (byId("soundLabel")) byId("soundLabel").textContent = state.sound ? "声音已开启" : "声音已关闭";
  }
  if (byId("soundBtn")) byId("soundBtn").addEventListener("click", function () {
    state.sound = !state.sound; renderSound(); save();
    if (state.sound) chime(659, 0.6, 0.06);
    else if (audioContext) { stopActiveAudio(); audioContext.suspend().catch(function () {}); }
    say(state.sound ? "声音已开启。" : "声音已关闭。");
  });
  renderSound();

  function completed() { return [state.draw, state.rose, state.pulled.length === 3, state.planets.length === 6, state.fox === 6, state.well, state.stars.length === 7]; }
  var interactionChapters = [0, 1, 2, 4, 6, 7, 8];
  var current = -1, mapStops = [], railButtons = [];
  var pendingNavigation = null, pendingNavigationTimer = 0, navigationToken = 0;
  var initialHash = window.location.hash, initializing = Boolean(initialHash), lastFollowedHash = "";
  function cancelPendingNavigation() {
    clearTimeout(pendingNavigationTimer); pendingNavigationTimer = 0; pendingNavigation = null;
  }
  function finishPendingNavigation(token) {
    if (!pendingNavigation || (token && pendingNavigation.token !== token)) return;
    var target = pendingNavigation;
    cancelPendingNavigation();
    if (target.cover) updateCurrent(-1, true);
    var hash = target.cover ? "#cover" : "#" + chapters[target.index].id;
    if (window.location.hash !== hash) {
      try { history.replaceState(null, "", hash); } catch (error) { /* History may be restricted. */ }
    }
  }
  function beginPendingNavigation(index, cover, instant) {
    cancelPendingNavigation();
    var token = ++navigationToken;
    pendingNavigation = { index: index, cover: cover, instant: Boolean(instant), readyAt: performance.now() + ((instant || reduce) ? 700 : 0), token: token };
    function settle() {
      if (!pendingNavigation || pendingNavigation.token !== token) return;
      if (pendingNavigation.cover && pendingNavigation.instant && window.scrollY > 4) {
        scrollInstantly(function () { window.scrollTo({ top: 0, behavior: "auto" }); });
        scheduleScroll();
        pendingNavigationTimer = setTimeout(settle, 250);
        return;
      }
      finishPendingNavigation(token);
    }
    pendingNavigationTimer = setTimeout(settle, 2200);
  }
  function scrollInstantly(action) {
    var root = document.documentElement, previous = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    action();
    root.style.scrollBehavior = previous;
  }
  function renderJourney() {
    var collection = completed(), count = collection.filter(Boolean).length;
    if (byId("collectCount")) byId("collectCount").textContent = count + " / 7";
    interactionChapters.forEach(function (chapter, i) {
      var inter = chapters[chapter] && chapters[chapter].querySelector(".inter");
      if (inter) inter.classList.toggle("is-complete", collection[i]);
    });
    var position = current >= 0 ? current : state.lastChapter;
    if (byId("journeyProgress")) { byId("journeyProgress").max = 9; byId("journeyProgress").value = current + 1; }
    if (byId("mapProgress")) byId("mapProgress").textContent = "旅程 " + (position === null || position < 0 ? 0 : position + 1) + " / 9 · 纪念 " + count + " / 7";
    if (byId("resumeBtn")) {
      byId("resumeBtn").hidden = state.lastChapter === null;
      if (state.lastChapter !== null) byId("resumeBtn").setAttribute("aria-label", "继续旅程：第 " + (state.lastChapter + 1) + " 章，" + chapters[state.lastChapter].getAttribute("data-name"));
    }
    mapStops.forEach(function (button, i) {
      var interaction = interactionChapters.indexOf(i);
      var collected = interaction !== -1 && collection[interaction];
      button.classList.toggle("is-complete", collected);
      button.classList.toggle("is-current", i === current);
      if (i === current) button.setAttribute("aria-current", "step"); else button.removeAttribute("aria-current");
      button.setAttribute("aria-label", "第 " + (i + 1) + " 章，" + chapters[i].getAttribute("data-name") + "。" + descriptions[i] + (collected ? "。已收集本章纪念" : ""));
    });
  }
  function commit(message) { renderJourney(); save(); if (message) say(message); }
  function updateCurrent(index, suppressHash) {
    if (current === index) return;
    current = index;
    var dock = byId("chapterDock"); if (dock) dock.hidden = index < 0;
    if (index >= 0) {
      if (byId("currentChapterName")) byId("currentChapterName").textContent = chapters[index].getAttribute("data-name");
      if (byId("currentChapterNumber")) byId("currentChapterNumber").textContent = String(index + 1).padStart(2, "0") + " / 09";
      if (state.lastChapter !== index) { state.lastChapter = index; save(); }
      // Keep refreshed and shared chapter links aligned with the visible story.
      if (!suppressHash && !initializing && window.location.hash !== "#" + chapters[index].id) {
        try { history.replaceState(null, "", "#" + chapters[index].id); } catch (error) { /* Storage and history may be restricted. */ }
      }
    }
    if (byId("prevChapterBtn")) byId("prevChapterBtn").disabled = index <= 0;
    if (byId("nextChapterBtn")) byId("nextChapterBtn").disabled = index >= chapters.length - 1;
    railButtons.forEach(function (button, i) {
      button.classList.toggle("on", i === index);
      if (i === index) button.setAttribute("aria-current", "step"); else button.removeAttribute("aria-current");
    });
    renderJourney();
  }
  function goTo(index, changeHash, instant) {
    if (!validIndex(index, chapters.length - 1)) return;
    cancelPendingNavigation();
    if (changeHash !== false) lastFollowedHash = "";
    if (changeHash !== false && window.location.hash !== "#" + chapters[index].id) {
      try { history.pushState(null, "", "#" + chapters[index].id); } catch (error) { window.location.hash = chapters[index].id; }
    }
    beginPendingNavigation(index, false, instant);
    if (reduce || instant) scrollInstantly(function () { chapters[index].scrollIntoView({ behavior: "auto", block: "start" }); });
    else chapters[index].scrollIntoView({ behavior: "smooth", block: "start" });
    say("前往第 " + (index + 1) + " 章：" + chapters[index].getAttribute("data-name") + "。");
    scheduleScroll();
  }
  var dialog = byId("journeyMap"), mapButton = byId("mapBtn");
  function closeMap() {
    if (!dialog) return;
    if (typeof dialog.close === "function" && dialog.open) dialog.close(); else dialog.removeAttribute("open");
    if (mapButton) { mapButton.setAttribute("aria-expanded", "false"); mapButton.focus({ preventScroll: true }); }
  }
  chapters.forEach(function (chapter, i) {
    if (byId("rail")) {
      var railButton = document.createElement("button");
      railButton.type = "button"; railButton.textContent = "✦";
      railButton.setAttribute("data-label", String(i + 1).padStart(2,"0") + " · " + chapter.getAttribute("data-name"));
      railButton.setAttribute("aria-label", "前往第 " + (i + 1) + " 章：" + chapter.getAttribute("data-name"));
      railButton.addEventListener("click", function () { goTo(i); });
      byId("rail").appendChild(railButton); railButtons.push(railButton);
    }
    if (byId("mapGrid")) {
      var stop = document.createElement("button"); stop.type = "button"; stop.className = "map-stop";
      [["map-num", String(i + 1).padStart(2, "0")], ["map-name", chapter.getAttribute("data-name")], ["map-note", descriptions[i]]].forEach(function (part) {
        var span = document.createElement("span"); span.className = part[0]; span.textContent = part[1]; stop.appendChild(span);
      });
      stop.addEventListener("click", function () { closeMap(); goTo(i); });
      byId("mapGrid").appendChild(stop); mapStops.push(stop);
    }
  });
  if (mapButton && dialog) {
    mapButton.setAttribute("aria-haspopup", "dialog"); mapButton.setAttribute("aria-controls", "journeyMap"); mapButton.setAttribute("aria-expanded", "false");
    mapButton.addEventListener("click", function () {
      if (dialog.open) return;
      renderJourney();
      if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
      mapButton.setAttribute("aria-expanded", "true");
      var focusTarget = mapStops[current >= 0 ? current : state.lastChapter || 0] || byId("mapCloseBtn");
      if (focusTarget) focusTarget.focus();
    });
    dialog.addEventListener("close", function () { mapButton.setAttribute("aria-expanded", "false"); mapButton.focus({ preventScroll: true }); });
    dialog.addEventListener("cancel", function () { mapButton.setAttribute("aria-expanded", "false"); });
    dialog.addEventListener("click", function (event) {
      if (event.target !== dialog) return;
      var rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeMap();
    });
    dialog.addEventListener("keydown", function (event) { if (event.key === "Escape" && typeof dialog.showModal !== "function") { event.preventDefault(); closeMap(); } });
  }
  if (byId("mapCloseBtn")) byId("mapCloseBtn").addEventListener("click", closeMap);
  if (byId("enterBtn")) byId("enterBtn").addEventListener("click", function () { chime(659, 1, 0.06); goTo(0); });
  if (byId("resumeBtn")) byId("resumeBtn").addEventListener("click", function () { if (state.lastChapter !== null) goTo(state.lastChapter); });
  if (byId("prevChapterBtn")) byId("prevChapterBtn").addEventListener("click", function () { goTo(Math.max(0, current - 1)); });
  if (byId("nextChapterBtn")) byId("nextChapterBtn").addEventListener("click", function () { goTo(Math.min(chapters.length - 1, current + 1)); });
  if (byId("totopBtn")) byId("totopBtn").addEventListener("click", function () {
    cancelPendingNavigation();
    lastFollowedHash = "";
    try { history.pushState(null, "", "#cover"); } catch (error) { /* Scrolling still works. */ }
    beginPendingNavigation(-1, true, false);
    if (reduce) scrollInstantly(function () { window.scrollTo({ top: 0, behavior: "auto" }); });
    else window.scrollTo({ top: 0, behavior: "smooth" });
    scheduleScroll();
  });
  function followHash(instant) {
    var hash = window.location.hash;
    if (hash === lastFollowedHash) return;
    lastFollowedHash = hash;
    cancelPendingNavigation();
    var index = chapters.findIndex(function (chapter) { return "#" + chapter.id === hash; });
    if (index >= 0) goTo(index, false, instant === true);
    else if (hash === "#cover") {
      beginPendingNavigation(-1, true, instant === true);
      if (reduce || instant) scrollInstantly(function () { window.scrollTo({ top: 0, behavior: "auto" }); });
      else window.scrollTo({ top: 0, behavior: "smooth" });
      scheduleScroll();
    }
  }
  window.addEventListener("hashchange", function () { followHash(false); });
  window.addEventListener("popstate", function () { followHash(true); });

  var fullscreen = byId("fullscreenBtn");
  if (fullscreen) {
    fullscreen.hidden = typeof document.documentElement.requestFullscreen !== "function" || document.fullscreenEnabled === false;
    fullscreen.setAttribute("aria-pressed", "false");
    fullscreen.addEventListener("click", function () {
      var action = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
      if (action && action.catch) action.catch(function () { say("当前浏览器暂时无法进入全屏。"); });
    });
    document.addEventListener("fullscreenchange", function () {
      fullscreen.setAttribute("aria-pressed", String(Boolean(document.fullscreenElement)));
      fullscreen.setAttribute("aria-label", document.fullscreenElement ? "退出全屏" : "进入全屏");
    });
  }

  /* Existing interaction IDs stay stable; collection is separate from the current view. */
  var showBoa = state.draw;
  function renderDrawing() {
    if (byId("drawingScene")) { byId("drawingScene").src = "assets/stamp-" + (showBoa ? "boa" : "hat") + ".webp"; byId("drawingScene").alt = showBoa ? "水彩画：蟒蛇的肚子里，藏着一头大象" : "水彩画：一顶帽子，还是另一种可能？"; }
    byId("hatImg").classList.toggle("off", showBoa); byId("hatImg").setAttribute("aria-hidden", String(showBoa));
    byId("boaImg").classList.toggle("off", !showBoa); byId("boaImg").setAttribute("aria-hidden", String(!showBoa));
    byId("drawLine").textContent = showBoa ? "可那底下，是一头大象——只有孩子看得出来。" : "大人们看到的，永远是一顶帽子。";
    byId("drawLine").classList.add("show"); byId("drawBtn").textContent = showBoa ? "变回帽子" : "让蟒蛇显形";
    byId("drawBtn").setAttribute("aria-pressed", String(showBoa));
  }
  byId("drawBtn").addEventListener("click", function () { showBoa = !showBoa; if (showBoa) state.draw = true; renderDrawing(); chime(showBoa ? 392 : 523); commit(); });
  renderDrawing();
  function renderRose() {
    byId("roseWrap").classList.toggle("bloomed", state.rose); byId("roseLine").classList.toggle("show", state.rose);
    byId("roseBtn").disabled = state.rose; byId("roseBtn").textContent = state.rose ? "花瓣展开了" : "给它浇一点水";
  }
  byId("roseBtn").addEventListener("click", function () {
    if (state.rose) return; state.rose = true; renderRose(); chime(523); setTimeout(function () { chime(784); }, 180); commit("玫瑰绽放了，收下一份关于照料的纪念。");
  }); renderRose();

  var saplings = [];
  function renderSaplings() {
    saplings.forEach(function (button, i) { var gone = state.pulled.indexOf(i) !== -1; button.classList.toggle("gone", gone); button.disabled = gone; button.setAttribute("aria-pressed", String(gone)); });
    byId("baobabCount").textContent = "已拔除 " + state.pulled.length + " / 3" + (state.pulled.length === 3 ? " ✦" : "");
    byId("baobabLine").classList.toggle("show", state.pulled.length === 3);
  }
  for (var seed = 0; seed < 3; seed++) (function (index) {
    var button = document.createElement("button"); button.type = "button"; button.className = "sapling";
    button.setAttribute("aria-label", "拔掉第 " + (index + 1) + " 棵猴面包树幼苗");
    var image = document.createElement("img"); image.src = "assets/thumbs/stamp-sapling.webp"; image.alt = ""; image.width = 96; image.height = 96; image.loading = "lazy"; image.decoding = "async"; button.appendChild(image);
    button.addEventListener("click", function () {
      if (state.pulled.indexOf(index) !== -1) return;
      state.pulled.push(index); renderSaplings(); chime(392 + state.pulled.length * 60); commit(state.pulled.length === 3 ? "星球梳洗好了，收下一份关于守护的纪念。" : "");
    });
    byId("saplingRow").appendChild(button); saplings.push(button);
  })(seed);
  renderSaplings();

  var planets = [
    { name: "国王", caption: "<b>国王</b>：「我命令你打哈欠。」他统辖着一切，连星星都得按时听他指挥——虽然他的星球上，只有他自己和一件旧袍子。" },
    { name: "虚荣者", caption: "<b>虚荣者</b>：「请鼓掌吧！」——他戴着一顶高高的帽子，只听见掌声，别的什么都听不见。" },
    { name: "酒鬼", caption: "<b>酒鬼</b>：「你为什么要喝酒？」「为了忘记。」「忘记什么？」「忘记我喝酒的羞愧。」" },
    { name: "商人", caption: "<b>商人</b>：他埋头数星星，把编号写进纸片锁进抽屉。「我占有它们。」——占有从不能让人富有，只会让人一直忙。" },
    { name: "点灯人", caption: "<b>点灯人</b>：照亮的是一整颗星球，所以他每分钟都要点一次灯、熄一次灯。他是唯一一个，让小王子觉得在忙正经事的大人。" },
    { name: "地理学家", caption: "<b>地理学家</b>：「我只记录永恒的山河。花？花是短暂的，不在我的记录里。」——可是小王子的那朵玫瑰，正是这样一朵花。" }
  ];
  var planetButtons = [];
  function renderPlanets() { planetButtons.forEach(function (button, i) { var seen = state.planets.indexOf(i) !== -1; button.classList.toggle("on", seen); button.setAttribute("aria-pressed", String(seen)); }); }
  planets.forEach(function (planet, i) {
    var button = document.createElement("button"); button.type = "button"; button.className = "mini"; button.setAttribute("aria-label", "拜访" + planet.name + "的星球");
    var image = document.createElement("img"); image.src = "assets/thumbs/planet-" + (i + 1) + ".webp"; image.alt = ""; image.width = 74; image.height = 74; image.loading = "lazy"; image.decoding = "async";
    var name = document.createElement("span"); name.textContent = planet.name; button.appendChild(image); button.appendChild(name);
    button.addEventListener("click", function () {
      var firstVisit = state.planets.indexOf(i) === -1; if (firstVisit) state.planets.push(i);
      byId("miniCap").innerHTML = planet.caption; renderPlanets(); chime(392 + i * 55);
      commit(firstVisit && state.planets.length === 6 ? "六颗星球都已拜访，收下一份关于大人的纪念。" : "");
    }); byId("miniRow").appendChild(button); planetButtons.push(button);
  });
  renderPlanets(); if (state.planets.length) byId("miniCap").innerHTML = planets[state.planets[state.planets.length - 1]].caption;

  var foxSteps = ["狐狸坐在麦田里，隔着一段距离，安静地看着你。", "它没有动。驯养的第一天，安静就是礼貌。", "它歪了歪头——开始有点好奇了。", "它向前挪了半步。你听见了自己的心跳。", "它的耳朵转向了你。麦田里，只剩风经过的声音。", "你们之间安静得，能听见麦子一点点变黄。", "「从今天起，你对我来说就是独一无二的了。」狐狸说，「金色的麦子会让我想起你。」然后它把秘密也告诉了你：有些东西，不用眼睛，也看得见。"];
  for (var paw = 0; paw < 6; paw++) byId("pawRow").insertAdjacentHTML("beforeend", '<svg class="paw" viewBox="0 0 24 24" fill="#e6b95c" aria-hidden="true"><circle cx="12" cy="15.5" r="4.6"/><circle cx="5.6" cy="10.4" r="2.1"/><circle cx="10.3" cy="7.2" r="2.1"/><circle cx="14.9" cy="7.2" r="2.1"/><circle cx="19.2" cy="10.6" r="2.1"/></svg>');
  var foxBusy = false;
  function renderFox() {
    Array.prototype.forEach.call(byId("pawRow").children, function (el, i) { el.classList.toggle("on", i < state.fox); });
    byId("foxScene").style.transform = reduce ? "none" : "scale(" + (1 + state.fox * 0.02) + ")";
    byId("foxScene").style.filter = state.fox === 6 ? "brightness(1.07) saturate(1.05)" : "";
    byId("foxLine").textContent = foxSteps[state.fox]; byId("foxLine").classList.add("show");
    byId("foxBtn").disabled = foxBusy || state.fox === 6;
    byId("foxBtn").textContent = state.fox === 6 ? "它已经是你的狐狸了" : foxBusy ? "等一等，狐狸正在靠近…" : "再靠近一点";
    byId("foxBtn").setAttribute("aria-label", state.fox === 6 ? "已经与狐狸建立联系" : "再靠近一点，当前第 " + state.fox + " / 6 步");
  }
  byId("foxBtn").addEventListener("click", function () {
    if (foxBusy || state.fox === 6) return;
    state.fox++; foxBusy = state.fox < 6; renderFox(); chime(440 + state.fox * 42); commit(state.fox === 6 ? "你和狐狸建立了联系，收下一份关于耐心的纪念。" : "");
    if (foxBusy) setTimeout(function () { foxBusy = false; renderFox(); }, 900);
  }); renderFox();

  var wellTurns = state.well ? 3 : 0, wellBusy = false;
  function renderWell() {
    byId("wellWrap").classList.toggle("drawn", state.well); byId("wellWrap").style.setProperty("--well-progress", wellTurns / 3);
    byId("wellDown").classList.toggle("off", state.well); byId("wellDown").setAttribute("aria-hidden", String(state.well));
    byId("wellUp").classList.toggle("off", !state.well); byId("wellUp").setAttribute("aria-hidden", String(!state.well));
    byId("wellBtn").disabled = state.well || wellBusy;
    byId("wellBtn").textContent = state.well ? "水打上来了" : wellTurns ? "继续转动辘轳（" + wellTurns + " / 3）" : "转动辘轳（0 / 3）";
    byId("wellLine").textContent = state.well ? "这一桶水，喝起来像一份节日的礼物。" : wellTurns === 1 ? "辘轳轻轻唱起来，水桶正在离开井底。" : "绳子慢慢收紧，水面离星光更近了一点。";
    byId("wellLine").classList.toggle("show", wellTurns > 0);
  }
  byId("wellBtn").addEventListener("click", function () {
    if (state.well || wellBusy) return;
    wellTurns++; state.well = wellTurns === 3; wellBusy = !state.well;
    renderWell(); chime([392, 523, 659][wellTurns - 1]); commit(state.well ? "水桶升到了井口，收下一份关于寻找的纪念。" : "");
    if (wellBusy) setTimeout(function () { wellBusy = false; renderWell(); }, 420);
  }); renderWell();

  var starButtons = [];
  function renderStars() {
    starButtons.forEach(function (button, i) { var lit = state.stars.indexOf(i) !== -1; button.classList.toggle("lit", lit); button.setAttribute("aria-pressed", String(lit)); button.disabled = lit; });
    byId("starCount").textContent = "已经笑出声的星星：" + state.stars.length + " / 7";
    byId("starLine").classList.toggle("show", state.stars.length === 7);
  }
  for (var star = 0; star < 7; star++) (function (index) {
    var button = document.createElement("button"); button.type = "button"; button.className = "star"; button.textContent = "✦";
    button.setAttribute("aria-label", "点亮第 " + (index + 1) + " 颗星星");
    button.addEventListener("click", function () {
      if (state.stars.indexOf(index) !== -1) return;
      state.stars.push(index); renderStars(); chime(523 * Math.pow(1.108, index)); commit(state.stars.length === 7 ? "星星都笑了，收下一份关于思念的纪念。" : "");
    }); byId("starRow").appendChild(button); starButtons.push(button);
  })(star);
  renderStars(); renderJourney();

  /* A single scheduled scroll read drives navigation and the reveal fallback. */
  var revealElements = Array.prototype.slice.call(document.querySelectorAll(".ch-head,.scene,.card,.quote,.inter,.final .last"));
  var observer = null, scrollFrame = 0;
  function reveal(element) {
    if (element.classList.contains("fx-in")) return;
    element.classList.add("fx-in");
    if (observer) observer.unobserve(element);
    setTimeout(function () { element.classList.remove("fx"); }, reduce ? 0 : 1100);
  }
  function checkReveals() {
    revealElements.forEach(function (element) {
      if (!element.classList.contains("fx") || element.classList.contains("fx-in")) return;
      var rect = element.getBoundingClientRect();
      if (rect.top < innerHeight - 24 && rect.bottom > 0) reveal(element);
    });
  }
  function checkScroll() {
    scrollFrame = 0;
    var index = -1;
    chapters.forEach(function (chapter, i) { if (chapter.getBoundingClientRect().top < innerHeight * 0.45) index = i; });
    updateCurrent(index, Boolean(pendingNavigation));
    if (pendingNavigation) {
      var target = pendingNavigation;
      var reached = performance.now() >= target.readyAt && (target.cover ? window.scrollY <= 4 : Math.abs(chapters[target.index].getBoundingClientRect().top) <= 8);
      if (reached) finishPendingNavigation(target.token);
    }
    checkReveals();
  }
  function scheduleScroll() { if (!scrollFrame) scrollFrame = requestAnimationFrame(checkScroll); }
  if (!reduce) {
    try {
      if ("IntersectionObserver" in window) observer = new IntersectionObserver(function (entries) { entries.forEach(function (entry) { if (entry.isIntersecting) reveal(entry.target); }); }, { threshold: 0.04 });
      revealElements.forEach(function (element) { element.classList.add("fx"); if (observer) observer.observe(element); });
    } catch (error) { revealElements.forEach(function (element) { element.classList.remove("fx"); }); }
  } else revealElements.forEach(function (element) { element.classList.remove("fx"); element.classList.add("fx-in"); });
  window.addEventListener("scroll", scheduleScroll, { passive: true }); window.addEventListener("resize", scheduleScroll);
  window.addEventListener("load", function () { followHash(true); initializing = false; scheduleScroll(); });
  window.addEventListener("pageshow", scheduleScroll);
  document.querySelectorAll("img").forEach(function (image) { image.addEventListener("load", scheduleScroll, { once: true }); });
  checkScroll();

  /* The ambient canvas never keeps a duplicate animation loop alive. */
  var canvas = byId("sky"), context = canvas && canvas.getContext("2d");
  var skyFrame = 0, lastPaint = 0, width = 0, height = 0, skyStars = [], mouseX = 0, mouseY = 0;
  function paintSky(time) {
    if (!context) return;
    context.clearRect(0, 0, width, height);
    skyStars.forEach(function (star) {
      var alpha = reduce ? 0.6 : 0.3 + 0.5 * Math.abs(Math.sin(time / 1000 * star.speed + star.phase));
      context.fillStyle = "rgba(233,228,214," + alpha.toFixed(3) + ")"; context.beginPath();
      context.arc(star.x + (reduce ? 0 : mouseX * star.depth * 8), star.y + (reduce ? 0 : mouseY * star.depth * 6), star.radius, 0, Math.PI * 2); context.fill();
    });
  }
  function resizeSky() {
    if (!context) return;
    width = innerWidth; height = innerHeight; var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); context.setTransform(dpr, 0, 0, dpr, 0, 0);
    skyStars = [];
    for (var i = 0, count = Math.max(60, Math.min(180, Math.round(width * height / 10000))); i < count; i++) skyStars.push({ x: Math.random() * width, y: Math.random() * height, radius: 0.4 + Math.random() * 1.3, phase: Math.random() * 6.28, speed: 0.4 + Math.random(), depth: 0.2 + Math.random() });
    paintSky(performance.now());
  }
  function skyLoop(time) {
    skyFrame = 0; if (document.hidden || reduce || !context) return;
    if (time - lastPaint >= 32) { paintSky(time); lastPaint = time; }
    skyFrame = requestAnimationFrame(skyLoop);
  }
  function startSky() { if (!skyFrame && !reduce && !document.hidden && context) skyFrame = requestAnimationFrame(skyLoop); }
  function stopSky() { if (skyFrame) cancelAnimationFrame(skyFrame); skyFrame = 0; }
  window.addEventListener("resize", resizeSky);
  window.addEventListener("pointermove", function (event) { if (event.pointerType === "mouse" && !reduce) { mouseX = (event.clientX / innerWidth - 0.5) * 2; mouseY = (event.clientY / innerHeight - 0.5) * 2; } }, { passive: true });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { stopSky(); flushSave(); if (audioContext) { stopActiveAudio(); audioContext.suspend().catch(function () {}); } }
    else { startSky(); scheduleScroll(); }
  });
  function motionChanged(event) {
    reduce = event.matches; renderFox();
    if (reduce) { stopSky(); if (observer) observer.disconnect(); revealElements.forEach(function (element) { element.classList.remove("fx"); element.classList.add("fx-in"); }); paintSky(performance.now()); }
    else startSky();
  }
  if (motionQuery.addEventListener) motionQuery.addEventListener("change", motionChanged); else if (motionQuery.addListener) motionQuery.addListener(motionChanged);
  resizeSky(); startSky();
})();
