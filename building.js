// building.js — Fortnite-style building system for Zone Breach
(function () {
    'use strict';

    var BUILD_PIECES = [
        { label: 'WALL',  w: 2.8, h: 3.5,  d: 0.25, tilt: 0,   color: [0.76, 0.56, 0.26] },
        { label: 'FLOOR', w: 3.0, h: 0.25, d: 3.0,  tilt: 0,   color: [0.62, 0.47, 0.22] },
        { label: 'RAMP',  w: 3.0, h: 0.25, d: 3.5,  tilt: -28, color: [0.70, 0.52, 0.24] },
        { label: 'ROOF',  w: 3.0, h: 0.25, d: 3.0,  tilt: -45, color: [0.56, 0.42, 0.20] },
    ];

    var buildMode   = false;
    var pieceIdx    = 0;
    var GRID        = 3.0;
    var ghostEnt    = null;
    var ghostMat    = null;
    var builtPieces = [];

    var prevB = false, prevY = false, prevXBtn = false;

    // ── Wait for PlayCanvas ────────────────────────────────────────────
    var waitI = setInterval(function () {
        if (!window.pc || !pc.Application) return;
        var app = pc.Application.getApplication();
        if (!app) return;
        clearInterval(waitI);
        var tryInit = function () {
            var cams = app.root.findComponents('camera');
            if (!cams || !cams.length) { setTimeout(tryInit, 200); return; }
            init(app, cams[0].entity);
        };
        if (app.root && app.root.findComponents('camera').length) tryInit();
        else app.on('start', function () { setTimeout(tryInit, 200); });
    }, 150);

    // ── Init ──────────────────────────────────────────────────────────
    function init(app, cam) {
        ghostMat = new pc.StandardMaterial();
        ghostMat.diffuse    = new pc.Color(0.45, 0.85, 0.45);
        ghostMat.emissive   = new pc.Color(0.0, 0.18, 0.0);
        ghostMat.opacity    = 0.42;
        ghostMat.blendType  = pc.BLEND_NORMAL;
        ghostMat.depthWrite = false;
        ghostMat.cull       = pc.CULLFACE_NONE;
        ghostMat.update();

        ghostEnt = new pc.Entity('bld-ghost');
        ghostEnt.addComponent('render', { type: 'box', castShadows: false, receiveShadows: false });
        applyMat(ghostEnt, ghostMat);
        ghostEnt.enabled = false;
        app.root.addChild(ghostEnt);

        createHUD();

        document.addEventListener('keydown', function (e) {
            if (e.repeat) return;
            if (e.code === 'KeyQ') toggleBuild(app, cam);
            if (e.code === 'KeyE' && buildMode) cyclePiece(1);
            if (e.code === 'KeyF' && buildMode) placePiece(cam, app);
            if (e.code === 'KeyZ' && buildMode) undoLast(app);
        });

        // Expose globals for mobile overlay
        window.toggleBuildMode  = function () { toggleBuild(app, cam); };
        window.placeBuildPiece  = function () { if (buildMode) placePiece(cam, app); };
        window.cycleBuildPiece  = function (d) { if (buildMode) cyclePiece(d); };

        app.on('update', function (dt) {
            pollGamepad(cam, app);
            if (buildMode) updateGhost(cam);
        });
    }

    // ── Build-mode toggle ─────────────────────────────────────────────
    function toggleBuild(app, cam) {
        buildMode = !buildMode;
        ghostEnt.enabled = buildMode;
        updateHUD();
        showNotif(buildMode
            ? 'BUILD MODE  ·  F:place  E:cycle  Z:undo  Q:exit'
            : 'BUILD MODE  OFF');
    }

    function cyclePiece(dir) {
        pieceIdx = (pieceIdx + dir + BUILD_PIECES.length) % BUILD_PIECES.length;
        updateHUD();
    }

    // ── Ghost preview ─────────────────────────────────────────────────
    function updateGhost(cam) {
        var p   = BUILD_PIECES[pieceIdx];
        var fwd = cam.forward.clone();
        fwd.y   = 0;
        if (fwd.length() < 0.001) { fwd.set(0, 0, -1); }
        fwd.normalize();

        var camPos = cam.getPosition();
        var dist   = 3.4;
        var tx     = Math.round((camPos.x + fwd.x * dist) / GRID) * GRID;
        var tz     = Math.round((camPos.z + fwd.z * dist) / GRID) * GRID;

        var ty;
        if (p.label === 'WALL') {
            ty = p.h / 2;
        } else {
            ty = p.h / 2 + 0.01;
        }

        ghostEnt.setLocalScale(p.w, p.h, p.d);
        ghostEnt.setPosition(tx, ty, tz);

        var yaw = Math.atan2(fwd.x, fwd.z) * 180 / Math.PI;
        ghostEnt.setEulerAngles(p.tilt, yaw, 0);
    }

    // ── Place piece ───────────────────────────────────────────────────
    function placePiece(cam, app) {
        if (!ghostEnt || !ghostEnt.enabled) return;
        var p   = BUILD_PIECES[pieceIdx];
        var pos = ghostEnt.getPosition().clone();
        var rot = ghostEnt.getEulerAngles().clone();

        var ent = new pc.Entity('bld-' + Date.now());
        ent.addComponent('render', { type: 'box', castShadows: true, receiveShadows: true });

        var mat = new pc.StandardMaterial();
        mat.diffuse   = new pc.Color(p.color[0], p.color[1], p.color[2]);
        mat.shininess = 22;
        mat.update();
        applyMat(ent, mat);

        ent.setLocalScale(p.w, p.h, p.d);
        ent.setPosition(pos.x, pos.y, pos.z);
        ent.setEulerAngles(rot.x, rot.y, rot.z);
        app.root.addChild(ent);
        builtPieces.push(ent);

        playBuildSound();
        updateHUD();
    }

    function undoLast(app) {
        if (!builtPieces.length) return;
        builtPieces.pop().destroy();
        showNotif('REMOVED  (' + builtPieces.length + ' placed)');
        updateHUD();
    }

    // ── Gamepad polling ───────────────────────────────────────────────
    function pollGamepad(cam, app) {
        var pads = navigator.getGamepads ? navigator.getGamepads() : [];
        var gp   = null;
        for (var i = 0; i < pads.length; i++) {
            if (pads[i] && pads[i].connected) { gp = pads[i]; break; }
        }
        if (!gp) { prevB = prevY = prevXBtn = false; return; }

        var bt      = gp.buttons;
        var curB    = !!(bt[1] && bt[1].pressed);  // B = toggle
        var curY    = !!(bt[3] && bt[3].pressed);  // Y = cycle
        var curXBtn = !!(bt[2] && bt[2].pressed);  // X = place

        if (curB && !prevB) toggleBuild(app, cam);
        if (buildMode) {
            if (curY    && !prevY)    cyclePiece(1);
            if (curXBtn && !prevXBtn) placePiece(cam, app);
        }

        prevB = curB; prevY = curY; prevXBtn = curXBtn;
    }

    // ── Helpers ───────────────────────────────────────────────────────
    function applyMat(ent, mat) {
        if (ent.render && ent.render.meshInstances) {
            ent.render.meshInstances.forEach(function (mi) { mi.material = mat; });
        }
    }

    function playBuildSound() {
        try {
            var ctx  = new (window.AudioContext || window.webkitAudioContext)();
            var freqs = [440, 554, 659];
            freqs.forEach(function (f, i) {
                setTimeout(function () {
                    var o = ctx.createOscillator(); var g = ctx.createGain();
                    o.type = 'square'; o.frequency.value = f;
                    g.gain.setValueAtTime(0.07, ctx.currentTime);
                    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.11);
                    o.connect(g); g.connect(ctx.destination);
                    o.start(); o.stop(ctx.currentTime + 0.11);
                }, i * 55);
            });
        } catch (e) {}
    }

    // ── HUD ───────────────────────────────────────────────────────────
    var hudEl    = null;
    var pieceLbl = null;
    var countLbl = null;
    var slotEls  = [];
    var notifEl  = null;
    var notifTmr = null;

    function createHUD() {
        var F = 'font-family:"Segoe UI",Arial,sans-serif;';

        hudEl = document.createElement('div');
        hudEl.style.cssText =
            'position:fixed;bottom:82px;left:50%;transform:translateX(-50%);' +
            'display:none;flex-direction:column;align-items:center;gap:5px;' +
            'z-index:60;pointer-events:none;' + F;

        pieceLbl = document.createElement('div');
        pieceLbl.style.cssText =
            'font-size:11px;letter-spacing:3px;color:#4ade80;font-weight:800;text-transform:uppercase;' +
            'text-shadow:0 0 8px rgba(74,222,128,0.6);';

        var slotsWrap = document.createElement('div');
        slotsWrap.style.cssText = 'display:flex;gap:5px;';

        BUILD_PIECES.forEach(function (p, i) {
            var s = document.createElement('div');
            s.style.cssText =
                'padding:4px 11px;font-size:9px;letter-spacing:2px;font-weight:700;' +
                'background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.15);' +
                'color:rgba(255,255,255,0.38);transition:all 0.12s;text-transform:uppercase;';
            s.textContent = p.label;
            slotsWrap.appendChild(s);
            slotEls.push(s);
        });

        countLbl = document.createElement('div');
        countLbl.style.cssText =
            'font-size:9px;letter-spacing:2px;color:rgba(255,255,255,0.42);font-weight:600;';

        var hint = document.createElement('div');
        hint.style.cssText =
            'font-size:8px;letter-spacing:1.5px;color:rgba(255,255,255,0.28);margin-top:1px;text-transform:uppercase;';
        hint.textContent = 'F: place  ·  E: cycle  ·  Z: undo  ·  Q: exit';

        hudEl.appendChild(pieceLbl);
        hudEl.appendChild(slotsWrap);
        hudEl.appendChild(countLbl);
        hudEl.appendChild(hint);
        document.body.appendChild(hudEl);

        notifEl = document.createElement('div');
        notifEl.style.cssText =
            'position:fixed;top:56px;left:50%;transform:translateX(-50%);' +
            'background:rgba(0,0,0,0.8);border:1px solid rgba(74,222,128,0.45);' +
            'padding:5px 18px;font-size:10px;letter-spacing:2px;text-transform:uppercase;' +
            'color:#4ade80;font-weight:700;z-index:65;opacity:0;transition:opacity 0.35s;' +
            'pointer-events:none;white-space:nowrap;' + F;
        document.body.appendChild(notifEl);
    }

    function updateHUD() {
        if (!hudEl) return;
        hudEl.style.display = buildMode ? 'flex' : 'none';
        if (pieceLbl) pieceLbl.textContent = '\u{1F528}  ' + BUILD_PIECES[pieceIdx].label;
        if (countLbl) countLbl.textContent = builtPieces.length + ' piece' + (builtPieces.length !== 1 ? 's' : '') + ' placed';
        slotEls.forEach(function (s, i) {
            if (i === pieceIdx) {
                s.style.background   = 'rgba(74,222,128,0.18)';
                s.style.color        = '#4ade80';
                s.style.border       = '1px solid #4ade80';
                s.style.boxShadow    = '0 0 6px rgba(74,222,128,0.35)';
            } else {
                s.style.background   = 'rgba(0,0,0,0.6)';
                s.style.color        = 'rgba(255,255,255,0.38)';
                s.style.border       = '1px solid rgba(255,255,255,0.15)';
                s.style.boxShadow    = 'none';
            }
        });
    }

    function showNotif(msg) {
        if (!notifEl) return;
        notifEl.textContent = msg;
        notifEl.style.opacity = '1';
        clearTimeout(notifTmr);
        notifTmr = setTimeout(function () { notifEl.style.opacity = '0'; }, 2800);
    }

})();
