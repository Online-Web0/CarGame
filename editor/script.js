// ===== Data =====
var walls = [];
var start = [];
var trees = [];
var arrows = [];
var erase = [];
var hist = [];
var spawn = { x: 0, y: 0, angle: 0 };

var mouse = {
  down: false,
  start: { x: 0, y: 0 },
  cur: { x: 0, y: 0 },
  end: { x: 0, y: 0 }
};

var sel = 0;
var s = document.getElementById("menu");
var ca = document.getElementById("c");
var c = ca.getContext("2d");
c.lineCap = "round";

var height = 0;
var width = 0;

var scale = 10;
var offset = { x: 0, y: 0 };

// ===== Camera / pan / zoom =====
var camX = 0;          // world units
var camY = 0;          // world units
var zoom = 10;         // pixels per world unit (this becomes "scale")
var GRID_HALF = 500;   // world bounds => 1000x1000 total (-500..+500)

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function syncScale(){ scale = zoom; }
syncScale();

// Right-click drag pan state
var panning = false;
var pan0 = { mx: 0, my: 0, camX: 0, camY: 0 };

// Disable browser menu on right click
ca.addEventListener("contextmenu", function(e){ e.preventDefault(); });

// ===== Canvas sizing =====
function resizeCanvas(){
  height = ca.clientHeight * window.devicePixelRatio;
  width  = ca.clientWidth  * window.devicePixelRatio;
  ca.height = height;
  ca.width  = width;

  // canvas center in device pixels
  offset = { x: width / 2, y: height / 2 };
}
resizeCanvas();

// ===== Grid =====
function drawBG(){
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, width, height);

  c.strokeStyle = "#C0C0C0";
  c.lineWidth = 1;
  c.beginPath();

  // Visible bounds in world units
  var viewW = width / scale;
  var viewH = height / scale;

  var left   = camX - viewW / 2;
  var right  = camX + viewW / 2;
  var top    = camY - viewH / 2;
  var bottom = camY + viewH / 2;

  // Clamp grid drawing to world bounds
  left   = Math.max(left,   -GRID_HALF);
  right  = Math.min(right,   GRID_HALF);
  top    = Math.max(top,    -GRID_HALF);
  bottom = Math.min(bottom,  GRID_HALF);

  // Draw vertical lines at integer world X
  var x0 = Math.floor(left);
  var x1 = Math.ceil(right);
  for (var gx = x0; gx <= x1; gx++){
    var sx = (gx - camX) * scale + offset.x;
    c.moveTo(sx, 0);
    c.lineTo(sx, height);
  }

  // Draw horizontal lines at integer world Y
  var y0 = Math.floor(top);
  var y1 = Math.ceil(bottom);
  for (var gy = y0; gy <= y1; gy++){
    var sy = (gy - camY) * scale + offset.y;
    c.moveTo(0, sy);
    c.lineTo(width, sy);
  }

  c.stroke();
}

// ===== Render loop =====
function update(){
  requestAnimationFrame(update);

  // keep size in sync if the canvas element changes
  var newH = ca.clientHeight * window.devicePixelRatio;
  var newW = ca.clientWidth * window.devicePixelRatio;
  if (newH !== height || newW !== width) resizeCanvas();

  drawBG();

  // World -> screen transform: center + pan + zoom
  c.setTransform(scale, 0, 0, scale, offset.x - camX * scale, offset.y - camY * scale);

  // Keep line thickness consistent in screen pixels while zooming
  c.lineWidth = 2 / scale;

  // ===== Spawn =====
  c.fillStyle = "#08cc3c";
  c.fillRect(spawn.x - 1, spawn.y - 1, 2, 2);

  c.strokeStyle = "#ffffff";
  c.beginPath();
  c.moveTo(spawn.x, spawn.y);
  c.lineTo(
    spawn.x + Math.cos(spawn.angle) * 2,
    spawn.y + Math.sin(spawn.angle) * 2
  );
  c.stroke();

  // ===== Walls =====
  c.strokeStyle = "#f48342";
  c.beginPath();
  for (var i = 0; i < walls.length; i++){
    c.moveTo(walls[i].start.x, walls[i].start.y);
    c.lineTo(walls[i].end.x, walls[i].end.y);
  }
  c.stroke();

  // ===== Start segments (blue first, red rest) =====
  c.strokeStyle = "#428ff4";
  c.beginPath();
  for (var j = 0; j < start.length && j < 1; j++){
    c.moveTo(start[j].start.x, start[j].start.y);
    c.lineTo(start[j].end.x, start[j].end.y);
  }
  c.stroke();

  c.strokeStyle = "#f00";
  c.beginPath();
  for (var k = 1; k < start.length; k++){
    c.moveTo(start[k].start.x, start[k].start.y);
    c.lineTo(start[k].end.x, start[k].end.y);
  }
  c.stroke();

  // ===== Trees =====
  c.fillStyle = "#08cc3c";
  for (var t = 0; t < trees.length; t++){
    c.beginPath();
    c.arc(trees[t].x, trees[t].y, 0.5, 0, 2 * Math.PI); // radius in world units
    c.fill();
  }

  // ===== Arrows =====
  c.strokeStyle = "#f00";
  c.beginPath();
  for (var a = 0; a < arrows.length; a++){
    var x = arrows[a].x;
    var y = arrows[a].y;
    var len = 2;

    c.moveTo(x, y);
    c.lineTo(
      x - Math.cos(arrows[a].angle) * len,
      y - Math.sin(arrows[a].angle) * len
    );
  }
  c.stroke();

  // reset transform
  c.setTransform(1, 0, 0, 1, 0, 0);
}
update();

// ===== UI selection =====
function select(n){
  sel = n;
  for (var i = 0; i < s.children.length - 1; i++){
    s.children[i].className = "button" + (i === n ? " selected" : "");
  }
}

// ===== Grid coordinate helpers (screen -> world) =====
function gridX(x){
  var wx = camX + ((x * window.devicePixelRatio - offset.x) / scale);
  return clamp(Math.round(wx), -GRID_HALF, GRID_HALF);
}
function gridY(y){
  var wy = camY + ((y * window.devicePixelRatio - offset.y) / scale);
  return clamp(Math.round(wy), -GRID_HALF, GRID_HALF);
}

// ===== Pan (right click drag) =====
ca.addEventListener("mousedown", function(e){
  if (e.button === 2){
    panning = true;
    pan0.mx = e.clientX;
    pan0.my = e.clientY;
    pan0.camX = camX;
    pan0.camY = camY;
    e.preventDefault();
  }
});

window.addEventListener("mouseup", function(){
  panning = false;
});

window.addEventListener("mousemove", function(e){
  if (!panning) return;

  var dx = (e.clientX - pan0.mx) * window.devicePixelRatio;
  var dy = (e.clientY - pan0.my) * window.devicePixelRatio;

  camX = pan0.camX - dx / scale;
  camY = pan0.camY - dy / scale;

  camX = clamp(camX, -GRID_HALF, GRID_HALF);
  camY = clamp(camY, -GRID_HALF, GRID_HALF);
});

// ===== Zoom (mouse wheel) =====
ca.addEventListener("wheel", function(e){
  e.preventDefault();

  // world point under cursor before zoom
  var beforeX = camX + ((e.clientX * window.devicePixelRatio - offset.x) / scale);
  var beforeY = camY + ((e.clientY * window.devicePixelRatio - offset.y) / scale);

  // zoom factor
  var factor = Math.exp(-e.deltaY * 0.0015);
  zoom = clamp(zoom * factor, 4, 60);
  syncScale();

  // world point under cursor after zoom
  var afterX = camX + ((e.clientX * window.devicePixelRatio - offset.x) / scale);
  var afterY = camY + ((e.clientY * window.devicePixelRatio - offset.y) / scale);

  // keep cursor anchored
  camX += (beforeX - afterX);
  camY += (beforeY - afterY);

  camX = clamp(camX, -GRID_HALF, GRID_HALF);
  camY = clamp(camY, -GRID_HALF, GRID_HALF);
}, { passive: false });

// ===== Mouse handling (left click tools) =====
ca.onmousedown = function(e){
  if (e.button === 2) return; // right-click is pan only

  mouse.down = true;
  mouse.cur.x = e.clientX;
  mouse.cur.y = e.clientY;
  mouse.start.x = e.clientX;
  mouse.start.y = e.clientY;

  if (sel === 5){
    spawn.x = gridX(mouse.start.x);
    spawn.y = gridY(mouse.start.y);
  }

  if (sel === 0){
    walls.push({
      start: { x: gridX(mouse.start.x), y: gridY(mouse.start.y) },
      end:   { x: gridX(mouse.start.x), y: gridY(mouse.start.y) }
    });
  }
  if (sel === 1){
    start.push({
      start: { x: gridX(mouse.start.x), y: gridY(mouse.start.y) },
      end:   { x: gridX(mouse.start.x), y: gridY(mouse.start.y) }
    });
  }
  if (sel === 2){
    trees.push({ x: gridX(mouse.start.x), y: gridY(mouse.start.y) });
  }
  if (sel === 3){
    arrows.push({ x: gridX(mouse.start.x), y: gridY(mouse.start.y), angle: 0 });
  }
  if (sel === 4){
    eraseL(gridX(mouse.cur.x), gridY(mouse.cur.y));
  }
};

ca.onmousemove = function(e){
  mouse.cur.x = e.clientX;
  mouse.cur.y = e.clientY;

  if (sel === 5 && mouse.down){
    spawn.angle = Math.atan2(
      mouse.cur.y - mouse.start.y,
      mouse.cur.x - mouse.start.x
    );
  }

  if (sel === 0 && mouse.down){
    walls[walls.length - 1].end.x = gridX(mouse.cur.x);
    walls[walls.length - 1].end.y = gridY(mouse.cur.y);
  }
  if (sel === 1 && mouse.down){
    start[start.length - 1].end.x = gridX(mouse.cur.x);
    start[start.length - 1].end.y = gridY(mouse.cur.y);
  }
  if (sel === 2 && mouse.down){
    trees.push({ x: gridX(mouse.cur.x), y: gridY(mouse.cur.y) });
    hist.push(sel);
  }
  if (sel === 3 && mouse.down){
    arrows[arrows.length - 1].angle =
      Math.atan2(mouse.start.y - mouse.cur.y, mouse.start.x - mouse.cur.x);
  }
  if (sel === 4 && mouse.down){
    eraseL(gridX(mouse.cur.x), gridY(mouse.cur.y));
  }
};

ca.onmouseup = function(e){
  if (e.button === 2) return;

  mouse.down = false;
  mouse.cur.x = e.clientX;
  mouse.cur.y = e.clientY;
  mouse.end.x = e.clientX;
  mouse.end.y = e.clientY;

  if (sel === 0){
    walls[walls.length - 1].end.x = gridX(mouse.end.x);
    walls[walls.length - 1].end.y = gridY(mouse.end.y);
  }
  if (sel === 1){
    start[start.length - 1].end.x = gridX(mouse.end.x);
    start[start.length - 1].end.y = gridY(mouse.end.y);
  }
  if (sel === 2){
    trees[trees.length - 1] = { x: gridX(mouse.end.x), y: gridY(mouse.end.y) };
  }
  hist.push(sel);
};

// ===== Import / Export =====
function imp(){
  var raw = prompt("Track data?");
  if (!raw) return;

  var text = raw.trim().split("|");
  if (!text || text.length < 4) return;

  var wallsText  = (text[0] || "").trim().split(" ");
  var startText  = (text[1] || "").trim().split(" ");
  var treesText  = (text[2] || "").trim().split(" ");
  var arrowsText = (text[3] || "").trim().split(" ");

  // ---- spawn import (5th section) ----
  var spawnText = text[4];
  if (spawnText && spawnText.trim().length){
    var sp = spawnText.split("/");
    if (sp.length === 2){
      var pos = sp[0].split(",");
      if (pos.length >= 2){
        spawn.x = parseInt(pos[0], 10) || 0;
        spawn.y = -(parseInt(pos[1], 10) || 0);

        var dir = (parseInt(sp[1], 10) || 0) * Math.PI / 180; // game heading
        spawn.angle = (Math.PI / 2) - dir;                    // back to editor angle
      }
    }
  }

  walls = [];
  for (var i = 0; i < wallsText.length; i++){
    var entry = wallsText[i].trim();
    if (!entry) continue;
    var t = entry.split("/");
    if (t.length < 2) continue;

    var a = t[0].split(",");
    var b = t[1].split(",");
    if (a.length < 2 || b.length < 2) continue;

    walls.push({
      start: { x: parseInt(a[0], 10) || 0, y: -(parseInt(a[1], 10) || 0) },
      end:   { x: parseInt(b[0], 10) || 0, y: -(parseInt(b[1], 10) || 0) }
    });
  }

  start = [];
  for (var j = 0; j < startText.length; j++){
    var entry2 = startText[j].trim();
    if (!entry2) continue;
    var t2 = entry2.split("/");
    if (t2.length < 2) continue;

    var a2 = t2[0].split(",");
    var b2 = t2[1].split(",");
    if (a2.length < 2 || b2.length < 2) continue;

    start.push({
      start: { x: parseInt(a2[0], 10) || 0, y: -(parseInt(a2[1], 10) || 0) },
      end:   { x: parseInt(b2[0], 10) || 0, y: -(parseInt(b2[1], 10) || 0) }
    });
  }

  trees = [];
  for (var k = 0; k < treesText.length; k++){
    var tr = treesText[k].trim();
    if (!tr) continue;
    var p = tr.split(",");
    if (p.length < 2) continue;

    trees.push({
      x: parseInt(p[0], 10) || 0,
      y: -(parseInt(p[1], 10) || 0)
    });
  }

  arrows = [];
  for (var aI = 0; aI < arrowsText.length; aI++){
    var entryA = arrowsText[aI].trim();
    if (!entryA) continue;

    var tA = entryA.split("/");
    if (tA.length < 2) continue;

    var coords = tA[0].split(",");
    if (coords.length < 3) continue;

    var gx = parseInt(coords[0], 10);
    var gy = parseInt(coords[2], 10);
    var ang = parseInt(tA[1], 10);

    if (isNaN(gx) || isNaN(gy) || isNaN(ang)) continue;

    arrows.push({
      x: gx,
      y: -gy,
      angle: (90 - ang) * Math.PI / 180
    });
  }

  // Center camera on spawn (nice QoL)
  camX = clamp(spawn.x, -GRID_HALF, GRID_HALF);
  camY = clamp(spawn.y, -GRID_HALF, GRID_HALF);
}

function exp(){
  var text = "";

  // ---- walls ----
  for (var i = 0; i < walls.length; i++){
    text += (walls[i].start.x) + ",";
    text += (-1 * (walls[i].start.y)) + "/";
    text += (walls[i].end.x) + ",";
    text += (-1 * (walls[i].end.y)) + " ";
  }

  text += "|";

  // ---- start lines ----
  for (var j = 0; j < start.length; j++){
    text += (start[j].start.x) + ",";
    text += (-1 * (start[j].start.y)) + "/";
    text += (start[j].end.x) + ",";
    text += (-1 * (start[j].end.y)) + " ";
  }

  text += "|";

  // ---- trees ----
  for (var k = 0; k < trees.length; k++){
    text += (trees[k].x) + ",";
    text += (-1 * (trees[k].y)) + " ";
  }

  text += "|";

  // ---- arrows ----
  for (var a = 0; a < arrows.length; a++){
    text += (arrows[a].x) + ",3,";
    text += (-1 * (arrows[a].y)) + "/";
    text += Math.floor(90 - arrows[a].angle * 180 / Math.PI) + " ";
  }

  // ---- spawn ----
  text += "|";
  text += (spawn.x) + ",";
  text += (-1 * (spawn.y)) + "/";

  // editor angle -> game heading degrees
  var spawnDirDeg = Math.round(((Math.PI / 2) - spawn.angle) * 180 / Math.PI);
  spawnDirDeg = ((spawnDirDeg % 360) + 360) % 360;
  text += spawnDirDeg;

  // show text safely
  var win = window.open();
  win.document.body.innerText = text;
}

// ===== Undo / Erase =====
document.body.onkeydown = function(e){
  if (e.keyCode === 90 && (e.ctrlKey || e.metaKey)){
    e.preventDefault();
    if (hist.length === 0) return;

    var a = hist.splice(hist.length - 1, 1)[0];
    var ar = [walls, start, trees, arrows, erase][a];
    if (!ar || ar.length === 0) return;

    var del = ar.splice(ar.length - 1, 1)[0];
    if (ar === erase && del && del.list){
      del.list.splice(del.pos, 0, del.ob);
    }
  }
};

function eraseL(x, y){
  var tol = Math.max(0.6, 6 / scale); // slightly nicer erase feel across zoom

  for (var i = 0; i < walls.length; i++){
    if (Math.hypot(walls[i].start.x - x, walls[i].start.y - y) < tol ||
        Math.hypot(walls[i].end.x - x, walls[i].end.y - y) < tol){
      hist.push(sel);
      erase.push({ list: walls, ob: walls.splice(i, 1)[0], pos: i });
    }
  }
  for (var j = 0; j < start.length; j++){
    if (Math.hypot(start[j].start.x - x, start[j].start.y - y) < tol ||
        Math.hypot(start[j].end.x - x, start[j].end.y - y) < tol){
      hist.push(sel);
      erase.push({ list: start, ob: start.splice(j, 1)[0], pos: j });
    }
  }
  for (var k = 0; k < trees.length; k++){
    if (Math.hypot(trees[k].x - x, trees[k].y - y) < tol){
      hist.push(sel);
      erase.push({ list: trees, ob: trees.splice(k, 1)[0], pos: k });
    }
  }
  for (var a = 0; a < arrows.length; a++){
    if (Math.hypot(arrows[a].x - x, arrows[a].y - y) < tol){
      hist.push(sel);
      erase.push({ list: arrows, ob: arrows.splice(a, 1)[0], pos: a });
    }
  }
}

// ===== Helpers (kept) =====
function help(){
  document.getElementById("help").parentElement.style.transform = "none";
}

function dedupTrees(){
  var poss = [];
  for (var i = 0; i < trees.length; i++){
    for (var n = 0; n < poss.length; n++){
      if (poss[n].x === trees[i].x && poss[n].y === trees[i].y){
        trees.splice(i--, 1);
        break;
      }
    }
    poss.push(trees[i]);
  }
}
