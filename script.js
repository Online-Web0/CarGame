
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let keys = {};
window.addEventListener("keydown", e => keys[e.key] = true);
window.addEventListener("keyup", e => keys[e.key] = false);

const car = {
  x: canvas.width/2,
  y: canvas.height/2,
  vx: 0,
  vy: 0,
  angle: 0,
  speed: 0,
  nitro: 100
};

function update(){
  let accel = 0.2;
  let friction = 0.96;
  let turnSpeed = 0.05;

  if(keys["ArrowUp"]) car.speed += accel;
  if(keys["ArrowDown"]) car.speed -= accel;
  if(keys["ArrowLeft"]) car.angle -= turnSpeed * (car.speed/5);
  if(keys["ArrowRight"]) car.angle += turnSpeed * (car.speed/5);

  if(keys["Shift"] && car.nitro > 0){
    car.speed += 0.4;
    car.nitro -= 1;
  } else {
    car.nitro = Math.min(100, car.nitro + 0.2);
  }

  car.speed *= friction;

  car.vx = Math.cos(car.angle) * car.speed;
  car.vy = Math.sin(car.angle) * car.speed;

  car.x += car.vx;
  car.y += car.vy;

  document.getElementById("nitro").innerText = Math.floor(car.nitro);
}

function draw(){
  ctx.fillStyle = "#222";
  ctx.fillRect(0,0,canvas.width,canvas.height);

  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = "red";
  ctx.fillRect(-20,-10,40,20);
  ctx.restore();
}

function loop(){
  update();
  draw();
  requestAnimationFrame(loop);
}

loop();
