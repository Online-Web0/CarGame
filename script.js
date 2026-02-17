// CarGame - script.js (single file, no dependencies beyond three.js + firebase)
// - Optional GLTF car (set GLTF_CAR_URL). Falls back to built-in F1.
// - Rectangular hitbox collisions (walls + cars)  ✅ now auto-fit for GLTF
// - Reverse steering behavior (left/right as specified)
// - Nitro lockout (must release Shift to re-arm after empty)
// - Nitro bar visible only in game
// - Slipstream boost + visuals
// - Boost FOV camera effect
// - Multiplayer sync (Firebase RTDB; anonymous auth; solo fallback)

(function () {
  "use strict";

  // =========================
  // ===== USER TUNING =======
  // =========================
  var SPEED = 0.016;
  var CAMERA_LAG = 0.82;
  var COLLISION = 1.1;      // (optional) used if you want to scale player collision push; kept for compatibility
  var BOUNCE = 1.45;
  var mapscale = 500;
  var VR = false;
  var BOUNCE_CORRECT = 0.01;

  // wall collision thickness margin (smaller = tighter)
  var WALL_SIZE = 0.35;

  var MOUNTAIN_DIST = 2500;
  var OOB_DIST = 2000;
  var LAPS = 3;

  // ===== Nitro tuning =====
  var NITRO_MULT = 2.0;
  var NITRO_MAX = 100;
  var nitroFuel = NITRO_MAX;
  var NITRO_DRAIN = 45;   // per second
  var NITRO_REGEN = 15;   // per second

  // ===== Movement tuning =====
  var MAX_SPEED = 0.30;
  var STEER_MIN = 0.05;
  var STEER_SPEED = 0.12;
  var CAM_HEIGHT = 4;

  // ===== Original-like physics (classic) =====
  var USE_CLASSIC_PHYSICS = true;
  var CLASSIC_DRAG = 0.99;
  var CLASSIC_TURN_DIV = 9;     // your preferred value
  var CLASSIC_AUTO_FORWARD = false;
  var CLASSIC_MAX_SPEED = 0.40;

  // Understeer at speed (higher = harder to turn fast)
  var TURN_SPEED_FALLOFF = 2.4; // your preferred value

  // ===== Drift/grip =====
  var DRIFT_ALIGN_BASE = 0.020;        // lower = more drift
  var DRIFT_ALIGN_TURN_MULT = 0.40;    // while steering, grip worse (<1 => more drift)
  var DRIFT_ALIGN_NITRO_MULT = 0.40;   // nitro reduces grip (<1 => more drift)
  var DRIFT_ALIGN_SPEED_FALLOFF = 3.0; // higher = less grip at speed

  // Lateral scrub (how fast sideways motion dies)
  var SIDE_SCRUB = 0.035;
  var SIDE_SCRUB_TURN_MULT = 0.3;
  var SIDE_SCRUB_NITRO_MULT = 0.75;

  // ===== Car hitbox (rectangle) =====
  // Built-in fallback dimensions. GLTF can auto-fit and override per player.
  var CAR_HALF_WIDTH = 1.08;
  var CAR_HALF_LENGTH = 2.25;

  // ===== Steering max (your value) =====
  var STEER_MAX = Math.PI / 5.4;

  // =========================
  // ===== OPTIONAL GLTF =====
  // =========================
  // Set this to your car model URL (relative or absolute). Example:
  // var GLTF_CAR_URL = "./models/f1_car.glb";
var GLTF_CAR_URL = "scene.gltf";
var GLTF_CAR_SCALE = 0.45;
var GLTF_CAR_ROT_Y = Math.PI;
var GLTF_CAR_Y_OFFSET = 0.02; // tiny lift to avoid z-fighting
  // --- GLTF fit controls (NEW) ---
  // Auto-fit hitbox to the GLTF model's bounding box (XZ). Stored per-player.
  var GLTF_AUTO_FIT_HITBOX = true;
  // Extra padding added to half-extents (world units). Lower = tighter.
  var GLTF_HITBOX_PADDING = 0.02;
  // Multiply fitted half-extents. 1.0 = exact bbox; <1 tighter; >1 looser.
  var GLTF_HITBOX_SCALE = 1.0;

  // Auto-scale GLTF to feel like your built-in car size (recommended).
var GLTF_AUTO_SCALE = false;
  // If auto-scaling, match the built-in car length (2*CAR_HALF_LENGTH) primarily.
var GLTF_TARGET_LENGTH = (2 * CAR_HALF_LENGTH) * 0.75;
  // If auto-scaling, match width as a secondary clamp.
  var GLTF_TARGET_WIDTH = (2 * CAR_HALF_WIDTH);
  // If not auto-scaling, you can force a scale here:
var GLTF_MANUAL_SCALE = 1.67;

  // Auto-center GLTF pivot to its bbox center (recommended for stable rotation/collision feel).
  var GLTF_AUTO_CENTER = true;

  // If your GLB faces the wrong way, adjust yaw visually without changing physics:
  // 0 = assumes model faces +Z when rotation.y = 0
var GLTF_YAW_OFFSET = 0;

  // If tinting breaks your textured model, set false.
  var GLTF_TINT_ENABLED = true;

  // =========================
  // ===== Nitro input/state ==
  // =========================
  var nitro = false;          // Shift currently held
  var nitroArmed = false;     // set true on a fresh Shift press
  var nitroLock = false;      // locks after fuel hits 0 until Shift released
  var nitroActive = false;    // true only while boost actually applies

  // ===== Slipstream tuning =====
  var SLIP_DIST = 11.0;
  var SLIP_WIDTH = 2.2;
  var SLIP_ACCEL_BONUS = 0.70;
  var SLIP_TOPSPEED_BONUS = 0.22;

  var slipTargetKey = null;
  var slipFactor = 0;

  // =========================
  // ===== Firebase ==========
  // =========================
  var database = null;
  var firebaseOK = false;

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
      firebaseOK = true;
      firebase.auth().signInAnonymously().catch(function (e) {
        console.warn("Firebase auth failed (solo still works):", e);
      });
    }
  } catch (e) {
    console.warn("Firebase init failed (solo still works):", e);
  }

  // =========================
  // ===== Three.js globals ===
  // =========================
  var scene, renderer, camera;
  var mapGroup, cpGroup, decoGroup;
  var ground;

  // ===== Map physics data =====
  var wallSegs = [];  // {a:V2,b:V2,dir:V2,len2:number,mesh:Mesh}
  var cpSegs = [];    // checkpoints; [0]=start line
  var spawnX = 0, spawnY = 0, spawnDir = 0;

  // ===== Multiplayer/game state =====
  var ROOM = null;
  var isHost = false;
  var roomRef = null;
  var playersRef = null;
  var startRef = null;

  // players[k] => {key, data, model, label, ref, isMe, halfW, halfL, lastSend}
  var players = {};
  var meKey = null;
  var me = null;

  var gameStarted = false;
  var gameSortaStarted = false;
  var playerCollisionEnabled = false;

  // ===== Input state =====
  var left = false;
  var right = false;
  var up = false;
  var down = false;
  var mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // ===== UI elements =====
  var foreEl, titleEl, startEl, nameEl, pickerEl, sliderEl, countdownEl, lapEl, settingsEl, toolbarEl;
  var modeWrapEl = null;
  var overlayMsgEl = null;

  // Global color
  var color = "#ff3030";

  // =========================
  // ===== Utilities =========
  // =========================
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function safeRemove(el) { if (!el) return; try { el.remove(); } catch (e) {} }

  function makeDiv(id, className, text) {
    var d = document.createElement("div");
    if (id) d.id = id;
    if (className) d.className = className;
    if (typeof text === "string") d.innerHTML = text;
    return d;
  }

  function vec2(x, y) { return new THREE.Vector2(x, y); }

  function wrapAngle(a) {
    a = (a + Math.PI) % (2 * Math.PI);
    if (a < 0) a += 2 * Math.PI;
    return a - Math.PI;
  }

  function reflect2(v, n) {
    var d = v.dot(n);
    return v.clone().sub(n.clone().multiplyScalar(2 * d));
  }

  // =========================
  // ===== Track code =========
  // =========================
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
  window.setTrackCode = setTrackCode;

  // ===== Coordinate parsing =====
  var MIRROR_X = false;

  function parseV2(tok) {
    var parts = tok.split(",");
    if (parts.length !== 2) return null;

    var x = parseFloat(parts[0]);
    var y = parseFloat(parts[1]);
    if (!isFinite(x) || !isFinite(y)) return null;

    if (MIRROR_X) x = -x;
    return vec2(x, -y); // editor y -> game z (negated)
  }

  function parseSeg(tok) {
    var p = tok.split("/");
    if (p.length !== 2) return null;
    var a = parseV2(p[0]);
    var b = parseV2(p[1]);
    if (!a || !b) return null;
    return { a: a, b: b };
  }

  // =========================
  // ===== UI helpers =========
  // =========================
  function setDisplay(id, val) {
    var el = document.getElementById(id);
    if (el) el.style.display = val;
  }

  function hideLobbyUI() {
    setDisplay("name", "none");
    setDisplay("colorpicker", "none");
    setDisplay("start", "none");
    setDisplay("divider", "none");
    setDisplay("mywebsitelink", "none");
  }

  function clearModeUI() {
    safeRemove(modeWrapEl);
    modeWrapEl = null;
    safeRemove(overlayMsgEl);
    overlayMsgEl = null;

    safeRemove(document.getElementById("startgame"));
    safeRemove(document.getElementById("code"));
    safeRemove(document.getElementById("incode"));
  }

  function hideAllMenusForGameplay() {
    clearModeUI();
    safeRemove(document.getElementById("modewrap"));

    setDisplay("title", "none");
    hideLobbyUI();

    if (foreEl) {
      foreEl.style.pointerEvents = "none";
      foreEl.style.display = "none";
    }
    if (settingsEl) settingsEl.style.display = "none";
    if (toolbarEl) toolbarEl.classList.remove("sel");
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
    overlayMsgEl.innerHTML = html || "";
  }

  // =========================
  // ===== Engine init ========
  // =========================
  var BASE_FOV = 90;
  var BOOST_FOV = 100;

  // ---- GLTF loader (SINGLE INSTANCE) ----
  var gltfLoader = null;
  var carGLTF = null;          // loaded gltf scene (raw)
  var carGLTFReady = false;
  var carGLTFLoading = false;
  var carGLTFWaiters = [];     // callbacks waiting for load (scene or null on fail)

 function ensureGLTFLoader() {
  if (gltfLoader) return;
  if (!GLTF_CAR_URL) return;
  if (typeof THREE === "undefined") return;

  if (typeof THREE.GLTFLoader === "undefined") {
    console.warn("GLTFLoader not found. Include GLTFLoader.js");
    return;
  }

  gltfLoader = new THREE.GLTFLoader();
  gltfLoader.setPath("models/");
}

function preloadCarGLTF() {

    if (!GLTF_CAR_URL) return;
    ensureGLTFLoader();
    if (!gltfLoader) return;

    if (carGLTFReady || carGLTFLoading) return;
    carGLTFLoading = true;

    gltfLoader.load(
      GLTF_CAR_URL,
      function (g) {
        carGLTFLoading = false;
        carGLTFReady = true;
        carGLTF = (g && g.scene) ? g.scene : null;

        if (carGLTF) {
          carGLTF.traverse(function (o) {
            if (o && o.isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
              if (o.material) o.material.needsUpdate = true;
            }
          });
        }

        var w = carGLTFWaiters.slice();
        carGLTFWaiters.length = 0;
        for (var i = 0; i < w.length; i++) w[i](carGLTF);
      },
      undefined,
      function (err) {
        console.warn("GLTF car load failed. Falling back to built-in car.", err);
        carGLTFLoading = false;
        carGLTFReady = false;
        carGLTF = null;

        var w2 = carGLTFWaiters.slice();
        carGLTFWaiters.length = 0;
        for (var j = 0; j < w2.length; j++) w2[j](null);
      }
    );
  }

  function ensureEngine() {
    if (scene && renderer && mapGroup && cpGroup && camera) return;

    if (typeof THREE === "undefined") {
      throw new Error("THREE is not loaded. Make sure three.js is included before script.js");
    }

    scene = new THREE.Scene();


    scene.background = new THREE.Color(0x7fb0ff);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    renderer.domElement.style.position = "fixed";
    renderer.domElement.style.top = "0";
    renderer.domElement.style.left = "0";
    renderer.domElement.style.zIndex = "0";
    renderer.domElement.style.pointerEvents = "none";
    document.body.appendChild(renderer.domElement);

    mapGroup = new THREE.Group();
    cpGroup = new THREE.Group();
    decoGroup = new THREE.Group();
    scene.add(mapGroup);
    scene.add(cpGroup);
    scene.add(decoGroup);

    // Ground
    var gGeo = new THREE.PlaneGeometry(300, 300);
    gGeo.rotateX(-Math.PI / 2);
    var gMat = new THREE.MeshStandardMaterial({ color: 0x4aa85e, roughness: 1 });
    ground = new THREE.Mesh(gGeo, gMat);
    ground.receiveShadow = true;
    scene.add(ground);

    camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 1, 2000);
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

    // Grab existing UI nodes
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

    // Create missing essentials safely
    if (!countdownEl) {
      countdownEl = makeDiv("countdown", "", "");
      countdownEl.style.pointerEvents = "none";
      countdownEl.style.display = "none";
      document.body.appendChild(countdownEl);
    }
    if (!lapEl) {
      lapEl = makeDiv("lap", "", "");
      document.body.appendChild(lapEl);
    }

    // Player label style
    if (!document.getElementById("pLabelStyle")) {
      var st = document.createElement("style");
      st.id = "pLabelStyle";
      st.textContent =
        ".pLabel{position:fixed;transform:translate(-50%,-100%);color:#fff;font-family:'Press Start 2P',monospace;font-size:12px;pointer-events:none;text-shadow:0 2px 0 rgba(0,0,0,.55);z-index:4;white-space:nowrap;}";
      document.head.appendChild(st);
    }

    // Nitro UI style
    if (!document.getElementById("nitroStyle")) {
      var ns = document.createElement("style");
      ns.id = "nitroStyle";
      ns.textContent =
        "#nitrobar{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);width:300px;height:14px;" +
        "background:rgba(0,0,0,.35);border:2px solid rgba(255,255,255,.95);border-radius:999px;z-index:5;" +
        "opacity:1;pointer-events:none;transition:filter .15s ease, transform .15s ease;display:none;}" +
        "#nitrobar.active{transform:translateX(-50%) scale(1.02);filter:drop-shadow(0 0 12px rgba(0,229,255,.65))}" +
        "#nitrofill{height:100%;width:0%;border-radius:999px;" +
        "background:linear-gradient(90deg, rgba(0,229,255,1) 0%, rgba(57,255,136,1) 55%, rgba(255,255,255,1) 100%);" +
        "box-shadow:0 0 8px rgba(0,229,255,.28);transition:width .08s linear}" +
        "#nitrolabel{position:fixed;bottom:38px;left:50%;transform:translateX(-50%);" +
        "font-family:'Press Start 2P',monospace;font-size:10px;color:rgba(255,255,255,.9);z-index:5;" +
        "text-shadow:0 2px 0 rgba(0,0,0,.45);pointer-events:none;opacity:.85;display:none;}";
      document.head.appendChild(ns);
    }

    if (!document.getElementById("nitrobar")) {
      var nb = makeDiv("nitrobar", "", "");
      var fill = makeDiv("nitrofill", "", "");
      nb.appendChild(fill);
      document.body.appendChild(nb);

      var lbl = makeDiv("nitrolabel", "", "NITRO");
      document.body.appendChild(lbl);
    }

    window.addEventListener("resize", onResize, false);
    window.addEventListener("orientationchange", onResize, false);

    // Initialize loader once + preload once
    ensureGLTFLoader();
    preloadCarGLTF();
  }

  function onResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // =========================
  // ===== Map build ==========
  // =========================
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

    // ===== SPAWN (5th section: parts[4]) =====
    var hasSpawn = false;
    var spawnText = (parts[4] || "").trim();
    if (spawnText.length) {
      var sp = spawnText.split("/");
      var posTok = (sp[0] || "").trim();
      var p = parseV2(posTok);
      if (p) {
        spawnX = p.x;
        spawnY = p.y;
        hasSpawn = true;
      }

      var deg = parseFloat(sp[1] || "0");
      if (isFinite(deg)) {
        if (MIRROR_X) deg = 180 - deg;

        // Editor: 0°=+X, 90°=+Y. Game forward is (sin(dir), cos(dir)).
        // Correct conversion:
        spawnDir = deg * Math.PI / 180; // +90 more (right)


        hasSpawn = true;
      }

      // small bias backward so you don't start inside checkpoint/wall
      spawnX -= Math.sin(spawnDir) * 0.8;
      spawnY -= Math.cos(spawnDir) * 0.8;
    }

    var wallsPart = (parts[0] || "").trim();
    var checkPart = (parts[1] || "").trim();
    var treesPart = (parts[2] || "").trim();

    var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    function includePt(p2) {
      minX = Math.min(minX, p2.x);
      minY = Math.min(minY, p2.y);
      maxX = Math.max(maxX, p2.x);
      maxY = Math.max(maxY, p2.y);
    }

    // Walls
    var wallTokens = wallsPart.split(/\s+/).filter(Boolean);
    for (var i = 0; i < wallTokens.length; i++) {
      var seg = parseSeg(wallTokens[i]);
      if (!seg) continue;
      includePt(seg.a); includePt(seg.b);
      addWall(seg.a, seg.b);
    }

    // Checkpoints
    var cpTokens = checkPart.split(/\s+/).filter(Boolean);
    for (var j = 0; j < cpTokens.length; j++) {
      var cseg = parseSeg(cpTokens[j]);
      if (!cseg) continue;
      includePt(cseg.a); includePt(cseg.b);
      addCheckpoint(cseg.a, cseg.b, j === 0);
    }

    // Trees
    var treeTokens = treesPart.split(/\s+/).filter(Boolean);
    for (var t = 0; t < treeTokens.length; t++) {
      var tp = parseV2(treeTokens[t]);
      if (!tp) continue;
      includePt(tp);
      addTree(tp.x, tp.y);
    }

    // resize ground
    if (minX < 1e8) {
      var pad = 2000;
      var w = (maxX - minX) + pad;
      var h = (maxY - minY) + pad;
      w = Math.max(w, 120);
      h = Math.max(h, 120);

      if (ground && ground.geometry) ground.geometry.dispose();
      var ng = new THREE.PlaneGeometry(w, h);
      ng.rotateX(-Math.PI / 2);
      ground.geometry = ng;
      ground.position.set((minX + maxX) / 2, 0, (minY + maxY) / 2);
    } else {
      ground.position.set(0, 0, 0);
    }

    if (!hasSpawn) computeSpawn();
  }

  function addWall(a2, b2) {
    var a = a2.clone(), b = b2.clone();
    var ab = b.clone().sub(a);
    var len2 = ab.lengthSq();
    if (len2 < 1e-6) return;

    var mid = a.clone().add(b).multiplyScalar(0.5);
    var width = Math.sqrt(len2);

    var geo = new THREE.BoxGeometry(width, 3, 0.6);
    var mat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.95 });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    var ang = Math.atan2((b.y - a.y), (b.x - a.x));
    mesh.rotation.y = -ang;
    mesh.position.set(mid.x, 1.5, mid.y);

    mapGroup.add(mesh);

    wallSegs.push({ a: a, b: b, dir: ab, len2: len2, mesh: mesh });
  }

  function addCheckpoint(a2, b2, isStart) {
    var a = a2.clone(), b = b2.clone();
    var ab = b.clone().sub(a);
    var len2 = ab.lengthSq();
    if (len2 < 1e-6) return;

    var mid = a.clone().add(b).multiplyScalar(0.5);
    var width = Math.sqrt(len2);

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
    if (!cpSegs.length) {
      spawnX = 0; spawnY = 0; spawnDir = 0;
      return;
    }

    var start = cpSegs[0];
    var forward = start.normal.clone();

    if (cpSegs.length > 1) {
      var chk = cpSegs[1];
      var v = chk.mid.clone().sub(start.mid);
      if (v.dot(forward) < 0) forward.multiplyScalar(-1);
    }

    spawnX = start.mid.x + forward.x * 5;
    spawnY = start.mid.y + forward.y * 5;

    // Inverse of fwd = (sin(dir), cos(dir))
spawnDir = Math.atan2(forward.x, forward.y);
spawnDir = wrapAngle(spawnDir);


  }

  // =========================
  // ===== Car models =========
  // =========================
  function attachSlipFX(root) {
    if (!root) return;
    if (root.getObjectByName && root.getObjectByName("slipfx")) return;

    var slip = new THREE.Group();
    slip.name = "slipfx";
    slip.visible = false;

    var geo = new THREE.PlaneGeometry(0.10, 6.0);
    geo.rotateX(-Math.PI / 2);

    function lineMesh(x) {
      var mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      mat.blending = THREE.AdditiveBlending;

      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, -0.52, -3.8);
      mesh.renderOrder = 9999;
      return mesh;
    }

    slip.add(lineMesh(-0.35));
    slip.add(lineMesh(0.35));

    root.add(slip);
  }

  // ---- Built-in procedural F1 (has wheel indices 2/3 for steer animation) ----
  function makeBuiltInCar(hexColor) {
    var car = new THREE.Object3D();
    car.userData.isBuiltIn = true;
    car.userData.isGLTF = false;
    car.userData.yawOffset = 0;
    car.userData.halfW = CAR_HALF_WIDTH;
    car.userData.halfL = CAR_HALF_LENGTH;

    var bodyMat = new THREE.MeshStandardMaterial({ color: hexColor, roughness: 0.5, metalness: 0.12 });
    var carbonMat = new THREE.MeshStandardMaterial({ color: 0x0f0f10, roughness: 0.9, metalness: 0.05 });
    var darkMat = new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.85, metalness: 0.05 });
    var metalMat = new THREE.MeshStandardMaterial({ color: 0x6b6b6b, roughness: 0.45, metalness: 0.5 });
    var glassMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.9 });

    function addMesh(parent, mesh, x, y, z, rx, ry, rz) {
      if (x != null) mesh.position.x = x;
      if (y != null) mesh.position.y = y;
      if (z != null) mesh.position.z = z;
      if (rx != null) mesh.rotation.x = rx;
      if (ry != null) mesh.rotation.y = ry;
      if (rz != null) mesh.rotation.z = rz;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }
    function box(parent, w, h, l, mat, x, y, z, rx, ry, rz) {
      return addMesh(parent, new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat), x, y, z, rx, ry, rz);
    }
    function cyl(parent, rTop, rBot, h, seg, mat, x, y, z, rx, ry, rz) {
      return addMesh(parent, new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat), x, y, z, rx, ry, rz);
    }

    // body is child[0]
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.30, 2.85), bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    body.position.y = 0.55;
    car.add(body);

    box(body, 1.28, 0.06, 3.55, carbonMat, 0, -0.19, 0);
    box(body, 0.22, 0.10, 0.95, carbonMat, 0, -0.11, 1.55);

    cyl(body, 0.12, 0.22, 1.25, 12, bodyMat, 0, -0.02, 1.65, Math.PI / 2, 0, 0);
    cyl(body, 0.06, 0.12, 0.30, 10, darkMat, 0, -0.03, 2.25, Math.PI / 2, 0, 0);

    box(body, 2.35, 0.06, 0.42, carbonMat, 0, -0.16, 2.18);
    box(body, 2.10, 0.05, 0.26, darkMat, 0, -0.08, 2.30);

    box(body, 0.55, 0.22, 1.25, bodyMat, 0, 0.12, -1.05);
    box(body, 0.06, 0.40, 0.95, carbonMat, 0, 0.30, -1.20);

    box(body, 1.55, 0.09, 0.42, carbonMat, 0, 0.22, -1.92);
    box(body, 1.35, 0.06, 0.28, darkMat, 0, 0.30, -1.98);

    // slipstream fx on body
    attachSlipFX(body);

    // cabin is child[1]
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.20, 0.90), glassMat);
    cabin.castShadow = true;
    cabin.receiveShadow = true;
    cabin.position.set(0, 0.78, 0.25);
    car.add(cabin);

    // wheels are child[2..5]
    function wheelMesh(radius, thickness) {
      var g = new THREE.CylinderGeometry(radius, radius, thickness, 18);
      var m = new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 1, metalness: 0.02 });
      var w = new THREE.Mesh(g, m);
      w.rotation.z = Math.PI / 2;
      w.castShadow = true;
      w.receiveShadow = true;

      var rim = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, thickness + 0.02, 14),
        new THREE.MeshStandardMaterial({ color: 0x303030, roughness: 0.55, metalness: 0.25 })
      );
      rim.rotation.z = Math.PI / 2;
      w.add(rim);

      var disc = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.35, radius * 0.35, thickness + 0.03, 12),
        metalMat
      );
      disc.rotation.z = Math.PI / 2;
      w.add(disc);

      return w;
    }

    var FL = { x: -1.08, y: 0.36, z: 1.52 };
    var FR = { x:  1.08, y: 0.36, z: 1.52 };
    var BL = { x: -1.08, y: 0.40, z: -1.32 };
    var BR = { x:  1.08, y: 0.40, z: -1.32 };

    var frontLeft = wheelMesh(0.36, 0.30);
    frontLeft.position.set(FL.x, FL.y, FL.z);
    car.add(frontLeft);

    var frontRight = wheelMesh(0.36, 0.30);
    frontRight.position.set(FR.x, FR.y, FR.z);
    car.add(frontRight);

    var backLeft = wheelMesh(0.42, 0.34);
    backLeft.position.set(BL.x, BL.y, BL.z);
    car.add(backLeft);

    var backRight = wheelMesh(0.42, 0.34);
    backRight.position.set(BR.x, BR.y, BR.z);
    car.add(backRight);

    return car;
  }

  function tintModel(root, hexColor) {
    if (!root || !GLTF_TINT_ENABLED) return;
    var c = new THREE.Color(hexColor);
    root.traverse(function (o) {
      if (!o || !o.isMesh) return;
      var m = o.material;
      if (!m) return;

      // If material has a map, tinting often looks bad. Keep map look by skipping color override.
      // If you want full tint always, delete the "if (m.map)" checks.
      if (Array.isArray(m)) {
        for (var i = 0; i < m.length; i++) {
          if (!m[i]) continue;
          if (m[i].map) continue;
          if (m[i].color) m[i].color.copy(c);
        }
      } else {
        if (m.map) return;
        if (m.color) m.color.copy(c);
      }
    });
  }

  // --- GLTF bbox sizing helpers (NEW) ---
  function getBBoxSizeXZ(obj) {
    // assumes obj already has desired scale applied
    var savedPos = obj.position.clone();
    var savedRot = obj.rotation.clone();

    obj.position.set(0, 0, 0);
    obj.rotation.set(0, 0, 0);
    obj.updateMatrixWorld(true);

    var box = new THREE.Box3().setFromObject(obj);
    var size = new THREE.Vector3();
    box.getSize(size);

    obj.position.copy(savedPos);
    obj.rotation.copy(savedRot);
    obj.updateMatrixWorld(true);

    return { size: size, box: box };
  }

  function buildGLTFCarInstance(hexColorInt) {
    if (!carGLTFReady || !carGLTF) return null;

    // clone raw gltf
    var raw = carGLTF.clone(true);
    raw.traverse(function (o) {
      if (o && o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material) o.material.needsUpdate = true;
      }
    });

    // scale
    var scale = GLTF_MANUAL_SCALE;
    if (GLTF_AUTO_SCALE) {
      // measure at unit scale
      raw.scale.set(1, 1, 1);
      raw.updateMatrixWorld(true);
      var m0 = getBBoxSizeXZ(raw).size;

      var len = Math.max(1e-6, m0.z);
      var wid = Math.max(1e-6, m0.x);

      // primary: match length, clamp a bit using width to prevent absurd results
      var sLen = GLTF_TARGET_LENGTH / len;
      var sWid = GLTF_TARGET_WIDTH / wid;

      // choose length match, but keep within a reasonable range of width match
      scale = sLen;
      var minS = sWid * 0.55;
      var maxS = sWid * 1.80;
      scale = clamp(scale, minS, maxS);
    }

    raw.scale.set(scale, scale, scale);
    raw.updateMatrixWorld(true);

    // optional center to bbox
    var wrapper = new THREE.Group();
    wrapper.userData.isBuiltIn = false;
    wrapper.userData.isGLTF = true;
    wrapper.userData.yawOffset = GLTF_YAW_OFFSET;

    if (GLTF_AUTO_CENTER) {
      var bbox = new THREE.Box3().setFromObject(raw);
      var center = new THREE.Vector3();
      bbox.getCenter(center);
      // move raw so its bbox center sits at wrapper origin
      raw.position.sub(center);
      raw.updateMatrixWorld(true);
    }
// --- ground the model so its lowest point sits on y=0 ---
raw.updateMatrixWorld(true);
var bbY = new THREE.Box3().setFromObject(raw);
var minY = bbY.min.y;

// move model up/down so bbox bottom is at y=0, then apply small offset
raw.position.y -= minY;
raw.position.y += (GLTF_CAR_Y_OFFSET || 0);

raw.updateMatrixWorld(true);

    // fit hitbox from raw only (NO slipfx included)
    var halfW = CAR_HALF_WIDTH;
    var halfL = CAR_HALF_LENGTH;

    if (GLTF_AUTO_FIT_HITBOX) {
      var s = getBBoxSizeXZ(raw).size;
      halfW = (s.x * 0.5) * GLTF_HITBOX_SCALE + GLTF_HITBOX_PADDING;
      halfL = (s.z * 0.5) * GLTF_HITBOX_SCALE + GLTF_HITBOX_PADDING;

      // keep sane minimums
      halfW = Math.max(0.25, halfW);
      halfL = Math.max(0.35, halfL);
    }

    wrapper.userData.halfW = halfW;
    wrapper.userData.halfL = halfL;

    // tint (optional)
    tintModel(raw, hexColorInt);

    wrapper.add(raw);

    // slip fx on wrapper so it follows car
    attachSlipFX(wrapper);

    return wrapper;
  }

  function syncPlayerHitboxFromModel(p) {
    if (!p || !p.model) return;
    var hw = (p.model.userData && p.model.userData.halfW) ? p.model.userData.halfW : CAR_HALF_WIDTH;
    var hl = (p.model.userData && p.model.userData.halfL) ? p.model.userData.halfL : CAR_HALF_LENGTH;
    p.halfW = hw;
    p.halfL = hl;
  }

  function swapPlayerModelToGLTF(playerKey) {
    if (!carGLTFReady || !carGLTF) return;
    var p = players[playerKey];
    if (!p || !p.model) return;

    // already gltf
    if (p.model.userData && p.model.userData.isGLTF) return;

    // preserve transform
    var pos = p.model.position.clone();
    var rotY = p.model.rotation.y;

    // color -> hex
    var col = (p.data && p.data.color) ? p.data.color : "#ff3030";
    var hex = parseInt(col.replace("#", "0x"), 16);

    var newModel = buildGLTFCarInstance(hex);
    if (!newModel) return;

    newModel.position.copy(pos);
    newModel.rotation.y = rotY; // already includes yawOffset in rotY if we were applying it
    scene.add(newModel);

    scene.remove(p.model);
    p.model = newModel;

    syncPlayerHitboxFromModel(p);
  }

  // createCarModel now takes playerKey so swap-in can update the correct player (NEW)
  function createCarModel(hexColorInt, playerKey, cb) {
    ensureEngine();

    // If no GLTF configured, return built-in immediately
    if (!GLTF_CAR_URL) {
      var built = makeBuiltInCar(hexColorInt);
      built.userData.playerKey = playerKey;
      cb(built);
      return;
    }

    // If GLTF already loaded, use it immediately
if (carGLTFReady && carGLTF) {
  var model = buildGLTFCarInstance(hexColorInt);
  if (!model) {
    var built = makeBuiltInCar(hexColorInt);
    built.userData.playerKey = playerKey;
    cb(built);
    return;
  }
  model.userData.playerKey = playerKey;
  cb(model);
  return;
}




    // Otherwise: return built-in NOW (game never blocks),
    // then swap to GLTF when it finishes loading.
    var placeholder = makeBuiltInCar(hexColorInt);
    placeholder.userData.playerKey = playerKey;
    placeholder.userData.isPlaceholder = true;
    cb(placeholder);

    // Queue swap after GLTF loads
    carGLTFWaiters.push(function (loaded) {
      if (!loaded) return;
      // if player still exists, swap
      if (players[playerKey]) swapPlayerModelToGLTF(playerKey);
    });

    preloadCarGLTF();
  }

  // =========================
  // ===== Labels ============
  // =========================
  function makeLabel(name) {
    var el = document.createElement("div");
    el.className = "pLabel";
    el.textContent = name || "Player";
    document.body.appendChild(el);
    return el;
  }

  function projectToScreen(pos3) {
    var v = pos3.clone();
    v.y += 0.8;
    v.project(camera);
    var x = (v.x + 1) / 2 * window.innerWidth;
    var y = (-v.y + 1) / 2 * window.innerHeight;
    var visible = (v.z >= -1 && v.z <= 1);
    return { x: x, y: y, visible: visible };
  }

  // =========================
  // ===== Slipstream =========
  // =========================
  function getSlipFX(model) {
    if (!model) return null;
    if (model._slipfxCached !== undefined) return model._slipfxCached;

    var fx = model.getObjectByName ? model.getObjectByName("slipfx") : null;
    model._slipfxCached = fx || null;
    return model._slipfxCached;
  }

  function setSlipFX(model, factor, ts) {
    var fx = getSlipFX(model);
    if (!fx) return;

    if (factor <= 0.02) {
      fx.visible = false;
      return;
    }

    fx.visible = true;

    var pulse = 0.70 + 0.30 * Math.sin(ts * 0.02);
    var op = clamp((0.20 + 0.65 * factor) * pulse, 0, 0.90);
    var stretch = 0.85 + factor * 0.65;

    for (var i = 0; i < fx.children.length; i++) {
      var m = fx.children[i];
      if (!m || !m.material) continue;
      m.material.opacity = op;
      m.scale.z = stretch;
    }
  }

  function computeSlipstreamForMe() {
    var bestKey = null;
    var best = 0;

    if (!me || !me.data) return { key: null, factor: 0 };

    var myPos = vec2(me.data.x, me.data.y);

    for (var k in players) {
      if (!players.hasOwnProperty(k)) continue;
      if (k === meKey) continue;

      var p = players[k];
      if (!p || !p.data) continue;

      var ox = p.data.x || 0;
      var oy = p.data.y || 0;
      var od = p.data.dir || 0;

      var oPos = vec2(ox, oy);
      var dVec = myPos.clone().sub(oPos); // from other -> me
      var dist = dVec.length();
      if (dist < 0.001 || dist > SLIP_DIST) continue;

      var fwd = vec2(Math.sin(od), Math.cos(od)); // their forward
      var along = dVec.dot(fwd);                  // + means I'm in front of them
      if (along > -0.25) continue;                // must be behind them

      var proj = fwd.clone().multiplyScalar(along);
      var lateral = dVec.clone().sub(proj).length();
      if (lateral > SLIP_WIDTH) continue;

      var distFactor = clamp((SLIP_DIST - dist) / SLIP_DIST, 0, 1);
      var latFactor = clamp((SLIP_WIDTH - lateral) / SLIP_WIDTH, 0, 1);

      var factor = distFactor * (latFactor * latFactor);

      if (factor > best) {
        best = factor;
        bestKey = k;
      }
    }

    return { key: bestKey, factor: best };
  }

  function updateSlipstreamVisuals(ts) {
    for (var k in players) {
      if (!players.hasOwnProperty(k)) continue;
      var p = players[k];
      if (!p || !p.model) continue;

      if (k === slipTargetKey) setSlipFX(p.model, slipFactor, ts);
      else setSlipFX(p.model, 0, ts);
    }
  }

  // =========================
  // ===== Input =============
  // =========================
  function setupInputOnce() {
    if (setupInputOnce._did) return;
    setupInputOnce._did = true;

    window.addEventListener("keydown", function (e) {
      var k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") left = true;
      if (k === "ArrowRight" || k === "d" || k === "D") right = true;
      if (k === "ArrowUp" || k === "w" || k === "W") up = true;
      if (k === "ArrowDown" || k === "s" || k === "S") down = true;

      if (k === "Shift") {
        if (!nitro) {
          if (!nitroLock && nitroFuel > 0.5) nitroArmed = true;
        }
        nitro = true;
      }
    });

    window.addEventListener("keyup", function (e) {
      var k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") left = false;
      if (k === "ArrowRight" || k === "d" || k === "D") right = false;
      if (k === "ArrowUp" || k === "w" || k === "W") up = false;
      if (k === "ArrowDown" || k === "s" || k === "S") down = false;

      if (k === "Shift") {
        nitro = false;
        nitroArmed = false;
        nitroLock = false;
        nitroActive = false;
      }
    });

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

  // =========================
  // ===== Color picker =======
  // =========================
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

    requestAnimationFrame(function () { setSliderFrom01(0.02); });

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

  // =========================
  // ===== Menu + flow ========
  // =========================
  function animateMenuIn() {
    if (titleEl) setTimeout(function () { titleEl.style.transform = "translate3d(0, 0, 0)"; }, 10);
    var items = document.getElementsByClassName("menuitem");
    for (var i = 0; i < items.length; i++) {
      (function (idx) {
        setTimeout(function () { items[idx].style.transform = "translate3d(0, 0, 0)"; }, 120 + idx * 90);
      })(i);
    }
    if (settingsEl) setTimeout(function () { settingsEl.style.transform = "translate3d(0, 0, 0)"; }, 500);
  }

  function showModeMenu() {
    ensureEngine();
    setupInputOnce();
    setupColorPickerOnce();

    clearModeUI();
    hideLobbyUI();

    if (nameEl && !nameEl.value.trim()) nameEl.value = "Player";

    if (titleEl) {
      titleEl.style.display = "";
      titleEl.innerHTML = "";
    }

    modeWrapEl = document.createElement("div");
    modeWrapEl.id = "modewrap";
    if (foreEl) foreEl.appendChild(modeWrapEl);

    function mkButton(text, topVh, onClick) {
      var b = makeDiv(null, "button", text);
      b.style.top = "calc(" + topVh + "vh - 8vmin)";
      b.onclick = onClick;
      modeWrapEl.appendChild(b);
      setTimeout(function () { b.style.transform = "translate3d(0,0,0)"; }, 20);
      return b;
    }

    mkButton("HOST", 30, function () { hostFlow(); });
    mkButton("JOIN", 55, function () { joinFlow(); });
    mkButton("SOLO", 80, function () { soloFlow(); });
  }

  // =========================
  // ===== Toolbar tools ======
  // =========================
  function setupToolbarOnce() {
    if (setupToolbarOnce._did) return;
    setupToolbarOnce._did = true;

    if (!settingsEl || !toolbarEl) return;

    settingsEl.onclick = function () {
      if (toolbarEl.classList.contains("sel")) toolbarEl.classList.remove("sel");
      else toolbarEl.classList.add("sel");
    };

    toolbarEl.innerHTML = "";

    function toolButton(title, bg, onClick) {
      var t = document.createElement("div");
      t.className = "tools";
      if (bg) t.style.backgroundColor = bg;
      t.title = title;
      t.onclick = function (e) { e.stopPropagation(); onClick(); };
      toolbarEl.appendChild(t);
      return t;
    }

    toolButton("Open editor", "#55db8f", function () {
      window.open("./editor/", "_blank");
    });

    toolButton("Import map code", "#db6262", function () {
      var cur = getTrackCode();
      var str = prompt("Paste trackcode here (exported from /editor).", cur);
      if (typeof str === "string" && str.trim()) {
        setTrackCode(str);
        showOverlayMsg("Map imported.");
        setTimeout(function () { showOverlayMsg(""); }, 1200);
      }
    });

    toolButton("Export map code", "#9a55db", function () {
      var str = getTrackCode();
      if (!str) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(str).then(function () {
          showOverlayMsg("Map code copied to clipboard.");
          setTimeout(function () { showOverlayMsg(""); }, 1200);
        }).catch(function () {
          prompt("Copy trackcode:", str);
        });
      } else {
        prompt("Copy trackcode:", str);
      }
    });
  }

  // =========================
  // ===== Multiplayer ========
  // =========================
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
    if (meKey) return; // prevents multiple cars spawning
    ensureEngine();

    detachRoomListeners();
    clearPlayers();

    ROOM = (code || "").toUpperCase();
    isHost = !!hostFlag;

    if (!database) {
      showOverlayMsg("Firebase unavailable. Running SOLO.");
      setTimeout(function () { showOverlayMsg(""); }, 1500);
      soloFlow();
      return;
    }

    roomRef = database.ref("rooms/" + ROOM);
    playersRef = roomRef.child("players");
    startRef = roomRef.child("startedAt");

    createLocalPlayerFirebase();

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

    createCarModel(hex, meKey, function (model) {
      model.position.set(data.x, 0, data.y);
      // apply visual yaw offset without changing physics
      var yawOff = (model.userData && model.userData.yawOffset) ? model.userData.yawOffset : 0;
      model.rotation.y = data.dir + yawOff;
      scene.add(model);

      var label = makeLabel(nm);

      me = { key: meKey, ref: ref, data: data, model: model, label: label, isMe: true, lastSend: 0, halfW: CAR_HALF_WIDTH, halfL: CAR_HALF_LENGTH };
      players[meKey] = me;

      syncPlayerHitboxFromModel(me);

      ref.onDisconnect().remove();
      ref.set(data);
    });
  }

  function upsertPlayer(key, data) {
    if (!data) return;

    if (meKey && key === meKey && me) {
      me.data.name = data.name || me.data.name;
      me.data.color = data.color || me.data.color;
      if (me.label) me.label.textContent = me.data.name;
      return;
    }

    var p = players[key];
    if (!p) {
      var hex = parseInt(((data.color || "#ff3030").replace("#", "0x")), 16);

      createCarModel(hex, key, function (model) {
        model.position.set(data.x || 0, 0, data.y || 0);
        var yawOff = (model.userData && model.userData.yawOffset) ? model.userData.yawOffset : 0;
        model.rotation.y = (data.dir || 0) + yawOff;
        scene.add(model);

        var label = makeLabel(data.name || "Player");
        p = { key: key, ref: playersRef.child(key), data: data, model: model, label: label, isMe: false, halfW: CAR_HALF_WIDTH, halfL: CAR_HALF_LENGTH };
        players[key] = p;

        syncPlayerHitboxFromModel(p);
      });
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

    var codeEl = makeDiv("code", "info", code);
    codeEl.style.fontSize = "20vmin";
    codeEl.style.textAlign = "center";
    codeEl.style.position = "absolute";
    codeEl.style.top = "20vh";
    codeEl.style.left = "0";
    codeEl.style.width = "100%";
    if (foreEl) foreEl.appendChild(codeEl);

    var sg = makeDiv("startgame", "", "START GAME");
    sg.style.position = "fixed";
    sg.style.bottom = "20px";
    sg.style.left = "50%";
    sg.style.transform = "translateX(-50%)";
    sg.style.width = "420px";
    sg.style.textAlign = "center";
    sg.style.zIndex = "99999";
    document.body.appendChild(sg);

    sg.onclick = function () {
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
    joinBtn.style.position = "fixed";
    joinBtn.style.bottom = "20px";
    joinBtn.style.left = "50%";
    joinBtn.style.transform = "translateX(-50%)";
    joinBtn.style.width = "420px";
    joinBtn.style.textAlign = "center";
    joinBtn.style.zIndex = "99999";
    document.body.appendChild(joinBtn);

    function doJoin() {
      var code = (inEl.value || "").trim().toUpperCase();
      if (!code) return;
      connectToRoom(code, false);
    }

    inEl.addEventListener("input", function () { inEl.value = inEl.value.toUpperCase(); });
    inEl.addEventListener("keydown", function (e) { if (e.key === "Enter") doJoin(); });
    joinBtn.onclick = doJoin;
  }

  function soloFlow() {
    ensureEngine();
    clearPlayers();
    detachRoomListeners();
    ROOM = null;
    isHost = false;

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

    createCarModel(hex, meKey, function (model) {
      model.position.set(data.x, 0, data.y);
      var yawOff = (model.userData && model.userData.yawOffset) ? model.userData.yawOffset : 0;
      model.rotation.y = data.dir + yawOff;
      scene.add(model);

      var label = makeLabel(nm);

      me = { key: meKey, ref: null, data: data, model: model, label: label, isMe: true, lastSend: 0, halfW: CAR_HALF_WIDTH, halfL: CAR_HALF_LENGTH };
      players[meKey] = me;

      syncPlayerHitboxFromModel(me);

      startGame();
    });
  }

  function startGame() {
    if (gameStarted) return;

    gameStarted = true;
    playerCollisionEnabled = false;

    hideAllMenusForGameplay();

    safeRemove(document.getElementById("incode"));
    safeRemove(document.getElementById("startgame"));

    showOverlayMsg("");
    startCountdown(function () {});

    setTimeout(function () { playerCollisionEnabled = true; }, 5000);
  }

  function startCountdown(done) {
    gameSortaStarted = true;
    var t = 3;

    if (countdownEl) {
      countdownEl.style.fontSize = "40vmin";
      countdownEl.style.display = "block";
      countdownEl.innerHTML = String(t);
    }

    var iv = setInterval(function () {
      t--;
      if (t <= 0) {
        clearInterval(iv);
        if (countdownEl) {
          countdownEl.innerHTML = "";
          countdownEl.style.display = "none";
        }
        gameSortaStarted = false;
        if (done) done();
        return;
      }
      if (countdownEl) {
        countdownEl.style.display = "block";
        countdownEl.innerHTML = String(t);
      }
    }, 1000);
  }

  // =========================
  // ===== Collision helpers ==
  // =========================
  function axesFromDir(dir) {
    var fwd = vec2(Math.sin(dir), Math.cos(dir));
    var right = vec2(Math.cos(dir), -Math.sin(dir));
    return { fwd: fwd, right: right };
  }

  function worldToLocal(pWorld, centerWorld, axes) {
    var v = pWorld.clone().sub(centerWorld);
    return vec2(v.dot(axes.right), v.dot(axes.fwd));
  }

  function localToWorld(pLocal, axes) {
    return vec2(
      axes.right.x * pLocal.x + axes.fwd.x * pLocal.y,
      axes.right.y * pLocal.x + axes.fwd.y * pLocal.y
    );
  }

  function pointSegDistSq(p, a, b) {
    var ab = b.clone().sub(a);
    var t = 0;
    var len2 = ab.lengthSq();
    if (len2 > 1e-9) t = clamp(p.clone().sub(a).dot(ab) / len2, 0, 1);
    var q = a.clone().add(ab.multiplyScalar(t));
    return { d2: p.distanceToSquared(q), q: q, t: t };
  }

  function pointRectClosest(p, hx, hy) {
    return vec2(clamp(p.x, -hx, hx), clamp(p.y, -hy, hy));
  }

  function segIntersectsAABB(a, b, hx, hy) {
    var t0 = 0, t1 = 1;
    var dx = b.x - a.x;
    var dy = b.y - a.y;

    function clip(p, q) {
      if (Math.abs(p) < 1e-9) return q >= 0;
      var r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
      return true;
    }

    if (
      clip(-dx, a.x + hx) &&
      clip( dx, hx - a.x) &&
      clip(-dy, a.y + hy) &&
      clip( dy, hy - a.y)
    ) {
      return t0 <= t1;
    }
    return false;
  }

  function segRectDistanceLocal(a, b, hx, hy) {
    if (segIntersectsAABB(a, b, hx, hy)) {
      var mid = a.clone().add(b).multiplyScalar(0.5);
      var ax = hx - Math.abs(mid.x);
      var ay = hy - Math.abs(mid.y);
      if (ax < ay) return { dist: 0, n: vec2(mid.x >= 0 ? 1 : -1, 0) };
      return { dist: 0, n: vec2(0, mid.y >= 0 ? 1 : -1) };
    }

    function pointRectDist(p) {
      var dx = Math.max(Math.abs(p.x) - hx, 0);
      var dy = Math.max(Math.abs(p.y) - hy, 0);
      return Math.sqrt(dx * dx + dy * dy);
    }

    var bestDist = 1e9;
    var bestN = vec2(0, 1);

    var da = pointRectDist(a);
    if (da < bestDist) {
      var ca = pointRectClosest(a, hx, hy);
      var n = ca.clone().sub(a);
      if (n.lengthSq() > 1e-9) n.normalize();
      bestDist = da;
      bestN = n;
    }
    var db = pointRectDist(b);
    if (db < bestDist) {
      var cb = pointRectClosest(b, hx, hy);
      var n2 = cb.clone().sub(b);
      if (n2.lengthSq() > 1e-9) n2.normalize();
      bestDist = db;
      bestN = n2;
    }

    var corners = [
      vec2(-hx, -hy),
      vec2(-hx,  hy),
      vec2( hx, -hy),
      vec2( hx,  hy)
    ];
    for (var i = 0; i < corners.length; i++) {
      var c = corners[i];
      var r = pointSegDistSq(c, a, b);
      var d = Math.sqrt(r.d2);
      if (d < bestDist) {
        var n3 = c.clone().sub(r.q);
        if (n3.lengthSq() > 1e-9) n3.normalize();
        bestDist = d;
        bestN = n3;
      }
    }

    return { dist: bestDist, n: bestN };
  }

  function obbOverlapMTV(aCenter, aDir, aHx, aHy, bCenter, bDir, bHx, bHy) {
    var aAxes = axesFromDir(aDir);
    var bAxes = axesFromDir(bDir);

    var axes = [aAxes.right, aAxes.fwd, bAxes.right, bAxes.fwd];

    var bestOverlap = 1e9;
    var bestAxis = null;

    var d = bCenter.clone().sub(aCenter);

    for (var i = 0; i < axes.length; i++) {
      var axis = axes[i].clone();
      var len = axis.length();
      if (len < 1e-9) continue;
      axis.multiplyScalar(1 / len);

      var dist = Math.abs(d.dot(axis));

      var ra =
        Math.abs(axis.dot(aAxes.right)) * aHx +
        Math.abs(axis.dot(aAxes.fwd)) * aHy;

      var rb =
        Math.abs(axis.dot(bAxes.right)) * bHx +
        Math.abs(axis.dot(bAxes.fwd)) * bHy;

      var overlap = (ra + rb) - dist;
      if (overlap <= 0) return { hit: false };

      if (overlap < bestOverlap) {
        bestOverlap = overlap;
        bestAxis = axis;
        if (d.dot(axis) < 0) bestAxis = axis.clone().multiplyScalar(-1);
      }
    }

    return { hit: true, mtv: bestAxis.clone().multiplyScalar(bestOverlap) };
  }

  function collideWithPlayers() {
    if (!playerCollisionEnabled || !me) return;

    var aCenter = vec2(me.data.x, me.data.y);
    var aDir = me.data.dir;
    var aHx = (me.halfW != null) ? me.halfW : CAR_HALF_WIDTH;
    var aHy = (me.halfL != null) ? me.halfL : CAR_HALF_LENGTH;

    var v = vec2(me.data.xv, me.data.yv);

    for (var k in players) {
      if (!players.hasOwnProperty(k)) continue;
      if (k === meKey) continue;

      var p = players[k];
      if (!p || !p.data) continue;

      var bCenter = vec2(p.data.x || 0, p.data.y || 0);
      var bDir = p.data.dir || 0;
      var bHx = (p.halfW != null) ? p.halfW : CAR_HALF_WIDTH;
      var bHy = (p.halfL != null) ? p.halfL : CAR_HALF_LENGTH;

      var res = obbOverlapMTV(aCenter, aDir, aHx, aHy, bCenter, bDir, bHx, bHy);
      if (!res.hit) continue;

      aCenter.sub(res.mtv);

      var n = res.mtv.clone();
      if (n.lengthSq() > 1e-9) n.normalize();
      if (v.dot(n) < 0) v = reflect2(v, n).multiplyScalar(BOUNCE);

      p.data.x += n.x * 0.06;
      p.data.y += n.y * 0.06;
      p.data.xv = (p.data.xv || 0) + n.x * 0.05;
      p.data.yv = (p.data.yv || 0) + n.y * 0.05;
    }

    me.data.x = aCenter.x;
    me.data.y = aCenter.y;
    me.data.xv = v.x;
    me.data.yv = v.y;
  }

  function collideMeWithWallsRect() {
    if (!me) return;

    var hx = (me.halfW != null) ? me.halfW : CAR_HALF_WIDTH;
    var hy = (me.halfL != null) ? me.halfL : CAR_HALF_LENGTH;

    var pWorld = vec2(me.data.x, me.data.y);
    var vWorld = vec2(me.data.xv, me.data.yv);

    var axes = axesFromDir(me.data.dir);

    for (var pass = 0; pass < 3; pass++) {
      for (var i = 0; i < wallSegs.length; i++) {
        var w = wallSegs[i];

        var aL = worldToLocal(w.a, pWorld, axes);
        var bL = worldToLocal(w.b, pWorld, axes);

        var res = segRectDistanceLocal(aL, bL, hx, hy);

        if (res.dist < WALL_SIZE) {
          var nL = res.n.clone();
          if (nL.lengthSq() < 1e-9) continue;
          nL.normalize();

          var push = (WALL_SIZE - res.dist) + 0.08;
          var pushWorld = localToWorld(nL.multiplyScalar(push), axes);
          pWorld.add(pushWorld);

          var nW = pushWorld.clone().normalize();

          if (vWorld.dot(nW) < 0) {
            vWorld = reflect2(vWorld, nW).multiplyScalar(BOUNCE);
          }
        }
      }
    }

    me.data.x = pWorld.x;
    me.data.y = pWorld.y;
    me.data.xv = vWorld.x;
    me.data.yv = vWorld.y;
  }

  // =========================
  // ===== Checkpoints ========
  // =========================
  function handleCheckpoints() {
    if (!cpSegs.length || !me) return;
    if (cpSegs.length < 2) return;

    var pos = vec2(me.data.x, me.data.y);

    for (var i = 0; i < cpSegs.length; i++) {
      var cp = cpSegs[i];

      var ab = cp.b.clone().sub(cp.a);
      var t = 0;
      if (cp.len2 > 1e-9) t = clamp(pos.clone().sub(cp.a).dot(ab) / cp.len2, 0, 1);
      var closest = cp.a.clone().add(ab.multiplyScalar(t));

      var dist = pos.distanceTo(closest);
      if (dist > 1.1) continue;

      if (i === 0) {
        if (me.data.checkpoint === 1) {
          me.data.checkpoint = 0;
          me.data.lap++;
        }
      } else {
        me.data.checkpoint = 1;
      }
    }

    if (me.data.lap > LAPS && countdownEl) {
      gameSortaStarted = true;
      countdownEl.style.display = "block";
      countdownEl.style.fontSize = "18vmin";
      countdownEl.innerHTML =
        (me.data.name || "Player").replace(/</g, "&lt;") + "<br>WINS!";

      me.data.xv = 0;
      me.data.yv = 0;
    }
  }

  // =========================
  // ===== Physics + loop =====
  // =========================
  function updateMePhysics(warp, dtSec) {
    if (!me || !me.data || !me.model) return;

    // Slipstream compute
    var slip = computeSlipstreamForMe();
    slipTargetKey = slip.key;
    slipFactor = slip.factor;

    // Steering (reverse behavior)
    if (!mobile) {
      if (left) me.data.steer = STEER_MAX;
      if (right) me.data.steer = -STEER_MAX;
      if (!(left ^ right)) me.data.steer = 0;
    }
    me.data.steer = clamp(me.data.steer, -STEER_MAX, STEER_MAX);

    // Nitro state
    nitroActive = false;
    if (nitro && nitroArmed && !nitroLock && nitroFuel > 0) {
      nitroActive = true;
      nitroFuel -= NITRO_DRAIN * dtSec;

      if (nitroFuel <= 0) {
        nitroFuel = 0;
        nitroLock = true;
        nitroArmed = false;
        nitroActive = false;
      }
    } else {
      nitroFuel = Math.min(NITRO_MAX, nitroFuel + NITRO_REGEN * dtSec);
    }

    if (USE_CLASSIC_PHYSICS) {
      var usingNitro = nitroActive;

      // understeer scaling with speed
      var sp0 = Math.sqrt(me.data.xv * me.data.xv + me.data.yv * me.data.yv);
      var steerScale = 1 / (1 + sp0 * TURN_SPEED_FALLOFF);

      // turn
      me.data.dir += (me.data.steer / CLASSIC_TURN_DIV) * warp * steerScale;
      me.data.dir = wrapAngle(me.data.dir);

      // throttle
      var forwardOn = up;
      var accel = SPEED;

      if (usingNitro) accel *= NITRO_MULT;
      if (slipFactor > 0.001) accel *= (1.0 + SLIP_ACCEL_BONUS * slipFactor);

      if (forwardOn) {
        me.data.xv += Math.sin(me.data.dir) * accel * warp;
        me.data.yv += Math.cos(me.data.dir) * accel * warp;
      }

      if (down) {
        me.data.xv -= Math.sin(me.data.dir) * accel * 2.3 * warp;
        me.data.yv -= Math.cos(me.data.dir) * accel * 2.3 * warp;
      }

      // drag
      var dragPow = Math.pow(CLASSIC_DRAG, warp);
      me.data.xv *= dragPow;
      me.data.yv *= dragPow;

      // drift model: velocity direction lags heading
      var vx = me.data.xv, vy = me.data.yv;
      var sp = Math.sqrt(vx * vx + vy * vy);

      if (sp > 1e-6) {
        var velAng = Math.atan2(vx, vy);
        var fwdAng = me.data.dir;
        var diff = wrapAngle(fwdAng - velAng);

        var grip = DRIFT_ALIGN_BASE / (1 + sp * DRIFT_ALIGN_SPEED_FALLOFF);
        if (Math.abs(me.data.steer) > 0.001) grip *= DRIFT_ALIGN_TURN_MULT;
        if (usingNitro) grip *= DRIFT_ALIGN_NITRO_MULT;

        var align = clamp(grip * dtSec * 60, 0, 1);
        velAng += diff * align;

        vx = Math.sin(velAng) * sp;
        vy = Math.cos(velAng) * sp;

        var fwd = vec2(Math.sin(me.data.dir), Math.cos(me.data.dir));
        var side = vec2(fwd.y, -fwd.x);

        var vf = vx * fwd.x + vy * fwd.y;
        var vl = vx * side.x + vy * side.y;

        var scrub = SIDE_SCRUB;
        if (Math.abs(me.data.steer) > 0.001) scrub *= SIDE_SCRUB_TURN_MULT;
        if (usingNitro) scrub *= SIDE_SCRUB_NITRO_MULT;

        vl *= Math.pow(1 - scrub, warp);

        vx = fwd.x * vf + side.x * vl;
        vy = fwd.y * vf + side.y * vl;

        me.data.xv = vx;
        me.data.yv = vy;
      }

      // speed cap
      var cap = CLASSIC_MAX_SPEED;
      if (usingNitro) cap *= 1.6;
      if (slipFactor > 0.001) cap *= (1.0 + SLIP_TOPSPEED_BONUS * slipFactor);

      var sp2 = Math.sqrt(me.data.xv * me.data.xv + me.data.yv * me.data.yv);
      if (sp2 > cap && sp2 > 1e-9) {
        var sc = cap / sp2;
        me.data.xv *= sc;
        me.data.yv *= sc;
      }
    }

    // substeps for collision stability
    var steps = Math.ceil(Math.max(Math.abs(me.data.xv), Math.abs(me.data.yv)) * 6);
    steps = Math.max(1, steps);

    for (var s = 0; s < steps; s++) {
      me.data.x += (me.data.xv * warp) / steps;
      me.data.y += (me.data.yv * warp) / steps;

      collideMeWithWallsRect();
      collideWithPlayers();
    }

    handleCheckpoints();

    // out of bounds
    if (Math.sqrt(me.data.x * me.data.x + me.data.y * me.data.y) > OOB_DIST) {
      me.data.x = spawnX;
      me.data.y = spawnY;
      me.data.xv = 0;
      me.data.yv = 0;
      me.data.dir = spawnDir;

      nitroArmed = false;
      nitroLock = false;
      nitroActive = false;
    }

    // apply to model
    var yawOff = (me.model.userData && me.model.userData.yawOffset) ? me.model.userData.yawOffset : 0;
    me.model.position.x = me.data.x;
    me.model.position.z = me.data.y;
    me.model.rotation.y = me.data.dir + yawOff;

    // wheel steer for built-in model only (children[2] & [3] are front wheels)
    if (me.model.userData && me.model.userData.isBuiltIn) {
      if (me.model.children && me.model.children.length >= 4) {
        if (me.model.children[2]) me.model.children[2].rotation.z = Math.PI / 2 - me.data.steer;
        if (me.model.children[3]) me.model.children[3].rotation.z = Math.PI / 2 - me.data.steer;
      }
    }
  }

 function updateCamera(warp) {
  if (!me || !me.model) return;

  var targetFov = nitroActive ? BOOST_FOV : BASE_FOV;
  camera.fov = camera.fov * 0.88 + targetFov * 0.12;
  camera.updateProjectionMatrix();

  // IMPORTANT: camera follows PHYSICS dir only (no yawOffset)
  var d = me.data.dir;

  // keep your original math, just with d = me.data.dir
  var target = new THREE.Vector3(
    me.model.position.x + Math.sin(-d) * 5,
    CAM_HEIGHT,
    me.model.position.z + -Math.cos(-d) * 5
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

      var tx = p.data.x || 0;
      var ty = p.data.y || 0;

      var yawOff = (p.model.userData && p.model.userData.yawOffset) ? p.model.userData.yawOffset : 0;
      var tdir = (p.data.dir || 0) + yawOff;

      p.model.position.x += (tx - p.model.position.x) * clamp(0.18 * warp, 0, 1);
      p.model.position.z += (ty - p.model.position.z) * clamp(0.18 * warp, 0, 1);

      var cur = p.model.rotation.y;
      var diff = ((tdir - cur + Math.PI) % (2 * Math.PI)) - Math.PI;
      p.model.rotation.y = cur + diff * clamp(0.25 * warp, 0, 1);
    }
  }

  function updateLabels() {
    if (!camera) return;
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
    var spd = Math.sqrt(me.data.xv * me.data.xv + me.data.yv * me.data.yv);
    var roomText = ROOM ? (" | " + ROOM) : "";
    lapEl.style.fontSize = "26px";
    lapEl.style.lineHeight = "28px";
    lapEl.innerHTML = "Lap " + (me.data.lap <= LAPS ? (me.data.lap + "/" + LAPS) : "") + " | Spd " + spd.toFixed(2) + roomText;
  }

  function maybeSendToFirebase(ts) {
    if (!me || !me.ref) return;
    if (ts - me.lastSend < 60) return;
    me.lastSend = ts;

    me.data.lastSeen = Date.now();
    me.ref.set(me.data);
  }

  // ===== Nitro UI =====
  function updateNitroUI() {
    var barEl = document.getElementById("nitrobar");
    var fillEl = document.getElementById("nitrofill");
    var lblEl = document.getElementById("nitrolabel");
    if (!barEl || !fillEl || !lblEl) return;

    if (gameStarted) {
      barEl.style.display = "block";
      lblEl.style.display = "block";
    } else {
      barEl.style.display = "none";
      lblEl.style.display = "none";
    }

    if (nitroActive) barEl.classList.add("active");
    else barEl.classList.remove("active");

    fillEl.style.width = ((nitroFuel / NITRO_MAX) * 100) + "%";
  }

  // ===== Main loop =====
  var lastTime = 0;

  function renderLoop(ts) {
    requestAnimationFrame(renderLoop);
    if (!lastTime) lastTime = ts;

    var timepassed = ts - lastTime;
    lastTime = ts;

    timepassed = Math.min(timepassed, 50);
    var warp = timepassed / 16;
    var dtSec = timepassed / 1000;

    if (gameStarted && me) {
      if (!gameSortaStarted) updateMePhysics(warp, dtSec);
      updateRemoteVisuals(warp);

      updateSlipstreamVisuals(ts);
      updateCamera(warp);

      updateHud();
      updateNitroUI();
      maybeSendToFirebase(ts);
    } else {
      // menu idle camera
      var a = ts * 0.0004;
      camera.position.set(50 * Math.sin(a), 20, 50 * Math.cos(a));
      camera.lookAt(new THREE.Vector3(0, 0, 0));

      slipTargetKey = null;
      slipFactor = 0;
      updateSlipstreamVisuals(ts);
      updateNitroUI();
    }

    updateLabels();
    renderer.render(scene, camera);
  }

  // =========================
  // ===== Init ===============
  // =========================
  function init() {
    ensureEngine();

    // allow UI clicks while in menu
    if (foreEl) foreEl.style.pointerEvents = "auto";
    if (foreEl && foreEl.style.display === "none") foreEl.style.display = "";

    setupToolbarOnce();
    setupInputOnce();
    setupColorPickerOnce();

    buildMapFromTrackCode(getTrackCode());

    if (startEl) startEl.onclick = showModeMenu;

    animateMenuIn();
    requestAnimationFrame(renderLoop);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // ===== Compatibility with your HTML inline onclick handlers =====
  window.menu2 = showModeMenu;
  window.host = hostFlow;
  window.joinGame = joinFlow;
  window.codeCheck = function () {};
  window.updateColor = function (x01) { setSliderFrom01(x01); };

  // Clean up firebase presence on close
  window.addEventListener("beforeunload", function () {
    try {
      if (me && me.ref) me.ref.remove();
    } catch (e) {}
  });

})();
