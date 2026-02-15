var walls = [];
var start = [];
function placeStart(x, y){
    start = [{ x, y }];
}
var trees = [];
var arrows = [];
var spawn = { x: 0, y: 0, angle: 0 };

var erase = [];
var hist = [];

var mouse = {
	down: false,
	start: {
		x: 0,
		y: 0
	},
	cur: {
		x: 0,
		y: 0
	},
	end: {
		x: 0,
		y: 0
	}
}
var sel = 0;
var s = document.getElementById("menu");
var ca = document.getElementById("c");
var height = ca.clientHeight * window.devicePixelRatio;
var width = ca.clientWidth * window.devicePixelRatio;
ca.height = height;
ca.width = width;
var scale = 10;
var offset = {x: width % scale / 2, y : height % scale / 2}
var c = ca.getContext("2d");
c.lineCap = "round";
c.lineWidth = 2;
function drawBG(){
	c.clearRect(0, 0, width, height);
	c.strokeStyle="#C0C0C0";
	c.beginPath();
	for(var x = offset.x - scale; x < width; x += scale){
		c.moveTo(x, 0);
		c.lineTo(x, height);
	}
	for(var y = offset.y - scale; y < height; y += scale){
		c.moveTo(0, y);
		c.lineTo(width, y);
	}
	c.stroke();
}
drawBG();
start.forEach(s => {
    c.fillStyle = "green";
    c.fillRect(s.x * scale, s.y * scale, scale, scale);
});

function update(){
	requestAnimationFrame(update);
	height = ca.clientHeight * window.devicePixelRatio;
	width = ca.clientWidth * window.devicePixelRatio;
	ca.height = height;
	ca.width = width;
	drawBG();
	// draw spawn square



	c.translate(offset.x, offset.y);
	c.fillStyle = "#08cc3c";
c.fillRect(scale * spawn.x - scale, scale * spawn.y - scale, scale * 2, scale * 2);

// draw spawn direction arrow
c.strokeStyle = "#ffffff";
c.beginPath();
c.moveTo(scale * spawn.x, scale * spawn.y);
c.lineTo(
    scale * spawn.x + Math.cos(spawn.angle) * scale * 2,
    scale * spawn.y + Math.sin(spawn.angle) * scale * 2
);
c.stroke();
	c.lineCap = "round";
	c.lineWidth = 2;
	c.strokeStyle="#f48342";
	c.beginPath();
	for(var i = 0; i < walls.length; i++){
		c.moveTo(scale * walls[i].start.x, scale * walls[i].start.y);
		c.lineTo(scale * walls[i].end.x, scale * walls[i].end.y);
	}
	c.stroke();
	c.strokeStyle="#428ff4";
	c.beginPath();
	for(var i = 0; i < start.length && i < 1; i++){
		c.moveTo(scale * start[i].start.x, scale * start[i].start.y);
		c.lineTo(scale * start[i].end.x, scale * start[i].end.y);
	}
	c.stroke();
	c.strokeStyle="#f00";
	c.beginPath();
	for(var i = 1; i < start.length; i++){
		c.moveTo(scale * start[i].start.x, scale * start[i].start.y);
		c.lineTo(scale * start[i].end.x, scale * start[i].end.y);
	}
	c.stroke();
	c.fillStyle="#08cc3c";
	for(var i = 0; i < trees.length; i++){
		c.beginPath();
		c.arc(scale * trees[i].x, scale * trees[i].y, 5, 0, 2 * Math.PI);
		c.fill();
	}
c.strokeStyle = "#f00";
c.lineWidth = 2;
c.beginPath();

for (var i = 0; i < arrows.length; i++) {
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


	c.translate(-offset.x, -offset.y);
}
update();

function select(n){
	sel = n;
	for(var i = 0; i < s.children.length - 1; i++)
		s.children[i].className = "button" + (i == n ? " selected" : "");
}

function gridX(x){
	return Math.round((x * window.devicePixelRatio - offset.x) / scale);
}

function gridY(x){
	return Math.round((x * window.devicePixelRatio - offset.y) / scale);
}

ca.onmousedown = function(e){
	mouse.down = true;
	mouse.cur.x = e.clientX;
	mouse.cur.y = e.clientY;
	mouse.start.x = e.clientX;
	mouse.start.y = e.clientY;
	if(sel == 0)
		walls.push({
			start: {
				x: gridX(mouse.start.x),
				y: gridY(mouse.start.y)
			},
			end: {
				x: gridX(mouse.start.x),
				y: gridY(mouse.start.y)
			}
		});
	if(sel == 1)
		start.push({
			start: {
				x: gridX(mouse.start.x),
				y: gridY(mouse.start.y)
			},
			end: {
				x: gridX(mouse.start.x),
				y: gridY(mouse.start.y)
			}
		});
	if(sel == 2)
		trees.push({
			x: gridX(mouse.start.x),
			y: gridY(mouse.start.y)
		});
	if(sel == 3)
		arrows.push({
			x: gridX(mouse.start.x),
			y: gridY(mouse.start.y),
			angle: 0
	
		});
	if(sel == 5){
    spawn.x = gridX(mouse.start.x);
    spawn.y = gridY(mouse.start.y);
}

	if(sel == 4)
		eraseL(gridX(mouse.cur.x), gridY(mouse.cur.y));
}

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
		trees.push({
			x: gridX(mouse.cur.x),
			y: gridY(mouse.cur.y)
		});
		hist.push(sel);
	}
	if(sel == 3 && mouse.down)
		arrows[arrows.length - 1].angle = Math.atan2(mouse.start.y - mouse.cur.y, mouse.start.x - mouse.cur.x);
	if(sel == 4 && mouse.down)
		eraseL(gridX(mouse.cur.x), gridY(mouse.cur.y));
if(sel == 5 && mouse.down){
    spawn.angle = Math.atan2(
        mouse.start.y - mouse.cur.y,
        mouse.start.x - mouse.cur.x
    );
}

}

ca.onmouseup = function(e){
	mouse.down = false;
	mouse.cur.x = e.clientX;
	mouse.cur.y = e.clientY;
	mouse.end.x = e.clientX;
	mouse.end.y = e.clientY;
	if(sel == 0){
		walls[walls.length - 1].end.x = gridX(mouse.end.x);
		walls[walls.length - 1].end.y = gridY(mouse.end.y);
	}
	if(sel == 1){
		start[start.length - 1].end.x = gridX(mouse.end.x);
		start[start.length - 1].end.y = gridY(mouse.end.y);
	}
	if(sel == 2)
		trees[trees.length - 1] = {
			x: gridX(mouse.end.x),
			
			y: gridY(mouse.end.y)
		};
	hist.push(sel);
	//console.log(hist);
}

function imp(){
	var text = prompt("Track data?").trim().split("|");
	
	if(!text || text.length < 4)
		return;

	var wallsText = text[0].split(" ");
	var startText = text[1].split(" ");
	var treesText = text[2].split(" ");
	var arrowsText = text[3].split(" ");
var spawnText = text[4];

if (spawnText) {
    var sp = spawnText.split("/");
    if (sp.length === 2) {
        var pos = sp[0].split(",");
        spawn.x = parseInt(pos[0]) + Math.floor(width / scale / 2);
        spawn.y = -parseInt(pos[1]) + Math.floor(height / scale / 2);
// stored value is game dir; convert back to editor angle
var dir = parseInt(sp[1]) * Math.PI / 180;
spawn.angle = (Math.PI / 2) - dir;
    }
}

	walls = [];
	for(var i = 0; i < wallsText.length; i++){
		var t = wallsText[i].split("/");
		if(t.length < 2)
			continue;

		walls.push({
			start: {
				x: parseInt(t[0].split(",")[0]) + Math.floor(width / scale / 2),
				y: -parseInt(t[0].split(",")[1]) + Math.floor(height / scale / 2)
			},
			end: {
				x: parseInt(t[1].split(",")[0]) + Math.floor(width / scale / 2),
				y: -parseInt(t[1].split(",")[1]) + Math.floor(height / scale / 2)
			}
		});
	}

	start = [];
	for(var i = 0; i < startText.length; i++){
		var t = startText[i].split("/");
		if(t.length < 2)
			continue;

		start.push({
			start: {
				x: parseInt(t[0].split(",")[0]) + Math.floor(width / scale / 2),
				y: -parseInt(t[0].split(",")[1]) + Math.floor(height / scale / 2)
			},
			end: {
				x: parseInt(t[1].split(",")[0]) + Math.floor(width / scale / 2),
				y: -parseInt(t[1].split(",")[1]) + Math.floor(height / scale / 2)
			}
		});
	}

	trees = [];
	for(var i = 0; i < treesText.length; i++){
		if(treesText[i].trim().length == 0)
			continue;

		trees.push({
			x: parseInt(treesText[i].split(",")[0]) + Math.floor(width / scale / 2),
			y: -parseInt(treesText[i].split(",")[1]) + Math.floor(height / scale / 2)
		});
	}

arrows = [];

for (var i = 0; i < arrowsText.length; i++) {
    var entry = arrowsText[i].trim();
    if (!entry) continue;

    var t = entry.split("/");
    if (t.length < 2) continue;

    var coords = t[0].split(",");
    if (coords.length < 3) continue;

    var gx = parseInt(coords[0]);
    var gy = parseInt(coords[2]);
    var ang = parseInt(t[1]);

    if (isNaN(gx) || isNaN(gy) || isNaN(ang)) continue;

    arrows.push({
        x: gx + Math.floor(width / scale / 2),
        y: -gy + Math.floor(height / scale / 2),
        angle: (90 - ang) * Math.PI / 180
    });
}


}



);
c.stroke();
	c.lineCap = "round";
	c.lineWidth = 2;
	c.strokeStyle="#f48342";
	c.beginPath();
	for(var i = 0; i < walls.length; i++){
		c.moveTo(scale * walls[i].start.x, scale * walls[i].start.y);
		c.lineTo(scale * walls[i].end.x, scale * walls[i].end.y);
	}
	c.stroke();
	c.strokeStyle="#428ff4";
	c.beginPath();
	for(var i = 0; i < start.length && i < 1; i++){
		c.moveTo(scale * start[i].start.x, scale * start[i].start.y);
		c.lineTo(scale * start[i].end.x, scale * start[i].end.y);
	}
	c.stroke();
	c.strokeStyle="#f00";
	c.beginPath();
	for(var i = 1; i < start.length; i++){
		c.moveTo(scale * start[i].start.x, scale * start[i].start.y);
		c.lineTo(scale * start[i].end.x, scale * start[i].end.y);
	}
	c.stroke();
	c.fillStyle="#08cc3c";
	for(var i = 0; i < trees.length; i++){
		c.beginPath();
		c.arc(scale * trees[i].x, scale * trees[i].y, 5, 0, 2 * Math.PI);
		c.fill();
	}
c.strokeStyle = "#f00";
c.lineWidth = 2;
c.beginPath();

for (var i = 0; i < arrows.length; i++) {
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


	c.translate(-offset.x, -offset.y);
}
update();

function select(n){
	sel = n;
	for(var i = 0; i < s.children.length - 1; i++)
		s.children[i].className = "button" + (i == n ? " selected" : "");
}

function gridX(x){
	return Math.round((x * window.devicePixelRatio - offset.x) / scale);
}

function gridY(x){
	return Math.round((x * window.devicePixelRatio - offset.y) / scale);
}

ca.onmousedown = function(e){
	mouse.down = true;
	mouse.cur.x = e.clientX;
	mouse.cur.y = e.clientY;
	mouse.start.x = e.clientX;
	mouse.start.y = e.clientY;
	if(sel == 0)
		walls.push({
			start: {
				x: gridX(mouse.start.x),
				y: gridY(mouse.start.y)
			},
			end: {
				x: gridX(mouse.start.x),
				y: gridY(mouse.start.y)
			}
		});
	if(sel == 1)
		start.push({
			start: {
				x: gridX(mouse.start.x),
				y: gridY(mouse.start.y)
			},
			end: {
				x: gridX(mouse.start.x),
				y: gridY(mouse.start.y)
			}
		});
	if(sel == 2)
		trees.push({
			x: gridX(mouse.start.x),
			y: gridY(mouse.start.y)
		});
	if(sel == 3)
		arrows.push({
			x: gridX(mouse.start.x),
			y: gridY(mouse.start.y),
			angle: 0
	
		});
	if(sel == 5){
    spawn.x = gridX(mouse.start.x);
    spawn.y = gridY(mouse.start.y);
}

	if(sel == 4)
		eraseL(gridX(mouse.cur.x), gridY(mouse.cur.y));
}

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
		trees.push({
			x: gridX(mouse.cur.x),
			y: gridY(mouse.cur.y)
		});
		hist.push(sel);
	}
	if(sel == 3 && mouse.down)
		arrows[arrows.length - 1].angle = Math.atan2(mouse.start.y - mouse.cur.y, mouse.start.x - mouse.cur.x);
	if(sel == 4 && mouse.down)
		eraseL(gridX(mouse.cur.x), gridY(mouse.cur.y));
if(sel == 5 && mouse.down){
    spawn.angle = Math.atan2(
        mouse.start.y - mouse.cur.y,
        mouse.start.x - mouse.cur.x
    );
}

}

ca.onmouseup = function(e){
	mouse.down = false;
	mouse.cur.x = e.clientX;
	mouse.cur.y = e.clientY;
	mouse.end.x = e.clientX;
	mouse.end.y = e.clientY;
	if(sel == 0){
		walls[walls.length - 1].end.x = gridX(mouse.end.x);
		walls[walls.length - 1].end.y = gridY(mouse.end.y);
	}
	if(sel == 1){
		start[start.length - 1].end.x = gridX(mouse.end.x);
		start[start.length - 1].end.y = gridY(mouse.end.y);
	}
	if(sel == 2)
		trees[trees.length - 1] = {
			x: gridX(mouse.end.x),
			
			y: gridY(mouse.end.y)
		};
	hist.push(sel);
	//console.log(hist);
}

function imp(){
	var text = prompt("Track data?").trim().split("|");
	
	if(!text || text.length < 4)
		return;

	var wallsText = text[0].split(" ");
	var startText = text[1].split(" ");
	var treesText = text[2].split(" ");
	var arrowsText = text[3].split(" ");
var spawnText = text[4];

if (spawnText) {
    var sp = spawnText.split("/");
    if (sp.length === 2) {
        var pos = sp[0].split(",");
        spawn.x = parseInt(pos[0]) + Math.floor(width / scale / 2);
        spawn.y = -parseInt(pos[1]) + Math.floor(height / scale / 2);
// stored value is game dir; convert back to editor angle
var dir = parseInt(sp[1]) * Math.PI / 180;
spawn.angle = (Math.PI / 2) - dir;
    }
}

	walls = [];
	for(var i = 0; i < wallsText.length; i++){
		var t = wallsText[i].split("/");
		if(t.length < 2)
			continue;

		walls.push({
			start: {
				x: parseInt(t[0].split(",")[0]) + Math.floor(width / scale / 2),
				y: -parseInt(t[0].split(",")[1]) + Math.floor(height / scale / 2)
			},
			end: {
				x: parseInt(t[1].split(",")[0]) + Math.floor(width / scale / 2),
				y: -parseInt(t[1].split(",")[1]) + Math.floor(height / scale / 2)
			}
		});
	}

	start = [];
	for(var i = 0; i < startText.length; i++){
		var t = startText[i].split("/");
		if(t.length < 2)
			continue;

		start.push({
			start: {
				x: parseInt(t[0].split(",")[0]) + Math.floor(width / scale / 2),
				y: -parseInt(t[0].split(",")[1]) + Math.floor(height / scale / 2)
			},
			end: {
				x: parseInt(t[1].split(",")[0]) + Math.floor(width / scale / 2),
				y: -parseInt(t[1].split(",")[1]) + Math.floor(height / scale / 2)
			}
		});
	}

	trees = [];
	for(var i = 0; i < treesText.length; i++){
		if(treesText[i].trim().length == 0)
			continue;

		trees.push({
			x: parseInt(treesText[i].split(",")[0]) + Math.floor(width / scale / 2),
			y: -parseInt(treesText[i].split(",")[1]) + Math.floor(height / scale / 2)
		});
	}

arrows = [];

for (var i = 0; i < arrowsText.length; i++) {
    var entry = arrowsText[i].trim();
    if (!entry) continue;

    var t = entry.split("/");
    if (t.length < 2) continue;

    var coords = t[0].split(",");
    if (coords.length < 3) continue;

    var gx = parseInt(coords[0]);
    var gy = parseInt(coords[2]);
    var ang = parseInt(t[1]);

    if (isNaN(gx) || isNaN(gy) || isNaN(ang)) continue;

    arrows.push({
        x: gx + Math.floor(width / scale / 2),
        y: -gy + Math.floor(height / scale / 2),
        angle: (90 - ang) * Math.PI / 180
    });
}


}

