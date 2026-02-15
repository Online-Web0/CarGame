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

