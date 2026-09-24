function generateBackground() {
    const html = `
      <div class="fixed inset-0 z-n1 w-100 h-100 d-flex flex-col items-center bg-grass">
          <div class="relative w-100 h-50vh">
              <canvas id="grassCanvas" class="w-100 h-100"></canvas>
              <div class="absolute bottom-10px h-10px w-100 bg-white z-1"></div>
          </div>
          <div class="ramdom-position-images relative inset-0 z-n2 w-100"></div>
      </div>
    `;

    // Appends inside <body> at the top (use 'beforeend' to place at the bottom)
    document.body.insertAdjacentHTML('afterbegin', html);
}

// Call the function when DOM is ready
generateBackground();

const canvas = document.getElementById('grassCanvas');
const gl = canvas.getContext('webgl2');

const numLayers = 100;
const density = 1.7;
const maxEffectiveWidth = 2000;
const segments = 6;

const initialMinHeight = 15;
const initialMaxHeight = 30;
const minHeightIncrease = 3.3;
const maxHeightIncrease = 4.2;

const minBladeWidth = 1.5;
const maxBladeWidth = 10;

const minSwaySpeed = 0.004;
const maxSwaySpeed = 0.007;
const minSwayDistance = 15;
const maxSwayDistance = 100;

const maxCurveStrength = 16;

const initialMinLightness = 2;
const initialMaxLightness = 18;
const minLightnessLimit = 30;
const maxLightnessLimit = 50;

const shadowBladeChance = 0.22;

const creamColor = [1.0, 0.980, 0.957];

function hslToRgb(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return [r, g, b];
}

const vsSource = `#version 300 es
layout(location=0) in vec2 a_corner;
layout(location=1) in vec2 a_pos;
layout(location=2) in float a_height;
layout(location=3) in float a_width;
layout(location=4) in float a_swaySpeed;
layout(location=5) in float a_offset;
layout(location=6) in float a_maxSway;
layout(location=7) in float a_curve;
layout(location=8) in vec3 a_color;

uniform vec2 u_resolution;
uniform float u_time;

out vec3 v_color;

void main() {
    float t = a_corner.y;
    float widthAtT = a_width * pow(1.0 - t, 0.6);
    float sway = sin(u_time * a_swaySpeed + a_offset) * a_maxSway;
    float bend = a_curve * t * t;
    float xOffset = a_corner.x * widthAtT * 0.5 + sway * t * t + bend;
    float yOffset = -a_height * t;

    vec2 pos = vec2(a_pos.x + xOffset, a_pos.y + yOffset);
    vec2 clip = (pos / u_resolution) * 2.0 - 1.0;
    clip.y = -clip.y;
    gl_Position = vec4(clip, 0.0, 1.0);
    v_color = a_color;
}`;

const fsSource = `#version 300 es
precision mediump float;
in vec3 v_color;
out vec4 outColor;
void main() {
    outColor = vec4(v_color, 1.0);
}`;

function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
    }
    return shader;
}

const program = gl.createProgram();
gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vsSource));
gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fsSource));
gl.linkProgram(program);
gl.useProgram(program);

const u_resolution = gl.getUniformLocation(program, 'u_resolution');
const u_time = gl.getUniformLocation(program, 'u_time');

const vao = gl.createVertexArray();
gl.bindVertexArray(vao);

const templateData = [];
for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    templateData.push(-1, t, 1, t);
}
const vertexCount = templateData.length / 2;

const templateBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, templateBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(templateData), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

function makeInstanceBuffer(location, size) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(location, 1);
    return buffer;
}

const posBuffer = makeInstanceBuffer(1, 2);
const heightBuffer = makeInstanceBuffer(2, 1);
const widthBuffer = makeInstanceBuffer(3, 1);
const swaySpeedBuffer = makeInstanceBuffer(4, 1);
const offsetBuffer = makeInstanceBuffer(5, 1);
const maxSwayBuffer = makeInstanceBuffer(6, 1);
const curveBuffer = makeInstanceBuffer(7, 1);
const colorBuffer = makeInstanceBuffer(8, 3);

let width, height, bladeCount = 0;
let time = 0;

function buildBlades() {
    const effectiveWidth = Math.min(width, maxEffectiveWidth);
    const bladesPerLayer = Math.max(1, Math.floor((effectiveWidth * density) / numLayers));
    bladeCount = bladesPerLayer * numLayers;

    const posArr = new Float32Array(bladeCount * 2);
    const heightArr = new Float32Array(bladeCount);
    const widthArr = new Float32Array(bladeCount);
    const swaySpeedArr = new Float32Array(bladeCount);
    const offsetArr = new Float32Array(bladeCount);
    const maxSwayArr = new Float32Array(bladeCount);
    const curveArr = new Float32Array(bladeCount);
    const colorArr = new Float32Array(bladeCount * 3);

    let idx = 0;
    for (let layer = numLayers - 1; layer >= 0; layer--) {
        const layerProgress = layer / (numLayers - 1 || 1);
        const currentMinHeight = initialMinHeight + layer * minHeightIncrease;
        const currentMaxHeight = initialMaxHeight + layer * maxHeightIncrease;
        const minLight = initialMinLightness + layerProgress * (minLightnessLimit - initialMinLightness);
        const maxLight = initialMaxLightness + layerProgress * (maxLightnessLimit - initialMaxLightness);

        for (let i = 0; i < bladesPerLayer; i++) {
            const x = Math.random() * width;
            const h = Math.random() * (currentMaxHeight - currentMinHeight) + currentMinHeight;
            const w = Math.random() * (maxBladeWidth - minBladeWidth) + minBladeWidth;
            const swaySpeed = Math.random() * (maxSwaySpeed - minSwaySpeed) + minSwaySpeed;
            const offset = Math.random() * 2 * Math.PI;
            const maxSway = Math.random() * (maxSwayDistance - minSwayDistance) + minSwayDistance;
            const curve = (Math.random() * 2 - 1) * maxCurveStrength;

            const hue = Math.floor(Math.random() * 20 + 65);
            const saturation = Math.floor(Math.random() * 20 + 70);
            const lightness = Math.random() < shadowBladeChance
                ? Math.random() * 7 + 3
                : Math.random() * (maxLight - minLight) + minLight;

            const [r, g, b] = hslToRgb(hue, saturation, lightness);

            posArr[idx * 2] = x;
            posArr[idx * 2 + 1] = height;
            heightArr[idx] = h;
            widthArr[idx] = w;
            swaySpeedArr[idx] = swaySpeed;
            offsetArr[idx] = offset;
            maxSwayArr[idx] = maxSway;
            curveArr[idx] = curve;
            colorArr[idx * 3] = r;
            colorArr[idx * 3 + 1] = g;
            colorArr[idx * 3 + 2] = b;
            idx++;
        }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, posArr, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, heightBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, heightArr, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, widthBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, widthArr, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, swaySpeedBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, swaySpeedArr, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, offsetBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, offsetArr, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, maxSwayBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, maxSwayArr, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, curveBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, curveArr, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colorArr, gl.STATIC_DRAW);
}

function resize() {
    width = canvas.width = canvas.offsetWidth;
    height = canvas.height = canvas.offsetHeight;
    gl.viewport(0, 0, width, height);
    buildBlades();
}

function animate() {
    time += 1;
    gl.clearColor(creamColor[0], creamColor[1], creamColor[2], 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform2f(u_resolution, width, height);
    gl.uniform1f(u_time, time);

    gl.bindVertexArray(vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, vertexCount, bladeCount);

    requestAnimationFrame(animate);
}

window.addEventListener('resize', resize);

resize();
animate();

function generateJitteredPoints(count, width, height, paddingRatio = 0.2) {
    const points = [];

    // Calculate optimal grid layout (columns x rows) for the count
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);

    const cellWidth = width / cols;
    const cellHeight = height / rows;

    for (let i = 0; i < count; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);

        // Calculate top-left corner of the current grid cell
        const cellX = col * cellWidth;
        const cellY = row * cellHeight;

        // Apply random offset within the cell (paddingRatio keeps points away from borders)
        const x = cellX + (paddingRatio + Math.random() * (1 - 2 * paddingRatio)) * cellWidth;
        const y = cellY + (paddingRatio + Math.random() * (1 - 2 * paddingRatio)) * cellHeight;

        points.push({
            x: Number(x.toFixed(2)),
            y: Number(y.toFixed(2))
        });
    }

    return points;
}

function generateRandomPositionImages() {
    const images = ['/resources/flowerBackground.png'];

    // Calculate the number of images according to the screen size
    // const numberOfImages = Math.floor(Math.sqrt(width * height) / 50);
    // console.log(numberOfImages);
    positions = [
        { x: -50, y: 0 },
        { x: -45, y: 380 },
        { x: 200, y: 180 },
        { x: 500, y: -100 },
        { x: 480, y: 400 },
        { x: 1000, y: -50 },
        { x: 1700, y: -100 },
        { x: 1780, y: 400 },
        { x: 1500, y: 200 },
        { x: 1200, y: 400 }
    ];
    const numberOfImages = positions.length;
    imageSize = 250;
    myPCWidth = 1920;
    myPCHeight = 1080;
    windowWidth = window.innerWidth;
    windowHeight = window.innerHeight;
    for (let i = 0; i < positions.length; i++) {
        positions[i].x = positions[i].x * (myPCWidth / windowWidth)
        positions[i].y = positions[i].y * (myPCHeight / windowHeight)
    }

    const container = document.querySelector('.ramdom-position-images');
    for (let i = 0; i < numberOfImages; i++) {
        const image = new Image();
        image.src = images[Math.floor(Math.random() * images.length)];
        image.style.position = 'absolute';
        image.style.left = positions[i].x + 'px';
        image.style.top = positions[i].y + 'px';
        image.style.width = imageSize + 'px';
        image.style.height = imageSize + 'px';
        image.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
        container.appendChild(image);
        console.log(image);
    }
}

generateRandomPositionImages();