// ====== TUNING (updated) ======
var SPEED = 0.004;
var CAMERA_LAG = 0.82;   // was 0.9
var COLLISION = 1.1;
var BOUNCE = 0.7;
var mapscale = 50;
var VR = false;
var BOUNCE_CORRECT = 0.01;
var WALL_SIZE = 1.2;
var MOUNTAIN_DIST = 2500;
var OOB_DIST = 200;
var LAPS = 3;

// New tuning (added)
var MAX_SPEED = 0.9;      // top speed cap
var STEER_MIN = 0.05;     // steering response at low speed
var STEER_SPEED = 0.12;   // steering response increases with speed
var CAM_HEIGHT = 4;       // was 3

function MODS(){

}

// ====== Firebase connection (unchanged) ======
const firebaseConfig = {
  apiKey: "AIzaSyAbvjrx9Nvu2_xRFTN-AEN8dJgRUDdb410",
  authDomain: "car-game67.firebaseapp.com",
  databaseURL: "https://car-game67-default-rtdb.firebaseio.com/",
  projectId: "car-game67",
  storageBucket: "car-game67.appspot.com",
  messagingSenderId: "211052611005",
  appId: "1:211052611005:web:bd456d81c7be8825e1fed4"
};

firebase.initializeApp(firebaseConfig);
var database = firebase.database();
firebase.auth().signInAnonymously().catch(console.error);

// ... (everything above your join() stays the same)
function loadMap() {
  return "";
}


var scene = new THREE.Scene();

var renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

var map = new THREE.Object3D();
scene.add(map);

var startc = new THREE.Object3D();
scene.add(startc);

var players = {};
var labels = [];

var gameStarted = false;
var gameSortaStarted = false;
var mobile = false;

var lap = document.createElement("div");
lap.style.position = "absolute";
lap.style.top = "10px";
lap.style.left = "10px";
lap.style.color = "white";
document.body.appendChild(lap);

// ====== join() ======
function join(){
	eval(loadMap());

	scene.background = new THREE.Color(0x7fb0ff);

	camera = new THREE.PerspectiveCamera(
		90,
		window.innerWidth / window.innerHeight,
		1,
		1000
	);

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

	// NEW: nicer fill lighting
	scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));

	var x = 0;
	var ray = new THREE.Raycaster();
	function toXYCoords(pos){
		pos = pos.clone();
		pos.y += 0.5;
		var vector = pos.project(camera);
		vector.x = (vector.x + 1) / 2 * window.innerWidth;
		vector.y = -(vector.y - 1) / 2 * window.innerHeight;
		return vector;
	}
	var windowsize = {x: window.innerWidth, y: window.innerHeight};

	var ray = new THREE.Raycaster();
	ray.near = 0;
	ray.far = 1;

	var ren = renderer;
	var controls;
	if(VR){
		var effect = new THREE.StereoEffect(renderer);
		effect.setSize(window.innerWidth, window.innerHeight);
		effect.setEyeSeparation(0.7);
		ren = effect;
		controls = new THREE.DeviceOrientationControls(camera);
	}

	var lastTime = performance.now();
	function render(timestamp) {
		requestAnimationFrame(render);
		var timepassed = timestamp - lastTime;
		lastTime = timestamp;
		var warp = timepassed / 16;

		if(gameStarted){
			if(!mobile){
				if(left)  me.data.steer = Math.PI / 6;
				if(right) me.data.steer = -Math.PI / 6;
				if(!(left ^ right)) me.data.steer = 0;
			}
			if(VR) me.data.steer = camera.rotation.z;
			me.data.steer = Math.max(-Math.PI / 6, Math.min(Math.PI / 6, me.data.steer));

			players[me.ref.path.pieces_[2]].data = me.data;

			if(!gameSortaStarted){
				for(var p in players){
					var play = players[p];

					// ====== NEW: speed-aware steering ======
					var speedMag = Math.sqrt(play.data.xv * play.data.xv + play.data.yv * play.data.yv);
					play.data.dir += play.data.steer * (STEER_MIN + speedMag * STEER_SPEED) * warp;

					// ====== Your accel/friction/drag (kept) ======
					const ACCEL = SPEED * 1.6;
					const FRICTION = 0.965;
					const DRAG = 0.992;

					play.data.xv += Math.sin(play.data.dir) * ACCEL * warp;
					play.data.yv += Math.cos(play.data.dir) * ACCEL * warp;

					play.data.xv *= Math.pow(FRICTION, warp);
					play.data.yv *= Math.pow(FRICTION, warp);

					play.data.xv *= DRAG;
					play.data.yv *= DRAG;

					// ====== NEW: top-speed cap ======
					var velMag = Math.sqrt(play.data.xv * play.data.xv + play.data.yv * play.data.yv);
					if(velMag > MAX_SPEED){
						var s = MAX_SPEED / velMag;
						play.data.xv *= s;
						play.data.yv *= s;
					}

					play.data.x += play.data.xv * warp;
					play.data.y += play.data.yv * warp;

					play.model.position.x = play.data.x + play.data.xv;
					play.model.position.z = play.data.y + play.data.yv;
					play.model.rotation.y = play.data.dir;

					play.model.children[0].rotation.z = Math.PI / 2 - play.data.steer;
					play.model.children[1].rotation.z = Math.PI / 2 - play.data.steer;

					// ====== Collisions/walls/checkpoints/etc (unchanged) ======
					for(var w in map.children){
						var wall = map.children[w];
						var posi = new THREE.Vector2(play.data.x, play.data.y);
						if(Math.abs(wall.plane.distanceToPoint(play.model.position.clone().sub(wall.position))) < WALL_SIZE){
							if(wall.position.clone().distanceTo(play.model.position) < wall.width / 2){
								var vel = new THREE.Vector3(play.data.xv, 0, play.data.yv);
								vel.reflect(wall.plane.normal);
								play.data.xv = vel.x + BOUNCE_CORRECT * wall.plane.normal.x * Math.sign(wall.plane.normal.dot(play.model.position.clone().sub(wall.position)));
								play.data.yv = vel.z + BOUNCE_CORRECT * wall.plane.normal.z * Math.sign(wall.plane.normal.dot(play.model.position.clone().sub(wall.position)));
								while(Math.abs(wall.plane.distanceToPoint(new THREE.Vector3(play.data.x, 0, play.data.y).sub(wall.position))) < WALL_SIZE){
									play.data.x += play.data.xv;
									play.data.y += play.data.yv;
								}
								play.data.xv *= BOUNCE;
								play.data.yv *= BOUNCE;
							}
						}
						if(posi.distanceTo(wall.p1) < WALL_SIZE + 0.1){
							var norm = posi.clone().sub(wall.p1);
							norm = new THREE.Vector3(norm.x, 0, norm.y);
							norm.normalize();
							var vel = new THREE.Vector3(play.data.xv, 0, play.data.yv);
							vel.reflect(norm);
							play.data.xv = vel.x + norm.x * BOUNCE_CORRECT * 1;
							play.data.yv = vel.z + norm.z * BOUNCE_CORRECT * 1;
							while((new THREE.Vector2(play.data.x, play.data.y)).distanceTo(wall.p1) < WALL_SIZE + 0.1){
								play.data.x += play.data.xv;
								play.data.y += play.data.yv;
							}
							play.data.xv *= BOUNCE;
							play.data.yv *= BOUNCE;
						}
						if(posi.distanceTo(wall.p2) < WALL_SIZE + 0.1){
							var norm = posi.clone().sub(wall.p2);
							norm = new THREE.Vector3(norm.x, 0, norm.y);
							norm.normalize();
							var vel = new THREE.Vector3(play.data.xv, 0, play.data.yv);
							vel.reflect(norm);
							play.data.xv = vel.x + norm.x * BOUNCE_CORRECT * 1;
							play.data.yv = vel.z + norm.z * BOUNCE_CORRECT * 1;
							while((new THREE.Vector2(play.data.x, play.data.y)).distanceTo(wall.p2) < WALL_SIZE + 0.1){
								play.data.x += play.data.xv;
								play.data.y += play.data.yv;
							}
							play.data.xv *= BOUNCE;
							play.data.yv *= BOUNCE;
						}
					}

					for(var i in startc.children){
						var cp = startc.children[i];
						if(Math.abs(cp.plane.distanceToPoint(play.model.position.clone().sub(cp.position))) < 1){
							if(cp.position.clone().distanceTo(play.model.position) < cp.width / 2 + 1){
								if(i == 0){
									if(play.data.checkpoint == 1){
										play.data.checkpoint = 0;
										play.data.lap++;
									}
								}else{
									play.data.checkpoint = 1;
								}
							}
						}
					}

					if(play.data.lap > LAPS && document.getElementById("countdown").innerHTML == ""){
						document.getElementById("countdown").style.fontSize = "25vmin";
						document.getElementById("countdown").innerHTML = play.data.name.replaceAll("<", "&lt;") + " Won!";
					}

					for(var pl in players){
						if(play != players[pl] && play.model.position.distanceTo(players[pl].model.position) < 2){
							var ply = players[pl];
							var temp = new THREE.Vector2(play.data.xv, play.data.yv);
							var temp2 = new THREE.Vector2(ply.data.xv, ply.data.yv);
							ply.data.xv -= temp.x;
							ply.data.yv -= temp.y;
							play.data.xv -= temp2.x;
							play.data.yv -= temp2.y;
							var norm = (new THREE.Vector2(play.data.x, play.data.y)).sub(new THREE.Vector2(ply.data.x, ply.data.y));
							norm = new THREE.Vector3(norm.x, 0, norm.y);
							norm.normalize();
							var vel = new THREE.Vector3(play.data.xv, 0, play.data.yv);
							var vel2 = new THREE.Vector3(ply.data.xv, 0, ply.data.yv);
							vel.reflect(norm);
							vel2.reflect(norm);
							ply.data.xv += COLLISION * vel2.x;
							ply.data.yv += COLLISION * vel2.z;
							play.data.xv += COLLISION * vel.x;
							play.data.yv += COLLISION * vel.z;
							ply.data.xv += temp.x;
							ply.data.yv += temp.y;
							play.data.xv += temp2.x;
							play.data.yv += temp2.y;
							while((new THREE.Vector2(play.data.x, play.data.y)).distanceTo(new THREE.Vector2(ply.data.x, ply.data.y)) < 2){
								play.data.x += play.data.xv;
								play.data.y += play.data.yv;
							}
						}
					}

					if(play.model.position.distanceTo(new THREE.Vector3()) > OOB_DIST){
						play.data.x = 0;
						play.data.y = 0;
					}
				}
			}

			// ====== NEW: camera height + smoother follow ======
			var target = new THREE.Vector3(
				me.model.position.x + Math.sin(-me.model.rotation.y) * 5,
				CAM_HEIGHT,
				me.model.position.z + -Math.cos(-me.model.rotation.y) * 5
			);
			camera.position.set(
				camera.position.x * Math.pow(CAMERA_LAG, warp) + target.x * (1 - Math.pow(CAMERA_LAG, warp)),
				CAM_HEIGHT,
				camera.position.z * Math.pow(CAMERA_LAG, warp) + target.z * (1 - Math.pow(CAMERA_LAG, warp))
			);
			camera.lookAt(me.model.position);

			me.ref.set(me.data);

			lap.innerHTML = me.data.lap <= LAPS ? me.data.lap + "/" + LAPS : "";
		}else{
			camera.position.set(50 * Math.sin(x), 20, 50 * Math.cos(x));
			camera.lookAt(player.position);
		}

		x += 0.01;

		camera.updateMatrix();
		camera.updateMatrixWorld();
		camera.updateProjectionMatrix();
		var frustum = new THREE.Frustum();
		frustum.setFromMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
		for(var i = 0; i < labels.length; i++){
			var label = labels[i];
			if(frustum.containsPoint(label.position) && !VR){
				var vec = toXYCoords(label.position);
				label.style.left = vec.x + "px";
				label.style.top = vec.y + "px";
				label.style.zIndex = 99999 - Math.floor(camera.position.distanceTo(label.position) * 10);
				label.style.display = "inline-block";
			}else{
				label.style.display = "none";
			}
		}

		if(windowsize.x != window.innerWidth || windowsize.x != window.innerHeight){
			windowsize = {x: window.innerWidth, y: window.innerHeight};
			onWindowResize();
		}

		if(VR){
			var a = camera.rotation.y;
			controls.update();
			camera.rotation.y += a - Math.PI / 2;
		}
		ren.render(scene, camera);
		MODS();
	}

	render(performance.now());

	window.addEventListener("resize", onWindowResize, false);
	window.addEventListener("orientationchange", onWindowResize, false);

	function onWindowResize(){
		function orientCamera(){
			camera.aspect = window.innerWidth / window.innerHeight;
			renderer.setSize(window.innerWidth, window.innerHeight);
		}
		orientCamera();
		setTimeout(orientCamera, 0);
	}
}
