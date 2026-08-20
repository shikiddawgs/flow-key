// --- CSInterface Initialization ---
let csInterface;
let isCEP = false;
try {
    csInterface = new CSInterface();
    isCEP = (typeof window.__adobe_cep__ !== "undefined");
} catch (e) {
    console.warn("Not running in CEP environment.");
}

if (!isCEP) {
    console.log("Mock Mode Active: Running in standard browser.");
}

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
    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();
    const size = Math.max(Math.floor(Math.min(rect.width, rect.height)), 60);
    if (canvas.width !== size || canvas.height !== size) {
        canvas.width = size;
        canvas.height = size;
        render();
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

// Dragging state
let activeHandle = null;
let animationId = null;

let accentColor = '#1890ff';
try {
    const savedColor = localStorage.getItem('flowAccentColor');
    if (savedColor) accentColor = savedColor;
} catch (e) { }

// Define global target states to fix spamming reverse during animation
let targetStateP1 = { x: p1.x, y: p1.y };
let targetStateP2 = { x: p2.x, y: p2.y };

function animateCurveTo(targetP1, targetP2) {
    if (animationId) cancelAnimationFrame(animationId);

    targetStateP1 = { x: targetP1.x, y: targetP1.y };
    targetStateP2 = { x: targetP2.x, y: targetP2.y };

    const startP1 = { x: p1.x, y: p1.y };
    const startP2 = { x: p2.x, y: p2.y };

    const duration = 600; // ms, made slower so it's more visible
    const startTime = performance.now();

    // Softened easeOutBack for a smaller motion bounce
    const easeOutBack = (t) => {
        const c1 = 0.9; // Reduced from 1.70158 for a smaller bounce
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    };

    function step(currentTime) {
        const elapsed = currentTime - startTime;
        let progress = Math.min(elapsed / duration, 1);

        const t = easeOutBack(progress);

        p1.x = startP1.x + (targetP1.x - startP1.x) * t;
        p1.y = startP1.y + (targetP1.y - startP1.y) * t;
        p2.x = startP2.x + (targetP2.x - startP2.x) * t;
        p2.y = startP2.y + (targetP2.y - startP2.y) * t;

        render();

        if (progress < 1) {
            animationId = requestAnimationFrame(step);
        }
    }

    animationId = requestAnimationFrame(step);
}

function render() {
    const { width, height, padding, drawWidth, drawHeight } = getCanvasDimensions();
    ctx.clearRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
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
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.setLineDash([5, 5]);
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

    // Draw bezier curve (thick white)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(3, 7 * scale); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cP0.x, cP0.y);
    ctx.bezierCurveTo(cP1.x, cP1.y, cP2.x, cP2.y, cP3.x, cP3.y);
    ctx.stroke();

    // Draw control point handles (blue circles with white border)
    const handleRadius = Math.max(4, 6 * scale);
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

    updateCoordinateDisplay();
}

function updateCoordinateDisplay() {
    coordDisplay.innerText = `${p1.x.toFixed(2)}, ${p1.y.toFixed(2)}, ${p2.x.toFixed(2)}, ${p2.y.toFixed(2)}`;
}

// --- Mouse Interaction ---
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
    if (animationId) cancelAnimationFrame(animationId);

    const mousePos = getMousePos(e);
    const { height, padding, drawWidth, drawHeight } = getCanvasDimensions();

    // Convert current normalized P1, P2 to canvas space for distance check
    const toCanvasX = (nx) => padding + nx * drawWidth;
    const toCanvasY = (ny) => height - padding - ny * drawHeight;

    const cP1 = { x: toCanvasX(p1.x), y: toCanvasY(p1.y) };
    const cP2 = { x: toCanvasX(p2.x), y: toCanvasY(p2.y) };

    const dist1 = getDist(mousePos, cP1);
    const dist2 = getDist(mousePos, cP2);

    // Scale hit area proportionally
    const hitArea = Math.max(20, 30 * (Math.min(canvas.width, canvas.height) / 280));

    if (dist1 < hitArea) { // Increased hit area for easier clicking/touching
        activeHandle = 1;
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
    } else if (dist2 < hitArea) {
        activeHandle = 2;
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
    }
});

canvas.addEventListener('pointermove', (e) => {
    if (!activeHandle) return;

    const mousePos = getMousePos(e);
    const { height, padding, drawWidth, drawHeight } = getCanvasDimensions();

    // Map mouse position back to normalized coordinates
    let nx = (mousePos.x - padding) / drawWidth;
    let ny = (height - padding - mousePos.y) / drawHeight;

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
    activeHandle = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { }
});

canvas.addEventListener('pointercancel', (e) => {
    activeHandle = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { }
});

// --- Actions & API Calls ---
document.getElementById('applyBtn').addEventListener('click', () => {
    if (!isCEP) {
        console.log(`[MOCK MODE] Apply Ease: p1(${p1.x.toFixed(4)}, ${p1.y.toFixed(4)}) p2(${p2.x.toFixed(4)}, ${p2.y.toFixed(4)})`);
        const toast = document.getElementById('toast');
        if (toast) {
            toast.innerText = "Mock Apply (Browser)";
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 2000);
        }
        return;
    }
    if (!csInterface) return;

    // Call the JSX function
    const script = `applyFlowToSelectedKeys(${p1.x}, ${p1.y}, ${p2.x}, ${p2.y})`;
    csInterface.evalScript(script, (result) => {
        if (result === "false" || result === "error") {
            console.error("Failed to apply easing.");
        }
    });
});

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
    const script = `
        (function() {
            var comp = app.project.activeItem;
            if (!comp) return "error";
            var layer = comp.selectedLayers[0];
            if (!layer) return "error";
            var prop = layer.selectedProperties[0];
            if (!prop || prop.selectedKeys.length === 0) return "error";
            
            var keyIndex = prop.selectedKeys[0];
            // We need the NEXT keyframe to compute average speed
            if (keyIndex >= prop.numKeys) return "error";
            
            var time1 = prop.keyTime(keyIndex);
            var time2 = prop.keyTime(keyIndex + 1);
            var val1 = prop.keyValue(keyIndex);
            var val2 = prop.keyValue(keyIndex + 1);
            
            var timeDiff = time2 - time1;
            if (timeDiff <= 0) return "error";
            
            // Determine if property is spatial
            var propType = prop.propertyValueType;
            var isSpatial = (propType === PropertyValueType.TwoD_SPATIAL || propType === PropertyValueType.ThreeD_SPATIAL);
            
            var valDiff;
            if (isSpatial) {
                var distSq = 0;
                for (var i = 0; i < val1.length; i++) {
                    distSq += Math.pow(val2[i] - val1[i], 2);
                }
                valDiff = Math.sqrt(distSq);
            } else {
                var v1 = (val1 instanceof Array) ? val1[0] : val1;
                var v2 = (val2 instanceof Array) ? val2[0] : val2;
                valDiff = v2 - v1;
            }
            
            var avgSpeed = valDiff / timeDiff;
            
            var easeOut = prop.keyOutTemporalEase(keyIndex)[0];
            var easeIn = prop.keyInTemporalEase(keyIndex + 1)[0];
            
            var x1 = easeOut.influence / 100;
            var x2 = 1 - (easeIn.influence / 100);
            
            var y1, y2;
            if (avgSpeed === 0) {
                y1 = 0;
                y2 = 1;
            } else if (isSpatial) {
                y1 = x1 * (Math.abs(easeOut.speed) / avgSpeed);
                y2 = 1 - (1 - x2) * (Math.abs(easeIn.speed) / avgSpeed);
            } else {
                y1 = x1 * (easeOut.speed / avgSpeed);
                y2 = 1 - (1 - x2) * (easeIn.speed / avgSpeed);
            }
            
            // Clamp to reasonable range
            x1 = Math.max(0, Math.min(1, x1));
            y1 = Math.max(-0.5, Math.min(1.5, y1));
            x2 = Math.max(0, Math.min(1, x2));
            y2 = Math.max(-0.5, Math.min(1.5, y2));
            
            return x1.toFixed(4) + "," + y1.toFixed(4) + "," + x2.toFixed(4) + "," + y2.toFixed(4);
        })()
    `;

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

    const newPreset = {
        name: name,
        value: [
            parseFloat(p1.x.toFixed(2)),
            parseFloat(p1.y.toFixed(2)),
            parseFloat(p2.x.toFixed(2)),
            parseFloat(p2.y.toFixed(2))
        ]
    };

    let customPresets = [];
    try {
        const stored = localStorage.getItem('flowCustomPresets');
        if (stored) customPresets = JSON.parse(stored);
    } catch (e) { }

    customPresets.push(newPreset);
    localStorage.setItem('flowCustomPresets', JSON.stringify(customPresets));

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
let presetToDeleteIndex = -1;

cancelDeleteBtn.addEventListener('click', () => {
    deleteModal.classList.remove('show');
    presetToDeleteIndex = -1;
});

confirmDeleteBtn.addEventListener('click', () => {
    if (presetToDeleteIndex > -1) {
        let customPresets = [];
        try {
            const stored = localStorage.getItem('flowCustomPresets');
            if (stored) customPresets = JSON.parse(stored);
            customPresets.splice(presetToDeleteIndex, 1);
            localStorage.setItem('flowCustomPresets', JSON.stringify(customPresets));
            loadPresets();
        } catch (err) { }
    }
    deleteModal.classList.remove('show');
    presetToDeleteIndex = -1;
});

// --- Presets Loading ---
function drawMiniCurve(canvasEl, pt1, pt2) {
    const ctx = canvasEl.getContext('2d');
    const w = canvasEl.width;
    const h = canvasEl.height;

    const padding = 4;
    const drawW = w - padding * 2;
    const drawH = h - padding * 2;

    // Convert normalized points
    const p0 = { x: padding, y: h - padding };
    const p1 = { x: padding + pt1.x * drawW, y: (h - padding) - pt1.y * drawH };
    const p2 = { x: padding + pt2.x * drawW, y: (h - padding) - pt2.y * drawH };
    const p3 = { x: w - padding, y: padding };

    // Draw handles (dynamic color line)
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(p3.x, p3.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Draw bezier curve
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
    ctx.stroke();

    // Draw control point handles
    ctx.fillStyle = accentColor;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.arc(p1.x, p1.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(p2.x, p2.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
}

async function loadPresets() {
    try {
        let presets = [];

        // Only load custom presets from localStorage (no defaults)
        try {
            const stored = localStorage.getItem('flowCustomPresets');
            if (stored) {
                const custom = JSON.parse(stored);
                presets = presets.concat(custom);
            }
        } catch (e) { }

        const grid = document.getElementById('presetsGrid');
        grid.innerHTML = ''; // clear before repopulating

        presets.forEach((preset, index) => {
            const card = document.createElement('div');
            card.className = 'preset-card';

            const delBtn = document.createElement('button');
            delBtn.className = 'delete-btn';
            delBtn.innerHTML = '&times;';
            delBtn.title = 'Delete Preset';

            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                presetToDeleteIndex = index;
                deleteModalText.innerText = `Delete preset "${preset.name}"?`;
                deleteModal.classList.add('show');
            });

            const pt1 = { x: preset.value[0], y: preset.value[1] };
            const pt2 = { x: preset.value[2], y: preset.value[3] };
            const thumb = document.createElement('canvas');
            thumb.width = 48;
            thumb.height = 48;
            drawMiniCurve(thumb, pt1, pt2);

            const label = document.createElement('div');
            label.className = 'preset-label';
            label.innerText = preset.name;

            card.appendChild(delBtn);
            card.appendChild(thumb);
            card.appendChild(label);

            card.addEventListener('click', () => {
                animateCurveTo(pt1, pt2);
            });

            grid.appendChild(card);
        });
    } catch (e) {
        console.error("Failed to load presets", e);
    }
}

// Init
resizeCanvas();
render();
loadPresets();

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
const appContainer = document.querySelector('.container');

try {
    const storedBg = localStorage.getItem('flowCustomBg');
    if (storedBg && canvasBg) {
        canvasBg.style.backgroundImage = `linear-gradient(rgba(30, 30, 30, 0.3), rgba(30, 30, 30, 0.3)), url(${storedBg})`;
        canvasBg.style.opacity = '0.5';
        const cCont = document.querySelector('.canvas-container');
        if (cCont) { cCont.style.backdropFilter = 'blur(16px)'; cCont.style.webkitBackdropFilter = 'blur(16px)'; }
    }
    const storedAppBg = localStorage.getItem('flowAppBg');
    if (storedAppBg && appContainer) {
        appContainer.style.backgroundImage = `linear-gradient(rgba(26, 26, 28, 0.70), rgba(26, 26, 28, 0.70)), url(${storedAppBg})`;
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
            if (appContainer) appContainer.style.backgroundImage = `linear-gradient(rgba(26, 26, 28, 0.75), rgba(26, 26, 28, 0.75)), url(${dataUrl})`;
            try {
                localStorage.setItem('flowAppBg', dataUrl);
            } catch (err) {
                console.warn("Image too large for localStorage.");
            }
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
            try {
                localStorage.setItem('flowCustomBg', dataUrl);
            } catch (err) {
                console.warn("Image too large for localStorage.");
            }
        };
        reader.readAsDataURL(file);
    });
}

const colorPicker = document.getElementById('colorPicker');
if (colorPicker) {
    colorPicker.value = accentColor;
    document.documentElement.style.setProperty('--dynamic-accent', accentColor);

    colorPicker.addEventListener('input', (e) => {
        accentColor = e.target.value;
        document.documentElement.style.setProperty('--dynamic-accent', accentColor);
        render();
    });

    colorPicker.addEventListener('change', (e) => {
        accentColor = e.target.value;
        try { localStorage.setItem('flowAccentColor', accentColor); } catch (err) { }
        loadPresets();
    });
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
        try { localStorage.removeItem('flowCustomBg'); } catch (e) { }
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
        try { localStorage.removeItem('flowAppBg'); } catch (e) { }
        if (appContainer) appContainer.style.backgroundImage = 'none';
    });
}
