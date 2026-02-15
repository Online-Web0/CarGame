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
c.lineWidth = 2;

var height = 0;
var width = 0;

var scale = 10;
var offset = { x: 0, y: 0 };

// ===== Canvas sizing =====
function resizeCanvas(){
	height = ca.clientHeight * window.devicePixelRatio;
	width = ca.clientWidth * window.devicePixelRatio;
	ca.height = height;
	ca.width = width;
	offset = { x: (width % scale) / 2, y: (height % scale) / 2 };
}
resizeCanvas();

// ===== Grid =====
function drawBG(){
	c.setTransform(1, 0, 0, 1, 0, 0);
	c.clearRect(0, 0, width, height);

	c.strokeStyle = "#C0C0C0";
	c.beginPath();

	for (var x = offset.x - scale; x < width; x += scale){
		c.moveTo(x, 0);
		c.lineTo(x, height);
	}
	for (var y = offset.y - scale; y < height; y += scale){
		c.moveTo(0, y);
		c.lineTo(width, y);
	}
	c.stroke(); // IMPORTANT: this was missing when your grid "disappeared"
}

// ===== Render loop =====
function update(){
	requestAnimationFrame(update);

	// keep size in sync if the canvas element changes
	var newH = ca.clientHeight * window.devicePixelRatio;
	var newW = ca.clientWidth * window.devicePixelRatio;
	if (newH !== height || newW !== width) resizeCanvas();

	drawBG();

	// draw everything in grid space (offset applied)
	c.translate(offset.x, offset.y);
// spawn box
c.fillStyle = "#08cc3c";
c.fillRect(
    scale * spawn.x - scale,
    scale * spawn.y - scale,
    scale * 2,
    scale * 2
);

// spawn direction arrow
c.strokeStyle = "#ffffff";
c.beginPath();
c.moveTo(scale * spawn.x, scale * spawn.y);
c.lineTo(
    scale * spawn.x + Math.cos(spawn.angle) * scale * 2,
    scale * spawn.y + Math.sin(spawn.angle) * scale * 2
);
c.stroke();

	// walls
	c.strokeStyle = "#f48342";
	c.beginPath();
	for (var i = 0; i < walls.length; i++){
		c.moveTo(scale * walls[i].start.x, scale * walls[i].start.y);
		c.lineTo(scale * walls[i].end.x, scale * walls[i].end.y);
	}
	c.stroke();

	// start segments (blue first, red rest like your original)
	c.strokeStyle = "#428ff4";
	c.beginPath();
	for (var i = 0; i < start.length && i < 1; i++){
		c.moveTo(scale * start[i].start.x, scale * start[i].start.y);
		c.lineTo(scale * start[i].end.x, scale * start[i].end.y);
	}
	c.stroke();

	c.strokeStyle = "#f00";
	c.beginPath();
	for (var i = 1; i < start.length; i++){
		c.moveTo(scale * start[i].start.x, scale * start[i].start.y);
		c.lineTo(scale * start[i].end.x, scale * start[i].end.y);
	}
	c.stroke();

	// trees
	c.fillStyle = "#08cc3c";
	for (var i = 0; i < trees.length; i++){
		c.beginPath();
		c.arc(scale * trees[i].x, scale * trees[i].y, 5, 0, 2 * Math.PI);
		c.fill();
	}

	// arrows (red)
	c.strokeStyle = "#f00";
	c.lineWidth = 2;
	c.beginPath();
	for (var i = 0; i < arrows.length; i++){
		var x = scale * arrows[i].x;
		var y = scale * arrows[i].y;
		var len = scale * 2;

		c.moveTo(x, y);
		c.lineTo(
			x - Math.cos(arrows[i].angle) * len,
			y - Math.sin(arrows[i].angle) * len
		);
	}
	c.stroke();

	// undo offset transform
	c.translate(-offset.x, -offset.y);
}
update();

// ===== UI selection =====
function select(n){
	sel = n;
	for (var i = 0; i < s.children.length - 1; i++){
		s.children[i].className = "button" + (i === n ? " selected" : "");
	}
}

// ===== Grid coordinate helpers =====
function gridX(x){
	return Math.round((x * window.devicePixelRatio - offset.x) / scale);
}
function gridY(y){
	return Math.round((y * window.devicePixelRatio - offset.y) / scale);
}

// ===== Mouse handling =====
ca.onmousedown = function(e){
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

	var wallsText = text[0].split(" ");
	var startText = text[1].split(" ");
	var treesText = text[2].split(" ");
	var arrowsText = text[3].split(" ");

	walls = [];
	for (var i = 0; i < wallsText.length; i++){
		var t = wallsText[i].split("/");
		if (t.length < 2) continue;

		walls.push({
			start: {
				x: parseInt(t[0].split(",")[0], 10) + Math.floor(width / scale / 2),
				y: -parseInt(t[0].split(",")[1], 10) + Math.floor(height / scale / 2)
			},
			end: {
				x: parseInt(t[1].split(",")[0], 10) + Math.floor(width / scale / 2),
				y: -parseInt(t[1].split(",")[1], 10) + Math.floor(height / scale / 2)
			}
		});
	}

	start = [];
	for (var i = 0; i < startText.length; i++){
		var t = startText[i].split("/");
		if (t.length < 2) continue;

		start.push({
			start: {
				x: parseInt(t[0].split(",")[0], 10) + Math.floor(width / scale / 2),
				y: -parseInt(t[0].split(",")[1], 10) + Math.floor(height / scale / 2)
			},
			end: {
				x: parseInt(t[1].split(",")[0], 10) + Math.floor(width / scale / 2),
				y: -parseInt(t[1].split(",")[1], 10) + Math.floor(height / scale / 2)
			}
		});
	}

	trees = [];
	for (var i = 0; i < treesText.length; i++){
		if (treesText[i].trim().length === 0) continue;

		trees.push({
			x: parseInt(treesText[i].split(",")[0], 10) + Math.floor(width / scale / 2),
			y: -parseInt(treesText[i].split(",")[1], 10) + Math.floor(height / scale / 2)
		});
	}

	arrows = [];
	for (var i = 0; i < arrowsText.length; i++){
		var entry = arrowsText[i].trim();
		if (!entry) continue;

		var t = entry.split("/");
		if (t.length < 2) continue;

		var coords = t[0].split(",");
		if (coords.length < 3) continue;

		var gx = parseInt(coords[0], 10);
		var gy = parseInt(coords[2], 10);
		var ang = parseInt(t[1], 10);

		if (isNaN(gx) || isNaN(gy) || isNaN(ang)) continue;

		arrows.push({
			x: gx + Math.floor(width / scale / 2),
			y: -gy + Math.floor(height / scale / 2),
			angle: (90 - ang) * Math.PI / 180
		});
	}
}

function exp(){
	var text = "";

	// ---- walls ----
	for (var i = 0; i < walls.length; i++){
		text += (walls[i].start.x - Math.floor(width / scale / 2)) + ",";
		text += (-1 * (walls[i].start.y - Math.floor(height / scale / 2))) + "/";
		text += (walls[i].end.x - Math.floor(width / scale / 2)) + ",";
		text += (-1 * (walls[i].end.y - Math.floor(height / scale / 2))) + " ";
	}

	text += "|";

	// ---- start lines ----
	for (var i = 0; i < start.length; i++){
		text += (start[i].start.x - Math.floor(width / scale / 2)) + ",";
		text += (-1 * (start[i].start.y - Math.floor(height / scale / 2))) + "/";
		text += (start[i].end.x - Math.floor(width / scale / 2)) + ",";
		text += (-1 * (start[i].end.y - Math.floor(height / scale / 2))) + " ";
	}

	text += "|";

	// ---- trees ----
	for (var i = 0; i < trees.length; i++){
		text += (trees[i].x - Math.floor(width / scale / 2)) + ",";
		text += (-1 * (trees[i].y - Math.floor(height / scale / 2))) + " ";
	}

	text += "|";

	// ---- arrows ----
	for (var i = 0; i < arrows.length; i++){
		text += (arrows[i].x - Math.floor(width / scale / 2)) + ",3,";
		text += (-1 * (arrows[i].y - Math.floor(height / scale / 2))) + "/";
		text += Math.floor(90 - arrows[i].angle * 180 / Math.PI) + " ";
	}

	// ---- spawn (THIS is what you were missing) ----
	text += "|";
	text += (spawn.x - Math.floor(width / scale / 2)) + ",";
	text += (-1 * (spawn.y - Math.floor(height / scale / 2))) + "/";

	// convert editor angle -> game heading degrees
	var spawnDirDeg = Math.round(((Math.PI / 2) - spawn.angle) * 180 / Math.PI);
	spawnDirDeg = ((spawnDirDeg % 360) + 360) % 360; // keep 0..359
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
	for (var i = 0; i < walls.length; i++){
		if (Math.hypot(walls[i].start.x - x, walls[i].start.y - y) < 1 ||
		    Math.hypot(walls[i].end.x - x, walls[i].end.y - y) < 1){
			hist.push(sel);
			erase.push({ list: walls, ob: walls.splice(i, 1)[0], pos: i });
		}
	}
	for (var i = 0; i < start.length; i++){
		if (Math.hypot(start[i].start.x - x, start[i].start.y - y) < 1 ||
		    Math.hypot(start[i].end.x - x, start[i].end.y - y) < 1){
			hist.push(sel);
			erase.push({ list: start, ob: start.splice(i, 1)[0], pos: i });
		}
	}
	for (var i = 0; i < trees.length; i++){
		if (Math.hypot(trees[i].x - x, trees[i].y - y) < 1){
			hist.push(sel);
			erase.push({ list: trees, ob: trees.splice(i, 1)[0], pos: i });
		}
	}
	for (var i = 0; i < arrows.length; i++){
		if (Math.hypot(arrows[i].x - x, arrows[i].y - y) < 1){
			hist.push(sel);
			erase.push({ list: arrows, ob: arrows.splice(i, 1)[0], pos: i });
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
