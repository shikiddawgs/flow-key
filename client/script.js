// --- CSInterface & Node.js Initialization ---
let csInterface;
let isCEP = false;
let fs = null;
let path = null;
try {
    csInterface = new CSInterface();
    isCEP = (typeof window.__adobe_cep__ !== "undefined");
    if (isCEP && typeof require !== "undefined") {
        fs = require('fs');
        path = require('path');
    }
    
    // Auto-reload the JSX host script when the panel is reloaded
    if (isCEP) {
        var extPath = csInterface.getSystemPath(SystemPath.EXTENSION);
        var hostPath = extPath + '/host/index.jsx';
        csInterface.evalScript('$.evalFile("' + hostPath + '")');
    }
} catch (e) {
    console.warn("Not running in CEP environment.");
}

if (!isCEP) {
    console.log("Mock Mode Active: Running in standard browser.");
}

// Strip any native tooltip attributes from bottom navbar & dock
(function cleanDockTooltips() {
    function strip() {
        const dock = document.querySelector('.dock-container');
        if (dock) {
            dock.querySelectorAll('*').forEach(el => {
                el.removeAttribute('title');
                el.removeAttribute('aria-label');
            });
        }
    }
    strip();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', strip);
    }
})();

// --- Canvas & Bezier Logic ---
const canvas = document.getElementById('bezierCanvas');
const ctx = canvas.getContext('2d');
const coordDisplay = document.getElementById('coordinateDisplay');

// Dynamic sizing — padding is a ratio of canvas size
const PADDING_RATIO = 20 / 280;

function getCanvasDimensions() {
    const w = canvas.width;
    const h = canvas.height;
    const padding = Math.round(Math.min(w, h) * PADDING_RATIO);
    return { width: w, height: h, padding, drawWidth: w - padding * 2, drawHeight: h - padding * 2 };
}

// Resize canvas to match its displayed CSS size (keeps rendering crisp)
function resizeCanvas() {
    // Resize Bezier Canvas
    const container = canvas.parentElement;
    if (container) {
        const rect = container.getBoundingClientRect();
        const size = Math.max(Math.floor(Math.min(rect.width, rect.height)), 60);
        if (canvas.width !== size || canvas.height !== size) {
            canvas.width = size;
            canvas.height = size;
            render();
        }
    }

    // Resize Speed Canvas
    const speedCanvas = document.getElementById('speedCanvas');
    if (speedCanvas) {
        const speedContainer = speedCanvas.parentElement;
        if (speedContainer) {
            const speedRect = speedContainer.getBoundingClientRect();
            const speedSize = Math.max(Math.floor(Math.min(speedRect.width, speedRect.height)), 60);
            if (speedCanvas.width !== speedSize || speedCanvas.height !== speedSize) {
                speedCanvas.width = speedSize;
                speedCanvas.height = speedSize;
                if (typeof renderSpeed === 'function') renderSpeed();
            }
        }
    }
}

// Global UI scaling for responsiveness
function handleUIScaling() {
    const appContainer = document.querySelector('.container');
    if (!appContainer) return;
    const w = window.innerWidth;
    if (w < 240) {
        appContainer.style.zoom = w / 240;
    } else {
        appContainer.style.zoom = 1;
    }
}
window.addEventListener('resize', handleUIScaling);
handleUIScaling();



// The anchor points are fixed
const p0 = { x: 0, y: 0 };
const p3 = { x: 1, y: 1 };

// The control points (user modifiable)
// Defaults to Ease In Out
let p1 = { x: 0.42, y: 0.0 };
let p2 = { x: 0.58, y: 1.0 };

try {
    const savedCurve = localStorage.getItem('flowLastCurve');
    if (savedCurve) {
        const parsed = JSON.parse(savedCurve);
        if (parsed && typeof parsed.p1x === 'number') {
            p1.x = parsed.p1x; p1.y = parsed.p1y;
            p2.x = parsed.p2x; p2.y = parsed.p2y;
        }
    }
} catch (e) {}

function saveCurrentCurve() {
    try {
        localStorage.setItem('flowLastCurve', JSON.stringify({
            p1x: p1.x, p1y: p1.y,
            p2x: p2.x, p2y: p2.y
        }));
    } catch (e) {}
}

// Dragging state
let activeHandle = null;
let animationId = null;

// Target state untuk tracking posisi akhir (mencegah shrink saat animasi spam)
let targetStateP1 = { x: p1.x, y: p1.y };
let targetStateP2 = { x: p2.x, y: p2.y };

// Bounce effect untuk control point handles + kurva
let handleBounceScale = 1.0;
let curveBounceScale = 1.0;
let bounceAnimId = null;

function bounceHandles() {
    if (bounceAnimId) cancelAnimationFrame(bounceAnimId);

    const bounceDuration = 400; // ms
    const bounceStart = performance.now();

    function bounceStep(now) {
        const elapsed = now - bounceStart;
        const progress = Math.min(elapsed / bounceDuration, 1);

        // Spring bounce: overshoot then settle back to 1.0
        const decay = Math.exp(-4 * progress);
        const oscillation = Math.sin(progress * Math.PI * 2.5);

        // Handle dots bounce (lebih besar)
        handleBounceScale = 1.0 + 0.45 * decay * oscillation;

        // Kurva line bounce (lebih subtle, ketebalan garis mantul)
        curveBounceScale = 1.0 + 0.35 * decay * oscillation;

        render();

        if (progress < 1) {
            bounceAnimId = requestAnimationFrame(bounceStep);
        } else {
            handleBounceScale = 1.0;
            curveBounceScale = 1.0;
            bounceAnimId = null;
            render();
        }
    }

    bounceAnimId = requestAnimationFrame(bounceStep);
}

function hexToRgbValues(hex) {
    if (!hex) return '255, 42, 117';
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    if (isNaN(num)) return '255, 42, 117';
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `${r}, ${g}, ${b}`;
}

function hexToRgba(hex, alpha = 1) {
    return `rgba(${hexToRgbValues(hex)}, ${alpha})`;
}

let accentColor = '#FF2A75';
try {
    const s = JSON.parse(localStorage.getItem('flowSettings') || '{}');
    if (s && s.accentColor) {
        accentColor = s.accentColor;
    } else {
        const savedColor = localStorage.getItem('flowAccentColor');
        if (savedColor) accentColor = savedColor;
    }
} catch (e) { }

document.documentElement.style.setProperty('--dynamic-accent', accentColor);
document.documentElement.style.setProperty('--accent', accentColor);
document.documentElement.style.setProperty('--dynamic-accent-rgb', hexToRgbValues(accentColor));

function animateCurveTo(targetP1, targetP2) {
    if (animationId) cancelAnimationFrame(animationId);
    if (bounceAnimId) cancelAnimationFrame(bounceAnimId);
    handleBounceScale = 1.0;
    curveBounceScale = 1.0;

    targetStateP1 = { x: targetP1.x, y: targetP1.y };
    targetStateP2 = { x: targetP2.x, y: targetP2.y };

    const startP1 = { x: p1.x, y: p1.y };
    const startP2 = { x: p2.x, y: p2.y };

    const duration = 450; // ms

    // Gentle easeOutBack — sedikit overshoot biar mantul halus di titik akhir
    const easeOutBack = (t) => {
        const c1 = 0.5; // Subtle bounce
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    };

    let startTime = null;

    function step(currentTime) {
        if (!startTime) {
            startTime = currentTime; // fix first frame lag spike
            animationId = requestAnimationFrame(step);
            return;
        }

        const elapsed = currentTime - startTime;
        let progress = Math.min(elapsed / duration, 1);

        const t = easeOutBack(progress);

        p1.x = startP1.x + (targetStateP1.x - startP1.x) * t;
        p1.y = startP1.y + (targetStateP1.y - startP1.y) * t;
        p2.x = startP2.x + (targetStateP2.x - startP2.x) * t;
        p2.y = startP2.y + (targetStateP2.y - startP2.y) * t;

        render();

        if (progress < 1) {
            animationId = requestAnimationFrame(step);
        } else {
            p1.x = targetStateP1.x;
            p1.y = targetStateP1.y;
            p2.x = targetStateP2.x;
            p2.y = targetStateP2.y;
            animationId = null;
            bounceHandles();
            render();
            saveCurrentCurve();
        }
    }

    animationId = requestAnimationFrame(step);
}

function render() {
    const { width, height, padding, drawWidth, drawHeight } = getCanvasDimensions();
    ctx.clearRect(0, 0, width, height);

    // Draw grid (subtle accent tint like in screenshot)
    ctx.strokeStyle = hexToRgba(accentColor, 0.22);
    ctx.lineWidth = 1;
    ctx.beginPath();

    // 4x4 Grid
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
        // Vertical
        const x = padding + (drawWidth / steps) * i;
        ctx.moveTo(x, padding);
        ctx.lineTo(x, height - padding);

        // Horizontal
        const y = padding + (drawHeight / steps) * i;
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
    }
    ctx.stroke();

    // Map normalized coordinates to canvas coordinates
    const toCanvasX = (nx) => padding + nx * drawWidth;
    const toCanvasY = (ny) => height - padding - ny * drawHeight;

    const cP0 = { x: toCanvasX(p0.x), y: toCanvasY(p0.y) };
    const cP1 = { x: toCanvasX(p1.x), y: toCanvasY(p1.y) };
    const cP2 = { x: toCanvasX(p2.x), y: toCanvasY(p2.y) };
    const cP3 = { x: toCanvasX(p3.x), y: toCanvasY(p3.y) };

    // Diagonal dashed line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cP0.x, cP0.y);
    ctx.lineTo(cP3.x, cP3.y);
    ctx.stroke();
    ctx.setLineDash([]); // reset

    // Scale-aware line widths
    const scale = Math.min(width, height) / 280;

    // Draw handles (dynamic color)
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = Math.max(1.5, 2 * scale);
    ctx.beginPath();
    ctx.moveTo(cP0.x, cP0.y);
    ctx.lineTo(cP1.x, cP1.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cP3.x, cP3.y);
    ctx.lineTo(cP2.x, cP2.y);
    ctx.stroke();

    // Draw bezier curve (thick crisp white with soft glow)
    const baseCurveWidth = Math.max(3, 6 * scale);
    ctx.save();
    ctx.shadowColor = hexToRgba(accentColor, 0.6);
    ctx.shadowBlur = 8;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = baseCurveWidth * curveBounceScale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cP0.x, cP0.y);
    ctx.bezierCurveTo(cP1.x, cP1.y, cP2.x, cP2.y, cP3.x, cP3.y);
    ctx.stroke();
    ctx.restore();

    // Draw control point handles (pink glowing circles with white rim)
    const baseHandleRadius = Math.max(4, 6 * scale);
    const handleRadius = baseHandleRadius * handleBounceScale;

    ctx.save();
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 10;
    ctx.fillStyle = accentColor;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, 2 * scale);

    ctx.beginPath();
    ctx.arc(cP1.x, cP1.y, handleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cP2.x, cP2.y, handleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    updateCoordinateDisplay();
}

function updateCoordinateDisplay() {
    coordDisplay.innerText = `${p1.x.toFixed(2)}, ${p1.y.toFixed(2)}, ${p2.x.toFixed(2)}, ${p2.y.toFixed(2)}`;
}

// --- Mouse Interaction ---
let dragOffset = { x: 0, y: 0 };

function getMousePos(evt) {
    const rect = canvas.getBoundingClientRect();
    // Scale from CSS display size to internal canvas resolution
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (evt.clientX - rect.left) * scaleX,
        y: (evt.clientY - rect.top) * scaleY
    };
}

function getDist(pA, pB) {
    return Math.sqrt(Math.pow(pA.x - pB.x, 2) + Math.pow(pA.y - pB.y, 2));
}

canvas.addEventListener('pointerdown', (e) => {
    // 1. Clear active bounces
    if (bounceAnimId) {
        cancelAnimationFrame(bounceAnimId);
        bounceAnimId = null;
    }
    handleBounceScale = 1.0;
    curveBounceScale = 1.0;

    const mousePos = getMousePos(e);
    const { height, padding, drawWidth, drawHeight } = getCanvasDimensions();

    // 2. Map current p1/p2 to canvas space for distance check
    const toCanvasX = (nx) => padding + nx * drawWidth;
    const toCanvasY = (ny) => height - padding - ny * drawHeight;

    const cP1 = { x: toCanvasX(p1.x), y: toCanvasY(p1.y) };
    const cP2 = { x: toCanvasX(p2.x), y: toCanvasY(p2.y) };

    const dist1 = getDist(mousePos, cP1);
    const dist2 = getDist(mousePos, cP2);

    // Scale hit area proportionally
    const hitArea = Math.max(20, 30 * (Math.min(canvas.width, canvas.height) / 280));

    let hit = 0;
    if (dist1 < hitArea) hit = 1;
    else if (dist2 < hitArea) hit = 2;

    // 3. If there was a running animation, cancel it and snap to its final target state
    // so handles don't get stuck midway if you rapidly click and drag.
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
        p1.x = targetStateP1.x;
        p1.y = targetStateP1.y;
        p2.x = targetStateP2.x;
        p2.y = targetStateP2.y;
    }

    // 4. Calculate mouse normalized position
    let nx = (mousePos.x - padding) / drawWidth;
    let ny = (height - padding - mousePos.y) / drawHeight;

    if (hit === 1) {
        activeHandle = 1;
        dragOffset.x = p1.x - nx;
        dragOffset.y = p1.y - ny;
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
    } else if (hit === 2) {
        activeHandle = 2;
        dragOffset.x = p2.x - nx;
        dragOffset.y = p2.y - ny;
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
    }

    render();
});

canvas.addEventListener('pointermove', (e) => {
    if (!activeHandle) return;

    const mousePos = getMousePos(e);
    const { height, padding, drawWidth, drawHeight } = getCanvasDimensions();

    // Map mouse position back to normalized coordinates and apply drag offset
    let nx = (mousePos.x - padding) / drawWidth;
    let ny = (height - padding - mousePos.y) / drawHeight;

    nx += dragOffset.x;
    ny += dragOffset.y;

    // Clamp X between 0 and 1
    nx = Math.max(0, Math.min(1, nx));
    // Optionally clamp Y, or let it overshoot for anticipation/overshoot effects
    // ny = Math.max(-0.5, Math.min(1.5, ny));

    if (activeHandle === 1) {
        p1.x = nx;
        p1.y = ny;
        targetStateP1 = { x: nx, y: ny };
    } else if (activeHandle === 2) {
        p2.x = nx;
        p2.y = ny;
        targetStateP2 = { x: nx, y: ny };
    }

    render();
});

canvas.addEventListener('pointerup', (e) => {
    if (activeHandle) saveCurrentCurve();
    activeHandle = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { }
});

canvas.addEventListener('pointercancel', (e) => {
    if (activeHandle) saveCurrentCurve();
    activeHandle = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { }
});

// Speed Canvas Logic Removed

// --- Actions & API Calls ---
document.getElementById('applyBtn').addEventListener('click', () => {
    // Determine active mode
    const activeBtn = document.querySelector('.tab-btn.active');
    let currentMode = 'value';
    if (activeBtn) {
        const target = activeBtn.getAttribute('data-target');
        if (target) currentMode = target.replace('view-', '');
    }

    if (!isCEP) {
        console.log(`[MOCK MODE] Apply ${currentMode}`);
        return;
    }
    if (!csInterface) return;

    if (currentMode === 'speed') {
        // Mode ini di-disabled seperti yang diminta
        return;
    } else {
        applyBezier();
    }
});

function applyBezier() {
    let script = `applyFlowToSelectedKeys(${p1.x}, ${p1.y}, ${p2.x}, ${p2.y})`;
    csInterface.evalScript(script, (result) => {
        if (result === "false" || result === "error" || result === "undefined" || result === "EvalScript error.") {
            console.error("Failed to apply bezier easing. Result:", result);
            alert("APPLY ERROR: " + result);
        }
    });
}

document.getElementById('reverseBtn').addEventListener('click', () => {
    // Reverse/Swap In and Out using targetState to prevent shrinking during animation spam
    const newP1 = { x: parseFloat((1 - targetStateP2.x).toFixed(2)), y: parseFloat((1 - targetStateP2.y).toFixed(2)) };
    const newP2 = { x: parseFloat((1 - targetStateP1.x).toFixed(2)), y: parseFloat((1 - targetStateP1.y).toFixed(2)) };
    animateCurveTo(newP1, newP2);
});

document.getElementById('getBtn').addEventListener('click', () => {
    if (!isCEP) {
        console.log("[MOCK MODE] Get Curve clicked. Simulating AE data retrieval.");
        // Simulate receiving a generic ease curve
        const simP1 = { x: 0.25, y: 0.1 };
        const simP2 = { x: 0.25, y: 1.0 };
        animateCurveTo(simP1, simP2);
        return;
    }
    if (!csInterface) return;

    // Call the JSX function to get selected keyframe ease
    const script = `getFlowFromSelectedKeys()`;

    csInterface.evalScript(script, (result) => {
        if (result && result !== "error" && result !== "undefined") {
            const parts = result.split(",");
            if (parts.length === 4) {
                const targetP1 = { x: parseFloat(parts[0]), y: parseFloat(parts[1]) };
                const targetP2 = { x: parseFloat(parts[2]), y: parseFloat(parts[3]) };
                animateCurveTo(targetP1, targetP2);
            }
        } else {
            const toast = document.getElementById('toast');
            toast.innerText = "Select a keyframe first!";
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 2000);
        }
    });
});

// --- Save Modal Logic ---
const modal = document.getElementById('promptModal');
const presetNameInput = document.getElementById('presetNameInput');
const cancelSaveBtn = document.getElementById('cancelSaveBtn');
const confirmSaveBtn = document.getElementById('confirmSaveBtn');

cancelSaveBtn.addEventListener('click', () => {
    modal.classList.remove('show');
});

confirmSaveBtn.addEventListener('click', () => {
    const name = presetNameInput.value.trim();
    if (!name) {
        presetNameInput.focus();
        return;
    }

    modal.classList.remove('show');

    // Get current mode to tag the preset
    const activeBtn = document.querySelector('.tab-btn.active');
    let currentMode = 'value';
    if (activeBtn) {
        const target = activeBtn.getAttribute('data-target');
        if (target) currentMode = target.replace('view-', '');
    }

    let presetValue = [];
    if (currentMode === 'speed') {
        presetValue = [
            parseFloat(sp1.speed.toFixed(2)),
            parseFloat(sp1.influence.toFixed(2)),
            parseFloat(sp2.speed.toFixed(2)),
            parseFloat(sp2.influence.toFixed(2))
        ];
    } else {
        presetValue = [
            parseFloat(p1.x.toFixed(2)),
            parseFloat(p1.y.toFixed(2)),
            parseFloat(p2.x.toFixed(2)),
            parseFloat(p2.y.toFixed(2))
        ];
    }

    const newPreset = {
        name: name,
        type: currentMode,
        value: presetValue
    };

    let customPresets = [];
    try {
        const stored = localStorage.getItem('flowCustomPresets');
        if (stored) customPresets = JSON.parse(stored);
    } catch (e) { }

    customPresets.push(newPreset);
    localStorage.setItem('flowCustomPresets', JSON.stringify(customPresets));

    // Remove from deleted list if it was previously deleted
    try {
        let deleted = [];
        const dStored = localStorage.getItem('flowDeletedPresets');
        if (dStored) deleted = JSON.parse(dStored);
        if (deleted.includes(name)) {
            deleted = deleted.filter(n => n !== name);
            localStorage.setItem('flowDeletedPresets', JSON.stringify(deleted));
        }
    } catch (e) { }

    // Show toast
    const toast = document.getElementById('toast');
    toast.innerText = `Saved: ${name}`;
    toast.classList.add('show');

    // Hide toast after 2 seconds
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);

    // Refresh grid
    loadPresets();
});

// --- Delete Modal Logic ---
const deleteModal = document.getElementById('deleteModal');
const deleteModalText = document.getElementById('deleteModalText');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
let presetToDelete = null;

cancelDeleteBtn.addEventListener('click', () => {
    deleteModal.classList.remove('show');
    presetToDelete = null;
});

confirmDeleteBtn.addEventListener('click', () => {
    if (presetToDelete) {
        const targetName = presetToDelete.name;

        // 1. Remove from flowCustomPresets if present
        try {
            const stored = localStorage.getItem('flowCustomPresets');
            if (stored) {
                let customPresets = JSON.parse(stored);
                if (Array.isArray(customPresets)) {
                    customPresets = customPresets.filter(p => p.name !== targetName);
                    localStorage.setItem('flowCustomPresets', JSON.stringify(customPresets));
                }
            }
        } catch (err) { }

        // 2. Add to flowDeletedPresets so default and custom presets stay deleted
        try {
            let deleted = [];
            const dStored = localStorage.getItem('flowDeletedPresets');
            if (dStored) deleted = JSON.parse(dStored);
            if (!deleted.includes(targetName)) {
                deleted.push(targetName);
                localStorage.setItem('flowDeletedPresets', JSON.stringify(deleted));
            }
        } catch (err) { }

        // Show toast
        const toast = document.getElementById('toast');
        if (toast) {
            toast.innerText = `Deleted: ${targetName}`;
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
            }, 2000);
        }

        loadPresets();
    }
    deleteModal.classList.remove('show');
    presetToDelete = null;
});

// --- Default Presets (Full collection matching screenshot) ---
const defaultPresets = [
    { "name": "Quart", "value": [0.77, 0, 0.175, 1] },
    { "name": "Fast in", "value": [0.1, 0.9, 0.2, 1] },
    { "name": "Fast Out", "value": [0.8, 0, 0.9, 0.1] },
    { "name": "I", "value": [0.42, 0, 1, 1] },
    { "name": "O", "value": [0, 0, 0.58, 1] },
    { "name": "OF", "value": [0, 0, 0.2, 1] },
    { "name": "IF", "value": [0.8, 0, 1, 1] },
    { "name": "50 50", "value": [0.5, 0, 0.5, 1] },
    { "name": "fast i", "value": [0.05, 0.7, 0.1, 1] },
    { "name": "fast o", "value": [0, 0, 0.3, 1] },
    { "name": "os", "value": [0.2, 0, 0.4, 1] },
    { "name": "cubic", "value": [0.65, 0.05, 0.35, 1] },
    { "name": "is", "value": [0.4, 0.1, 0.7, 1] },
    { "name": "i fek", "value": [0.6, 0.05, 0.8, 0.95] },
    { "name": "o fek", "value": [0.05, 0.6, 0.95, 0.8] },
    { "name": "iFF", "value": [0.9, 0.05, 0.95, 0.5] },
    { "name": "OFF", "value": [0.05, 0.5, 0.1, 0.95] },
    { "name": "Turbo", "value": [0.15, 0.85, 0.35, 1.2] },
    { "name": "E Turbo", "value": [0.2, 1.1, 0.4, 1] },
    { "name": "io", "value": [0.42, 0, 0.58, 1] },
    { "name": "Snappy", "value": [0.1, 1, 0.1, 1] },
    { "name": "Smooth", "value": [0.6, 0.1, 0.2, 1] },
    { "name": "Back Out", "value": [0.175, 0.885, 0.32, 1.275] },
    { "name": "Linear", "value": [0, 0, 1, 1] }
];

// --- Presets Loading ---
function drawMiniCurve(canvasEl, pt1, pt2) {
    const ctx = canvasEl.getContext('2d');
    const w = canvasEl.width;
    const h = canvasEl.height;

    ctx.clearRect(0, 0, w, h);

    const padding = 6;
    const drawW = w - padding * 2;
    const drawH = h - padding * 2;

    // Convert normalized points
    const p0 = { x: padding, y: h - padding };
    const p1 = { x: padding + pt1.x * drawW, y: (h - padding) - pt1.y * drawH };
    const p2 = { x: padding + pt2.x * drawW, y: (h - padding) - pt2.y * drawH };
    const p3 = { x: w - padding, y: padding };

    // Handles line
    ctx.strokeStyle = accentColor;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(p3.x, p3.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    // Bezier curve (crisp white)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
    ctx.stroke();

    // Control point handles (accent glowing circle)
    ctx.fillStyle = accentColor;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    ctx.arc(p1.x, p1.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(p2.x, p2.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
}

async function loadPresets() {
    try {
        let basePresets = [];

        // 1. Try loading from presets.json or use defaultPresets
        try {
            if (isCEP && fs && path) {
                const extPath = csInterface.getSystemPath(SystemPath.EXTENSION);
                const presetsFile = path.join(extPath, 'data', 'presets.json');
                if (fs.existsSync(presetsFile)) {
                    basePresets = JSON.parse(fs.readFileSync(presetsFile, 'utf8'));
                }
            }
        } catch (e) { }

        if (!basePresets || basePresets.length === 0) {
            try {
                const res = await fetch('../data/presets.json');
                if (res.ok) basePresets = await res.json();
            } catch (e) { }
        }

        if (!basePresets || basePresets.length === 0) {
            basePresets = [...defaultPresets];
        }

        // 2. Append custom presets from localStorage
        let customPresets = [];
        try {
            const stored = localStorage.getItem('flowCustomPresets');
            if (stored) {
                const custom = JSON.parse(stored);
                if (Array.isArray(custom)) {
                    customPresets = custom;
                }
            }
        } catch (e) { }

        // Combine base presets and custom presets
        let presets = basePresets.concat(customPresets);

        // 3. Filter out any presets recorded in flowDeletedPresets
        try {
            const dStored = localStorage.getItem('flowDeletedPresets');
            if (dStored) {
                const deletedNames = JSON.parse(dStored);
                if (Array.isArray(deletedNames) && deletedNames.length > 0) {
                    presets = presets.filter(p => !deletedNames.includes(p.name));
                }
            }
        } catch (e) { }

        const grid = document.getElementById('presetsGrid');
        if (!grid) return;
        grid.innerHTML = ''; // clear before repopulating

        presets.forEach((preset, index) => {
            const item = document.createElement('div');
            item.className = 'preset-item';

            const card = document.createElement('div');
            card.className = 'preset-card';

            // Show delete button for ALL presets (default and custom)
            const delBtn = document.createElement('button');
            delBtn.className = 'delete-btn';
            delBtn.innerHTML = '&times;';
            delBtn.setAttribute('aria-label', `Delete "${preset.name}"`);

            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                presetToDelete = preset;
                deleteModalText.innerText = `Delete preset "${preset.name}"?`;
                deleteModal.classList.add('show');
            });
            card.appendChild(delBtn);

            const pt1 = { x: preset.value[0], y: preset.value[1] };
            const pt2 = { x: preset.value[2], y: preset.value[3] };
            const thumb = document.createElement('canvas');
            thumb.width = 60;
            thumb.height = 60;
            drawMiniCurve(thumb, pt1, pt2);

            const label = document.createElement('div');
            label.className = 'preset-label';
            label.innerText = preset.name;
            label.setAttribute('aria-label', preset.name);

            card.appendChild(thumb);
            item.appendChild(card);
            item.appendChild(label);

            item.addEventListener('click', () => {
                document.querySelectorAll('.preset-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');

                const targetMode = preset.type || 'value';
                if (typeof window.switchMode === 'function') {
                    window.switchMode(targetMode);
                }
                
                if (targetMode === 'value' || targetMode === 'bezier') {
                    setTimeout(() => animateCurveTo(pt1, pt2), 40);
                }
            });

            // JS-driven stagger: set inline animation-delay for cascading top-to-bottom
            item.classList.add('pop-animate');
            item.style.animationDelay = `${(index + 1) * 0.04}s`;

            grid.appendChild(item);
        });
    } catch (e) {
        console.error("Failed to load presets", e);
    }
}

// Helper: re-trigger stagger animation on preset items (called on tab switch)
function restaggerPresets() {
    const grid = document.getElementById('presetsGrid');
    if (!grid) return;
    const items = grid.querySelectorAll('.preset-item');
    items.forEach((item, i) => {
        item.classList.remove('pop-animate');
        item.style.animationDelay = '';
    });
    // Force reflow
    void grid.offsetWidth;
    items.forEach((item, i) => {
        item.classList.add('pop-animate');
        item.style.animationDelay = `${(i + 1) * 0.04}s`;
    });
}

// Init
resizeCanvas();
render();
loadPresets();

// Restore default presets button handler
const restoreDefaultPresetsBtn = document.getElementById('restoreDefaultPresetsBtn');
if (restoreDefaultPresetsBtn) {
    restoreDefaultPresetsBtn.addEventListener('click', () => {
        try {
            localStorage.removeItem('flowDeletedPresets');
            loadPresets();
            const toast = document.getElementById('toast');
            if (toast) {
                toast.innerText = 'Default presets restored!';
                toast.classList.add('show');
                setTimeout(() => {
                    toast.classList.remove('show');
                }, 2000);
            }
        } catch (e) { }
    });
}

// Observe the canvas container for size changes (must be after render is ready)
const canvasContainer = document.querySelector('.canvas-container');
const resizeObserver = new ResizeObserver(() => resizeCanvas());
resizeObserver.observe(canvasContainer);

// --- Background Logic ---
const bgBtn = document.getElementById('bgBtn');
const bgInput = document.getElementById('bgInput');
const canvasBg = document.getElementById('canvasBg');
const appBgBtn = document.getElementById('appBgBtn');
const appBgInput = document.getElementById('appBgInput');
const appContainer = document.querySelector('.app-container');

let userDataDir = "";
if (isCEP && fs && path) {
    try {
        const extPath = csInterface.getSystemPath(SystemPath.EXTENSION);
        userDataDir = path.join(extPath, 'userData');
        if (!fs.existsSync(userDataDir)) {
            fs.mkdirSync(userDataDir);
        }
    } catch(e) { }
}

function saveLongData(key, dataUrl) {
    if (fs && path && userDataDir) {
        try { fs.writeFileSync(path.join(userDataDir, key + '.txt'), dataUrl, 'utf8'); return; } catch(e) {}
    }
    try { localStorage.setItem(key, dataUrl); } catch(err) {
        console.warn("Storage full.");
        const toast = document.getElementById('toast');
        if (toast) { toast.innerText = "Error: File too large to save! Use < 3MB"; toast.style.backgroundColor = "#ff4d4f"; toast.classList.add('show'); setTimeout(() => { toast.classList.remove('show'); toast.style.backgroundColor = "var(--dynamic-accent)"; }, 3000); }
    }
}

function loadLongData(key) {
    if (fs && path && userDataDir) {
        try { const fp = path.join(userDataDir, key + '.txt'); if (fs.existsSync(fp)) return fs.readFileSync(fp, 'utf8'); } catch(e) {}
    }
    return localStorage.getItem(key);
}

function removeLongData(key) {
    if (fs && path && userDataDir) {
        try { const fp = path.join(userDataDir, key + '.txt'); if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch(e) {}
    }
    try { localStorage.removeItem(key); } catch(e) {}
}

try {
    const storedBg = loadLongData('flowCustomBg');
    if (storedBg && canvasBg) {
        canvasBg.style.backgroundImage = `linear-gradient(rgba(30, 30, 30, 0.3), rgba(30, 30, 30, 0.3)), url(${storedBg})`;
        canvasBg.style.opacity = '0.5';
        const cCont = document.querySelector('.canvas-container');
        if (cCont) { cCont.style.backdropFilter = 'blur(16px)'; cCont.style.webkitBackdropFilter = 'blur(16px)'; }
    }
    const storedAppBg = loadLongData('flowAppBg');
    if (storedAppBg) {
        document.body.style.backgroundImage = `linear-gradient(rgba(26, 26, 28, 0.70), rgba(26, 26, 28, 0.70)), url(${storedAppBg})`;
    }
} catch (e) { }

if (appBgBtn && appBgInput) {
    appBgBtn.addEventListener('click', () => {
        appBgInput.click();
    });
    appBgInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (evt) {
            const dataUrl = evt.target.result;
            document.body.style.backgroundImage = `linear-gradient(rgba(26, 26, 28, 0.75), rgba(26, 26, 28, 0.75)), url(${dataUrl})`;
            saveLongData('flowAppBg', dataUrl);
        };
        reader.readAsDataURL(file);
    });
}

if (bgBtn && bgInput) {
    bgBtn.addEventListener('click', () => {
        bgInput.click();
    });

    bgInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target.result;
            canvasBg.style.backgroundImage = `linear-gradient(rgba(30, 30, 30, 0.3), rgba(30, 30, 30, 0.3)), url(${dataUrl})`;
            canvasBg.style.opacity = '0.5';
            const cCont = document.querySelector('.canvas-container');
            if (cCont) { cCont.style.backdropFilter = 'blur(16px)'; cCont.style.webkitBackdropFilter = 'blur(16px)'; }
            saveLongData('flowCustomBg', dataUrl);
        };
        reader.readAsDataURL(file);
    });
}

function setGlobalAccentColor(newColor) {
    if (!newColor) return;
    accentColor = newColor;
    try {
        localStorage.setItem('flowAccentColor', accentColor);
        const s = JSON.parse(localStorage.getItem('flowSettings') || '{}');
        s.accentColor = accentColor;
        localStorage.setItem('flowSettings', JSON.stringify(s));
    } catch (e) { }
    document.documentElement.style.setProperty('--dynamic-accent', accentColor);
    document.documentElement.style.setProperty('--accent', accentColor);
    document.documentElement.style.setProperty('--dynamic-accent-rgb', hexToRgbValues(accentColor));
    if (typeof render === 'function') render();
    if (typeof loadPresets === 'function') loadPresets();
}



const mainBgBtn = document.getElementById('mainBgBtn');
const bgDropdown = document.getElementById('bgDropdown');
if (mainBgBtn && bgDropdown) {
    mainBgBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelector('.bg-dropdown-container').classList.toggle('show');
    });
    document.addEventListener('click', () => {
        const container = document.querySelector('.bg-dropdown-container');
        if (container) container.classList.remove('show');
    });
}

const saveBtn = document.getElementById('saveBtn');
if (saveBtn) {
    saveBtn.addEventListener('click', () => {
        const promptModal = document.getElementById('promptModal');
        if (promptModal) promptModal.classList.add('show');
        const saveModalValues = document.getElementById('saveModalValues');
        if (saveModalValues) {
            saveModalValues.textContent = `Graph values: ${p1.x.toFixed(2)}, ${p1.y.toFixed(2)}, ${p2.x.toFixed(2)}, ${p2.y.toFixed(2)}`;
        }
        const input = document.getElementById('presetNameInput');
        if (input) {
            input.value = '';
            input.focus();
        }
    });
}

const clearBgBtn = document.getElementById('clearBgBtn');
if (clearBgBtn) {
    clearBgBtn.addEventListener('click', () => {
        removeLongData('flowCustomBg');
        if (canvasBg) {
            canvasBg.style.backgroundImage = 'none';
            canvasBg.style.opacity = '0.5';
        }
        const cCont = document.querySelector('.canvas-container');
        if (cCont) { cCont.style.backdropFilter = 'none'; cCont.style.webkitBackdropFilter = 'none'; }

        const container = document.querySelector('.bg-dropdown-container');
        if (container) container.classList.remove('show');
    });
}

const clearAppBgBtn = document.getElementById('clearAppBgBtn');
if (clearAppBgBtn) {
    clearAppBgBtn.addEventListener('click', () => {
        removeLongData('flowAppBg');
        document.body.style.backgroundImage = 'none';
        saveLongData('flowAppBg', '');
    });
}

// --- Dev Tools / Context Menu & Flyout Menu ---
if (isCEP && csInterface) {
    // 1. Right-click Context Menu
    const menuXML = '<Menu><MenuItem Id="reload" Label="Reload Panel (Dev)"/></Menu>';
    csInterface.setContextMenu(menuXML, (menuId) => {
        if (menuId === "reload") {
            window.location.reload(true);
        }
    });

    // 2. Flyout Menu (Titik 3 di panel tab AE)
    const flyoutXML = '<Menu><MenuItem Id="reload_flyout" Label="Reload Panel (Dev)"/></Menu>';
    csInterface.setPanelFlyoutMenu(flyoutXML);
    csInterface.addEventListener("com.adobe.csxs.events.flyoutMenuClicked", (event) => {
        if (event.data.menuId === "reload_flyout") {
            window.location.reload(true);
        }
    });
}

// --- Sidebar Tab Switching Logic (single handler, no duplicates) ---
const tabBtns = document.querySelectorAll('.tab-btn');
const viewPanels = document.querySelectorAll('.view-panel');

window.switchMode = function(modeName) {
    const targetId = modeName.startsWith('view-') ? modeName : `view-${modeName}`;
    
    // Skip bounce animation if target panel is already active
    const targetPanel = document.getElementById(targetId);
    if (targetPanel && targetPanel.classList.contains('active')) {
        return;
    }
    
    // 1. Remove active + animation class from all buttons and panels
    tabBtns.forEach(b => b.classList.remove('active'));
    viewPanels.forEach(p => {
        p.classList.remove('active');
        p.classList.remove('tab-bounce-in');
    });
    
    // 2. Add active class to corresponding button
    const targetBtn = Array.from(tabBtns).find(b => b.getAttribute('data-target') === targetId);
    if (targetBtn) targetBtn.classList.add('active');
    
    // 3. Find target panel and activate with smooth bounce animation
    if (targetPanel) {
        targetPanel.classList.add('active');
        // Force DOM reflow to restart CSS animation cleanly
        void targetPanel.offsetWidth;
        targetPanel.classList.add('tab-bounce-in');
        
        if (targetId === 'value' || targetId === 'view-value') {
            setTimeout(() => {
                resizeCanvas();
                render();
            }, 50);
        }
    }
};

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        window.switchMode(btn.getAttribute('data-target'));
    });
});

// ==========================================
// BOUNCE MOTION MODULE LOGIC
// ==========================================
(() => {
    const sliderAmp   = document.getElementById('bounceSliderAmp');
    const sliderFreq  = document.getElementById('bounceSliderFreq');
    const sliderDecay = document.getElementById('bounceSliderDecay');
    const valAmp      = document.getElementById('bounceValAmp');
    const valFreq     = document.getElementById('bounceValFreq');
    const valDecay    = document.getElementById('bounceValDecay');
    const applyBtn    = document.getElementById('bounceApplyBtn');
    const removeBtn   = document.getElementById('bounceRemoveBtn');
    const presetBtns  = document.querySelectorAll('.bounce-preset-btn');
    const propTabs    = document.querySelectorAll('#bouncePropTabs .segment');

    let selectedProp = 'Scale';

    // --- Helpers ---
    const getAccentColor = () => {
        return getComputedStyle(document.documentElement).getPropertyValue('--dynamic-accent').trim() || '#FF2A75';
    };

    const updateBounceSlider = (slider, valEl, decimals) => {
        if (!slider) return;
        const val = parseFloat(slider.value);
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 1;
        const pct = ((val - min) / (max - min)) * 100;
        const accent = getAccentColor();
        slider.style.background = `linear-gradient(to right, ${accent} ${pct}%, rgba(255,255,255,0.1) ${pct}%)`;
        if (valEl) valEl.textContent = val.toFixed(decimals);
    };

    const updateAllBounceSliders = () => {
        updateBounceSlider(sliderAmp, valAmp, 2);
        updateBounceSlider(sliderFreq, valFreq, 1);
        updateBounceSlider(sliderDecay, valDecay, 1);
    };

    const setBounceValues = (amp, freq, decay) => {
        if (sliderAmp)   sliderAmp.value   = amp;
        if (sliderFreq)  sliderFreq.value  = freq;
        if (sliderDecay) sliderDecay.value  = decay;
        updateAllBounceSliders();
    };

    const callApplyBounce = (amp, freq, decay) => {
        const script = `applyBounceExpression("${selectedProp}", ${amp}, ${freq}, ${decay})`;
        if (isCEP && csInterface) {
            csInterface.evalScript(script, (result) => {
                if (result === 'error' || result === 'undefined' || result === 'EvalScript error.') {
                    console.error('Bounce apply failed:', result);
                }
            });
        } else {
            console.log('[MOCK MODE] ' + script);
        }
    };

    const callRemoveBounce = () => {
        const script = `removeBounceExpression("${selectedProp}")`;
        if (isCEP && csInterface) {
            csInterface.evalScript(script, (result) => {
                if (result === 'error' || result === 'undefined' || result === 'EvalScript error.') {
                    console.error('Bounce remove failed:', result);
                }
            });
        } else {
            console.log('[MOCK MODE] ' + script);
        }
    };

    // --- Preset Buttons ---
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Toggle active state
            presetBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Read preset values from data attributes
            const amp   = parseFloat(btn.dataset.amp);
            const freq  = parseFloat(btn.dataset.freq);
            const decay = parseFloat(btn.dataset.decay);

            // Update sliders and apply immediately
            setBounceValues(amp, freq, decay);
            callApplyBounce(amp, freq, decay);
        });
    });

    // --- Property Selector Tabs ---
    propTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            propTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            selectedProp = tab.dataset.prop;
        });
    });

    // --- Slider Events ---
    if (sliderAmp) sliderAmp.addEventListener('input', () => {
        updateBounceSlider(sliderAmp, valAmp, 2);
        presetBtns.forEach(b => b.classList.remove('active'));
    });
    if (sliderFreq) sliderFreq.addEventListener('input', () => {
        updateBounceSlider(sliderFreq, valFreq, 1);
        presetBtns.forEach(b => b.classList.remove('active'));
    });
    if (sliderDecay) sliderDecay.addEventListener('input', () => {
        updateBounceSlider(sliderDecay, valDecay, 1);
        presetBtns.forEach(b => b.classList.remove('active'));
    });

    // --- Apply Custom Button ---
    if (applyBtn) applyBtn.addEventListener('click', () => {
        const amp   = parseFloat(sliderAmp.value);
        const freq  = parseFloat(sliderFreq.value);
        const decay = parseFloat(sliderDecay.value);
        callApplyBounce(amp, freq, decay);
    });

    // --- Remove Bounce Button ---
    if (removeBtn) removeBtn.addEventListener('click', () => {
        callRemoveBounce();
    });

    // Init slider fills on load
    updateAllBounceSliders();
})();

// ==========================================
// SETTINGS UI LOGIC (Slider, Toggle, Storage)
// ==========================================
(() => {
    const root = document.documentElement;

    const toggleWallpaper  = document.getElementById("toggleWallpaper");
    const sliderDimmer     = document.getElementById("sliderDimmer");
    const valDimmer        = document.getElementById("valDimmer");
    const sliderBgOpacity  = document.getElementById("sliderBgOpacity");
    const valBgOpacity     = document.getElementById("valBgOpacity");
    const sliderBlur       = document.getElementById("sliderBlur");
    const valBlur          = document.getElementById("valBlur");
    const glassSegments    = document.querySelectorAll(".settings-card .segment");
    const hiddenColorInput = document.getElementById("hiddenColorInput");
    const colorPickerBtn   = document.getElementById("colorPickerBtn");

    // --- Helpers ---
    const getAccent = () => (hiddenColorInput ? hiddenColorInput.value.toUpperCase() : (accentColor || '#FF2A75'));

    const updateColorPickerUI = (color) => {
        if (!color) return;
        color = color.toUpperCase();
        if (colorPickerBtn) {
            colorPickerBtn.style.backgroundColor = color;
            const hexText = colorPickerBtn.querySelector('.hex-text');
            if (hexText) hexText.textContent = color;
        }
        if (hiddenColorInput) {
            hiddenColorInput.value = color;
        }
        // Sync swatch active state
        document.querySelectorAll('.color-swatch').forEach(s => {
            const sc = s.dataset.color ? s.dataset.color.toUpperCase() : '';
            s.classList.toggle('active', sc === color);
        });
    };

    const updateSlider = (slider, textEl, suffix) => {
        if (!slider) return;
        const val     = parseFloat(slider.value);
        const min     = parseFloat(slider.min)  || 0;
        const max     = parseFloat(slider.max)  || 100;
        const pct     = ((val - min) / (max - min)) * 100;
        const accent  = getAccent();
        slider.style.background = `linear-gradient(to right, ${accent} ${pct}%, rgba(255,255,255,0.1) ${pct}%)`;
        if (textEl) textEl.textContent = val + suffix;
    };

    const updateAllSliders = () => {
        updateSlider(sliderDimmer,    valDimmer,    "%");
        updateSlider(sliderBgOpacity, valBgOpacity, "%");
        updateSlider(sliderBlur,      valBlur,      "px");
    };

    // --- Apply to CSS & JS ---
    const applySettings = (s) => {
        // Wallpaper visibility
        document.body.classList.toggle('hide-wallpaper', !s.wallpaperVisible);

        root.style.setProperty('--wallpaper-dimmer-opacity', (s.wallpaperDimmer / 100).toFixed(2));
        root.style.setProperty('--glass-bg-opacity',         (s.bgOpacity / 100).toFixed(2));
        root.style.setProperty('--glass-blur-amount',        s.blurIntensity + 'px');

        // Accent color — propagate everywhere
        accentColor = s.accentColor;
        try {
            localStorage.setItem('flowAccentColor', s.accentColor);
        } catch(e) {}
        root.style.setProperty('--dynamic-accent', s.accentColor);
        root.style.setProperty('--accent',         s.accentColor);
        root.style.setProperty('--dynamic-accent-rgb', hexToRgbValues(s.accentColor));

        // Neon glow
        if (s.neonGlow) {
            root.style.setProperty('--neon-glow-opacity', '1');
            root.style.setProperty('--neon-glow-spread',  '14px');
        } else {
            root.style.setProperty('--neon-glow-opacity', '0.6');
            root.style.setProperty('--neon-glow-spread',  '0px');
        }

        // Glass border (use integer for safe compare)
        const idx = parseInt(s.borderStyleIndex, 10);
        let borderCSS = '1px solid rgba(255, 255, 255, 0.13)';
        let shadowCSS = 'inset 0 1px 1.5px rgba(255, 255, 255, 0.24), inset 0 -1px 2px rgba(0, 0, 0, 0.3), 0 8px 26px rgba(0, 0, 0, 0.45)';
        if (idx === 0) {
            borderCSS = 'none';
            shadowCSS = 'none';
        } else if (idx === 2) {
            borderCSS = `1.5px solid ${s.accentColor}`;
            shadowCSS = `inset 0 1px 1.5px rgba(255, 255, 255, 0.35), 0 0 16px ${hexToRgba(s.accentColor, 0.7)}, 0 0 30px ${hexToRgba(s.accentColor, 0.35)}`;
        }
        root.style.setProperty('--glass-border-style', borderCSS);
        root.style.setProperty('--glass-box-shadow',   shadowCSS);

        // Immediately synchronize curve graph and preset thumbnails
        if (typeof render === 'function') render();
        if (typeof loadPresets === 'function') loadPresets();
    };

    // --- Load from localStorage ---
    const loadSettings = () => {
        const defaults = {
            wallpaperVisible: true,
            wallpaperDimmer: 40,
            bgOpacity: 55,
            blurIntensity: 18,
            borderStyleIndex: 1,
            accentColor: accentColor || '#FF2A75',
            neonGlow: true
        };
        const saved = Object.assign(defaults, JSON.parse(localStorage.getItem("flowSettings") || "{}"));
        if (saved.bgOpacity !== undefined && saved.bgOpacity <= 5) {
            saved.bgOpacity = 55;
        }

        if (toggleWallpaper) toggleWallpaper.checked = saved.wallpaperVisible;
        if (sliderDimmer)    sliderDimmer.value       = saved.wallpaperDimmer;
        if (sliderBgOpacity) sliderBgOpacity.value    = saved.bgOpacity;
        if (sliderBlur)      sliderBlur.value         = saved.blurIntensity;

        // Segments
        const idx = parseInt(saved.borderStyleIndex, 10);
        glassSegments.forEach((b, i) => b.classList.toggle("active", i === idx));

        // Color picker
        updateColorPickerUI(saved.accentColor);

        applySettings(saved);
        updateAllSliders();
    };

    // --- Save to localStorage ---
    const saveSettings = () => {
        let activeIdx = 1;
        glassSegments.forEach((seg, i) => { if (seg.classList.contains("active")) activeIdx = i; });

        const currentAccent = getAccent();
        accentColor = currentAccent;

        const s = {
            wallpaperVisible:  toggleWallpaper  ? toggleWallpaper.checked  : true,
            wallpaperDimmer:   sliderDimmer     ? parseFloat(sliderDimmer.value)    : 40,
            bgOpacity:         sliderBgOpacity  ? parseFloat(sliderBgOpacity.value) : 3,
            blurIntensity:     sliderBlur       ? parseFloat(sliderBlur.value)      : 16,
            borderStyleIndex:  activeIdx,
            accentColor:       currentAccent
        };

        try {
            localStorage.setItem("flowSettings", JSON.stringify(s));
            localStorage.setItem("flowAccentColor", currentAccent);
        } catch(e) {}
        applySettings(s);
    };

    // --- Event listeners ---
    if (toggleWallpaper) toggleWallpaper.addEventListener("change", saveSettings);

    if (sliderDimmer)    sliderDimmer.addEventListener("input",    () => { updateSlider(sliderDimmer,    valDimmer,    "%");  saveSettings(); });
    if (sliderBgOpacity) sliderBgOpacity.addEventListener("input", () => { updateSlider(sliderBgOpacity, valBgOpacity, "%");  saveSettings(); });
    if (sliderBlur)      sliderBlur.addEventListener("input",      () => { updateSlider(sliderBlur,      valBlur,      "px"); saveSettings(); });

    glassSegments.forEach(btn => {
        btn.addEventListener("click", () => {
            glassSegments.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            saveSettings();
        });
    });

    if (hiddenColorInput && colorPickerBtn) {
        colorPickerBtn.addEventListener("click", async () => {
            if ('EyeDropper' in window) {
                try {
                    const eyeDropper = new EyeDropper();
                    const result = await eyeDropper.open();
                    updateColorPickerUI(result.sRGBHex.toUpperCase());
                    saveSettings();
                    updateAllSliders();
                    return;
                } catch (err) {}
            }
            hiddenColorInput.click();
        });
        hiddenColorInput.addEventListener("input", (e) => {
            updateColorPickerUI(e.target.value.toUpperCase());
            saveSettings();
            updateAllSliders();
        });
        hiddenColorInput.addEventListener("change", (e) => {
            updateColorPickerUI(e.target.value.toUpperCase());
            saveSettings();
            updateAllSliders();
        });
    }

    // Color swatch preset clicks
    document.querySelectorAll('.color-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            const color = swatch.dataset.color;
            if (color) {
                updateColorPickerUI(color);
                saveSettings();
                updateAllSliders();
            }
        });
    });
    // --- Layer & Timeline Tools Event Listeners ---
    const toolBtns = [
        { id: "btnTrimLeft", script: "trimLayerLeft()" },
        { id: "btnTrimRight", script: "trimLayerRight()" },
        { id: "btnSplitLayer", script: "splitLayerAtCTI()" },
        { id: "btnPrevMarker", script: "goToPrevMarker()" },
        { id: "btnNextMarker", script: "goToNextMarker()" }
    ];

    toolBtns.forEach(btnInfo => {
        const el = document.getElementById(btnInfo.id);
        if (el) {
            el.addEventListener("click", () => {
                if (!isCEP) {
                    console.log(`[MOCK MODE] Executed: ${btnInfo.script}`);
                    return;
                }
                if (!csInterface) return;
                
                csInterface.evalScript(btnInfo.script, (result) => {
                    if (result === "error" || result === "undefined" || result === "EvalScript error.") {
                        console.error(`Failed to execute ${btnInfo.script}. Result:`, result);
                    }
                });
            });
        }
    });

    // --- KidFaster Features Event Listeners ---
    
    // 1. Layer Creation
    const creationBtns = [
        { id: "btnCreateNull", script: "createSmartNull()" },
        { id: "btnCreateAdj", script: "createAdjustmentLayer()" },
        { id: "btnCreateSolid", script: "createSolid()" },
        { id: "btnCreateCamera", script: "createCamera()" },
        { id: "btnCreateText", script: "createTextLayer()" },
        { id: "btnFitToComp", script: "fitLayerToComp()" }
    ];
    
    creationBtns.forEach(btnInfo => {
        const el = document.getElementById(btnInfo.id);
        if (el) {
            el.addEventListener("click", () => {
                if (!isCEP) return console.log(`[MOCK] ${btnInfo.script}`);
                csInterface.evalScript(btnInfo.script);
            });
        }
    });
    
    // 2. Quick Shapes (Dual Mode)
    const shapeBtns = [
        { id: "btnShapeRect", shape: "Rectangle" },
        { id: "btnShapeRounded", shape: "Rounded" },
        { id: "btnShapeEllipse", shape: "Ellipse" },
        { id: "btnShapePolygon", shape: "Polygon" },
        { id: "btnShapeStar", shape: "Star" }
    ];
    
    shapeBtns.forEach(btnInfo => {
        const el = document.getElementById(btnInfo.id);
        if (el) {
            el.addEventListener("click", (e) => {
                const script = e.shiftKey ? `addMaskToLayer("${btnInfo.shape}")` : `createShapeLayer("${btnInfo.shape}")`;
                if (!isCEP) return console.log(`[MOCK] ${script}`);
                csInterface.evalScript(script);
            });
        }
    });
    
    // 2b. Motion Tile (Effect utility)
    const btnMotionTile = document.getElementById("btnMotionTile");
    if (btnMotionTile) {
        btnMotionTile.addEventListener("click", () => {
            if (!isCEP) return console.log("[MOCK] applyMotionTilePreset()");
            csInterface.evalScript("applyMotionTilePreset()");
        });
    }
    
    // 3. Anchor Point
    const anchorBtns = [
        { id: "btnAnchorTL", alignX: "left", alignY: "top" },
        { id: "btnAnchorTC", alignX: "center", alignY: "top" },
        { id: "btnAnchorTR", alignX: "right", alignY: "top" },
        { id: "btnAnchorML", alignX: "left", alignY: "center" },
        { id: "btnAnchorC", alignX: "center", alignY: "center" },
        { id: "btnAnchorMR", alignX: "right", alignY: "center" },
        { id: "btnAnchorBL", alignX: "left", alignY: "bottom" },
        { id: "btnAnchorBC", alignX: "center", alignY: "bottom" },
        { id: "btnAnchorBR", alignX: "right", alignY: "bottom" }
    ];
    
    anchorBtns.forEach(btnInfo => {
        const el = document.getElementById(btnInfo.id);
        if (el) {
            el.addEventListener("click", () => {
                const script = `setAnchorPoint("${btnInfo.alignX}", "${btnInfo.alignY}")`;
                if (!isCEP) return console.log(`[MOCK] ${script}`);
                csInterface.evalScript(script);
            });
        }
    });

    // 4. Mode Switch is now handled by window.switchMode (no duplicate handler)

    loadSettings();
})();
