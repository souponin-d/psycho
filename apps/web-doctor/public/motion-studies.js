const studies = [
  {
    title: "Лента Мёбиуса",
    description:
      "Непрерывная перекрученная поверхность. Шалфейные частицы собираются в форму и мягко поворачиваются.",
    background: "#e4efdf",
    light: "#f9fff6",
    dark: [0.1, 0.27, 0.17],
    soft: [0.3, 0.52, 0.25],
  },
  {
    title: "Двойная спираль",
    description:
      "Две линии данных в одном ритме. Глубокий сине-зелёный фон и светлые мятные частицы.",
    background: "#143d3d",
    light: "#376d65",
    dark: [0.66, 0.93, 0.8],
    soft: [0.95, 0.89, 0.57],
  },
  {
    title: "Живой цветок",
    description:
      "Семь лепестков раскрываются из центра. Тёплая молочная поверхность и оттенки терракоты.",
    background: "#f4e9df",
    light: "#fff9f0",
    dark: [0.36, 0.17, 0.14],
    soft: [0.66, 0.31, 0.2],
  },
  {
    title: "Узел непрерывности",
    description:
      "Объёмная петля без разрыва. Тёмная сливовая среда с мягким лавандовым свечением.",
    background: "#302d42",
    light: "#55506b",
    dark: [0.92, 0.79, 0.88],
    soft: [0.73, 0.72, 0.99],
  },
  {
    title: "Пульсирующая сфера",
    description:
      "Сфера реагирует на движение курсора и дышит в спокойном темпе. Светлая база и насыщенная хвойная зелень.",
    background: "#e9f1ed",
    light: "#ffffff",
    dark: [0.05, 0.22, 0.18],
    soft: [0.13, 0.44, 0.34],
  },
];
const stage = document.querySelector(".stage");
const canvas = stage.querySelector("canvas");
const fallback = stage.querySelector(".fallback");
const button = stage.querySelector(".pause");
const buttons = [...document.querySelectorAll("[data-choice]")];
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let selected = 0;
let paused = reduced.matches;
let clock = 0;
let last = 0;
let frame = 0;
let gl, program, buffer, locations;
const count = 6000;
const vertex = `
precision highp float;
attribute vec4 a_seed;
uniform float u_time, u_shape, u_aspect, u_size, u_dpr, u_assembly, u_pointer;
uniform vec2 u_mouse;
varying float v_alpha, v_tone;
const float PI = 3.14159265359;
float hash(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
mat3 rx(float a) { float c=cos(a),s=sin(a); return mat3(1.,0.,0.,0.,c,s,0.,-s,c); }
mat3 ry(float a) { float c=cos(a),s=sin(a); return mat3(c,0.,-s,0.,1.,0.,s,0.,c); }
void main() {
 float t=a_seed.x*2.*PI, v=a_seed.y*2.-1., branch=floor(a_seed.z*2.);
 vec3 p=vec3(0.);
 if(u_shape<.5) {
   float r=1.05+.43*v*cos(t*.5); p=vec3(r*cos(t), r*sin(t), .43*v*sin(t*.5));
 } else if(u_shape<1.5) {
   float h=(a_seed.x-.5)*2.7, angle=h*6.8+branch*PI+u_time*.12;
   p=vec3(.61*cos(angle)+v*.055,h,.61*sin(angle)+v*.055);
 } else if(u_shape<2.5) {
   float a=a_seed.x*2.*PI, radial=.2+pow(a_seed.y,.7)*(.72+.32*cos(7.*a));
   p=vec3(radial*cos(a),radial*sin(a),.12*cos(7.*a)*a_seed.y+.08*v);
 } else if(u_shape<3.5) {
   p=vec3((sin(t)+2.*sin(2.*t))*.42,(cos(t)-2.*cos(2.*t))*.42,-sin(3.*t)*.58);
   p+=vec3(v*.07,(a_seed.z-.5)*.1,(hash(a_seed.w)-.5)*.1);
 } else {
   float z=v, a=t, r=sqrt(max(0.,1.-z*z));
   float wave=1.+.07*sin(8.*a+u_time*1.3)*sin(PI*z);
   p=vec3(r*cos(a),z,r*sin(a))*wave;
 }
 float scatter=(1.-u_assembly)*(1.5+hash(a_seed.w+3.)*.9);
 p+=vec3(hash(a_seed.w+4.)-.5,hash(a_seed.w+8.)-.5,hash(a_seed.w+12.)-.5)*scatter;
 if (u_shape>1.5 && u_shape<2.5) {
   p=ry(.12+sin(u_time*.35)*.15+u_mouse.x*.08*u_pointer)*rx(.08+sin(u_time*.3)*.08-u_mouse.y*.08*u_pointer)*p;
 } else {
   p=ry(.45+u_time*.18+u_mouse.x*.16*u_pointer)*rx(.15+sin(u_time*.24)*.12-u_mouse.y*.12*u_pointer)*p;
 }
 float depth=clamp((p.z+1.8)/3.6,0.,1.);
 vec2 xy=p.xy*vec2(1./u_aspect,1.)*.64;
 gl_Position=vec4(xy,0.,1.);
 gl_PointSize=u_dpr*u_size*(.8+depth*.9)*(1.+hash(a_seed.w+9.)*.3);
 v_alpha=(.45+depth*.5)*(.75+.25*hash(a_seed.w+15.))*mix(.42,1.,u_assembly);
 v_tone=depth*.7+.3*hash(a_seed.w+21.);
}`;
const fragment = `
precision highp float;
uniform vec3 u_dark,u_soft;
varying float v_alpha,v_tone;
void main() {
 vec2 p=gl_PointCoord*2.-1.; float r=dot(p,p);
 if(r>1.) discard;
 vec3 color=mix(u_dark,u_soft,v_tone);
 gl_FragColor=vec4(color,(1.-smoothstep(.25,1.,r))*v_alpha);
}`;
function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}
function initialize() {
  try {
    gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    if (!gl) throw new Error("WebGL unavailable");
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const data = new Float32Array(count * 4);
    let seed = 0x5eeda11;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < count; i++)
      data.set([random(), random(), random(), i], i * 4);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const attr = gl.getAttribLocation(program, "a_seed");
    gl.enableVertexAttribArray(attr);
    gl.vertexAttribPointer(attr, 4, gl.FLOAT, false, 0, 0);
    locations = Object.fromEntries(
      [
        "time",
        "shape",
        "aspect",
        "size",
        "dpr",
        "assembly",
        "pointer",
        "mouse",
        "dark",
        "soft",
      ].map((name) => [name, gl.getUniformLocation(program, "u_" + name)]),
    );
    fallback.hidden = true;
    draw();
    tick(performance.now());
  } catch {
    canvas.hidden = true;
    fallback.hidden = false;
  }
}
let mouseX = 0,
  mouseY = 0,
  mouseActive = 0;
function draw() {
  if (!gl) return;
  const { width, height } = stage.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 1.8);
  const w = Math.round(width * dpr),
    h = Math.round(height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);
  const values = {
    time: clock,
    shape: selected,
    aspect: width / height,
    size: 2.8,
    dpr,
    assembly: Math.min(1, clock / 2.7),
    pointer: mouseActive,
  };
  for (const [name, value] of Object.entries(values))
    gl.uniform1f(locations[name], value);
  gl.uniform2f(locations.mouse, mouseX, mouseY);
  gl.uniform3fv(locations.dark, studies[selected].dark);
  gl.uniform3fv(locations.soft, studies[selected].soft);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArrays(gl.POINTS, 0, count);
}
function tick(now) {
  frame = 0;
  if (paused || document.hidden) {
    last = 0;
    return;
  }
  const dt = last ? Math.min((now - last) / 1000, 0.06) : 1 / 60;
  last = now;
  clock += dt;
  draw();
  frame = requestAnimationFrame(tick);
}
function sync() {
  cancelAnimationFrame(frame);
  frame = 0;
  last = 0;
  button.textContent = paused ? "Возобновить" : "Приостановить";
  button.setAttribute("aria-pressed", String(paused));
  if (paused) {
    clock = Math.max(clock, 2.7);
    draw();
  } else frame = requestAnimationFrame(tick);
}
function select(value) {
  selected = /^[1-5]$/.test(value) ? Number(value) - 1 : 0;
  const item = studies[selected];
  stage.style.setProperty("--stage", item.background);
  stage.style.setProperty("--light", item.light);
  stage.style.setProperty("--fallback", item.background);
  document.querySelector("#motion-title").textContent = item.title;
  document.querySelector("#motion-description").textContent = item.description;
  buttons.forEach((b, i) =>
    b.setAttribute("aria-current", String(i === selected)),
  );
  clock = paused ? 2.7 : 0;
  draw();
}
buttons.forEach((button) =>
  button.addEventListener("click", () => {
    location.hash = button.dataset.choice;
    select(button.dataset.choice);
  }),
);
addEventListener("hashchange", () => select(location.hash.slice(1)));
button.addEventListener("click", () => {
  paused = !paused;
  sync();
});
stage.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch" || paused) return;
  const rect = stage.getBoundingClientRect();
  mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouseY = 1 - ((event.clientY - rect.top) / rect.height) * 2;
  mouseActive = 1;
});
stage.addEventListener("pointerleave", () => {
  mouseActive = 0;
});
reduced.addEventListener("change", () => {
  paused = reduced.matches;
  sync();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelAnimationFrame(frame);
    frame = 0;
  } else sync();
});
new ResizeObserver(draw).observe(stage);
select(location.hash.slice(1));
initialize();
if (paused) sync();
