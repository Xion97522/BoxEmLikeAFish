'use strict';
// =====================================================================
//  ZONE BREACH  —  Full Xbox FPS  (Three.js r128)
// =====================================================================

// ── Constants ────────────────────────────────────────────────────────
const GS = { MENU:0, PLAYING:1, PAUSED:2, WAVE_CLEAR:3, DEAD:4 };
const HALF  = 28;           // arena half-size (walls at ±HALF)
const EYE_H = 1.65;         // camera height
const GRAVITY     = -22;
const JUMP_VEL    = 7.5;
const WALK_SPEED  = 7.5;
const SPRINT_MULT = 1.7;
const MOUSE_SENS  = 0.0018;
const STICK_SENS  = 2.2;    // rad/s at full deflection

// ── Weapon Data ──────────────────────────────────────────────────────
const WDATA = {
    pistol:  { label:'PISTOL',        dmg:32, rate:0.45, mag:12,  res:Infinity, spread:0.012, auto:false, pellets:1, reloadTime:1.1 },
    ar:      { label:'ASSAULT RIFLE', dmg:20, rate:0.09, mag:30,  res:150,      spread:0.038, auto:true,  pellets:1, reloadTime:1.9 },
    shotgun: { label:'SHOTGUN',       dmg:18, rate:0.75, mag:8,   res:40,       spread:0.13,  auto:false, pellets:8, reloadTime:2.4 },
};
const WEAPON_KEYS = ['pistol','ar','shotgun'];

// ── Enemy Data ───────────────────────────────────────────────────────
const EDATA = {
    scout: { label:'SCOUT', hp:55,  spd:5.5, atkDmg:8,  atkRange:1.8, atkRate:0.85, color:0xff5555, emissive:0x551111, pts:100, h:1.5, r:0.3 },
    grunt: { label:'GRUNT', hp:110, spd:3.4, atkDmg:15, atkRange:2.0, atkRate:1.3,  color:0xcc1122, emissive:0x440000, pts:200, h:1.8, r:0.4 },
    heavy: { label:'HEAVY', hp:280, spd:1.7, atkDmg:30, atkRange:2.3, atkRate:1.9,  color:0x880011, emissive:0x220000, pts:500, h:2.0, r:0.55 },
};

// ── Wave Table ───────────────────────────────────────────────────────
const WAVE_TABLE = [
    [{t:'scout',n:3}],
    [{t:'scout',n:4},{t:'grunt',n:1}],
    [{t:'grunt',n:3},{t:'scout',n:3}],
    [{t:'grunt',n:4},{t:'heavy',n:1}],
    [{t:'scout',n:4},{t:'grunt',n:3},{t:'heavy',n:1}],
    [{t:'grunt',n:5},{t:'heavy',n:2}],
    [{t:'heavy',n:2},{t:'grunt',n:6}],
    [{t:'heavy',n:3},{t:'grunt',n:5},{t:'scout',n:5}],
    [{t:'heavy',n:4},{t:'grunt',n:7},{t:'scout',n:4}],
    [{t:'heavy',n:5},{t:'grunt',n:8},{t:'scout',n:6}],
];
function getWaveSpawns(w) {
    if (w <= WAVE_TABLE.length) return WAVE_TABLE[w-1];
    const scale = w - WAVE_TABLE.length;
    return [{t:'scout',n:3+scale},{t:'grunt',n:3+scale},{t:'heavy',n:1+Math.floor(scale/2)}];
}

// ── Globals ──────────────────────────────────────────────────────────
let scene, camera, renderer, clock;
let gameState = GS.MENU;
let animId    = null;

// Player
const player = {
    pos:    new THREE.Vector3(0, EYE_H, 0),
    vel:    new THREE.Vector3(),
    yaw:    0, pitch: 0,
    hp: 100, maxHp: 100,
    grounded: false,
    alive: true,
    weapIdx: 0,
    ammo: { pistol:{mag:12,res:Infinity}, ar:{mag:30,res:150}, shotgun:{mag:8,res:40} },
    fireCd:   0,
    reloading: false,
    reloadProg: 0,
    score: 0,
    kills: 0,
    waveNum: 1,
    invincTimer: 0,  // brief invulnerability after hit
};

// Enemies array
let enemies = [];

// World obstacle boxes (AABB for collision: {cx,cz,hw,hd} half-width/depth)
let obstacles = [];
// Three.js meshes for enemies stored here (enemies[i].mesh)

// Particles
let particles = [];

// Input
const keys = {};
let mouse = { dx:0, dy:0, left:false, locked:false };
let padState = { lx:0,ly:0,rx:0,ry:0, rt:0, lt:0, a:false, b:false, rb:false, lb:false, y:false, start:false };
let padPrev   = {};

// Timers / wave
let waveClearTimer = 0;
let spawnQueue     = [];
let spawnTimer     = 0;
let waveActive     = false;

// Muzzle flash
let muzzleFlash = null;
let muzzleTimer = 0;

// Screen flash
let damageFlashAlpha = 0;
let hitDirTimers     = {n:0,s:0,e:0,w:0};

// Hitmarker
let hitmarkerTimer = 0;

// Crosshair spread
let chSpread = 0;

// Audio
let audioCtx = null;

// ── Audio ─────────────────────────────────────────────────────────────
function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playTone(freq, dur, type='square', vol=0.12, detune=0) {
    if (!audioCtx) return;
    try {
        const osc  = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = type; osc.frequency.value = freq; osc.detune.value = detune;
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        osc.start(); osc.stop(audioCtx.currentTime + dur);
    } catch(e){}
}

function playNoise(dur, vol=0.15, filterFreq=1200) {
    if (!audioCtx) return;
    try {
        const buf   = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
        const data  = buf.getChannelData(0);
        for (let i=0;i<data.length;i++) data[i] = Math.random()*2-1;
        const src   = audioCtx.createBufferSource();
        src.buffer  = buf;
        const filt  = audioCtx.createBiquadFilter();
        filt.type   = 'bandpass'; filt.frequency.value = filterFreq; filt.Q.value = 2;
        const gain  = audioCtx.createGain();
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        src.connect(filt); filt.connect(gain); gain.connect(audioCtx.destination);
        src.start(); src.stop(audioCtx.currentTime + dur);
    } catch(e){}
}

function sndShoot(wName) {
    initAudio();
    if (wName === 'pistol') {
        playNoise(0.08, 0.3, 900);
        playTone(180, 0.08, 'sawtooth', 0.1);
    } else if (wName === 'ar') {
        playNoise(0.06, 0.25, 1200);
        playTone(140, 0.06, 'sawtooth', 0.08);
    } else {
        playNoise(0.12, 0.5, 600);
        playTone(90, 0.1, 'sawtooth', 0.12);
    }
}

function sndReload() { initAudio(); playTone(300, 0.05, 'square', 0.06); setTimeout(()=>playTone(500,0.05,'square',0.06), 120); }
function sndHit()    { initAudio(); playTone(800, 0.05, 'sine', 0.08); }
function sndDie()    { initAudio(); playNoise(0.1, 0.2, 400); playTone(200, 0.15, 'sawtooth', 0.1); }
function sndPlayerHit() { initAudio(); playNoise(0.15, 0.4, 300); playTone(120, 0.1, 'square', 0.1); }
function sndEmpty()  { initAudio(); playTone(200, 0.06, 'square', 0.04); }
function sndJump()   { initAudio(); playTone(400, 0.06, 'sine', 0.04); }
function sndWaveClear() {
    initAudio();
    [523, 659, 784, 1047].forEach((f,i) => setTimeout(()=>playTone(f, 0.15, 'sine', 0.08), i*100));
}

// ── Scene / Rendering ────────────────────────────────────────────────
function initScene() {
    scene    = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a0f0a, 20, 65);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.05, 120);
    camera.position.copy(player.pos);

    const canvas = document.getElementById('canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x060a06);

    clock = new THREE.Clock();

    buildWorld();
    buildMuzzleFlash();

    window.addEventListener('resize', onResize);
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ── World ────────────────────────────────────────────────────────────
function buildWorld() {
    // Directional light (sun)
    const dir = new THREE.DirectionalLight(0xffeedd, 1.0);
    dir.position.set(10, 20, 10);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.near = 0.5; dir.shadow.camera.far = 100;
    dir.shadow.camera.left = -40; dir.shadow.camera.right = 40;
    dir.shadow.camera.top  =  40; dir.shadow.camera.bottom= -40;
    scene.add(dir);

    // Ambient
    scene.add(new THREE.AmbientLight(0x223322, 0.8));

    // Accent point lights (Xbox green)
    const colors = [0x107c10, 0x0a5010, 0x108c10];
    const positions = [[-20,3,-20],[20,3,20],[-20,3,20]];
    positions.forEach((p,i) => {
        const pl = new THREE.PointLight(colors[i], 1.5, 30);
        pl.position.set(...p); scene.add(pl);
    });

    // Floor
    const floorGeo = new THREE.PlaneGeometry(HALF*2, HALF*2, 16, 16);
    const floorMat = new THREE.MeshLambertMaterial({ color:0x1a2a1a });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI/2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Floor grid lines
    const gridHelper = new THREE.GridHelper(HALF*2, 28, 0x1f3a1f, 0x152515);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    // Ceiling (dark)
    const ceilGeo = new THREE.PlaneGeometry(HALF*2, HALF*2);
    const ceilMat = new THREE.MeshLambertMaterial({ color:0x0a100a, side:THREE.BackSide });
    const ceil = new THREE.Mesh(ceilGeo, ceilMat);
    ceil.rotation.x = Math.PI/2; ceil.position.y = 8;
    scene.add(ceil);

    // Walls
    makeWall(0,     4, -HALF, HALF*2, 8, 0.5, 0x1a2a1a, false);  // N
    makeWall(0,     4,  HALF, HALF*2, 8, 0.5, 0x1a2a1a, false);  // S
    makeWall(-HALF, 4,  0,    0.5, 8, HALF*2, 0x1a2a1a, true);   // W
    makeWall( HALF, 4,  0,    0.5, 8, HALF*2, 0x1a2a1a, true);   // E

    // Register arena walls as collision boxes
    obstacles.push(
        {cx:0,   cz:-HALF, hw:HALF, hd:0.5},
        {cx:0,   cz: HALF, hw:HALF, hd:0.5},
        {cx:-HALF, cz:0,   hw:0.5, hd:HALF},
        {cx: HALF, cz:0,   hw:0.5, hd:HALF},
    );

    // Crates / cover
    const cratePositions = [
        [-12, 0, -12], [12, 0, -12], [-12, 0, 12], [12, 0, 12],
        [0, 0, -16],   [0, 0, 16],   [-16, 0, 0],  [16, 0, 0],
        [-6, 0, -6],   [6, 0, -6],   [-6, 0, 6],   [6, 0, 6],
        [-20, 0, 8],   [20, 0, -8],  [8, 0, -20],  [-8, 0, 20],
    ];

    cratePositions.forEach(([x,y,z]) => {
        const w  = 1.2 + Math.random()*1.0;
        const h  = 1.0 + Math.random()*1.5;
        const d  = 1.2 + Math.random()*1.0;
        const geo = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshLambertMaterial({
            color: Math.random() > 0.5 ? 0x3a4a3a : 0x2a3a2a
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, h/2, z);
        mesh.castShadow = true; mesh.receiveShadow = true;
        // slight rotation variety
        mesh.rotation.y = (Math.random()-0.5)*0.4;
        scene.add(mesh);
        // Register collision (axis-aligned, so approximate)
        obstacles.push({cx:x, cz:z, hw:w/2+0.1, hd:d/2+0.1});
    });

    // Spawn point markers (decorative)
    const spawnRing = new THREE.RingGeometry(0.4, 0.5, 16);
    const spawnMat  = new THREE.MeshBasicMaterial({ color:0x107c10, side:THREE.DoubleSide, transparent:true, opacity:0.4 });
    getSpawnPositions(8).forEach(p => {
        const m = new THREE.Mesh(spawnRing, spawnMat);
        m.rotation.x = -Math.PI/2; m.position.set(p.x, 0.02, p.z);
        scene.add(m);
    });
}

function makeWall(x, y, z, w, h, d, color, castShadow) {
    const geo  = new THREE.BoxGeometry(w, h, d);
    const mat  = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow  = castShadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
}

function buildMuzzleFlash() {
    const geo  = new THREE.SphereGeometry(0.08, 6, 4);
    const mat  = new THREE.MeshBasicMaterial({ color:0xffff88, transparent:true, opacity:0.9 });
    muzzleFlash = new THREE.Mesh(geo, mat);
    muzzleFlash.visible = false;
    camera.add(muzzleFlash);
    muzzleFlash.position.set(0.22, -0.16, -0.5);
    scene.add(camera);
}

// ── Enemy spawning ────────────────────────────────────────────────────
function getSpawnPositions(count) {
    const edges = [];
    for (let i=0; i<count; i++) {
        const side = i % 4;
        const t    = (Math.random()-0.5)*(HALF*2-4);
        if (side===0)      edges.push({x: t, z:-(HALF-3)});
        else if (side===1) edges.push({x: t, z:  HALF-3});
        else if (side===2) edges.push({x:-(HALF-3), z: t});
        else               edges.push({x:  HALF-3,  z: t});
    }
    return edges;
}

function buildEnemyMesh(type) {
    const d   = EDATA[type];
    const geo = new THREE.BoxGeometry(d.r*2, d.h, d.r*2);
    const mat = new THREE.MeshPhongMaterial({
        color:    d.color,
        emissive: d.emissive,
        emissiveIntensity: 0.3,
        shininess: 20,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;

    // Eyes (glow)
    const eyeGeo = new THREE.SphereGeometry(0.06, 6, 4);
    const eyeMat = new THREE.MeshBasicMaterial({ color:0xff4444 });
    const eyeL   = new THREE.Mesh(eyeGeo, eyeMat);
    const eyeR   = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-d.r*0.45, d.h*0.3, -d.r*0.8);
    eyeR.position.set( d.r*0.45, d.h*0.3, -d.r*0.8);
    mesh.add(eyeL); mesh.add(eyeR);

    // Health bar (plane above enemy)
    const barBgGeo = new THREE.PlaneGeometry(0.8, 0.08);
    const barBgMat = new THREE.MeshBasicMaterial({ color:0x222222, side:THREE.DoubleSide });
    const barBg    = new THREE.Mesh(barBgGeo, barBgMat);
    barBg.position.set(0, d.h*0.5+0.25, 0);
    barBg.rotation.x = -Math.PI/2 + 0.6;
    mesh.add(barBg);

    const barFgGeo = new THREE.PlaneGeometry(0.8, 0.07);
    const barFgMat = new THREE.MeshBasicMaterial({ color:0x22dd22, side:THREE.DoubleSide });
    const barFg    = new THREE.Mesh(barFgGeo, barFgMat);
    barFg.position.set(0, d.h*0.5+0.26, 0);
    barFg.rotation.x = -Math.PI/2 + 0.6;
    mesh.add(barFg);

    return { mesh, barFg };
}

function spawnEnemy(type, x, z) {
    const d    = EDATA[type];
    const { mesh, barFg } = buildEnemyMesh(type);
    mesh.position.set(x, d.h/2, z);
    scene.add(mesh);

    enemies.push({
        type, mesh, barFg,
        hp: d.hp, maxHp: d.hp,
        spd: d.spd,
        atkDmg: d.atkDmg,
        atkRange: d.atkRange,
        atkRate:  d.atkRate,
        atkTimer: Math.random(),
        pts: d.pts,
        r: d.r,
        h: d.h,
        alive: true,
        hitFlash: 0,
        deathTimer: -1,
        wanderAngle: Math.random()*Math.PI*2,
        wanderTimer: 0,
    });
}

// ── Waves ─────────────────────────────────────────────────────────────
function startWave(n) {
    player.waveNum = n;
    waveActive     = true;
    spawnQueue     = [];
    enemies        = [];
    // Clear old enemy meshes
    scene.children
        .filter(c => c.userData.isEnemyMesh)
        .forEach(c => scene.remove(c));

    const spawns = getWaveSpawns(n);
    spawns.forEach(({t, n: cnt}) => {
        for (let i=0; i<cnt; i++) {
            spawnQueue.push(t);
        }
    });
    // Shuffle spawn queue
    for (let i=spawnQueue.length-1; i>0; i--) {
        const j = Math.floor(Math.random()*(i+1));
        [spawnQueue[i],spawnQueue[j]] = [spawnQueue[j],spawnQueue[i]];
    }
    spawnTimer = 0;
    updateHUD();
    showNotif(`WAVE ${n} — ${spawnQueue.length} ENEMIES`);
}

function processSpawnQueue(dt) {
    if (!spawnQueue.length) return;
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
        const type = spawnQueue.shift();
        const pos  = getSpawnPositions(1)[0];
        spawnEnemy(type, pos.x, pos.z);
        spawnTimer = 0.5 + Math.random()*0.3;
    }
}

// ── Player input / movement ───────────────────────────────────────────
function initInput() {
    // Keyboard
    document.addEventListener('keydown', e => {
        keys[e.code] = true;
        if (gameState === GS.PLAYING) {
            if (e.code === 'Escape') pause();
            if (e.code === 'KeyR')    tryReload();
            if (e.code === 'Digit1')  switchWeapon(0);
            if (e.code === 'Digit2')  switchWeapon(1);
            if (e.code === 'Digit3')  switchWeapon(2);
            if (e.code === 'Space' && player.grounded) doJump();
        }
        if (gameState === GS.PAUSED && e.code === 'Escape') resumeGame();
    });
    document.addEventListener('keyup', e => { keys[e.code] = false; });

    // Mouse move
    document.addEventListener('mousemove', e => {
        if (!mouse.locked) return;
        mouse.dx += e.movementX;
        mouse.dy += e.movementY;
    });
    document.addEventListener('mousedown', e => {
        if (e.button === 0) mouse.left = true;
        if (!mouse.locked && gameState === GS.PLAYING) {
            document.getElementById('canvas').requestPointerLock();
        }
    });
    document.addEventListener('mouseup', e => { if (e.button === 0) mouse.left = false; });

    // Pointer lock
    document.addEventListener('pointerlockchange', () => {
        mouse.locked = document.pointerLockElement === document.getElementById('canvas');
        const lockPrompt = document.getElementById('lock-prompt');
        if (mouse.locked) {
            lockPrompt.classList.add('hidden');
        } else if (gameState === GS.PLAYING) {
            lockPrompt.classList.remove('hidden');
        }
    });

    // Click anywhere on canvas to lock
    document.getElementById('canvas').addEventListener('click', () => {
        if (gameState === GS.PLAYING && !mouse.locked) {
            document.getElementById('canvas').requestPointerLock();
        }
    });
    document.getElementById('lock-prompt').addEventListener('click', () => {
        if (gameState === GS.PLAYING) document.getElementById('canvas').requestPointerLock();
    });
}

function doJump() {
    player.vel.y = JUMP_VEL;
    player.grounded = false;
    sndJump();
}

function switchWeapon(idx) {
    if (player.reloading) return;
    if (player.weapIdx === idx) return;
    player.weapIdx   = idx;
    player.fireCd    = 0;
    player.reloading = false;
    updateHUD();
    chSpread = 0;
}

function tryReload() {
    if (player.reloading) return;
    const wk = WEAPON_KEYS[player.weapIdx];
    const wd = WDATA[wk];
    const am = player.ammo[wk];
    if (am.mag === wd.mag) return;         // already full
    if (am.res === 0) { showNotif('NO AMMO'); return; }
    player.reloading   = true;
    player.reloadProg  = 0;
    sndReload();
    document.getElementById('reload-bar-wrap').classList.remove('hidden');
}

function finishReload() {
    const wk  = WEAPON_KEYS[player.weapIdx];
    const wd  = WDATA[wk];
    const am  = player.ammo[wk];
    const need = wd.mag - am.mag;
    if (am.res === Infinity) {
        am.mag = wd.mag;
    } else {
        const take = Math.min(need, am.res);
        am.mag += take;
        am.res -= take;
    }
    player.reloading  = false;
    player.reloadProg = 0;
    document.getElementById('reload-bar-wrap').classList.add('hidden');
    updateHUD();
}

// ── Collision ─────────────────────────────────────────────────────────
function resolvePlayerObstacle(px, pz, radius) {
    let nx = px, nz = pz;
    for (const ob of obstacles) {
        const dx = Math.abs(nx - ob.cx);
        const dz = Math.abs(nz - ob.cz);
        const ox = ob.hw + radius;
        const oz = ob.hd + radius;
        if (dx < ox && dz < oz) {
            const overlapX = ox - dx;
            const overlapZ = oz - dz;
            if (overlapX < overlapZ) {
                nx += (nx < ob.cx ? -overlapX : overlapX);
            } else {
                nz += (nz < ob.cz ? -overlapZ : overlapZ);
            }
        }
    }
    return { x: nx, z: nz };
}

function resolveEnemyObstacle(ex, ez, radius) {
    return resolvePlayerObstacle(ex, ez, radius);
}

// ── Shooting ──────────────────────────────────────────────────────────
function shoot() {
    if (!player.alive) return;
    const wk = WEAPON_KEYS[player.weapIdx];
    const wd = WDATA[wk];
    const am = player.ammo[wk];

    if (player.reloading) return;
    if (am.mag <= 0) {
        sndEmpty();
        if (am.res > 0) tryReload();
        return;
    }
    if (player.fireCd > 0) return;

    am.mag--;
    player.fireCd = wd.rate;
    chSpread = Math.min(chSpread + 0.08, 0.25);

    sndShoot(wk);

    // Muzzle flash
    muzzleFlash.visible = true;
    muzzleTimer = 0.06;
    muzzleFlash.material.color.setHex(wk==='shotgun' ? 0xffaa44 : 0xffff88);

    // Raycast for each pellet
    const raycaster = new THREE.Raycaster();
    let hitAny = false;

    for (let p=0; p<wd.pellets; p++) {
        const sx = (Math.random()-0.5)*wd.spread;
        const sy = (Math.random()-0.5)*wd.spread;
        const dir = new THREE.Vector3(sx, sy, -1).normalize();
        dir.applyQuaternion(camera.quaternion);
        raycaster.set(camera.position, dir);

        // Build target meshes
        const meshes = enemies.filter(e=>e.alive).map(e=>e.mesh);
        const hits   = raycaster.intersectObjects(meshes, true);

        if (hits.length > 0) {
            hitAny = true;
            // Find which enemy
            const hitMesh = hits[0].object;
            const enemy = enemies.find(e => e.alive && (e.mesh === hitMesh || hitMesh.parent === e.mesh));
            if (enemy) {
                damageEnemy(enemy, wd.dmg, hits[0].point);
            }
        }
    }

    if (hitAny) {
        triggerHitmarker();
        sndHit();
    }

    // Auto-reload if empty
    if (am.mag === 0 && am.res > 0) {
        setTimeout(tryReload, 100);
    }

    updateHUD();
}

function damageEnemy(enemy, dmg, hitPoint) {
    enemy.hp -= dmg;
    enemy.hitFlash = 0.12;

    // Damage particles
    spawnHitParticles(hitPoint || enemy.mesh.position.clone(), 6);

    // Update health bar
    const pct = Math.max(0, enemy.hp / enemy.maxHp);
    enemy.barFg.scale.x  = pct;
    enemy.barFg.position.x = (pct-1)*0.4;
    enemy.barFg.material.color.setRGB(1-pct, pct*0.8, 0);

    if (enemy.hp <= 0) {
        killEnemy(enemy);
    }
}

function killEnemy(enemy) {
    if (!enemy.alive) return;
    enemy.alive  = false;
    enemy.deathTimer = 0.35;
    sndDie();
    spawnDeathParticles(enemy.mesh.position.clone().add(new THREE.Vector3(0, enemy.h/2, 0)), enemy);
    player.kills++;
    player.score += enemy.pts;
    updateHUD();
}

// ── Particles ─────────────────────────────────────────────────────────
function spawnHitParticles(pos, count=5) {
    for (let i=0; i<count; i++) {
        const geo  = new THREE.SphereGeometry(0.04 + Math.random()*0.04, 4, 4);
        const mat  = new THREE.MeshBasicMaterial({ color:0xffbb44 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        const vel  = new THREE.Vector3((Math.random()-0.5)*6, Math.random()*4, (Math.random()-0.5)*6);
        scene.add(mesh);
        particles.push({ mesh, vel, life:0.3, maxLife:0.3 });
    }
}

function spawnDeathParticles(pos, enemy) {
    for (let i=0; i<12; i++) {
        const geo  = new THREE.BoxGeometry(0.15, 0.15, 0.15);
        const mat  = new THREE.MeshBasicMaterial({ color: EDATA[enemy.type].color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        const vel  = new THREE.Vector3((Math.random()-0.5)*8, 2+Math.random()*5, (Math.random()-0.5)*8);
        scene.add(mesh);
        particles.push({ mesh, vel, life:0.6, maxLife:0.6, gravity:true });
    }
}

// ── HUD ───────────────────────────────────────────────────────────────
function updateHUD() {
    const wk  = WEAPON_KEYS[player.weapIdx];
    const am  = player.ammo[wk];

    document.getElementById('health-bar').style.width = (player.hp/player.maxHp*100) + '%';
    document.getElementById('health-val').textContent = Math.ceil(player.hp);
    document.getElementById('wave-num').textContent   = String(player.waveNum).padStart(2,'0');
    document.getElementById('score-val').textContent  = String(player.score).padStart(6,'0');
    document.getElementById('kill-val').textContent   = String(player.kills).padStart(2,'0');
    document.getElementById('weapon-name').textContent= WDATA[wk].label;
    document.getElementById('ammo-mag').textContent   = am.mag;
    document.getElementById('ammo-res').textContent   = am.res === Infinity ? '∞' : am.res;
    document.getElementById('enemy-count').textContent= String(enemies.filter(e=>e.alive).length + spawnQueue.length).padStart(2,'0');

    // Ammo color warning
    const magEl = document.getElementById('ammo-mag');
    magEl.className = 'ammo-mag';
    const pct = am.mag / WDATA[wk].mag;
    if (am.mag === 0) magEl.classList.add('ammo-empty');
    else if (pct <= 0.25) magEl.classList.add('ammo-low');

    // Weapon slot highlight
    WEAPON_KEYS.forEach((_, i) => {
        document.getElementById(`ws-${i}`).classList.toggle('active', i === player.weapIdx);
    });
}

function triggerHitmarker() {
    const hm = document.getElementById('hitmarker');
    hm.classList.remove('hidden');
    hm.style.animation = 'none';
    hm.offsetHeight;   // reflow
    hm.style.animation = 'hitFade 0.35s ease forwards';
    hitmarkerTimer = 0.35;
}

function showDamageFlash(dir3d) {
    damageFlashAlpha = 1;
    // Direction indicators
    if (dir3d) {
        const angle = Math.atan2(dir3d.x, dir3d.z) - player.yaw;
        const a = ((angle % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
        if      (a < Math.PI*0.25 || a > Math.PI*1.75) { hitDirTimers.n = 1.0; }
        else if (a < Math.PI*0.75)                      { hitDirTimers.e = 1.0; }
        else if (a < Math.PI*1.25)                      { hitDirTimers.s = 1.0; }
        else                                             { hitDirTimers.w = 1.0; }
    }
}

function showNotif(msg) {
    const el = document.getElementById('notif');
    el.textContent = msg;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = 'notifFade 2s ease forwards';
    setTimeout(() => el.classList.add('hidden'), 2000);
}

// ── Update crosshair spread ─────────────────────────────────────────
function updateCrosshair(dt) {
    chSpread = Math.max(0, chSpread - dt*0.4);
    const spread = chSpread * 30;
    const top = document.querySelector('#crosshair .ch-top');
    const bot = document.querySelector('#crosshair .ch-bottom');
    const lft = document.querySelector('#crosshair .ch-left');
    const rgt = document.querySelector('#crosshair .ch-right');
    if (top) {
        top.style.transform    = `translateX(-50%) translateY(-${spread}px)`;
        bot.style.transform    = `translateX(-50%) translateY(${spread}px)`;
        lft.style.transform    = `translateY(-50%) translateX(-${spread}px)`;
        rgt.style.transform    = `translateY(-50%) translateX(${spread}px)`;
    }
}

// ── Gamepad ───────────────────────────────────────────────────────────
function pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) { if (p && p.connected) { gp = p; break; } }
    if (!gp) { padState = { lx:0,ly:0,rx:0,ry:0,rt:0,lt:0,a:false,b:false,rb:false,lb:false,y:false,start:false }; return; }

    const ax = gp.axes;
    const bt = gp.buttons;
    const dead = 0.12;

    function axis(v) { return Math.abs(v) > dead ? v : 0; }

    padPrev  = { ...padState };
    padState = {
        lx: axis(ax[0] || 0),
        ly: axis(ax[1] || 0),
        rx: axis(ax[2] || 0),
        ry: axis(ax[3] || 0),
        rt: bt[7] ? bt[7].value : 0,
        lt: bt[6] ? bt[6].value : 0,
        a:     bt[0]  ? bt[0].pressed  : false,
        b:     bt[1]  ? bt[1].pressed  : false,
        x:     bt[2]  ? bt[2].pressed  : false,
        y:     bt[3]  ? bt[3].pressed  : false,
        lb:    bt[4]  ? bt[4].pressed  : false,
        rb:    bt[5]  ? bt[5].pressed  : false,
        start: bt[9]  ? bt[9].pressed  : false,
        back:  bt[8]  ? bt[8].pressed  : false,
    };

    if (gameState === GS.PLAYING) {
        if (padState.start && !padPrev.start) pause();
        if (padState.rb    && !padPrev.rb)    tryReload();
        if (padState.lb    && !padPrev.lb)    switchWeapon((player.weapIdx + 1) % 3);
        if (padState.y     && !padPrev.y)     switchWeapon((player.weapIdx + 2) % 3);
        if (padState.a     && !padPrev.a && player.grounded) doJump();
    }
    if (gameState === GS.PAUSED) {
        if (padState.start && !padPrev.start) resumeGame();
        if (padState.b     && !padPrev.b)     returnToMenu();
    }
    if (gameState === GS.DEAD) {
        if (padState.a && !padPrev.a) startGame();
        if (padState.b && !padPrev.b) returnToMenu();
    }
}

// ── Main update ───────────────────────────────────────────────────────
function update(dt) {
    if (gameState !== GS.PLAYING) return;

    pollGamepad();

    const wk = WEAPON_KEYS[player.weapIdx];
    const wd = WDATA[wk];

    // ── Look ──
    const lookX = mouse.dx * MOUSE_SENS + padState.rx * STICK_SENS * dt;
    const lookY = mouse.dy * MOUSE_SENS + padState.ry * STICK_SENS * dt;
    mouse.dx = 0; mouse.dy = 0;

    player.yaw   -= lookX;
    player.pitch -= lookY;
    player.pitch  = Math.max(-Math.PI*0.47, Math.min(Math.PI*0.47, player.pitch));

    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;

    // ── Move ──
    const sprint  = (keys['ShiftLeft'] || keys['ShiftRight'] || padState.lt > 0.5) ? SPRINT_MULT : 1;
    const spd     = WALK_SPEED * sprint;
    const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const right   = new THREE.Vector3( Math.cos(player.yaw), 0, -Math.sin(player.yaw));

    let moveX = 0, moveZ = 0;
    if (keys['KeyW'] || keys['ArrowUp'])    { moveX += forward.x; moveZ += forward.z; }
    if (keys['KeyS'] || keys['ArrowDown'])  { moveX -= forward.x; moveZ -= forward.z; }
    if (keys['KeyA'] || keys['ArrowLeft'])  { moveX -= right.x;   moveZ -= right.z; }
    if (keys['KeyD'] || keys['ArrowRight']) { moveX += right.x;   moveZ += right.z; }
    moveX += -padState.ly * forward.x + -padState.lx * right.x;
    moveZ += -padState.ly * forward.z + -padState.lx * right.z;

    const len = Math.sqrt(moveX*moveX + moveZ*moveZ);
    if (len > 0.001) { moveX = moveX/len * spd; moveZ = moveZ/len * spd; }

    player.vel.x = moveX;
    player.vel.z = moveZ;

    // Gravity
    if (!player.grounded) { player.vel.y += GRAVITY * dt; }

    // Integrate
    let nx = player.pos.x + player.vel.x * dt;
    let nz = player.pos.z + player.vel.z * dt;
    let ny = player.pos.y + player.vel.y * dt;

    // Collision
    const res = resolvePlayerObstacle(nx, nz, 0.35);
    nx = res.x; nz = res.z;

    // Floor
    if (ny - EYE_H <= 0.0) {
        ny = EYE_H;
        player.vel.y = 0;
        player.grounded = true;
    } else {
        player.grounded = false;
    }

    player.pos.set(nx, ny, nz);
    camera.position.copy(player.pos);
    // Bob
    if (len > 0.001 && player.grounded) {
        const bob = Math.sin(Date.now() * 0.008) * 0.025 * sprint;
        camera.position.y += bob;
    }

    // ── Shoot ──
    player.fireCd = Math.max(0, player.fireCd - dt);
    if (player.fireCd <= 0 && !player.reloading) {
        if (wd.auto) {
            // Full-auto: fire while held
            if (mouse.left || padState.rt > 0.5) shoot();
        } else {
            // Semi-auto: gamepad RT fresh press only (mouse handled by mousedown event)
            if (padState.rt > 0.5 && (!padPrev || (padPrev.rt || 0) <= 0.5)) shoot();
        }
    }

    // ── Reload ──
    if (player.reloading) {
        player.reloadProg += dt / WDATA[wk].reloadTime;
        document.getElementById('reload-bar').style.width = (Math.min(1, player.reloadProg)*100) + '%';
        if (player.reloadProg >= 1) finishReload();
    }

    // ── Invincibility timer ──
    if (player.invincTimer > 0) player.invincTimer -= dt;

    // ── Enemies ──
    processSpawnQueue(dt);
    updateEnemies(dt);

    // ── Particles ──
    updateParticles(dt);

    // ── Muzzle flash ──
    muzzleTimer -= dt;
    if (muzzleTimer <= 0) muzzleFlash.visible = false;

    // ── Damage flash ──
    damageFlashAlpha = Math.max(0, damageFlashAlpha - dt * 3);
    document.getElementById('damage-flash').style.opacity = damageFlashAlpha;

    // ── Hit dir indicators ──
    for (const dir of ['n','s','e','w']) {
        hitDirTimers[dir] = Math.max(0, hitDirTimers[dir] - dt * 2.5);
        const el = document.getElementById(`hit-${dir}`);
        el.style.opacity = hitDirTimers[dir];
        el.classList.toggle('hidden', hitDirTimers[dir] <= 0);
    }

    // ── Wave complete ──
    if (waveActive && enemies.every(e=>!e.alive) && spawnQueue.length === 0 && enemies.length > 0) {
        waveActive = false;
        onWaveClear();
    }

    // ── HUD enemy count ──
    document.getElementById('enemy-count').textContent =
        String(enemies.filter(e=>e.alive).length + spawnQueue.length).padStart(2,'0');

    updateCrosshair(dt);
}

// ── Enemies update ────────────────────────────────────────────────────
function updateEnemies(dt) {
    for (const e of enemies) {
        if (!e.alive) {
            // Death dissolve
            if (e.deathTimer > 0) {
                e.deathTimer -= dt;
                e.mesh.scale.y  = Math.max(0.01, e.deathTimer / 0.35);
                e.mesh.material.opacity = e.deathTimer / 0.35;
                e.mesh.material.transparent = true;
                if (e.deathTimer <= 0) scene.remove(e.mesh);
            }
            continue;
        }

        // Hit flash
        if (e.hitFlash > 0) {
            e.hitFlash -= dt;
            e.mesh.material.emissive.setHex(e.hitFlash > 0 ? 0xffffff : EDATA[e.type].emissive);
            e.mesh.material.emissiveIntensity = e.hitFlash > 0 ? 0.8 : 0.3;
        }

        // Move toward player
        const toPlayer = new THREE.Vector3(
            player.pos.x - e.mesh.position.x,
            0,
            player.pos.z - e.mesh.position.z
        );
        const dist = toPlayer.length();

        // Look at player
        e.mesh.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);

        if (dist > e.atkRange) {
            // Pursue
            toPlayer.normalize();
            const nx = e.mesh.position.x + toPlayer.x * e.spd * dt;
            const nz = e.mesh.position.z + toPlayer.z * e.spd * dt;
            const res = resolveEnemyObstacle(nx, nz, e.r + 0.1);
            e.mesh.position.x = res.x;
            e.mesh.position.z = res.z;
        }

        // Attack player
        if (dist <= e.atkRange) {
            e.atkTimer -= dt;
            if (e.atkTimer <= 0) {
                e.atkTimer = e.atkRate;
                if (player.invincTimer <= 0) {
                    player.hp -= e.atkDmg;
                    player.invincTimer = 0.3;
                    showDamageFlash(new THREE.Vector3(
                        e.mesh.position.x - player.pos.x, 0,
                        e.mesh.position.z - player.pos.z
                    ).normalize());
                    sndPlayerHit();
                    updateHUD();
                    if (player.hp <= 0) { player.hp = 0; onPlayerDead(); }
                }
            }
        } else {
            e.atkTimer = Math.max(0, e.atkTimer - dt);
        }

        // Health bar always faces camera
        e.mesh.children
            .filter(c => c.geometry && c.geometry.type === 'PlaneGeometry')
            .forEach(c => { c.lookAt(camera.position); });
    }
}

// ── Particles update ──────────────────────────────────────────────────
function updateParticles(dt) {
    for (let i=particles.length-1; i>=0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) { scene.remove(p.mesh); particles.splice(i, 1); continue; }
        if (p.gravity) p.vel.y += GRAVITY * dt * 0.5;
        p.mesh.position.add(p.vel.clone().multiplyScalar(dt));
        p.mesh.material.opacity = p.life / p.maxLife;
        p.mesh.material.transparent = true;
    }
}

// ── Wave clear ────────────────────────────────────────────────────────
function onWaveClear() {
    const bonus = player.waveNum * 500;
    player.score += bonus;
    updateHUD();
    sndWaveClear();

    const el = document.getElementById('wave-clear');
    const n  = document.getElementById('wave-clear-num');
    const b  = document.getElementById('wave-bonus');
    n.textContent = String(player.waveNum).padStart(2,'0');
    b.textContent = `+${bonus} WAVE BONUS`;
    el.classList.remove('hidden');

    gameState = GS.WAVE_CLEAR;
    waveClearTimer = 3.5;
}

function onPlayerDead() {
    if (!player.alive) return;
    player.alive = false;
    gameState = GS.DEAD;
    document.exitPointerLock();

    document.getElementById('go-score').textContent = player.score;
    document.getElementById('go-wave').textContent  = player.waveNum;
    document.getElementById('go-kills').textContent = player.kills;

    document.getElementById('hud').classList.add('hidden');
    document.getElementById('wave-clear').classList.add('hidden');
    setTimeout(() => document.getElementById('gameover-screen').classList.remove('hidden'), 1200);
}

// ── Game state controls ───────────────────────────────────────────────
function startGame() {
    // Reset player
    player.pos.set(0, EYE_H, 0);
    player.vel.set(0,0,0);
    player.yaw = 0; player.pitch = 0;
    player.hp = player.maxHp;
    player.alive     = true;
    player.weapIdx   = 0;
    player.fireCd    = 0;
    player.reloading = false;
    player.score     = 0;
    player.kills     = 0;
    player.waveNum   = 1;
    player.invincTimer = 0;
    player.ammo = {
        pistol:  { mag:12,  res:Infinity },
        ar:      { mag:30,  res:150 },
        shotgun: { mag:8,   res:40 },
    };

    // Clear enemies + particles
    enemies = [];
    particles.forEach(p => scene.remove(p.mesh));
    particles = [];
    spawnQueue = [];

    // UI
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('wave-clear').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('reload-bar-wrap').classList.add('hidden');

    gameState = GS.PLAYING;
    updateHUD();

    // Request pointer lock
    setTimeout(() => document.getElementById('canvas').requestPointerLock(), 100);

    // Start wave 1
    setTimeout(() => startWave(1), 600);
}

function pause() {
    if (gameState !== GS.PLAYING) return;
    gameState = GS.PAUSED;
    document.exitPointerLock();
    document.getElementById('pause-screen').classList.remove('hidden');
}

function resumeGame() {
    if (gameState !== GS.PAUSED) return;
    gameState = GS.PLAYING;
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('canvas').requestPointerLock();
}

function returnToMenu() {
    gameState = GS.MENU;
    document.exitPointerLock();
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('wave-clear').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
    enemies = []; spawnQueue = [];
    particles.forEach(p => scene.remove(p.mesh));
    particles = [];
}

function showControls()  { document.getElementById('controls-screen').classList.remove('hidden'); }
function hideControls()  { document.getElementById('controls-screen').classList.add('hidden'); }

// ── Semi-auto shoot on click ─────────────────────────────────────────
document.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (gameState !== GS.PLAYING || !mouse.locked) return;
    const wk = WEAPON_KEYS[player.weapIdx];
    if (!WDATA[wk].auto) shoot();
});

// ── Render loop ───────────────────────────────────────────────────────
function loop() {
    animId = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);

    // Wave clear countdown
    if (gameState === GS.WAVE_CLEAR) {
        waveClearTimer -= dt;
        if (waveClearTimer <= 0) {
            document.getElementById('wave-clear').classList.add('hidden');
            gameState = GS.PLAYING;
            startWave(player.waveNum + 1);
        }
    }

    update(dt);
    renderer.render(scene, camera);
}

// ── Boot ──────────────────────────────────────────────────────────────
function boot() {
    initScene();
    initInput();
    loop();
}

window.addEventListener('DOMContentLoaded', boot);

// Expose to HTML buttons
window.startGame   = startGame;
window.resumeGame  = resumeGame;
window.returnToMenu= returnToMenu;
window.showControls= showControls;
window.hideControls= hideControls;
