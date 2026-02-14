let camX = 0;
let camY = 0;
let zoom = 40; // pixels per grid unit (mouse wheel changes this)

// ===== Data =====
var walls = [];
var start = [];
var trees = [];
var arrows = [];
var erase = [];
var hist = [];

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

// keep your old "scale" only for legacy import/export math
var scale = 10;

// ===== Helpers =====
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

function resizeCanvas(){
	height = ca.clientHeight * window.devicePixelRatio;
	width = ca.clientWidth * window.devicePixelRatio;
	ca.height = height;
	ca.width = width;
}

function worldToScreen(wx, wy){
	return {
		x: (width / 2) + (wx - camX) * zoom,
		y: (height / 2) + (wy - camY) * zoom
	};
}

function screenToWorldX(px){
	return (px * window.devicePixelRatio - width/2) / zoom + camX;
}
function screenToWorldY(py){
	return (py * window.devicePixelRatio - height/2) / zoom + camY;
}

function gridX(px){
	return Math.round(screenToWorldX(px));
}
function gridY(py){
	return Math.round(screenToWorldY(py));
}

// ===== Draw =====
function drawBG(){
	// background grid in screen space
	c.clearRect(0, 0, width, height);

	const spacing = zoom;

	// offset so the world grid stays stable while panning
	const startX = ((width/2) - camX * zoom) % spacing;
	const startY = ((height/2) - camY * zoom) % spacing;

	c.strokeStyle = "#C0C0C0";
	c.beginPath();

	for(let x = startX; x < width; x += spacing){
		c.moveTo(x, 0);
		c.lineTo(x, height);
	}
	for(let y = startY; y < height; y += spacing){
		c.moveTo(0, y);
		c.lineTo(width, y);
	}

	c.stroke();
}

function drawCarArrow(){
	const carWorldX = camX;
	const carWorldY = camY;

	const carLen = 1.2;
	const carWid = 0.7;
	const ang = -Math.PI / 2;

	const tip = { x: carWorldX + Math.cos(ang) * carLen, y: carWorldY + Math.sin(ang) * carLen };
	const left = { x: carWorldX + Math.cos(ang + Math.PI * 0.75) * carWid, y: carWorldY + Math.sin(ang + Math.PI * 0.75) * carWid };
	const right = { x: carWorldX + Math.cos(ang - Math.PI * 0.75) * carWid, y: carWorldY + Math.sin(ang - Math.PI * 0.75) * carWid };

	const T = worldToScreen(tip.x, tip.y);
	const L = worldToScreen(left.x, left.y);
	const R = worldToScreen(right.x, right.y);

	c.fillStyle = "#08cc3c";
	c.beginPath();
	c.moveTo(T.x, T.y);
	c.lineTo(L.x, L.y);
	c.lineTo(R.x, R.y);
	c.closePath();
	c.fill();
}

function update(){
	requestAnimationFrame(update);

	resizeCanvas();
	drawBG();

	c.lineCap = "round";
	c.lineWidth = 2;

	c.strokeStyle = "#f48342";
	c.beginPath();
	for(var i = 0; i < walls.length; i++){
		let a = worldToScreen(walls[i].start.x, walls[i].start.y);
		let b = worldToScreen(walls[i].end.x, walls[i].end.y);
		c.moveTo(a.x, a.y);
		c.lineTo(b.x, b.y);
	}
	c.stroke();

	c.strokeStyle = "#428ff4";
	c.beginPath();
	for(var i = 0; i < start.length && i < 1; i++){
		let a = worldToScreen(start[i].start.x, start[i].start.y);
		let b = worldToScreen(start[i].end.x, start[i].end.y);
		c.moveTo(a.x, a.y);
		c.lineTo(b.x, b.y);
	}
	c.stroke();

	c.strokeStyle = "#f00";
	c.beginPath();
	for(var i = 1; i < start.length; i++){
		let a = worldToScreen(start[i].start.x, start[i].start.y);
		let b = worldToScreen(start[i].end.x, start[i].end.y);
		c.moveTo(a.x, a.y);
		c.lineTo(b.x, b.y);
	}
	c.stroke();

	c.fillStyle = "#08cc3c";
	for(var i = 0; i < trees.length; i++){
		let p = worldToScreen(trees[i].x, trees[i].y);
		c.beginPath();
		c.arc(p.x, p.y, Math.max(2, zoom * 0.15), 0, 2 * Math.PI);
		c.fill();
	}

	c.strokeStyle = "#f00";
	c.beginPath();
	for(var i = 0; i < arrows.length; i++){
		let p = worldToScreen(arrows[i].x, arrows[i].y);
		let q = worldToScreen(
			arrows[i].x - Math.cos(arrows[i].angle) / 2,
			arrows[i].y - Math.sin(arrows[i].angle) / 2
		);
		c.moveTo(p.x, p.y);
		c.lineTo(q.x, q.y);
	}
	c.stroke();

	drawCarArrow();
}
update();

function select(n){
	sel = n;
	for(var i = 0; i < s.children.length - 1; i++)
		s.children[i].className = "button" + (i == n ? " selected" : "");
}

ca.onmousedown = function(e){
	if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
		draggingView = true;
		lastX = e.clientX;
		lastY = e.clientY;
		return;
	}

	mouse.down = true;
	mouse.cur.x = e.clientX; mouse.cur.y = e.clientY;
	mouse.start.x = e.clientX; mouse.start.y = e.clientY;

	if(sel == 0)
		walls.push({ start:{ x:gridX(mouse.start.x), y:gridY(mouse.start.y) }, end:{ x:gridX(mouse.start.x), y:gridY(mouse.start.y) } });

	if(sel == 1)
		start.push({ start:{ x:gridX(mouse.start.x), y:gridY(mouse.start.y) }, end:{ x:gridX(mouse.start.x), y:gridY(mouse.start.y) } });

	if(sel == 2)
		trees.push({ x:gridX(mouse.start.x), y:gridY(mouse.start.y) });

	if(sel == 3)
		arrows.push({ x:gridX(mouse.start.x), y:gridY(mouse.start.y), angle: 0 });

	if(sel == 4)
		eraseL(gridX(mouse.cur.x), gridY(mouse.cur.y));
};

ca.onmousemove = function(e){
	mouse.cur.x = e.clientX;
	mouse.cur.y = e.clientY;

	if(sel == 0 && mouse.down){
		walls[walls.length - 1].end.x = gridX(mouse.cur.x);
		walls[walls.length - 1].end.y = gridY(mouse.cur.y);
	}
	if(sel == 1 && mouse.down){
		start[start.length - 1].end.x = gridX(mouse.cur.x);
		start[start.length - 1].end.y = gridY(mouse.cur.y);
	}
	if(sel == 2 && mouse.down){
		trees.push({ x:gridX(mouse.cur.x), y:gridY(mouse.cur.y) });
		hist.push(sel);
	}
	if(sel == 3 && mouse.down)
		arrows[arrows.length - 1].angle = Math.atan2(mouse.start.y - mouse.cur.y, mouse.start.x - mouse.cur.x);

	if(sel == 4 && mouse.down)
		eraseL(gridX(mouse.cur.x), gridY(mouse.cur.y));
};

ca.onmouseup = function(e){
	mouse.down = false;
	mouse.end.x = e.clientX;
	mouse.end.y = e.clientY;

	if(sel == 0 && walls.length){
		walls[walls.length - 1].end.x = gridX(mouse.end.x);
		walls[walls.length - 1].end.y = gridY(mouse.end.y);
	}
	if(sel == 1 && start.length){
		start[start.length - 1].end.x = gridX(mouse.end.x);
		start[start.length - 1].end.y = gridY(mouse.end.y);
	}
	if(sel == 2 && trees.length){
		trees[trees.length - 1] = { x:gridX(mouse.end.x), y:gridY(mouse.end.y) };
	}
	hist.push(sel);
};

ca.addEventListener("wheel", e => {
	e.preventDefault();

	const beforeX = screenToWorldX(e.clientX);
	const beforeY = screenToWorldY(e.clientY);

	zoom *= (e.deltaY > 0 ? 0.9 : 1.1);
	zoom = clamp(zoom, 5, 140);

	const afterX = screenToWorldX(e.clientX);
	const afterY = screenToWorldY(e.clientY);

	camX += (beforeX - afterX);
	camY += (beforeY - afterY);
}, { passive:false });

let draggingView = false;
let lastX = 0;
let lastY = 0;

window.addEventListener("mouseup", () => draggingView = false);

window.addEventListener("mousemove", e => {
	if (!draggingView) return;

	camX -= (e.clientX - lastX) / zoom;
	camY -= (e.clientY - lastY) / zoom;

	lastX = e.clientX;
	lastY = e.clientY;
});

function eraseL(x, y){
	for(var i = 0; i < walls.length; i++)
		if(Math.hypot(walls[i].start.x - x, walls[i].start.y - y) < 1 || Math.hypot(walls[i].end.x - x, walls[i].end.y - y) < 1){
			hist.push(sel);
			erase.push({ list: walls, ob: walls.splice(i, 1)[0], pos: i });
		}
	for(var i = 0; i < start.length; i++)
		if(Math.hypot(start[i].start.x - x, start[i].start.y - y) < 1 || Math.hypot(start[i].end.x - x, start[i].end.y - y) < 1){
			hist.push(sel);
			erase.push({ list: start, ob: start.splice(i, 1)[0], pos: i });
		}
	for(var i = 0; i < trees.length; i++)
		if(Math.hypot(trees[i].x - x, trees[i].y - y) < 1){
			hist.push(sel);
			erase.push({ list: trees, ob: trees.splice(i, 1)[0], pos: i });
		}
	for(var i = 0; i < arrows.length; i++)
		if(Math.hypot(arrows[i].x - x, arrows[i].y - y) < 1){
			hist.push(sel);
			erase.push({ list: arrows, ob: arrows.splice(i, 1)[0], pos: i });
		}
}
