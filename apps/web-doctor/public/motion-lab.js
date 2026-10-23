const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d", { alpha: false });
const names = [
  ["Шёлковые потоки", "Изумруд и холодный циан · текучие световые нити"],
  [
    "Гравитация частиц",
    "Ночной индиго, золото и ледяной голубой · объёмный рой",
  ],
  [
    "Полярное сияние",
    "Ультрамарин и мятный свет · многослойная световая завеса",
  ],
  ["Живой рельеф", "Тёплая бумага, медь и сливовый · движущиеся контуры"],
  ["Пульсар", "Глубокий бордо и коралл · ритм, луч и расширяющиеся кольца"],
];
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let scene = 1;
let paused = reduced.matches;
let frame = 0;
let start = performance.now();
let heldTime = 0;
let width = 1;
let height = 1;
const pointer = { x: 0.5, y: 0.5 };
const TAU = Math.PI * 2;

function gradient(x1, y1, x2, y2, stops) {
  const fill = ctx.createLinearGradient(x1, y1, x2, y2);
  stops.forEach(([at, color]) => fill.addColorStop(at, color));
  return fill;
}
function background(from, to) {
  ctx.fillStyle = gradient(0, 0, width, height, [
    [0, from],
    [1, to],
  ]);
  ctx.fillRect(0, 0, width, height);
}
function glow(x, y, radius, color) {
  const fill = ctx.createRadialGradient(x, y, 0, x, y, radius);
  fill.addColorStop(0, color);
  fill.addColorStop(1, "transparent");
  ctx.fillStyle = fill;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function silk(time) {
  background("#06191c", "#092d35");
  glow(width * 0.78, height * 0.58, width * 0.46, "#00bca54a");
  glow(width * 0.14, height * 0.83, width * 0.32, "#3edbd32e");
  ctx.globalCompositeOperation = "screen";
  const accent = gradient(0, 0, width, height, [
    [0, "#073f4c10"],
    [0.34, "#44c1c187"],
    [0.66, "#c9ffe6d0"],
    [1, "#0e857a18"],
  ]);
  for (let line = 0; line < 46; line++) {
    const offset = (line - 23) * Math.max(8, height / 95);
    ctx.beginPath();
    for (let step = 0; step <= 90; step++) {
      const x = (step / 90) * width;
      const phase = (x / width) * 8 + time * 0.58 + line * 0.075;
      const y =
        height * 0.54 +
        offset +
        Math.sin(phase) * height * 0.14 +
        Math.sin(phase * 0.54 + line * 0.07) * height * 0.11;
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = line % 9 === 0 ? 2.8 : 0.8;
    ctx.globalAlpha = line % 9 === 0 ? 0.9 : 0.3;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function particles(time) {
  background("#12112f", "#222451");
  glow(
    width * 0.54,
    height * 0.55,
    Math.min(width, height) * 0.49,
    "#6a4cc440",
  );
  const span = Math.min(width, height) * 0.52;
  const centerX = width * (0.52 + (pointer.x - 0.5) * 0.06);
  const centerY = height * (0.53 + (pointer.y - 0.5) * 0.06);
  for (let i = 0; i < 900; i++) {
    const r = Math.sqrt((i + 1) / 900);
    const seed = i * 2.39996323;
    const spin = time * (0.12 + (1 - r) * 0.25);
    const angle = seed + spin;
    const ripple = 1 + 0.09 * Math.sin(time * 1.2 + r * 13 + seed * 0.3);
    const x = centerX + Math.cos(angle) * r * span * 1.4 * ripple;
    const y = centerY + Math.sin(angle) * r * span * 0.82 * ripple;
    const size = 0.7 + (i % 17 === 0 ? 2.5 : (1 - r) * 1.4);
    ctx.fillStyle =
      i % 5 === 0 ? "#ffcc93" : i % 3 === 0 ? "#85e4ed" : "#cab9ff";
    ctx.globalAlpha = 0.32 + (1 - r) * 0.68;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  glow(centerX, centerY, span * 0.22, "#fff0c48a");
}

function aurora(time) {
  background("#090f37", "#12415b");
  glow(width * 0.79, height * 0.46, width * 0.38, "#2968a060");
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.filter = `blur(${Math.max(18, Math.min(width, height) * 0.045)}px)`;
  for (let band = 0; band < 5; band++) {
    const y0 = height * (0.26 + band * 0.11);
    ctx.beginPath();
    ctx.moveTo(-100, height + 100);
    for (let step = 0; step <= 50; step++) {
      const x = (step / 50) * (width + 200) - 100;
      const y =
        y0 +
        Math.sin((x / width) * 8 + time * 0.5 + band) * height * 0.13 +
        Math.cos((x / width) * 3 - time * 0.3) * height * 0.12;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width + 100, height + 100);
    ctx.closePath();
    ctx.fillStyle = [
      "#36d9bd50",
      "#86f6e735",
      "#599af047",
      "#b083ed35",
      "#37e0c52f",
    ][band];
    ctx.fill();
  }
  ctx.restore();
  for (let line = 0; line < 19; line++) {
    ctx.beginPath();
    for (let step = 0; step <= 80; step++) {
      const x = (step / 80) * width;
      const y =
        height * (0.29 + line * 0.023) +
        Math.sin((x / width) * 7 + time * 0.5 + line * 0.07) * height * 0.105;
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = line % 4 === 0 ? "#95fff877" : "#a3b9ff20";
    ctx.lineWidth = line % 4 === 0 ? 1.5 : 0.6;
    ctx.stroke();
  }
}

function relief(time) {
  background("#f6eee3", "#e7dcd0");
  glow(width * 0.78, height * 0.56, width * 0.44, "#e0a68037");
  const centerX = width * (0.74 + (pointer.x - 0.5) * 0.06);
  const centerY = height * (0.53 + (pointer.y - 0.5) * 0.06);
  for (let ring = 1; ring <= 44; ring++) {
    const radius = ring * Math.min(width, height) * 0.028;
    ctx.beginPath();
    for (let step = 0; step <= 170; step++) {
      const angle = (step / 170) * TAU;
      const warp =
        Math.sin(angle * 4 + time * 0.34 + ring * 0.19) * 11 +
        Math.sin(angle * 7 - time * 0.23) * 5;
      const x = centerX + Math.cos(angle) * (radius + warp) * 1.22;
      const y = centerY + Math.sin(angle) * (radius + warp) * 0.9;
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = ring % 8 === 0 ? "#c77456ab" : "#674e8155";
    ctx.lineWidth = ring % 8 === 0 ? 2.2 : 1;
    ctx.stroke();
  }
  glow(centerX, centerY, Math.min(width, height) * 0.09, "#ce866a88");
}

function pulsar(time) {
  background("#210e25", "#58192c");
  const centerX = width * (0.53 + (pointer.x - 0.5) * 0.04);
  const centerY = height * (0.53 + (pointer.y - 0.5) * 0.04);
  const maxRadius = Math.max(width, height) * 0.8;
  glow(centerX, centerY, Math.min(width, height) * 0.55, "#e8565c44");
  for (let ring = 0; ring < 8; ring++) {
    const radius = ((time * 45 + (ring * maxRadius) / 8) % maxRadius) + 12;
    ctx.globalAlpha = 1 - radius / maxRadius;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radius * 1.35, radius * 0.78, -0.25, 0, TAU);
    ctx.strokeStyle = ring % 2 ? "#ff7b75" : "#ffbb85";
    ctx.lineWidth = ring % 2 ? 2.2 : 1;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const angle = time * 0.35;
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(angle);
  ctx.fillStyle = gradient(0, 0, maxRadius, 0, [
    [0, "#ffcfacdd"],
    [0.5, "#ff686055"],
    [1, "#ff686000"],
  ]);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(maxRadius, -20);
  ctx.lineTo(maxRadius, 20);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  glow(centerX, centerY, Math.min(width, height) * 0.15, "#ffccafbb");
  ctx.fillStyle = "#ffede1";
  ctx.beginPath();
  ctx.arc(centerX, centerY, 6 + Math.sin(time * 3) * 2, 0, TAU);
  ctx.fill();
}

const renderers = [silk, particles, aurora, relief, pulsar];
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  width = innerWidth;
  height = innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}
function draw() {
  if (!ctx) return;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  renderers[scene - 1](heldTime);
}
function tick(now) {
  if (paused || document.hidden) {
    frame = 0;
    return;
  }
  heldTime = (now - start) / 1000;
  draw();
  frame = requestAnimationFrame(tick);
}
function sync() {
  const selected = Number(location.hash.slice(1));
  scene = selected >= 1 && selected <= 5 ? selected : 1;
  document.body.dataset.scene = String(scene);
  document.getElementById("name").textContent = names[scene - 1][0];
  document.getElementById("description").textContent = names[scene - 1][1];
  document
    .querySelectorAll("nav [data-scene]")
    .forEach((link) =>
      link.setAttribute(
        "aria-current",
        String(link.dataset.scene === String(scene)),
      ),
    );
  draw();
}
function setPaused(value) {
  paused = value;
  const button = document.getElementById("pause");
  button.textContent = paused ? "Продолжить" : "Пауза";
  button.setAttribute("aria-pressed", String(paused));
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  if (!paused) {
    start = performance.now() - heldTime * 1000;
    frame = requestAnimationFrame(tick);
  }
}
addEventListener("resize", resize);
addEventListener("hashchange", sync);
addEventListener("pointermove", (event) => {
  pointer.x = event.clientX / width;
  pointer.y = event.clientY / height;
});
document
  .getElementById("pause")
  .addEventListener("click", () => setPaused(!paused));
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !paused && !frame)
    frame = requestAnimationFrame(tick);
});
reduced.addEventListener("change", () => {
  setPaused(reduced.matches);
  draw();
});
sync();
resize();
setPaused(paused);
