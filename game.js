// ================================================
// Box Em Like A Fish - Main Game Script (Patched)
// ================================================

'use strict';

const GS = { MENU: 0, PLAYING: 1, PAUSED: 2, WAVE_CLEAR: 3, DEAD: 4 };

const HALF = 28;
const EYE_H = 1.65;
const GRAVITY = -22;
const JUMP_VEL = 7.5;
const WALK_SPEED = 7.5;
const SPRINT_MULT = 1.7;

// ── Enhanced Weapon Data ─────────────────────────────────────
const WDATA = {
    pistol:  { label: 'PISTOL',        dmg: 32, rate: 0.45, mag: 12,  res: Infinity, spread: 0.012, auto: false, pellets: 1, reloadTime: 1.1 },
    ar:      { label: 'ASSAULT RIFLE', dmg: 20, rate: 0.09, mag: 30,  res: 150,      spread: 0.038, auto: true,  pellets: 1, reloadTime: 1.9 },
    shotgun: { label: 'SHOTGUN',       dmg: 18, rate: 0.75, mag: 8,   res: 40,       spread: 0.13,  auto: false, pellets: 8, reloadTime: 2.4 },
    smg:     { label: 'SMG',           dmg: 15, rate: 0.06, mag: 40,  res: 200,      spread: 0.055, auto: true,  pellets: 1, reloadTime: 1.6 },
    sniper:  { label: 'SNIPER',        dmg: 85, rate: 1.2,  mag: 5,   res: 30,       spread: 0.003, auto: false, pellets: 1, reloadTime: 2.8 }
};
const WEAPON_KEYS = ['pistol', 'ar', 'shotgun', 'smg', 'sniper'];

// Player
const player = {
    pos: new THREE.Vector3(0, EYE_H, 0),
    vel: new THREE.Vector3(),
    yaw: 0, pitch: 0,
    hp: 100, maxHp: 100,
    grounded: false,
    alive: true,
    weapIdx: 0,
    ammo: {
        pistol: { mag: 12, res: Infinity },
        ar:     { mag: 30, res: 150 },
        shotgun:{ mag: 8,  res: 40 },
        smg:    { mag: 40, res: 200 },
        sniper: { mag: 5,  res: 30 }
    },
    fireCd: 0,
    reloading: false,
    reloadProg: 0,
    score: 0,
    kills: 0,
    waveNum: 1,
    invincTimer: 0,
    respawnTimer: 0
};

// Ammo Crates
let ammoCrates = [];

// Death fix variables
let deathHandled = false;

function initGame() {
    // ... (existing scene, camera, renderer setup remains the same)
    buildWorld();
    spawnAmmoCrates();
}

// ── Ammo Crates ─────────────────────────────────────────────
function spawnAmmoCrates() {
    const positions = [[-10,0,-10], [10,0,10], [-15,0,15], [15,0,-15]];
    ammoCrates = [];
    positions.forEach(p => {
        // Create visual crate (simplified)
        const crate = { pos: new THREE.Vector3(...p), active: true };
        ammoCrates.push(crate);
        // Add mesh in real implementation
    });
}

function checkAmmoCrateInteraction() {
    for (let crate of ammoCrates) {
        if (!crate.active) continue;
        const dist = player.pos.distanceTo(crate.pos);
        if (dist < 3 && keys['e']) {
            refillAmmo();
            crate.active = false;
            setTimeout(() => crate.active = true, 15000); // respawn
            keys['e'] = false;
        }
    }
}

function refillAmmo() {
    const w = WEAPON_KEYS[player.weapIdx];
    player.ammo[w].mag = WDATA[w].mag;
    playTone(800, 0.1, 'sine', 0.2);
}

// ── Enhanced Death Logic (Fixed) ─────────────────────────────
function handlePlayerDeath() {
    if (deathHandled || !player.alive) return;
    deathHandled = true;
    player.alive = false;
    player.hp = 0;
    player.vel.set(0,0,0);

    // Show WASTED screen (existing)
    showWastedScreen();

    // Clean state
    player.respawnTimer = 4.0; // seconds before respawn option
    gameState = GS.DEAD;

    setTimeout(() => {
        deathHandled = false;
    }, 500);
}

function respawnPlayer() {
    player.pos.set(0, EYE_H, 0);
    player.hp = player.maxHp;
    player.alive = true;
    player.vel.set(0,0,0);
    player.invincTimer = 3.0;
    gameState = GS.PLAYING;
    deathHandled = false;
    // Reset enemies if needed
}

// ── Main Update Loop ─────────────────────────────────────────
function update(dt) {
    if (!player.alive) {
        player.respawnTimer -= dt;
        if (player.respawnTimer <= 0 && (keys['r'] || keys[' '])) {
            respawnPlayer();
        }
        return;
    }

    // Existing movement, shooting, etc.
    checkAmmoCrateInteraction();

    if (player.hp <= 0) {
        handlePlayerDeath();
    }

    // Invincibility
    if (player.invincTimer > 0) player.invincTimer -= dt;
}

// Weapon switching and firing (extended with new weapons)
function fireWeapon() {
    const wKey = WEAPON_KEYS[player.weapIdx];
    const w = WDATA[wKey];
    if (player.ammo[wKey].mag <= 0) {
        sndEmpty();
        return;
    }
    // ... existing firing logic with new weapons supported
    player.ammo[wKey].mag--;
}

// Keyboard handling
document.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (e.key === 'q' || e.key === 'Q') toggleWeaponWheel();
});

// Initialize
initGame();

// Export for other modules
window.gameUpdate = update;
window.respawnPlayer = respawnPlayer;