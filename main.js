/**
 * Pebolim Pro - Game Logic
 */

// Configuration & Constants
const CONFIG = {
    friction: 0.985,
    wallBounce: 0.7,
    maxSpeed: 18,
    playerRadius: 12,
    ballRadius: 8,
    winScore: 5,
    colors: {
        p1: '#0088ff',
        p2: '#ff3333',
        field: '#1a472a',
        grassStripes: ['#1a472a', '#143821']
    },
    difficulty: {
        easy: { aiSpeed: 0.05, aiRange: 0.3 },
        medium: { aiSpeed: 0.1, aiRange: 0.4 },
        hard: { aiSpeed: 0.18, aiRange: 0.6 }
    },
    liftThreshold: 0.7 // ~40 degrees, angle at which players lift legs enough for ball to pass
};

// Game States
const GSTATE = {
    MENU: 'MENU',
    PLAYING: 'PLAYING',
    GAMEOVER: 'GAMEOVER'
};

// Global State
const state = {
    mode: GSTATE.MENU,
    difficulty: 'medium',
    width: 400,
    height: 700,
    scoreP1: 0, // Blue (Bottom) - User
    scoreP2: 0, // Red (Top) - CPU
    draggedRod: null,
    dragOffsetX: 0,
    particles: [],
    settings: {
        sound: true,
        vibration: true
    }
};

// Elements
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });
const forceBarFill = document.getElementById('force-bar-fill');
const kickBtn = document.getElementById('kick-btn');
const goalOverlay = document.getElementById('goal-overlay');
const countdownOverlay = document.getElementById('countdown-overlay');
const countdownText = document.getElementById('countdown-text');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over');
const winnerText = document.getElementById('winner-text');
const scoreP1El = document.getElementById('score-p1');
const scoreP2El = document.getElementById('score-p2');

// New Screens & Modals
const homeScreen = document.getElementById('home-screen');
const settingsModal = document.getElementById('settings-modal');
const howToPlayModal = document.getElementById('how-to-play-modal');
const soundToggle = document.getElementById('sound-toggle');
const vibrationToggle = document.getElementById('vibration-toggle');

// Audio Context (Lazy initialized)
let audioCtx = null;
function playSound(freq, type = 'sine', duration = 0.1, volume = 0.1) {
    if (!state.settings.sound) return;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

// Ball Object
const ball = {
    x: 200,
    y: 350,
    vx: 0,
    vy: 0,
    radius: CONFIG.ballRadius,
    color: '#ffffff'
};

/**
 * Rods Configuration
 */
const rods = [
    { yPct: 0.05, players: 1, team: 1, limit: 0.3, angle: 0, targetAngle: 0, angVel: 0, kickCharge: 0, isCharging: false, isReleasing: false }, // CPU Goalie
    { yPct: 0.15, players: 2, team: 1, limit: 0.3, angle: 0, targetAngle: 0, angVel: 0, kickCharge: 0, isCharging: false, isReleasing: false }, // CPU Defense
    { yPct: 0.30, players: 3, team: 0, limit: 0.2, angle: 0, targetAngle: 0, angVel: 0, kickCharge: 0, isCharging: false, isReleasing: false }, // P1 Attack
    { yPct: 0.45, players: 4, team: 1, limit: 0.15, angle: 0, targetAngle: 0, angVel: 0, kickCharge: 0, isCharging: false, isReleasing: false }, // CPU Midfield

    { yPct: 0.55, players: 4, team: 0, limit: 0.15, angle: 0, targetAngle: 0, angVel: 0, kickCharge: 0, isCharging: false, isReleasing: false }, // P1 Midfield
    { yPct: 0.70, players: 3, team: 1, limit: 0.2, angle: 0, targetAngle: 0, angVel: 0, kickCharge: 0, isCharging: false, isReleasing: false }, // CPU Attack
    { yPct: 0.85, players: 2, team: 0, limit: 0.3, angle: 0, targetAngle: 0, angVel: 0, kickCharge: 0, isCharging: false, isReleasing: false }, // P1 Defense
    { yPct: 0.95, players: 1, team: 0, limit: 0.3, angle: 0, targetAngle: 0, angVel: 0, kickCharge: 0, isCharging: false, isReleasing: false }  // P1 Goalie
];

function initRods() {
    rods.forEach(rod => {
        rod.y = state.height * rod.yPct;
        rod.minX = state.width * rod.limit;
        rod.maxX = state.width * (1 - rod.limit);
        rod.currentX = state.width / 2;
        rod.angle = 0;
        rod.targetAngle = 0;
        rod.angVel = 0;
        rod.kickCharge = 0;
        rod.isCharging = false;
        rod.isReleasing = false;
    });
}

function resize() {
    const parent = canvas.parentElement;
    const pW = parent.clientWidth;
    const pH = parent.clientHeight;

    const targetRatio = 4 / 7;
    let w = pW;
    let h = w / targetRatio;

    if (h > pH) {
        h = pH;
        w = h * targetRatio;
    }

    canvas.width = w;
    canvas.height = h;
    state.width = w;
    state.height = h;

    initRods();
}

/**
 * PHYSICS & UPDATES
 */

function resetBall(scorerTeam) {
    if (state.scoreP1 >= CONFIG.winScore || state.scoreP2 >= CONFIG.winScore) {
        endGame();
        return;
    }

    ball.x = state.width / 2;
    ball.y = state.height / 2;
    ball.vx = 0;
    ball.vy = 0;

    goalOverlay.classList.remove('hidden');
    playSound(440, 'square', 0.3, 0.15); // Goal sound

    setTimeout(() => {
        if (state.mode !== GSTATE.PLAYING) return;
        goalOverlay.classList.add('hidden');
        const dirY = scorerTeam === 0 ? -1 : 1;
        ball.vy = dirY * (3 + Math.random() * 2);
        ball.vx = (Math.random() - 0.5) * 4;
    }, 1500);
}

function endGame() {
    state.mode = GSTATE.GAMEOVER;
    gameOverScreen.classList.remove('hidden');
    winnerText.textContent = state.scoreP1 >= CONFIG.winScore ? "VOCÊ VENCEU!" : "DERROTA!";
    winnerText.style.color = state.scoreP1 >= CONFIG.winScore ? CONFIG.colors.p1 : CONFIG.colors.p2;
}

function getPlayerPositions(rod) {
    const positions = [];
    const spacing = state.width / (rod.players * 1.5 + 1);
    const totalWidth = (rod.players - 1) * spacing;
    const startX = rod.currentX - (totalWidth / 2);

    for (let i = 0; i < rod.players; i++) {
        positions.push({ x: startX + (i * spacing), y: rod.y });
    }
    return positions;
}

function update() {
    if (state.mode !== GSTATE.PLAYING) return;

    // Ball Movement
    ball.x += ball.vx;
    ball.y += ball.vy;
    ball.vx *= CONFIG.friction;
    ball.vy *= CONFIG.friction;

    // Boundary Collisions (Walls)
    if (ball.x - ball.radius < 0) {
        ball.x = ball.radius;
        ball.vx *= -CONFIG.wallBounce;
        playSound(200, 'sine', 0.05, 0.05);
    } else if (ball.x + ball.radius > state.width) {
        ball.x = state.width - ball.radius;
        ball.vx *= -CONFIG.wallBounce;
        playSound(200, 'sine', 0.05, 0.05);
    }

    // Goal & Edge Detection
    const goalW = 120;
    const goalXStart = state.width / 2 - goalW / 2;
    const goalXEnd = state.width / 2 + goalW / 2;

    // TOP EDGE
    if (ball.y - ball.radius < 0) {
        if (ball.x > goalXStart && ball.x < goalXEnd) {
            // GOAL for P1
            state.scoreP1++;
            scoreP1El.textContent = state.scoreP1;
            createParticles(ball.x, 0, CONFIG.colors.p1);
            resetBall(0);
        } else {
            // WALL BOUNCE (Top left or top right edge)
            ball.y = ball.radius;
            ball.vy *= -CONFIG.wallBounce;
            playSound(200, 'sine', 0.05, 0.05);
        }
    }
    // BOTTOM EDGE
    else if (ball.y + ball.radius > state.height) {
        if (ball.x > goalXStart && ball.x < goalXEnd) {
            // GOAL for P2
            state.scoreP2++;
            scoreP2El.textContent = state.scoreP2;
            createParticles(ball.x, state.height, CONFIG.colors.p2);
            resetBall(1);
        } else {
            // WALL BOUNCE (Bottom left or bottom right edge)
            ball.y = state.height - ball.radius;
            ball.vy *= -CONFIG.wallBounce;
            playSound(200, 'sine', 0.05, 0.05);
        }
    }

    // Rods & AI
    const diff = CONFIG.difficulty[state.difficulty];
    rods.forEach(rod => {
        // AI Logic (CPU)
        if (rod.team === 1) {
            let targetX = ball.x;
            const distY = ball.y - rod.y;
            const distX = ball.x - rod.currentX;

            // Better X-Tracking: More reactive as ball gets closer
            const trackMulti = Math.max(0.3, 1 - Math.abs(distY) / 500);
            const dx = targetX - rod.currentX;
            rod.currentX += dx * diff.aiSpeed * trackMulti;

            // Aggressive AI Kicking
            if (distY > 0 && distY < 70 && Math.abs(distX) < 50) {
                // If ball is above and close: Charge but also move towards it
                rod.targetAngle = Math.PI / 2.8; // Deep pull back
                rod.isCharging = true;
            } else if (distY > -15 && distY < 15 && Math.abs(distX) < 35) {
                // If ball is right at the feet: SNAP KICK
                if (rod.targetAngle > 0.5) { // If was charged
                    rod.angVel = -1.8 - (Math.random() * 0.5); // Sharp kick
                    rod.targetAngle = 0;
                    rod.isCharging = false;
                }
            } else if (distY < 0 && distY > -60) {
                // Defensive: If ball is past us, move back to center
                rod.targetAngle = 0;
            } else {
                rod.targetAngle = 0;
                rod.isCharging = false;
            }
        }

        rod.currentX = Math.max(rod.minX, Math.min(rod.maxX, rod.currentX));

        // Angular Physics
        if (rod.team === 0) {
            if (rod.isCharging) {
                rod.kickCharge += 2.5;
                if (rod.kickCharge > 100) rod.kickCharge = 100;
                rod.targetAngle = -Math.PI / 2.5; // Pull back
            } else if (rod.isReleasing) {
                rod.angVel = 1.2 + (rod.kickCharge / 40); // Initial snap velocity
                rod.isReleasing = false;
                // Defer charge reset for animation
                setTimeout(() => { if (!rod.isCharging) rod.kickCharge = 0; }, 100);
            } else {
                rod.targetAngle = 0; // Return to neutral
            }
        }

        // Sync Force Meter UI with dragged rod or active charging rod
        if (state.draggedRod === rod && forceBarFill) {
            forceBarFill.style.width = `${rod.kickCharge}%`;
        }

        // Apply Angular Velocity & Smoothing
        const torque = (rod.targetAngle - rod.angle) * 0.15;
        rod.angVel += torque;
        rod.angle += rod.angVel;
        rod.angVel *= 0.85; // Friction

        // Player Collisions
        const players = getPlayerPositions(rod);

        // LIFT-TO-PASS: If rod is rotated too much, ball passes under
        if (Math.abs(rod.angle) > CONFIG.liftThreshold) {
            return; // Skip collisions for this rod
        }

        players.forEach(p => {
            // Foot position based on rotation
            // We simulate the foot length as CONFIG.playerRadius * 1.5
            const footLen = CONFIG.playerRadius * 1.5;
            const footY = p.y + Math.sin(rod.angle) * footLen;
            const footX = p.x;

            const dx = ball.x - footX;
            const dy = ball.y - footY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const minDist = ball.radius + CONFIG.playerRadius;

            if (dist < minDist) {
                const nx = dx / dist;
                const ny = dy / dist;

                const overlap = minDist - dist;
                ball.x += nx * overlap;
                ball.y += ny * overlap;

                // Physics based on angular velocity
                // The foot velocity at impact: footLen * rod.angVel
                const footVelY = Math.cos(rod.angle) * footLen * rod.angVel;

                let kickPower = 0.5;
                if (Math.abs(rod.angVel) > 0.05) {
                    kickPower = Math.abs(rod.angVel) * 5;
                    playSound(300 + Math.abs(rod.angVel) * 100, 'triangle', 0.1, 0.1);
                    if (rod.team === 0 && state.settings.vibration && window.navigator.vibrate) window.navigator.vibrate(50);
                } else {
                    playSound(150, 'sine', 0.05, 0.08);
                }

                const dirY = rod.team === 0 ? -1 : 1;
                ball.vy = -ball.vy * 0.4;
                ball.vy += (dirY * kickPower * 3) + footVelY;
                ball.vx += (nx * 4) + (rod.angVel * 2);

                if (Math.abs(ball.vy) < 2) ball.vy = dirY * 3;
            }
        });
    });

    // Dead Zone Check (Prevent stuck ball) - Once per update
    const ballSpeed = Math.abs(ball.vx) + Math.abs(ball.vy);
    if (ballSpeed < 0.2) {
        if (!state.stuckTimer) state.stuckTimer = Date.now();
        if (Date.now() - state.stuckTimer > 3000) {
            // Reset ball to center if stationary for 3 seconds
            ball.x = state.width / 2;
            ball.y = state.height / 2;
            ball.vx = 0;
            ball.vy = 0;
            state.stuckTimer = null;
            playSound(300, 'sine', 0.1, 0.05);
        }
    } else {
        state.stuckTimer = null;
    }

    // Update Particles
    state.particles = state.particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
        return p.life > 0;
    });
}

function createParticles(x, y, color) {
    for (let i = 0; i < 20; i++) {
        state.particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            life: 1,
            color
        });
    }
}

/**
 * DRAWING
 */

function draw() {
    ctx.fillStyle = CONFIG.colors.field;
    ctx.fillRect(0, 0, state.width, state.height);

    const stripeH = state.height / 10;
    for (let i = 0; i < 10; i++) {
        ctx.fillStyle = CONFIG.colors.grassStripes[i % 2];
        ctx.fillRect(0, i * stripeH, state.width, stripeH);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, state.height / 2);
    ctx.lineTo(state.width, state.height / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(state.width / 2, state.height / 2, 50, 0, Math.PI * 2);
    ctx.stroke();
    const goalW = 120;
    const goalXStart = state.width / 2 - goalW / 2;
    // Goal areas
    ctx.strokeRect(goalXStart, 0, goalW, 60);
    ctx.strokeRect(goalXStart, state.height - 60, goalW, 60);

    // DRAW EDGE BORDERS (Orange zones from user request)
    ctx.strokeStyle = '#ff9800'; // Orange
    ctx.lineWidth = 6;
    // Top Left Wall
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(goalXStart, 0);
    ctx.stroke();
    // Top Right Wall
    ctx.beginPath();
    ctx.moveTo(state.width / 2 + goalW / 2, 0);
    ctx.lineTo(state.width, 0);
    ctx.stroke();
    // Bottom Left Wall
    ctx.beginPath();
    ctx.moveTo(0, state.height);
    ctx.lineTo(goalXStart, state.height);
    ctx.stroke();
    // Bottom Right Wall
    ctx.beginPath();
    ctx.moveTo(state.width / 2 + goalW / 2, state.height);
    ctx.lineTo(state.width, state.height);
    ctx.stroke();

    rods.forEach(rod => {
        // Rod Haste
        ctx.beginPath();
        ctx.moveTo(0, rod.y);
        ctx.lineTo(state.width, rod.y);
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 5;
        ctx.stroke();

        const players = getPlayerPositions(rod);
        players.forEach(p => {
            const teamColor = rod.team === 0 ? CONFIG.colors.p1 : CONFIG.colors.p2;
            const size = CONFIG.playerRadius;

            ctx.save();
            ctx.translate(p.x, p.y);

            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.beginPath();
            ctx.ellipse(4, 4 + Math.sin(rod.angle) * 5, size * 0.8, size * 1.2, 0, 0, Math.PI * 2);
            ctx.fill();

            // --- DRAW PLAYER FIGURE ---
            // The "T-Pose" arms are theoretically the rod itself.

            // 1. Torso/Body (Rectangular)
            // We use COS for the vertical length to simulate rotation
            const bodyH = size * 1.8;
            const viewH = Math.cos(rod.angle) * bodyH;
            const viewW = size * 1.2;

            ctx.fillStyle = teamColor;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;

            // Draw Body
            ctx.fillRect(-viewW / 2, 0, viewW, viewH);
            ctx.strokeRect(-viewW / 2, 0, viewW, viewH);

            // 2. Head (Always above the rod, slightly shifting)
            ctx.beginPath();
            ctx.arc(0, -size * 0.8, size * 0.7, 0, Math.PI * 2);
            const headGrad = ctx.createRadialGradient(-2, -size * 1, 1, 0, -size * 0.8, size * 0.7);
            headGrad.addColorStop(0, teamColor);
            headGrad.addColorStop(1, '#000');
            ctx.fillStyle = headGrad;
            ctx.fill();
            ctx.stroke();

            // 3. Foot/Leg (The part that actually hits the ball)
            // It extends from the body.
            const footLen = size * 1.2;
            const footY = viewH; // Starts where body ends
            const footScaleY = Math.cos(rod.angle);
            const footH = footLen * footScaleY;

            // Foot block
            ctx.fillStyle = teamColor;
            ctx.fillRect(-viewW / 2, footY, viewW, footH);
            ctx.strokeRect(-viewW / 2, footY, viewW, footH);

            // Highlight/Detail - Shoulder/Neck area
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.fillRect(-viewW / 2, -2, viewW, 4);

            // Indicator of Chute (Yellow ring, now integrated)
            if (rod.team === 0 && rod.kickCharge > 0) {
                ctx.beginPath();
                ctx.arc(0, 0, size * 2, -Math.PI / 2, -Math.PI / 2 + (rod.kickCharge / 100) * (Math.PI * 2));
                ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)';
                ctx.lineWidth = 3;
                ctx.stroke();
            }

            ctx.restore();
        });
    });

    const ballGrad = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, ball.radius);
    ballGrad.addColorStop(0, '#eee');
    ballGrad.addColorStop(1, '#999');
    ctx.fillStyle = ballGrad;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();

    state.particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 4, 4);
    });
    ctx.globalAlpha = 1;
}

/**
 * MENU LOGIC
 */

function initSettings() {
    const saved = localStorage.getItem('pebolim_settings');
    if (saved) {
        state.settings = JSON.parse(saved);
        soundToggle.checked = state.settings.sound;
        vibrationToggle.checked = state.settings.vibration;
    }
}

function saveSettings() {
    state.settings.sound = soundToggle.checked;
    state.settings.vibration = vibrationToggle.checked;
    localStorage.setItem('pebolim_settings', JSON.stringify(state.settings));
}

function startGame() {
    startScreen.classList.add('hidden');
    homeScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');

    // Reset Scores
    state.scoreP1 = 0;
    state.scoreP2 = 0;
    scoreP1El.textContent = "0";
    scoreP2El.textContent = "0";

    // Setup Ball for Countdown
    ball.x = state.width / 2;
    ball.y = state.height / 2;
    ball.vx = 0;
    ball.vy = 0;

    startCountdown();
}

function startCountdown() {
    state.mode = GSTATE.MENU; // Keep game paused (don't process update)
    countdownOverlay.classList.remove('hidden');

    let count = 3;
    countdownText.textContent = count;
    playSound(400, 'sine', 0.1, 0.1);

    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownText.textContent = count;
            playSound(400, 'sine', 0.1, 0.1);
        } else if (count === 0) {
            countdownText.textContent = "VAI!";
            playSound(800, 'sine', 0.3, 0.1);
        } else {
            clearInterval(interval);
            countdownOverlay.classList.add('hidden');
            state.mode = GSTATE.PLAYING;
            // Kickoff ball
            ball.vy = -(3 + Math.random() * 2);
            ball.vx = (Math.random() - 0.5) * 4;
        }
    }, 1000);
}

// Event Listeners
document.getElementById('main-play-btn').addEventListener('click', () => {
    homeScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    playSound(400, 'sine', 0.05, 0.05);
});

document.getElementById('difficulty-back-btn').addEventListener('click', () => {
    startScreen.classList.add('hidden');
    homeScreen.classList.remove('hidden');
    playSound(300, 'sine', 0.05, 0.05);
});

document.getElementById('settings-btn').addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
    playSound(400, 'sine', 0.05, 0.05);
});

document.getElementById('settings-back-btn').addEventListener('click', () => {
    settingsModal.classList.add('hidden');
    saveSettings();
    playSound(300, 'sine', 0.05, 0.05);
});

document.getElementById('how-to-play-btn').addEventListener('click', () => {
    howToPlayModal.classList.remove('hidden');
    playSound(400, 'sine', 0.05, 0.05);
});

document.getElementById('instructions-back-btn').addEventListener('click', () => {
    howToPlayModal.classList.add('hidden');
    playSound(300, 'sine', 0.05, 0.05);
});

document.getElementById('back-to-menu-btn').addEventListener('click', () => {
    gameOverScreen.classList.add('hidden');
    homeScreen.classList.remove('hidden');
    state.mode = GSTATE.MENU;
    playSound(300, 'sine', 0.05, 0.05);
});

document.getElementById('ingame-exit-btn').addEventListener('click', () => {
    if (confirm("Deseja mesmo sair para o menu principal? O progresso será perdido.")) {
        state.mode = GSTATE.MENU;
        homeScreen.classList.remove('hidden');
        playSound(300, 'sine', 0.05, 0.05);
    }
});

document.getElementById('ingame-settings-btn').addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
    playSound(400, 'sine', 0.05, 0.05);
});

document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.difficulty = btn.dataset.diff;
        playSound(400, 'sine', 0.05, 0.05);
    });
});

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

soundToggle.addEventListener('change', saveSettings);
vibrationToggle.addEventListener('change', saveSettings);

/**
 * INPUTS
 */

function handleStart(e) {
    if (state.mode !== GSTATE.PLAYING) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    let bestRod = null;
    let minDist = 40;
    rods.forEach(rod => {
        if (rod.team === 0) {
            const d = Math.abs(y - rod.y);
            if (d < minDist) {
                minDist = d;
                bestRod = rod;
            }
        }
    });

    if (bestRod) {
        state.draggedRod = bestRod;
        state.dragOffsetX = bestRod.currentX - x;
    }
}

function handleMove(e) {
    if (!state.draggedRod) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    const x = touch.clientX - rect.left;
    state.draggedRod.currentX = x + state.dragOffsetX;
}

function handleEnd() {
    state.draggedRod = null;
}

function startCharging() {
    if (state.mode !== GSTATE.PLAYING) return;
    if (state.draggedRod && state.draggedRod.team === 0) {
        state.draggedRod.isCharging = true;
    } else {
        // Fallback: charge all player rods if no specific one is dragged?
        // User said "somente a linha clicada", so maybe do nothing if no rod is clicked.
    }
}

function endCharging() {
    rods.forEach(rod => {
        if (rod.team === 0 && rod.isCharging) {
            rod.isCharging = false;
            rod.isReleasing = true;
        }
    });
}

// Event Listeners
canvas.addEventListener('mousedown', handleStart);
window.addEventListener('mousemove', handleMove);
window.addEventListener('mouseup', handleEnd);
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); handleStart(e); }, { passive: false });
canvas.addEventListener('touchmove', (e) => { e.preventDefault(); handleMove(e); }, { passive: false });
window.addEventListener('touchend', handleEnd);

kickBtn.addEventListener('mousedown', startCharging);
kickBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startCharging(); }, { passive: false });
window.addEventListener('mouseup', endCharging);
window.addEventListener('touchend', endCharging);

window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'z' && !state.isCharging) startCharging();
});
window.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() === 'z') endCharging();
});

window.addEventListener('resize', resize);

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

initSettings();
resize();
requestAnimationFrame(loop);
