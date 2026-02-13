// ====== TUNING (updated) ======
var SPEED = 0.004;
var CAMERA_LAG = 0.82; // was 0.9
var COLLISION = 1.1;
var BOUNCE = 0.7;
var mapscale = 50; // kept for compatibility (not required for track scaling)
var VR = false;
var BOUNCE_CORRECT = 0.01;
var WALL_SIZE = 1.2;
var MOUNTAIN_DIST = 2500;
var OOB_DIST = 200;
var LAPS = 3;

// New tuning (added)
var MAX_SPEED = 0.9; // top speed cap
var STEER_MIN = 0.05; // steering response at low speed
var STEER_SPEED = 0.12; // steering response increases with speed
var CAM_HEIGHT = 4; // was 3

function MODS() {}

// ====== Firebase connection ======
const firebaseConfig = {
  apiKey: "AIzaSyAbvjrx9Nvu2_xRFTN-AEN8dJgRUDdb410",
  authDomain: "car-game67.firebaseapp.com",
  databaseURL: "https://car-game67-default-rtdb.firebaseio.com/",
  projectId: "car-game67",
  storageBucket: "car-game67.appspot.com",
  messagingSenderId: "211052611005",
  appId: "1:211052611005:web:bd456d81c7be8825e1fed4",
};

firebase.initializeApp(firebaseConfig);
var database = firebase.database();

var authReady = false;
firebase.auth().onAuthStateChanged(function (u) {
  authReady = !!u;
});
firebase.auth().signInAnonymously().catch(console.error);

// ====== Globals expected by the game loop ======
var scene, renderer, camera;
var map, startc;
var players = {};
var labels = [];

var me = null;
var meKey = null;

var left = false;
var right = false;

var gameStarted = false; // true after you click Start and player is created
var gameSortaStarted = false; // true during countdown (freeze physics)

var mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// UI globals declared in index.html
// var color, updateColor, menu2, host, joinGame, codeCheck;
var color = "#ff3030";
var host = function () {};
var joinGame = function () {};
var codeCheck = function () {};

var countdownEl = null;
var lap = null;

// ====== Multiplayer room ======
var ROOM = "public";
var playersRef = database.ref("rooms/" + ROOM + "/players");

// ====== Engine init ======
function ensureEngine() {
  if (scene && renderer && map && startc) return;

  scene = new THREE.Scene();

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;

  // Put the canvas behind the UI
  renderer.domElement.style.position = "fixed";
  renderer.domElement.style.left = "0";
  renderer.domElement.style.top = "0";
  renderer.domElement.style.zIndex = "-1";
  document.body.insertBefore(renderer.domElement, document.body.firstChild);

  map = new THREE.Object3D();
  scene.add(map);

  startc = new THREE.Object3D();
  scene.add(startc);

  // Basic ground so you see something even before walls
  var groundGeo = new THREE.PlaneGeometry(400, 400);
  groundGeo.rotateX(-Math.PI / 2);
  var groundMat = new THREE.MeshStandardMaterial({ color: 0x5fbf6a, roughness: 1 });
  var ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  ground.position.y = 0;
  scene.add(ground);

  // UI elements (toolbar + countdown)
  lap = document.getElementById("toolbar") || document.createElement("div");

  countdownEl = document.getElementById("countdown");
  if (!countdownEl) {
    countdownEl = document.createElement("div");
    countdownEl.id = "countdown";
    countdownEl.style.position = "fixed";
    countdownEl.style.left = "50%";
    countdownEl.style.top = "50%";
    countdownEl.style.transform = "translate(-50%, -50%)";
    countdownEl.style.fontFamily = "'Press Start 2P', monospace";
    countdownEl.style.color = "white";
    countdownEl.style.textShadow = "0 4px 0 rgba(0,0,0,0.5)";
    countdownEl.style.fontSize = "18vmin";
    countdownEl.style.zIndex = "5";
    countdownEl.style.pointerEvents = "none";
    countdownEl.innerHTML = "";
    document.body.appendChild(countdownEl);
  }

  // Minimal label styling if CSS doesn’t define it
  if (!document.getElementById("label-style")) {
    var st = document.createElement("style");
    st.id = "label-style";
    st.textContent =
      ".pLabel{position:fixed;transform:translate(-50%,-50%);color:#fff;font-family:'Press Start 2P',monospace;font-size:12px;pointer-events:none;text-shadow:0 2px 0 rgba(0,0,0,.55);z-index:4;}";
    document.head.appendChild(st);
  }
}

// ====== Track parsing + world building ======
function parsePoint(tok) {
  // tok = "x,y"
  var parts = tok.split(",");
  if (parts.length !== 2) return null;
  var x = parseFloat(parts[0]);
  var y = parseFloat(parts[1]);
  if (!isFinite(x) || !isFinite(y)) return null;
  return new THREE.Vector2(x, y);
}

function clearObjectChildren(obj) {
  while (obj.children.length) obj.remove(obj.children[0]);
}

function addWallSegment(p1, p2) {
  var dir2 = new THREE.Vector2(p2.x - p1.x, p2.y - p1.y);
  var width = p1.distanceTo(p2);

  var mid = new THREE.Vector3((p1.x + p2.x) / 2, 0, (p1.y + p2.y) / 2);

  // plane normal perpendicular to the segment in XZ
  var normal = new THREE.Vector3(dir2.y, 0, -dir2.x);
  if (normal.lengthSq() < 1e-9) return;
  normal.normalize();

  var wall = new THREE.Object3D();
  wall.position.copy(mid);

  wall.plane = new THREE.Plane(normal.clone(), 0);
  wall.width = width;
  wall.p1 = p1.clone();
  wall.p2 = p2.clone();

  // visible wall mesh
  var geom = new THREE.BoxGeometry(width, 3, 0.6);
  var mat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.95 });
  var mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  var ang = Math.atan2(dir2.y, dir2.x);
  mesh.rotation.y = -ang;
  mesh.position.y = 1.5;

  wall.add(mesh);
  map.add(wall);
}

function addCheckpointSegment(p1, p2, isStart) {
  var dir2 = new THREE.Vector2(p2.x - p1.x, p2.y - p1.y);
  var width = p1.distanceTo(p2);

  var mid = new THREE.Vector3((p1.x + p2.x) / 2, 0, (p1.y + p2.y) / 2);

  var normal = new THREE.Vector3(dir2.y, 0, -dir2.x);
  if (normal.lengthSq() < 1e-9) return null;
  normal.normalize();

  var cp = new THREE.Object3D();
  cp.position.copy(mid);

  cp.plane = new THREE.Plane(normal.clone(), 0);
  cp.width = width;
  cp.p1 = p1.clone();
  cp.p2 = p2.clone();

  // visible line
  var geom = new THREE.BoxGeometry(width, 0.1, 2.0);
  var mat = new THREE.MeshStandardMaterial({ color: isStart ? 0xffffff : 0xffe100, roughness: 0.8 });
  var mesh = new THREE.Mesh(geom, mat);
  mesh.receiveShadow = true;

  var ang = Math.atan2(dir2.y, dir2.x);
  mesh.rotation.y = -ang;
  mesh.position.y = 0.05;

  cp.add(mesh);
  startc.add(cp);

  return { mid: mid, normal: normal, segDir: dir2 };
}

var spawnX = 0;
var spawnY = 0;
var spawnDir = 0;

function loadMap() {
  ensureEngine();

  clearObjectChildren(map);
  clearObjectChildren(startc);

  var raw = (document.getElementById("trackcode")?.textContent || "").trim();
  var parts = raw.split("|").map(function (s) {
    return s.trim();
  });

  // parts[0] = walls (polylines separated by '/')
  if (parts[0]) {
    var lines = parts[0]
      .split("/")
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);

    lines.forEach(function (ln) {
      var toks = ln.split(/\s+/).filter(Boolean);
      var pts = toks.map(parsePoint).filter(Boolean);
      for (var i = 0; i < pts.length - 1; i++) addWallSegment(pts[i], pts[i + 1]);
    });
  }

  // parts[1] = start line (usually 2 points, may be separated by '/')
  var startInfo = null;
  if (parts[1]) {
    var segs = parts[1].split("/").map(function (s) {
      return s.trim();
    });
    var stToks = (segs[0] || "").split(/\s+/).filter(Boolean);
    var stPts = stToks.map(parsePoint).filter(Boolean);
    if (stPts.length >= 2) startInfo = addCheckpointSegment(stPts[0], stPts[1], true);
  }

  // parts[2] = checkpoint line (can be a polyline)
  if (parts[2]) {
    var cpToks = parts[2].split(/\s+/).filter(Boolean);
    var cpPts = cpToks.map(parsePoint).filter(Boolean);
    for (var j = 0; j < cpPts.length - 1; j++) addCheckpointSegment(cpPts[j], cpPts[j + 1], false);
  }

  // Spawn based on start line if available
  if (startInfo) {
    // direction to drive: opposite the start plane normal (so you cross the start line)
    var drive = new THREE.Vector2(-startInfo.normal.x, -startInfo.normal.z);
    if (drive.lengthSq() < 1e-9) drive = new THREE.Vector2(0, 1);

    spawnDir = Math.atan2(drive.x, drive.y); // matches sin(dir)->x, cos(dir)->y
    spawnX = startInfo.mid.x + drive.x * 2.5;
    spawnY = startInfo.mid.z + drive.y * 2.5;
  } else {
    spawnX = 0;
    spawnY = 0;
    spawnDir = 0;
  }

  // Return empty string to keep old eval(loadMap()) safe if present elsewhere
  return "";
}

// ====== Car + labels ======
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

  // Front wheels MUST be children[0] and children[1] because your loop rotates them.
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

function removeLabel(el) {
  try {
    el.remove();
  } catch (e) {}
}

function applyPlayerDataToModel(play) {
  if (!play || !play.model || !play.data) return;
  play.model.position.x = play.data.x;
  play.model.position.z = play.data.y;
  play.model.rotation.y = play.data.dir;
}

// ====== Input (keyboard + touch) ======
function setupInput() {
  window.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") left = true;
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") right = true;
  });

  window.addEventListener("keyup", function (e) {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") left = false;
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") right = false;
  });

  // Simple touch steering: left half = left, right half = right
  function touchUpdate(touches) {
    left = false;
    right = false;
    if (!touches || touches.length === 0) return;
    for (var i = 0; i < touches.length; i++) {
      var x = touches[i].clientX;
      if (x < window.innerWidth / 2) left = true;
      else right = true;
    }
  }

  window.addEventListener(
    "touchstart",
    function (e) {
      touchUpdate(e.touches);
    },
    { passive: true }
  );
  window.addEventListener(
    "touchmove",
    function (e) {
      touchUpdate(e.touches);
    },
    { passive: true }
  );
  window.addEventListener(
    "touchend",
    function () {
      left = false;
      right = false;
    },
    { passive: true }
  );
}

// ====== UI: color picker + Start button ======
function hsvToHex(h, s, v) {
  var c = v * s;
  var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  var m = v - c;
  var r = 0,
    g = 0,
    b = 0;

  if (h < 60) (r = c), (g = x), (b = 0);
  else if (h < 120) (r = x), (g = c), (b = 0);
  else if (h < 180) (r = 0), (g = c), (b = x);
  else if (h < 240) (r = 0), (g = x), (b = c);
  else if (h < 300) (r = x), (g = 0), (b = c);
  else (r = c), (g = 0), (b = x);

  var R = Math.round((r + m) * 255);
  var G = Math.round((g + m) * 255);
  var B = Math.round((b + m) * 255);

  function to2(n) {
    var t = n.toString(16);
    return t.length === 1 ? "0" + t : t;
  }
  return "#" + to2(R) + to2(G) + to2(B);
}

updateColor = function (x01) {
  // x01 = 0..1
  x01 = Math.max(0, Math.min(1, x01));
  var hue = x01 * 360;
  color = hsvToHex(hue, 0.85, 1);

  var slider = document.getElementById("slider");
  var picker = document.getElementById("colorpicker");
  if (slider && picker) {
    slider.style.left = Math.round(x01 * (picker.clientWidth - slider.clientWidth)) + "px";
    slider.style.background = color;
  }
};

function setupColorPicker() {
  var picker = document.getElementById("colorpicker");
  var slider = document.getElementById("slider");
  if (!picker || !slider) return;

  // default
  updateColor(0.02);

  var dragging = false;

  function setFromEvent(e) {
    var rect = picker.getBoundingClientRect();
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    var x = clientX - rect.left;
    var x01 = x / rect.width;
    updateColor(x01);
  }

  picker.addEventListener("mousedown", function (e) {
    dragging = true;
    setFromEvent(e);
  });
  window.addEventListener("mousemove", function (e) {
    if (!dragging) return;
    setFromEvent(e);
  });
  window.addEventListener("mouseup", function () {
    dragging = false;
  });

  picker.addEventListener(
    "touchstart",
    function (e) {
      dragging = true;
      setFromEvent(e);
    },
    { passive: true }
  );
  picker.addEventListener(
    "touchmove",
    function (e) {
      if (!dragging) return;
      setFromEvent(e);
    },
    { passive: true }
  );
  picker.addEventListener(
    "touchend",
    function () {
      dragging = false;
    },
    { passive: true }
  );
}

function startCountdown(done) {
  gameSortaStarted = true;
  var t = 3;
  countdownEl.innerHTML = "" + t;

  var iv = setInterval(function () {
    t--;
    if (t <= 0) {
      clearInterval(iv);
      countdownEl.innerHTML = "";
      gameSortaStarted = false;
      if (done) done();
      return;
    }
    countdownEl.innerHTML = "" + t;
  }, 1000);
}

function createMeIfNeeded() {
  if (me) return;

  var nm = (document.getElementById("name")?.value || "").trim();
  if (!nm) nm = "Player";

  // Create local player entry
  var ref = playersRef.push();
  meKey = ref.key;

  var hex = parseInt(color.replace("#", "0x"), 16);
  me = {
    key: meKey,
    ref: ref,
    data: {
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
    },
    model: makeCar(hex),
    label: makeLabel(nm),
  };

  me.model.position.set(me.data.x, 0, me.data.y);
  me.model.rotation.y = me.data.dir;
  scene.add(me.model);

  me.label.position = me.model.position; // used by label projection code
  labels.push(me.label);

  players[meKey] = me;

  // Clean up on disconnect
  ref.onDisconnect().remove();

  // Initial write
  ref.set(me.data);
}

menu2 = function () {
  // Start game
  ensureEngine();
  loadMap(); // rebuild map first

  // Firebase should be ready, but if it isn't, this still works locally (you just won't sync)
  createMeIfNeeded();

  // hide the menu overlay if desired
  var fore = document.getElementById("fore");
  if (fore) fore.style.pointerEvents = "none";

  gameStarted = true;

  startCountdown(function () {
    // nothing else needed; physics unfreezes in render loop
  });
};

// ====== Multiplayer listeners ======
function upsertRemotePlayer(key, data) {
  if (!data) return;

  // Don't replace the local player's data object (keeps references stable)
  if (meKey && key === meKey && me) {
    // Keep name/color in sync if changed
    me.data.name = data.name || me.data.name;
    me.data.color = data.color || me.data.color;
    return;
  }

  var p = players[key];
  if (!p) {
    var hex = parseInt((data.color || "#ff3030").replace("#", "0x"), 16);
    p = {
      key: key,
      ref: playersRef.child(key),
      data: data,
      model: makeCar(hex),
      label: makeLabel(data.name || "Player"),
    };
    p.model.position.set(data.x || 0, 0, data.y || 0);
    p.model.rotation.y = data.dir || 0;
    scene.add(p.model);

    p.label.position = p.model.position;
    labels.push(p.label);

    players[key] = p;
  } else {
    p.data = data;

    // Update label text if name changes
    if (p.label && p.label.textContent !== (data.name || "Player")) p.label.textContent = data.name || "Player";
  }
}

function removePlayer(key) {
  var p = players[key];
  if (!p) return;

  if (p.model) {
    try {
      scene.remove(p.model);
    } catch (e) {}
  }

  if (p.label) {
    // remove from labels list
    labels = labels.filter(function (x) {
      return x !== p.label;
    });
    removeLabel(p.label);
  }

  delete players[key];
}

function attachMultiplayerListeners() {
  playersRef.on("child_added", function (snap) {
    ensureEngine();
    upsertRemotePlayer(snap.key, snap.val());
  });
  playersRef.on("child_changed", function (snap) {
    ensureEngine();
    upsertRemotePlayer(snap.key, snap.val());
  });
  playersRef.on("child_removed", function (snap) {
    removePlayer(snap.key);
  });
}

// ====== join() ======
function join() {
  ensureEngine();
  setupInput();
  setupColorPicker();
  attachMultiplayerListeners();

  // Build initial map immediately so the world exists even before Start
  loadMap();

  scene.background = new THREE.Color(0x7fb0ff);

  camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 1, 1000);
  camera.position.set(0, 3, 10);
  scene.add(camera);

  var player = new THREE.Object3D();
  player.position.set(0, 0, 0);
  camera.lookAt(player.position);
  scene.add(player);

  var light = new THREE.DirectionalLight(0xffffff, 0.7);
  light.position.set(3000, 2000, -2000);
  light.castShadow = true;
  light.shadow.mapSize.width = 2048;
  light.shadow.mapSize.height = 2048;
  light.shadow.camera.near = 3000;
  light.shadow.camera.far = 5000;
  light.shadow.camera.top = 100;
  light.shadow.camera.bottom = -100;
  light.shadow.camera.left = -100;
  light.shadow.camera.right = 120;
  light.shadow.bias = 0.00002;
  scene.add(light);

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));

  var x = 0;

  function toXYCoords(pos) {
    pos = pos.clone();
    pos.y += 0.5;
    var vector = pos.project(camera);
    vector.x = ((vector.x + 1) / 2) * window.innerWidth;
    vector.y = -((vector.y - 1) / 2) * window.innerHeight;
    return vector;
  }

  var windowsize = { x: window.innerWidth, y: window.innerHeight };

  var ren = renderer; // VR disabled by default

  var lastTime = performance.now();

  function render(timestamp) {
    requestAnimationFrame(render);
    var timepassed = timestamp - lastTime;
    lastTime = timestamp;
    var warp = timepassed / 16;

    if (gameStarted && me) {
      if (!mobile) {
        if (left) me.data.steer = Math.PI / 6;
        if (right) me.data.steer = -Math.PI / 6;
        if (!(left ^ right)) me.data.steer = 0;
      }

      me.data.steer = Math.max(-Math.PI / 6, Math.min(Math.PI / 6, me.data.steer));

      // Keep the local players dict pointing at the correct object
      if (players[meKey]) players[meKey].data = me.data;

      if (!gameSortaStarted) {
        for (var p in players) {
          var play = players[p];
          if (!play || !play.data || !play.model) continue;

          // speed-aware steering
          var speedMag = Math.sqrt(play.data.xv * play.data.xv + play.data.yv * play.data.yv);
          play.data.dir += play.data.steer * (STEER_MIN + speedMag * STEER_SPEED) * warp;

          // accel + friction + drag
          const ACCEL = SPEED * 1.6;
          const FRICTION = 0.965;
          const DRAG = 0.992;

          play.data.xv += Math.sin(play.data.dir) * ACCEL * warp;
          play.data.yv += Math.cos(play.data.dir) * ACCEL * warp;

          play.data.xv *= Math.pow(FRICTION, warp);
          play.data.yv *= Math.pow(FRICTION, warp);

          play.data.xv *= DRAG;
          play.data.yv *= DRAG;

          // top-speed cap
          var velMag = Math.sqrt(play.data.xv * play.data.xv + play.data.yv * play.data.yv);
          if (velMag > MAX_SPEED) {
            var s = MAX_SPEED / velMag;
            play.data.xv *= s;
            play.data.yv *= s;
          }

          play.data.x += play.data.xv * warp;
          play.data.y += play.data.yv * warp;

          play.model.position.x = play.data.x + play.data.xv;
          play.model.position.z = play.data.y + play.data.yv;
          play.model.rotation.y = play.data.dir;

          // front wheels steering visuals (children[0] & children[1])
          if (play.model.children[0]) play.model.children[0].rotation.z = Math.PI / 2 - play.data.steer;
          if (play.model.children[1]) play.model.children[1].rotation.z = Math.PI / 2 - play.data.steer;

          // Wall collisions
          for (var w in map.children) {
            var wall = map.children[w];
            var posi = new THREE.Vector2(play.data.x, play.data.y);

            if (Math.abs(wall.plane.distanceToPoint(play.model.position.clone().sub(wall.position))) < WALL_SIZE) {
              if (wall.position.clone().distanceTo(play.model.position) < wall.width / 2) {
                var vel = new THREE.Vector3(play.data.xv, 0, play.data.yv);
                vel.reflect(wall.plane.normal);
                play.data.xv =
                  vel.x +
                  BOUNCE_CORRECT *
                    wall.plane.normal.x *
                    Math.sign(wall.plane.normal.dot(play.model.position.clone().sub(wall.position)));
                play.data.yv =
                  vel.z +
                  BOUNCE_CORRECT *
                    wall.plane.normal.z *
                    Math.sign(wall.plane.normal.dot(play.model.position.clone().sub(wall.position)));

                while (
                  Math.abs(
                    wall.plane.distanceToPoint(new THREE.Vector3(play.data.x, 0, play.data.y).sub(wall.position))
                  ) < WALL_SIZE
                ) {
                  play.data.x += play.data.xv;
                  play.data.y += play.data.yv;
                }
                play.data.xv *= BOUNCE;
                play.data.yv *= BOUNCE;
              }
            }

            if (posi.distanceTo(wall.p1) < WALL_SIZE + 0.1) {
              var norm = posi.clone().sub(wall.p1);
              norm = new THREE.Vector3(norm.x, 0, norm.y);
              norm.normalize();
              var vel2 = new THREE.Vector3(play.data.xv, 0, play.data.yv);
              vel2.reflect(norm);
              play.data.xv = vel2.x + norm.x * BOUNCE_CORRECT * 1;
              play.data.yv = vel2.z + norm.z * BOUNCE_CORRECT * 1;
              while (new THREE.Vector2(play.data.x, play.data.y).distanceTo(wall.p1) < WALL_SIZE + 0.1) {
                play.data.x += play.data.xv;
                play.data.y += play.data.yv;
              }
              play.data.xv *= BOUNCE;
              play.data.yv *= BOUNCE;
            }

            if (posi.distanceTo(wall.p2) < WALL_SIZE + 0.1) {
              var norm2 = posi.clone().sub(wall.p2);
              norm2 = new THREE.Vector3(norm2.x, 0, norm2.y);
              norm2.normalize();
              var vel3 = new THREE.Vector3(play.data.xv, 0, play.data.yv);
              vel3.reflect(norm2);
              play.data.xv = vel3.x + norm2.x * BOUNCE_CORRECT * 1;
              play.data.yv = vel3.z + norm2.z * BOUNCE_CORRECT * 1;
              while (new THREE.Vector2(play.data.x, play.data.y).distanceTo(wall.p2) < WALL_SIZE + 0.1) {
                play.data.x += play.data.xv;
                play.data.y += play.data.yv;
              }
              play.data.xv *= BOUNCE;
              play.data.yv *= BOUNCE;
            }
          }

          // Start/Checkpoint triggers
          for (var i in startc.children) {
            var cp = startc.children[i];
            if (Math.abs(cp.plane.distanceToPoint(play.model.position.clone().sub(cp.position))) < 1) {
              if (cp.position.clone().distanceTo(play.model.position) < cp.width / 2 + 1) {
                if (i == 0) {
                  // start line
                  if (play.data.checkpoint == 1) {
                    play.data.checkpoint = 0;
                    play.data.lap++;
                  }
                } else {
                  // checkpoint
                  play.data.checkpoint = 1;
                }
              }
            }
          }

          if (play.data.lap > LAPS && countdownEl.innerHTML == "") {
            countdownEl.style.fontSize = "12vmin";
            countdownEl.innerHTML = (play.data.name || "Player").replaceAll("<", "&lt;") + " Won!";
          }

          // Player-player collisions
          for (var pl in players) {
            if (play !== players[pl] && play.model.position.distanceTo(players[pl].model.position) < 2) {
              var ply = players[pl];

              var temp = new THREE.Vector2(play.data.xv, play.data.yv);
              var temp2 = new THREE.Vector2(ply.data.xv, ply.data.yv);
              ply.data.xv -= temp.x;
              ply.data.yv -= temp.y;
              play.data.xv -= temp2.x;
              play.data.yv -= temp2.y;

              var norm3 = new THREE.Vector2(play.data.x, play.data.y).sub(new THREE.Vector2(ply.data.x, ply.data.y));
              norm3 = new THREE.Vector3(norm3.x, 0, norm3.y);
              norm3.normalize();

              var vA = new THREE.Vector3(play.data.xv, 0, play.data.yv);
              var vB = new THREE.Vector3(ply.data.xv, 0, ply.data.yv);
              vA.reflect(norm3);
              vB.reflect(norm3);

              ply.data.xv += COLLISION * vB.x;
              ply.data.yv += COLLISION * vB.z;
              play.data.xv += COLLISION * vA.x;
              play.data.yv += COLLISION * vA.z;

              ply.data.xv += temp.x;
              ply.data.yv += temp.y;
              play.data.xv += temp2.x;
              play.data.yv += temp2.y;

              while (new THREE.Vector2(play.data.x, play.data.y).distanceTo(new THREE.Vector2(ply.data.x, ply.data.y)) < 2) {
                play.data.x += play.data.xv;
                play.data.y += play.data.yv;
              }
            }
          }

          if (play.model.position.distanceTo(new THREE.Vector3()) > OOB_DIST) {
            play.data.x = spawnX;
            play.data.y = spawnY;
            play.data.xv = 0;
            play.data.yv = 0;
            play.data.dir = spawnDir;
          }
        }
      }

      // Camera follow me
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

      // Write only MY data to Firebase
      if (me && me.ref) me.ref.set(me.data);

      if (lap) lap.innerHTML = me.data.lap <= LAPS ? me.data.lap + "/" + LAPS : "";
    } else {
      // Not started yet: orbit camera
      camera.position.set(50 * Math.sin(x), 20, 50 * Math.cos(x));
      camera.lookAt(player.position);
    }

    x += 0.01;

    // Labels
    camera.updateMatrix();
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    var frustum = new THREE.Frustum();
    frustum.setFromMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));

    for (var li = 0; li < labels.length; li++) {
      var label = labels[li];
      if (!label || !label.position) continue;

      if (frustum.containsPoint(label.position) && !VR) {
        var vec = toXYCoords(label.position);
        label.style.left = vec.x + "px";
        label.style.top = vec.y + "px";
        label.style.display = "block";
        label.style.zIndex = 4;
      } else {
        label.style.display = "none";
      }
    }

    if (windowsize.x !== window.innerWidth || windowsize.y !== window.innerHeight) {
      windowsize = { x: window.innerWidth, y: window.innerHeight };
      onWindowResize();
    }

    ren.render(scene, camera);
    MODS();
  }

  render(performance.now());

  window.addEventListener("resize", onWindowResize, false);
  window.addEventListener("orientationchange", onWindowResize, false);

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

// If the page already loaded before script.js appended, still try to initialize
if (document.readyState === "complete" || document.readyState === "interactive") {
  // join() is called by index.html on load; this is just a safety net.
  // Do nothing here to avoid double-starting.
} else {
  // no-op
}
