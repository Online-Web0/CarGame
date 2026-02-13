// CarGame - rebuilt script.js (single file, no dependencies beyond three.js + firebase)
// Works with the provided index.html / style.css structure in your project.

// ====== TUNING (your values kept) ======
var SPEED = 0.004;
var CAMERA_LAG = 0.82;
var COLLISION = 1.1;        // kept (used only for optional player collisions)
var BOUNCE = 0.7;
var mapscale = 50;
var VR = false;
var BOUNCE_CORRECT = 0.01;
var WALL_SIZE = 1.2;
var MOUNTAIN_DIST = 2500;
var OOB_DIST = 200;
var LAPS = 3;

// New tuning
var MAX_SPEED = 0.9;
var STEER_MIN = 0.05;
var STEER_SPEED = 0.12;
var CAM_HEIGHT = 4;

function MODS() {}

// ====== Firebase connection ======
// NOTE: This assumes firebase scripts are already loaded in index.html
var database = null;
var authReady = false;
try {
  var firebaseConfig = {
    apiKey: "AIzaSyAbvjrx9Nvu2_xRFTN-AEN8dJgRUDdb410",
    authDomain: "car-game67.firebaseapp.com",
    databaseURL: "https://car-game67-default-rtdb.firebaseio.com/",
    projectId: "car-game67",
    storageBucket: "car-game67.appspot.com",
    messagingSenderId: "211052611005",
    appId: "1:211052611005:web:bd456d81c7be8825e1fed4"
  };

  if (typeof firebase !== "undefined" && firebase.apps && firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
  }
  if (typeof firebase !== "undefined") {
    database = firebase.database();
    firebase.auth().onAuthStateChanged(function (u) { authReady = !!u; });
    firebase.auth().signInAnonymously().catch(function (e) {
      console.warn("Firebase auth failed (solo still works):", e);
    });
  }
} catch (e) {
  console.warn("Firebase init failed (solo still works):", e);
}

// ====== Three.js globals ======
var scene, renderer, camera;
var mapGroup, cpGroup, decoGroup;
var ground;

// ====== Map physics data ======
var wallSegs = [];  // {a:V2,b:V2,dir:V2,len2:number,mesh:Mesh}
var cpSegs = [];    // [0]=start, [1]=checkpoint {a,b,dir,len2,normal:V2,mesh}
var spawnX = 0, spawnY = 0, spawnDir = 0;

// ====== Multiplayer/game state ======
var ROOM = null;
var isHost = false;
var roomRef = null;
var playersRef = null;
var startRef = null;

var players = {};   // key -> {key, data, model, label, ref, isMe}
var meKey = null;
var me = null;

var gameStarted = false;      // true after room start signal (or solo start)
var gameSortaStarted = false; // countdown freeze

// ====== Input state ======
var left = false;
var right = false;
var up = false;
var down = false;
var mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// ====== UI elements ======
var foreEl, titleEl, startEl, nameEl, pickerEl, sliderEl, countdownEl, lapEl, settingsEl, toolbarEl;
var modeWrapEl = null;
var overlayMsgEl = null;

// Global color (index.html expects it)
var color = "#ff3030";

// ====== Utility ======
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function nowMs() { return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now(); }

function safeRemove(el) { if (!el) return; try { el.remove(); } catch (e) {} }

function makeDiv(id, className, text) {
  var d = document.createElement("div");
  if (id) d.id = id;
  if (className) d.className = className;
  if (typeof text === "string") d.innerHTML = text;
  return d;
}

function vec2(x, y) { return new THREE.Vector2(x, y); }

function reflect2(v, n) {
  // v,n are Vector2, n must be unit
  var d = v.dot(n);
  return v.clone().sub(n.clone().multiplyScalar(2 * d));
}

function segClosestPoint(p, a, b) {
  var ab = b.clone().sub(a);
  var t = 0;
  var len2 = ab.lengthSq();
  if (len2 > 1e-9) t = clamp(p.clone().sub(a).dot(ab) / len2, 0, 1);
  return a.clone().add(ab.multiplyScalar(t));
}

function parseV2(tok) {
  // "x,y"
  var parts = tok.split(",");
  if (parts.length !== 2) return null;
  var x = parseFloat(parts[0]);
  var y = parseFloat(parts[1]);
  if (!isFinite(x) || !isFinite(y)) return null;
  return vec2(x, y);
}

function parseSeg(tok) {
  // "x1,y1/x2,y2"
  var p = tok.split("/");
  if (p.length !== 2) return null;
  var a = parseV2(p[0]);
  var b = parseV2(p[1]);
  if (!a || !b) return null;
  return { a: a, b: b };
}

function getTrackCode() {
  var el = document.getElementById("trackcode");
  if (!el) return "";
  return (el.textContent || "").trim();
}

function setTrackCode(str) {
  var el = document.getElementById("trackcode");
  if (!el) return;
  el.textContent = (str || "").trim();
  buildMapFromTrackCode(getTrackCode());
}

// Expose for you to paste maps from console if you want
window.setTrackCode = setTrackCode;

// ====== Engine init ======
function ensureEngine() {
  if (scene && renderer && mapGroup && cpGroup) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7fb0ff);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Put canvas behind UI
  renderer.domElement.style.position = "fixed";
  renderer.domElement.style.top = "0";
  renderer.domElement.style.left = "0";
  renderer.domElement.style.zIndex = "-1";
 renderer.domElement.style.pointerEvents = "none";
  document.body.insertBefore(renderer.domElement, document.body.firstChild);

  // Groups
  mapGroup = new THREE.Group();
  cpGroup = new THREE.Group();
  decoGroup = new THREE.Group();
  scene.add(mapGroup);
  scene.add(cpGroup);
  scene.add(decoGroup);

  // Ground (resized after loading map)
  var gGeo = new THREE.PlaneGeometry(300, 300);
  gGeo.rotateX(-Math.PI / 2);
  var gMat = new THREE.MeshStandardMaterial({ color: 0x4aa85e, roughness: 1 });
  ground = new THREE.Mesh(gGeo, gMat);
  ground.receiveShadow = true;
  scene.add(ground);

  // Camera + lights
  camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 1, 2000);
  camera.position.set(0, CAM_HEIGHT, 10);
  scene.add(camera);

  var sun = new THREE.DirectionalLight(0xffffff, 0.75);
  sun.position.set(3000, 2000, -2000);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 1500;
  sun.shadow.camera.far = 6000;
  sun.shadow.camera.top = 400;
  sun.shadow.camera.bottom = -400;
  sun.shadow.camera.left = -400;
  sun.shadow.camera.right = 400;
  sun.shadow.bias = 0.00002;
  scene.add(sun);

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.55));

  // UI elements
  foreEl = document.getElementById("fore");
  titleEl = document.getElementById("title");
  startEl = document.getElementById("start");
  nameEl = document.getElementById("name");
  pickerEl = document.getElementById("colorpicker");
  sliderEl = document.getElementById("slider");
  settingsEl = document.getElementById("settings");
  toolbarEl = document.getElementById("toolbar");

  countdownEl = document.getElementById("countdown");
  lapEl = document.getElementById("lap");

  if (!countdownEl) {
    countdownEl = makeDiv("countdown", "", "");
    document.body.appendChild(countdownEl);
  }
  if (!lapEl) {
    lapEl = makeDiv("lap", "", "");
    document.body.appendChild(lapEl);
  }

  // minimal label style if missing
  if (!document.getElementById("pLabelStyle")) {
    var st = document.createElement("style");
    st.id = "pLabelStyle";
    st.textContent = ".pLabel{position:fixed;transform:translate(-50%,-100%);color:#fff;font-family:'Press Start 2P',monospace;font-size:12px;pointer-events:none;text-shadow:0 2px 0 rgba(0,0,0,.55);z-index:4;white-space:nowrap;}";
    document.head.appendChild(st);
  }

  window.addEventListener("resize", onResize, false);
  window.addEventListener("orientationchange", onResize, false);
}

function onResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ====== Map build (compatible with /editor export) ======
function clearGroup(g) {
  if (!g) return;
  while (g.children.length) g.remove(g.children[0]);
}

function buildMapFromTrackCode(track) {
  ensureEngine();

  clearGroup(mapGroup);
  clearGroup(cpGroup);
  clearGroup(decoGroup);
  wallSegs = [];
  cpSegs = [];

  track = (track || "").trim();
  if (!track) {
    spawnX = 0; spawnY = 0; spawnDir = 0;
    return;
  }

  var parts = track.split("|");
  // parts[0]=walls, parts[1]=checkpoint (2 segments), parts[2]=trees, parts[3]=arrows
  var wallsPart = (parts[0] || "").trim();
  var checkPart = (parts[1] || "").trim();
  var treesPart = (parts[2] || "").trim();

  // collect bounds
  var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  function includePt(p) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  // Walls: tokens are segments "x1,y1/x2,y2"
  var wallTokens = wallsPart.split(/\s+/).filter(Boolean);
  for (var i = 0; i < wallTokens.length; i++) {
    var seg = parseSeg(wallTokens[i]);
    if (!seg) continue;
    includePt(seg.a); includePt(seg.b);
    addWall(seg.a, seg.b);
  }

  // Checkpoints: typically two segments
  var cpTokens = checkPart.split(/\s+/).filter(Boolean);
  for (var j = 0; j < cpTokens.length; j++) {
    var cseg = parseSeg(cpTokens[j]);
    if (!cseg) continue;
    includePt(cseg.a); includePt(cseg.b);
    addCheckpoint(cseg.a, cseg.b, j === 0);
  }

  // Trees (optional): tokens are points "x,y"
  var treeTokens = treesPart.split(/\s+/).filter(Boolean);
  for (var t = 0; t < treeTokens.length; t++) {
    var tp = parseV2(treeTokens[t]);
    if (!tp) continue;
    includePt(tp);
    addTree(tp.x, tp.y);
  }

  // resize ground to fit map with padding
  if (minX < 1e8) {
    var pad = 20;
    var w = (maxX - minX) + pad;
    var h = (maxY - minY) + pad;
    w = Math.max(w, 120);
    h = Math.max(h, 120);

    ground.geometry.dispose();
    var gGeo = new THREE.PlaneGeometry(w, h);
    gGeo.rotateX(-Math.PI / 2);
    ground.geometry = gGeo;
    ground.position.set((minX + maxX) / 2, 0, (minY + maxY) / 2);
  } else {
    ground.position.set(0, 0, 0);
  }

  // Spawn from start+checkpoint relationship
  computeSpawn();
}

function addWall(a2, b2) {
  var a = a2.clone(), b = b2.clone();
  var ab = b.clone().sub(a);
  var len2 = ab.lengthSq();
  if (len2 < 1e-6) return;

  var mid = a.clone().add(b).multiplyScalar(0.5);
  var width = Math.sqrt(len2);

  // Visual mesh (thin wall)
  var geo = new THREE.BoxGeometry(width, 3, 0.6);
  var mat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.95 });
  var mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // rotate so its long axis aligns with segment
  var ang = Math.atan2((b.y - a.y), (b.x - a.x));
  mesh.rotation.y = -ang;
  mesh.position.set(mid.x, 1.5, mid.y);

  mapGroup.add(mesh);

  wallSegs.push({
    a: a,
    b: b,
    dir: ab,
    len2: len2,
    mesh: mesh
  });
}

function addCheckpoint(a2, b2, isStart) {
  var a = a2.clone(), b = b2.clone();
  var ab = b.clone().sub(a);
  var len2 = ab.lengthSq();
  if (len2 < 1e-6) return;

  var mid = a.clone().add(b).multiplyScalar(0.5);
  var width = Math.sqrt(len2);

  // unit normal (perp)
  var n = vec2(ab.y, -ab.x);
  if (n.lengthSq() < 1e-9) n = vec2(0, 1);
  n.normalize();

  var geo = new THREE.BoxGeometry(width, 0.1, 2.0);
  var mat = new THREE.MeshStandardMaterial({ color: isStart ? 0xffffff : 0xffe100, roughness: 0.8 });
  var mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  var ang = Math.atan2((b.y - a.y), (b.x - a.x));
  mesh.rotation.y = -ang;
  mesh.position.set(mid.x, 0.05, mid.y);

  cpGroup.add(mesh);

  cpSegs.push({ a: a, b: b, dir: ab, len2: len2, normal: n, mid: mid, mesh: mesh });
}

function addTree(x, y) {
  // small low-cost decoration
  var trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.25, 1.2, 8),
    new THREE.MeshStandardMaterial({ color: 0x5a3b1e, roughness: 1 })
  );
  trunk.position.set(x, 0.6, y);
  trunk.castShadow = true;
  trunk.receiveShadow = true;

  var top = new THREE.Mesh(
    new THREE.ConeGeometry(0.9, 1.8, 10),
    new THREE.MeshStandardMaterial({ color: 0x1f7a3a, roughness: 1 })
  );
  top.position.set(x, 2.0, y);
  top.castShadow = true;

  decoGroup.add(trunk);
  decoGroup.add(top);
}

function computeSpawn() {
  // Need at least start segment
  if (!cpSegs.length) {
    spawnX = 0; spawnY = 0; spawnDir = 0;
    return;
  }
  var start = cpSegs[0];
  var forward = start.normal.clone();

  // If there is a checkpoint segment, choose the normal direction that points toward it.
  if (cpSegs.length > 1) {
    var chk = cpSegs[1];
    var v = chk.mid.clone().sub(start.mid); // Vector2
    if (v.dot(forward) < 0) forward.multiplyScalar(-1);
  }

  spawnX = start.mid.x + forward.x * 3;
  spawnY = start.mid.y + forward.y * 3;

  // For your physics convention: xv += sin(dir), yv += cos(dir)
  spawnDir = Math.atan2(forward.x, forward.y);
}

// ====== Cars + labels ======
function makeCar(hexColor) {
  var car = new THREE.Object3D();

  var bodyGeo = new THREE.BoxGeometry(1.6, 0.6, 2.6);
  var bodyMat = new THREE.MeshStandardMaterial({ color: hexColor, roughness: 0.7, metalness: 0.05 });
  var body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  body.position.y = 0.6;
  car.add(body);

  var cabinGeo = new THREE.BoxGeometry(1.2, 0.5, 1.2);
  var cabinMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
  var cabin = new THREE.Mesh(cabinGeo, cabinMat);
  cabin.castShadow = true;
  cabin.receiveShadow = true;
  cabin.position.set(0, 0.95, -0.2);
  car.add(cabin);

  function wheelMesh() {
    var g = new THREE.CylinderGeometry(0.32, 0.32, 0.24, 16);
    var m = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1 });
    var w = new THREE.Mesh(g, m);
    w.rotation.z = Math.PI / 2;
    w.castShadow = true;
    w.receiveShadow = true;
    return w;
  }

  // IMPORTANT: front wheels are children[0] and children[1]
  var frontLeft = wheelMesh();
  frontLeft.position.set(-0.75, 0.35, 0.85);
  car.add(frontLeft);

  var frontRight = wheelMesh();
  frontRight.position.set(0.75, 0.35, 0.85);
  car.add(frontRight);

  var backLeft = wheelMesh();
  backLeft.position.set(-0.75, 0.35, -0.85);
  car.add(backLeft);

  var backRight = wheelMesh();
  backRight.position.set(0.75, 0.35, -0.85);
  car.add(backRight);

  return car;
}

function makeLabel(name) {
  var el = document.createElement("div");
  el.className = "pLabel";
  el.textContent = name || "Player";
  document.body.appendChild(el);
  return el;
}

function projectToScreen(pos3) {
  // returns {x,y,visible}
  var v = pos3.clone();
  v.y += 0.8;
  v.project(camera);
  var x = (v.x + 1) / 2 * window.innerWidth;
  var y = (-v.y + 1) / 2 * window.innerHeight;
  var visible = (v.z >= -1 && v.z <= 1);
  return { x: x, y: y, visible: visible };
}

// ====== Input ======
function setupInputOnce() {
  if (setupInputOnce._did) return;
  setupInputOnce._did = true;

  window.addEventListener("keydown", function (e) {
    var k = e.key;
    if (k === "ArrowLeft" || k === "a" || k === "A") left = true;
    if (k === "ArrowRight" || k === "d" || k === "D") right = true;
    if (k === "ArrowUp" || k === "w" || k === "W") up = true;
    if (k === "ArrowDown" || k === "s" || k === "S") down = true;
  });

  window.addEventListener("keyup", function (e) {
    var k = e.key;
    if (k === "ArrowLeft" || k === "a" || k === "A") left = false;
    if (k === "ArrowRight" || k === "d" || k === "D") right = false;
    if (k === "ArrowUp" || k === "w" || k === "W") up = false;
    if (k === "ArrowDown" || k === "s" || k === "S") down = false;
  });

  // touch: left/right half steer, top half throttle
  function updateTouch(touches) {
    left = right = up = down = false;
    if (!touches || touches.length === 0) return;
    for (var i = 0; i < touches.length; i++) {
      var tx = touches[i].clientX;
      var ty = touches[i].clientY;
      if (tx < window.innerWidth / 2) left = true; else right = true;
      if (ty < window.innerHeight / 2) up = true;
    }
  }

  window.addEventListener("touchstart", function (e) { updateTouch(e.touches); }, { passive: true });
  window.addEventListener("touchmove", function (e) { updateTouch(e.touches); }, { passive: true });
  window.addEventListener("touchend", function () { left = right = up = down = false; }, { passive: true });
}

// ====== Color picker (fixes slider visual movement) ======
function hsvToHex(h, s, v) {
  var c = v * s;
  var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  var m = v - c;
  var r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  var R = Math.round((r + m) * 255);
  var G = Math.round((g + m) * 255);
  var B = Math.round((b + m) * 255);

  function to2(n) { var t = n.toString(16); return t.length === 1 ? "0" + t : t; }
  return "#" + to2(R) + to2(G) + to2(B);
}

function setSliderFrom01(x01) {
  x01 = clamp(x01, 0, 1);
  var hue = x01 * 360;
  color = hsvToHex(hue, 0.85, 1);

  if (sliderEl && pickerEl) {
    var rect = pickerEl.getBoundingClientRect();
    var sw = sliderEl.offsetWidth || (rect.width * 0.09);
    var x = x01 * rect.width;
    sliderEl.style.transform = "translate(" + (x - sw / 2) + "px, -2vmin)";
    sliderEl.style.background = color;
  }
}

function setupColorPickerOnce() {
  if (setupColorPickerOnce._did) return;
  setupColorPickerOnce._did = true;
  if (!pickerEl || !sliderEl) return;

  // initial
  requestAnimationFrame(function(){ setSliderFrom01(0.02); });

  var dragging = false;

  function setFromEvent(e) {
    var rect = pickerEl.getBoundingClientRect();
    var cx = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
    var x01 = (cx - rect.left) / rect.width;
    setSliderFrom01(x01);
  }

  pickerEl.addEventListener("mousedown", function (e) { dragging = true; setFromEvent(e); });
  window.addEventListener("mousemove", function (e) { if (dragging) setFromEvent(e); });
  window.addEventListener("mouseup", function () { dragging = false; });

  pickerEl.addEventListener("touchstart", function (e) { dragging = true; setFromEvent(e); }, { passive: true });
  pickerEl.addEventListener("touchmove", function (e) { if (dragging) setFromEvent(e); }, { passive: true });
  pickerEl.addEventListener("touchend", function () { dragging = false; }, { passive: true });
}

// ====== Menu + flow ======
function animateMenuIn() {
  // style.css starts everything off-screen; this brings it in.
  if (titleEl) setTimeout(function(){ titleEl.style.transform = "translate3d(0, 0, 0)"; }, 10);
  var items = document.getElementsByClassName("menuitem");
  for (var i = 0; i < items.length; i++) {
    (function(idx){
      setTimeout(function(){ items[idx].style.transform = "translate3d(0, 0, 0)"; }, 120 + idx * 90);
    })(i);
  }
  if (settingsEl) setTimeout(function(){ settingsEl.style.transform = "translate3d(0, 0, 0)"; }, 500);
}

function clearModeUI() {
  safeRemove(modeWrapEl);
  modeWrapEl = null;
  safeRemove(overlayMsgEl);
  overlayMsgEl = null;

  var old = document.getElementById("startgame");
  safeRemove(old);
  var oldCode = document.getElementById("code");
  safeRemove(oldCode);
  var oldIn = document.getElementById("incode");
  safeRemove(oldIn);
}

function showOverlayMsg(html) {
  if (!foreEl) return;
  if (!overlayMsgEl) {
    overlayMsgEl = makeDiv(null, "info", "");
    overlayMsgEl.style.top = "0";
    overlayMsgEl.style.left = "0";
    overlayMsgEl.style.width = "100%";
    overlayMsgEl.style.zIndex = "100000";
    foreEl.appendChild(overlayMsgEl);
  }
  overlayMsgEl.innerHTML = html;
}

function showModeMenu() {
  ensureEngine();
  setupInputOnce();
  setupColorPickerOnce();

  clearModeUI();

  // Validate name
  var nm = (nameEl && nameEl.value ? nameEl.value : "").trim();
  if (!nm) {
    if (nameEl) nameEl.value = "Player";
  }

  if (titleEl) titleEl.innerHTML = "Choose Mode";
  if (startEl) startEl.style.display = "none";

  modeWrapEl = document.createElement("div");
  modeWrapEl.id = "modewrap";
  if (foreEl) foreEl.appendChild(modeWrapEl);

  function mkButton(text, topVh, onClick) {
    var b = makeDiv(null, "button", text);
    b.style.top = "calc(" + topVh + "vh - 8vmin)";
    b.onclick = onClick;
    modeWrapEl.appendChild(b);
    // bring in from left
    setTimeout(function(){ b.style.transform = "translate3d(0,0,0)"; }, 20);
    return b;
  }

  mkButton("HOST", 30, function(){ hostFlow(); });
  mkButton("JOIN", 55, function(){ joinFlow(); });
  mkButton("SOLO", 80, function(){ soloFlow(); });
}

function hideMainMenu() {
  // hide name + picker + start buttons
  if (!foreEl) return;

  // Keep settings/toolbar visible; hide menu text + inputs
  var ids = ["title", "name", "colorpicker", "start", "divider", "mywebsitelink"]; // safe
  for (var i = 0; i < ids.length; i++) {
    var el = document.getElementById(ids[i]);
    if (el) el.style.display = "none";
  }

  clearModeUI();

  // Allow gameplay input
  // foreEl.style.pointerEvents = "none";

}

// ====== Toolbar tools ======
function setupToolbarOnce() {
  if (setupToolbarOnce._did) return;
  setupToolbarOnce._did = true;

  if (!settingsEl || !toolbarEl) return;

  settingsEl.onclick = function(){
    if (toolbarEl.classList.contains("sel")) toolbarEl.classList.remove("sel");
    else toolbarEl.classList.add("sel");
  };

  // Clear and rebuild tools
  toolbarEl.innerHTML = "";

  function toolButton(title, bg, onClick) {
    var t = document.createElement("div");
    t.className = "tools";
    if (bg) t.style.backgroundColor = bg;
    t.title = title;
    t.onclick = function(e){ e.stopPropagation(); onClick(); };
    toolbarEl.appendChild(t);
    return t;
  }

  // Open editor
  toolButton("Open editor", "#55db8f", function(){
    window.open("./editor/", "_blank");
  });

  // Import map
  toolButton("Import map code", "#db6262", function(){
    var cur = getTrackCode();
    var str = prompt("Paste trackcode here (exported from /editor).", cur);
    if (typeof str === "string" && str.trim()) {
      setTrackCode(str);
      showOverlayMsg("Map imported.");
      setTimeout(function(){ showOverlayMsg(""); }, 1200);
    }
  });

  // Export map
  toolButton("Export map code", "#9a55db", function(){
    var str = getTrackCode();
    if (!str) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(str).then(function(){
        showOverlayMsg("Map code copied to clipboard.");
        setTimeout(function(){ showOverlayMsg(""); }, 1200);
      }).catch(function(){
        prompt("Copy trackcode:", str);
      });
    } else {
      prompt("Copy trackcode:", str);
    }
  });
}

// ====== Multiplayer room handling ======
function randomCode(len) {
  var s = "";
  var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (var i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function detachRoomListeners() {
  try {
    if (playersRef) playersRef.off();
    if (startRef) startRef.off();
  } catch (e) {}
}

function clearPlayers() {
  for (var k in players) {
    if (!players.hasOwnProperty(k)) continue;
    var p = players[k];
    if (p && p.model) scene.remove(p.model);
    if (p && p.label) safeRemove(p.label);
  }
  players = {};
  meKey = null;
  me = null;
}

function connectToRoom(code, hostFlag) {
  ensureEngine();

  // reset any previous
  detachRoomListeners();
  clearPlayers();

  ROOM = (code || "").toUpperCase();
  isHost = !!hostFlag;

  if (!database) {
    showOverlayMsg("Firebase unavailable. Running SOLO.");
    setTimeout(function(){ showOverlayMsg(""); }, 1500);
    soloFlow();
    return;
  }

  roomRef = database.ref("rooms/" + ROOM);
  playersRef = roomRef.child("players");
  startRef = roomRef.child("startedAt");

  // create my player entry immediately so others see me in lobby
  createLocalPlayerFirebase();

  // listeners
  playersRef.on("child_added", function (snap) {
    var key = snap.key;
    var data = snap.val();
    if (!data) return;
    upsertPlayer(key, data);
  });

  playersRef.on("child_changed", function (snap) {
    var key = snap.key;
    var data = snap.val();
    if (!data) return;
    upsertPlayer(key, data);
  });

  playersRef.on("child_removed", function (snap) {
    removePlayer(snap.key);
  });

  startRef.on("value", function (snap) {
    var startedAt = snap.val();
    if (!startedAt) {
      if (!gameStarted) {
        showOverlayMsg(isHost ? "Share code <b>" + ROOM + "</b> — then press START GAME." : "Joined <b>" + ROOM + "</b>. Waiting for host...");
      }
      return;
    }

    // Start signal received
    startGame();
  });
}

function createLocalPlayerFirebase() {
  var nm = (nameEl && nameEl.value ? nameEl.value : "Player").trim() || "Player";

  var ref = playersRef.push();
  meKey = ref.key;

  var data = {
    name: nm,
    color: color,
    x: spawnX,
    y: spawnY,
    xv: 0,
    yv: 0,
    dir: spawnDir,
    steer: 0,
    lap: 1,
    checkpoint: 0,
    lastSeen: Date.now()
  };

  var hex = parseInt(color.replace("#", "0x"), 16);
  var model = makeCar(hex);
  model.position.set(data.x, 0, data.y);
  model.rotation.y = data.dir;
  scene.add(model);

  var label = makeLabel(nm);

  me = { key: meKey, ref: ref, data: data, model: model, label: label, isMe: true, lastSend: 0 };
  players[meKey] = me;

  // cleanup
  ref.onDisconnect().remove();
  ref.set(data);
}

function upsertPlayer(key, data) {
  if (!data) return;

  if (meKey && key === meKey && me) {
    // keep name/color synced, but don't overwrite live physics fields
    me.data.name = data.name || me.data.name;
    me.data.color = data.color || me.data.color;
    if (me.label) me.label.textContent = me.data.name;
    return;
  }

  var p = players[key];
  if (!p) {
    var hex = parseInt(((data.color || "#ff3030").replace("#", "0x")), 16);
    var model = makeCar(hex);
    model.position.set(data.x || 0, 0, data.y || 0);
    model.rotation.y = data.dir || 0;
    scene.add(model);

    var label = makeLabel(data.name || "Player");

    p = { key: key, ref: playersRef.child(key), data: data, model: model, label: label, isMe: false };
    players[key] = p;
  } else {
    p.data = data;
    if (p.label && p.label.textContent !== (data.name || "Player")) p.label.textContent = data.name || "Player";
  }
}

function removePlayer(key) {
  var p = players[key];
  if (!p) return;
  if (p.model) scene.remove(p.model);
  if (p.label) safeRemove(p.label);
  delete players[key];
}

// ====== Start/Host/Join/Solo flows ======
function hostFlow() {
  clearModeUI();
  var code = randomCode(4);

  // show code + startgame button
  var codeEl = makeDiv("code", "info", code);
  codeEl.style.fontSize = "20vmin";
  codeEl.style.textAlign = "center";
  codeEl.style.position = "absolute";
  codeEl.style.top = "20vh";
  codeEl.style.left = "0";
  codeEl.style.width = "100%";
  if (foreEl) foreEl.appendChild(codeEl);

  var sg = makeDiv("startgame", "", "START GAME");
  if (foreEl) foreEl.appendChild(sg);

  sg.onclick = function(){
    if (!roomRef) return;
    roomRef.child("startedAt").set(firebase.database.ServerValue.TIMESTAMP);
  };

  connectToRoom(code, true);
}

function joinFlow() {
  clearModeUI();

  var inEl = document.createElement("input");
  inEl.id = "incode";
  inEl.maxLength = 8;
  inEl.placeholder = "CODE";
  inEl.autocomplete = "off";
  inEl.spellcheck = false;
  inEl.value = "";

  if (foreEl) foreEl.appendChild(inEl);
  inEl.focus();

  var joinBtn = makeDiv("startgame", "", "JOIN");
  joinBtn.style.bottom = "10vmin";
  joinBtn.style.right = "calc(50vw - 40vmin)";
  joinBtn.style.width = "80vmin";
  joinBtn.style.textAlign = "center";
  if (foreEl) foreEl.appendChild(joinBtn);

  function doJoin() {
    var code = (inEl.value || "").trim().toUpperCase();
    if (!code) return;
    connectToRoom(code, false);
  }

  inEl.addEventListener("input", function(){ inEl.value = inEl.value.toUpperCase(); });
  inEl.addEventListener("keydown", function(e){ if (e.key === "Enter") doJoin(); });
  joinBtn.onclick = doJoin;
}

function soloFlow() {
  ensureEngine();
  clearPlayers();
  detachRoomListeners();
  ROOM = null;
  isHost = false;

  // local-only player
  var nm = (nameEl && nameEl.value ? nameEl.value : "Player").trim() || "Player";
  meKey = "solo";

  var data = {
    name: nm,
    color: color,
    x: spawnX,
    y: spawnY,
    xv: 0,
    yv: 0,
    dir: spawnDir,
    steer: 0,
    lap: 1,
    checkpoint: 0
  };

  var hex = parseInt(color.replace("#", "0x"), 16);
  var model = makeCar(hex);
  model.position.set(data.x, 0, data.y);
  model.rotation.y = data.dir;
  scene.add(model);

  var label = makeLabel(nm);

  me = { key: meKey, ref: null, data: data, model: model, label: label, isMe: true, lastSend: 0 };
  players[meKey] = me;

  startGame();
}

function startGame() {
  if (gameStarted) return;

  gameStarted = true;
  hideMainMenu();
  showOverlayMsg("");

  startCountdown(function(){
    // countdown done
  });
}

function startCountdown(done) {
  gameSortaStarted = true;
  var t = 3;
  if (countdownEl) {
    countdownEl.style.fontSize = "40vmin";
    countdownEl.innerHTML = String(t);
  }

  var iv = setInterval(function(){
    t--;
    if (t <= 0) {
      clearInterval(iv);
      if (countdownEl) countdownEl.innerHTML = "";
      gameSortaStarted = false;
      if (done) done();
      return;
    }
    if (countdownEl) countdownEl.innerHTML = String(t);
  }, 1000);
}

// ====== Physics + game loop ======
function updateMePhysics(warp) {
  if (!me || !me.data || !me.model) return;

  // steering input
  if (!mobile) {
    if (left) me.data.steer = Math.PI / 6;
    if (right) me.data.steer = -Math.PI / 6;
    if (!(left ^ right)) me.data.steer = 0;
  }
  me.data.steer = clamp(me.data.steer, -Math.PI/6, Math.PI/6);

  // Speed-aware steering
  var speedMag = Math.sqrt(me.data.xv * me.data.xv + me.data.yv * me.data.yv);
  me.data.dir += me.data.steer * (STEER_MIN + speedMag * STEER_SPEED) * warp;

  // Throttle/brake (small improvement)
  var throttle = up ? 1.0 : 0.65;
  var brake = down ? 0.82 : 1.0;

  var ACCEL = SPEED * 1.6 * throttle;
  var FRICTION = 0.965;
  var DRAG = 0.992;

  me.data.xv += Math.sin(me.data.dir) * ACCEL * warp;
  me.data.yv += Math.cos(me.data.dir) * ACCEL * warp;

  me.data.xv *= Math.pow(FRICTION, warp);
  me.data.yv *= Math.pow(FRICTION, warp);

  me.data.xv *= DRAG * brake;
  me.data.yv *= DRAG * brake;

  // top-speed cap
  var velMag = Math.sqrt(me.data.xv * me.data.xv + me.data.yv * me.data.yv);
  if (velMag > MAX_SPEED) {
    var s = MAX_SPEED / velMag;
    me.data.xv *= s;
    me.data.yv *= s;
  }

  // integrate
  me.data.x += me.data.xv * warp;
  me.data.y += me.data.yv * warp;

  // wall collisions (2D capsule against segments)
  collideMeWithWalls();

  // checkpoint logic
  handleCheckpoints();

  // OOB reset
  if (Math.sqrt(me.data.x * me.data.x + me.data.y * me.data.y) > OOB_DIST) {
    me.data.x = spawnX;
    me.data.y = spawnY;
    me.data.xv = 0;
    me.data.yv = 0;
    me.data.dir = spawnDir;
  }

  // model
  me.model.position.x = me.data.x;
  me.model.position.z = me.data.y;
  me.model.rotation.y = me.data.dir;

  // wheel visuals
  if (me.model.children[0]) me.model.children[0].rotation.z = Math.PI/2 - me.data.steer;
  if (me.model.children[1]) me.model.children[1].rotation.z = Math.PI/2 - me.data.steer;
}

function collideMeWithWalls() {
  var p = vec2(me.data.x, me.data.y);
  var v = vec2(me.data.xv, me.data.yv);

  for (var i = 0; i < wallSegs.length; i++) {
    var w = wallSegs[i];
    var c = segClosestPoint(p, w.a, w.b);
    var delta = p.clone().sub(c);
    var dist = delta.length();
    if (dist < WALL_SIZE) {
      var n = (dist > 1e-6) ? delta.multiplyScalar(1 / dist) : vec2(0, 1);
      // only reflect if moving into the wall
      if (v.dot(n) < 0) {
        v = reflect2(v, n);
        // small correction push
        v.add(n.clone().multiplyScalar(BOUNCE_CORRECT));
        v.multiplyScalar(BOUNCE);
      }
      p = c.add(n.multiplyScalar(WALL_SIZE + 0.001));
    }
  }

  me.data.x = p.x;
  me.data.y = p.y;
  me.data.xv = v.x;
  me.data.yv = v.y;
}

function handleCheckpoints() {
  if (cpSegs.length < 2) return;
  var pos = vec2(me.data.x, me.data.y);

  // For each cp segment: check if within width and near the line
  for (var i = 0; i < cpSegs.length; i++) {
    var cp = cpSegs[i];

    // projection along segment
    var ab = cp.b.clone().sub(cp.a);
    var t = 0;
    if (cp.len2 > 1e-9) t = clamp(pos.clone().sub(cp.a).dot(ab) / cp.len2, 0, 1);
    var closest = cp.a.clone().add(ab.multiplyScalar(t));

    var dist = pos.distanceTo(closest);
    if (dist > 1.1) continue;

    // crossed if close to line and inside segment
    if (i === 0) {
      // start line
      if (me.data.checkpoint === 1) {
        me.data.checkpoint = 0;
        me.data.lap++;
      }
    } else {
      // checkpoint line(s)
      me.data.checkpoint = 1;
    }
  }

  if (me.data.lap > LAPS && countdownEl && countdownEl.innerHTML === "") {
    countdownEl.style.fontSize = "14vmin";
    countdownEl.innerHTML = (me.data.name || "Player").replaceAll("<", "&lt;") + " Won!";
  }
}

function updateCamera(warp) {
  if (!me || !me.model) return;

  var target = new THREE.Vector3(
    me.model.position.x + Math.sin(-me.model.rotation.y) * 5,
    CAM_HEIGHT,
    me.model.position.z + -Math.cos(-me.model.rotation.y) * 5
  );

  var lagPow = Math.pow(CAMERA_LAG, warp);
  camera.position.set(
    camera.position.x * lagPow + target.x * (1 - lagPow),
    CAM_HEIGHT,
    camera.position.z * lagPow + target.z * (1 - lagPow)
  );

  camera.lookAt(me.model.position);
}

function updateRemoteVisuals(warp) {
  for (var k in players) {
    if (!players.hasOwnProperty(k)) continue;
    var p = players[k];
    if (!p || p.isMe || !p.model || !p.data) continue;

    // Smoothly follow their network position
    var tx = p.data.x || 0;
    var ty = p.data.y || 0;
    var tdir = p.data.dir || 0;

    p.model.position.x += (tx - p.model.position.x) * clamp(0.18 * warp, 0, 1);
    p.model.position.z += (ty - p.model.position.z) * clamp(0.18 * warp, 0, 1);

    // simple angle lerp
    var cur = p.model.rotation.y;
    var diff = ((tdir - cur + Math.PI) % (2*Math.PI)) - Math.PI;
    p.model.rotation.y = cur + diff * clamp(0.25 * warp, 0, 1);
  }
}

function updateLabels() {
  for (var k in players) {
    if (!players.hasOwnProperty(k)) continue;
    var p = players[k];
    if (!p || !p.model || !p.label) continue;

    var s = projectToScreen(p.model.position);
    if (s.visible) {
      p.label.style.display = "block";
      p.label.style.left = s.x + "px";
      p.label.style.top = s.y + "px";
    } else {
      p.label.style.display = "none";
    }
  }
}

function updateHud() {
  if (!lapEl || !me || !me.data) return;
  var spd = Math.sqrt(me.data.xv*me.data.xv + me.data.yv*me.data.yv);
  var roomText = ROOM ? (" | " + ROOM) : "";
  lapEl.innerHTML = "Lap " + (me.data.lap <= LAPS ? (me.data.lap + "/" + LAPS) : "") + "<br>Speed " + spd.toFixed(2) + roomText;
}

function maybeSendToFirebase(ts) {
  if (!me || !me.ref) return;
  // throttle writes
  if (ts - me.lastSend < 60) return;
  me.lastSend = ts;

  me.data.lastSeen = Date.now();
  me.ref.set(me.data);
}

// ====== Main loop ======
var lastTime = 0;
function renderLoop(ts) {
  requestAnimationFrame(renderLoop);
  if (!lastTime) lastTime = ts;

  var timepassed = ts - lastTime;
  lastTime = ts;

  // cap large deltas (tab switch)
  timepassed = Math.min(timepassed, 50);
  var warp = timepassed / 16;

  if (gameStarted && me) {
    if (!gameSortaStarted) updateMePhysics(warp);
    updateRemoteVisuals(warp);
    updateCamera(warp);
    updateHud();
    maybeSendToFirebase(ts);
  } else {
    // idle orbit preview
    var a = ts * 0.0004;
    camera.position.set(50 * Math.sin(a), 20, 50 * Math.cos(a));
    camera.lookAt(new THREE.Vector3(0,0,0));
    updateRemoteVisuals(warp);
  }

  updateLabels();

  renderer.render(scene, camera);
  MODS();
}

// ====== Init ======
function init() {
  ensureEngine();
  setupToolbarOnce();
  setupInputOnce();
  setupColorPickerOnce();

  // build map now (so you don't get a blank world)
  buildMapFromTrackCode(getTrackCode());

  // Start button
  if (startEl) startEl.onclick = showModeMenu;

  animateMenuIn();

  // Begin render loop
  requestAnimationFrame(renderLoop);
}

// Run init once DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// ====== Compatibility with your existing HTML inline onclick handlers ======
// index.html uses onclick="menu2()" for Start.
// Some older copies also try to call join() after loading.
window.menu2 = showModeMenu;
window.host = hostFlow;
window.joinGame = joinFlow;
window.codeCheck = function () {};
window.updateColor = function (x01) { setSliderFrom01(x01); };


// Clean up firebase presence on close
window.addEventListener("beforeunload", function(){
  try {
    if (me && me.ref) me.ref.remove();
  } catch (e) {}
});
