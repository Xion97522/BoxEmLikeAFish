// building.js — Building system with grid snap + edit mode for Box Em Like a Fish
(function () {
    'use strict';

    var BUILD_PIECES = [
        { label: 'WALL',  w: 2.8, h: 3.5,  d: 0.25, tilt: 0,   color: [0.76, 0.56, 0.26] },
        { label: 'FLOOR', w: 3.0, h: 0.25, d: 3.0,  tilt: 0,   color: [0.62, 0.47, 0.22] },
        { label: 'RAMP',  w: 3.0, h: 0.25, d: 3.5,  tilt: -28, color: [0.70, 0.52, 0.24] },
        { label: 'ROOF',  w: 3.0, h: 0.25, d: 3.0,  tilt: -45, color: [0.56, 0.42, 0.20] },
    ];

    var GRID       = 3.0;
    var PLACE_DIST = 4.0;

    // ── State ─────────────────────────────────────────────────────────
    var buildMode  = false;
    var editMode   = false;
    var pieceIdx   = 0;
    var snapRot    = 0;          // 0 / 90 / 180 / 270 — manual yaw offset
    var buildLevel = 0;          // integer floor level for Y stacking

    var ghostEnt   = null;
    var ghostMat   = null;
    var selOverlay = null;       // selection / hover overlay entity
    var selMat     = null;

    // builtPieces entries: { ent, mat, baseColor }
    var builtPieces  = [];
    var hoveredPiece = null;
    var selectedPiece = null;

    var prevB = false, prevY = false, prevXBtn = false;

    // ── Boot ──────────────────────────────────────────────────────────
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
        // Ghost material
        ghostMat = new pc.StandardMaterial();
        ghostMat.diffuse    = new pc.Color(0.45, 0.85, 0.45);
        ghostMat.emissive   = new pc.Color(0.0,  0.20, 0.0);
        ghostMat.opacity    = 0.40;
        ghostMat.blendType  = pc.BLEND_NORMAL;
        ghostMat.depthWrite = false;
        ghostMat.cull       = pc.CULLFACE_NONE;
        ghostMat.update();

        ghostEnt = new pc.Entity('bld-ghost');
        ghostEnt.addComponent('render', { type: 'box', castShadows: false, receiveShadows: false });
        applyMat(ghostEnt, ghostMat);
        ghostEnt.enabled = false;
        app.root.addChild(ghostEnt);

        // Selection overlay material
        selMat = new pc.StandardMaterial();
        selMat.diffuse    = new pc.Color(1.0, 0.82, 0.08);
        selMat.emissive   = new pc.Color(0.5, 0.35, 0.0);
        selMat.opacity    = 0.35;
        selMat.blendType  = pc.BLEND_NORMAL;
        selMat.depthWrite = false;
        selMat.cull       = pc.CULLFACE_NONE;
        selMat.update();

        selOverlay = new pc.Entity('bld-sel');
        selOverlay.addComponent('render', { type: 'box', castShadows: false, receiveShadows: false });
        applyMat(selOverlay, selMat);
        selOverlay.enabled = false;
        app.root.addChild(selOverlay);

        createHUD();

        document.addEventListener('keydown', function (e) {
            if (e.repeat) return;
            // Mode toggles
            if (e.code === 'KeyQ') { if (editMode) exitEdit(); else toggleBuild(app, cam); }
            if (e.code === 'KeyG') toggleEdit(app, cam);
            if (e.code === 'Escape') { exitBuild(); exitEdit(); }

            // Build mode keys
            if (buildMode) {
                if (e.code === 'KeyE')      cyclePiece(1);
                if (e.code === 'KeyF')      placePiece(cam, app);
                if (e.code === 'KeyZ')      undoLast(app);
                if (e.code === 'KeyR')      rotatePiece();
                if (e.code === 'BracketRight') changeLevel(1);
                if (e.code === 'BracketLeft')  changeLevel(-1);
            }

            // Edit mode keys
            if (editMode) {
                if (e.code === 'KeyF')      selectHovered();
                if (e.code === 'KeyR' && selectedPiece) rotateSelected();
                if (e.code === 'KeyX' || e.code === 'Delete') deleteSelected(app);
                if (e.code === 'Escape')    deselectPiece();
            }
        });

        // Expose globals for mobile
        window.toggleBuildMode  = function () { toggleBuild(app, cam); };
        window.placeBuildPiece  = function () { if (buildMode) placePiece(cam, app); };
        window.cycleBuildPiece  = function (d) { if (buildMode) cyclePiece(d); };

        app.on('update', function (dt) {
            pollGamepad(cam, app);
            if (buildMode) updateGhost(cam);
            if (editMode)  updateHover(cam);
            tickSelOverlay(dt);
        });
    }

    // ── Build mode ────────────────────────────────────────────────────
    function toggleBuild(app, cam) {
        if (editMode) exitEdit();
        buildMode = !buildMode;
        ghostEnt.enabled = buildMode;
        if (!buildMode) snapRot = 0;
        updateHUD();
        showNotif(buildMode
            ? 'BUILD  ·  F:place  E:cycle  R:rotate  ]:up  [:down  Z:undo  Q:exit'
            : 'BUILD  OFF');
    }

    function exitBuild() {
        if (!buildMode) return;
        buildMode = false;
        ghostEnt.enabled = false;
        snapRot = 0;
        updateHUD();
    }

    function cyclePiece(dir) {
        pieceIdx = (pieceIdx + dir + BUILD_PIECES.length) % BUILD_PIECES.length;
        updateHUD();
    }

    function rotatePiece() {
        snapRot = (snapRot + 90) % 360;
        showNotif('ROTATION  ' + snapRot + '\u00b0');
    }

    function changeLevel(dir) {
        buildLevel = Math.max(0, buildLevel + dir);
        showNotif('FLOOR  ' + buildLevel);
    }

    // ── Ghost preview ─────────────────────────────────────────────────
    function updateGhost(cam) {
        var p    = BUILD_PIECES[pieceIdx];
        var fwd  = cam.forward.clone(); fwd.y = 0;
        if (fwd.length() < 0.001) fwd.set(0, 0, -1);
        fwd.normalize();

        var camPos = cam.getPosition();

        // XZ snap
        var wx = camPos.x + fwd.x * PLACE_DIST;
        var wz = camPos.z + fwd.z * PLACE_DIST;
        var tx = Math.round(wx / GRID) * GRID;
        var tz = Math.round(wz / GRID) * GRID;

        // Y snap — stack by floor level
        var ty;
        if (p.label === 'WALL') {
            ty = buildLevel * GRID + p.h / 2;
        } else {
            ty = buildLevel * GRID + p.h / 2 + 0.02;
        }

        ghostEnt.setLocalScale(p.w, p.h, p.d);
        ghostEnt.setPosition(tx, ty, tz);

        // Yaw: camera forward angle + 90° snap offset
        var camYaw = Math.atan2(fwd.x, fwd.z) * 180 / Math.PI;
        var snappedYaw = Math.round(camYaw / 90) * 90 + snapRot;
        ghostEnt.setEulerAngles(p.tilt, snappedYaw, 0);

        // Pulse ghost opacity
        var pulse = 0.30 + 0.12 * Math.sin(Date.now() * 0.006);
        ghostMat.opacity = pulse;
        ghostMat.update();
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
        mat.shininess = 25;
        mat.update();
        applyMat(ent, mat);

        ent.setLocalScale(p.w, p.h, p.d);
        ent.setPosition(pos.x, pos.y, pos.z);
        ent.setEulerAngles(rot.x, rot.y, rot.z);
        app.root.addChild(ent);

        builtPieces.push({
            ent: ent, mat: mat,
            baseColor: [p.color[0], p.color[1], p.color[2]],
            scaleX: p.w, scaleY: p.h, scaleZ: p.d
        });

        playBuildSound();
        updateHUD();
    }

    function undoLast(app) {
        if (!builtPieces.length) return;
        var bp = builtPieces.pop();
        if (selectedPiece === bp) deselectPiece();
        bp.ent.destroy();
        showNotif('REMOVED  (' + builtPieces.length + ' placed)');
        updateHUD();
    }

    // ── Edit mode ─────────────────────────────────────────────────────
    function toggleEdit(app, cam) {
        if (buildMode) exitBuild();
        editMode = !editMode;
        if (!editMode) { deselectPiece(); hoveredPiece = null; selOverlay.enabled = false; }
        updateHUD();
        showNotif(editMode
            ? 'EDIT  ·  aim+F:select  R:rotate  X:delete  G:exit'
            : 'EDIT  OFF');
    }

    function exitEdit() {
        if (!editMode) return;
        editMode = false;
        deselectPiece();
        hoveredPiece = null;
        selOverlay.enabled = false;
        updateHUD();
    }

    // Ray vs sphere approximation — returns distance along ray or Infinity
    function rayPieceDist(ro, rd, bp) {
        var ep  = bp.ent.getPosition();
        var ox  = ep.x - ro.x, oy = ep.y - ro.y, oz = ep.z - ro.z;
        var t   = ox*rd.x + oy*rd.y + oz*rd.z;
        if (t < 0.5 || t > 20) return Infinity;
        var cx  = ro.x + rd.x*t - ep.x;
        var cy  = ro.y + rd.y*t - ep.y;
        var cz  = ro.z + rd.z*t - ep.z;
        var dist = Math.sqrt(cx*cx + cy*cy + cz*cz);
        var radius = Math.max(bp.scaleX, bp.scaleY, bp.scaleZ) * 0.72;
        return dist < radius ? t : Infinity;
    }

    var selPulse = 0;
    function updateHover(cam) {
        var ro  = cam.getPosition();
        var rd  = cam.forward;

        var closest = null, closestT = Infinity;
        for (var i = 0; i < builtPieces.length; i++) {
            var t = rayPieceDist(ro, rd, builtPieces[i]);
            if (t < closestT) { closestT = t; closest = builtPieces[i]; }
        }

        hoveredPiece = (closest && closestT < 18) ? closest : null;

        // Move selection overlay to hovered or selected
        var target = selectedPiece || hoveredPiece;
        if (target) {
            selOverlay.enabled = true;
            var ep = target.ent.getPosition();
            var er = target.ent.getEulerAngles();
            selOverlay.setPosition(ep.x, ep.y, ep.z);
            selOverlay.setEulerAngles(er.x, er.y, er.z);
            selOverlay.setLocalScale(
                target.scaleX + 0.06,
                target.scaleY + 0.06,
                target.scaleZ + 0.06
            );
        } else {
            selOverlay.enabled = false;
        }
    }

    function tickSelOverlay(dt) {
        if (!selOverlay.enabled) return;
        selPulse += dt * 4;
        var alpha = 0.25 + 0.15 * Math.sin(selPulse);
        // Orange for selected, yellow for hovered-only
        if (selectedPiece) {
            selMat.emissive = new pc.Color(0.6, 0.3, 0.0);
            selMat.opacity  = alpha + 0.1;
        } else {
            selMat.emissive = new pc.Color(0.4, 0.35, 0.0);
            selMat.opacity  = alpha;
        }
        selMat.update();
    }

    function selectHovered() {
        if (hoveredPiece && hoveredPiece !== selectedPiece) {
            selectedPiece = hoveredPiece;
            showNotif('SELECTED  ·  R:rotate  X:delete  ESC:deselect');
            updateHUD();
        } else {
            deselectPiece();
        }
    }

    function deselectPiece() {
        selectedPiece = null;
        updateHUD();
    }

    function rotateSelected() {
        if (!selectedPiece) return;
        var cur = selectedPiece.ent.getEulerAngles();
        selectedPiece.ent.setEulerAngles(cur.x, cur.y + 90, cur.z);
        showNotif('ROTATED  ' + Math.round(selectedPiece.ent.getEulerAngles().y) + '\u00b0');
    }

    function deleteSelected(app) {
        if (!selectedPiece) return;
        var idx = builtPieces.indexOf(selectedPiece);
        if (idx !== -1) builtPieces.splice(idx, 1);
        selectedPiece.ent.destroy();
        selectedPiece = null;
        hoveredPiece  = null;
        selOverlay.enabled = false;
        showNotif('DELETED  (' + builtPieces.length + ' placed)');
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
        var curB    = !!(bt[1] && bt[1].pressed);
        var curY    = !!(bt[3] && bt[3].pressed);
        var curXBtn = !!(bt[2] && bt[2].pressed);

        if (curB && !prevB) toggleBuild(app, cam);
        if (buildMode) {
            if (curY    && !prevY)    cyclePiece(1);
            if (curXBtn && !prevXBtn) placePiece(cam, app);
        }

        prevB = curB; prevY = curY; prevXBtn = curXBtn;
    }

    // ── Helpers ───────────────────────────────────────────────────────
    function applyMat(ent, mat) {
        if (ent.render && ent.render.meshInstances)
            ent.render.meshInstances.forEach(function (mi) { mi.material = mat; });
    }

    function playBuildSound() {
        try {
            var ctx = new (window.AudioContext || window.webkitAudioContext)();
            [440, 554, 659].forEach(function (f, i) {
                setTimeout(function () {
                    var o = ctx.createOscillator(), g = ctx.createGain();
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
    var hudEl = null, pieceLbl = null, countLbl = null;
    var slotEls = [], hintEl = null, notifEl = null, notifTmr = null;
    var modeLbl = null;

    function createHUD() {
        var F = 'font-family:"Segoe UI",Arial,sans-serif;';

        hudEl = document.createElement('div');
        hudEl.style.cssText =
            'position:fixed;bottom:82px;left:50%;transform:translateX(-50%);' +
            'display:none;flex-direction:column;align-items:center;gap:5px;' +
            'z-index:60;pointer-events:none;' + F;

        modeLbl = document.createElement('div');
        modeLbl.style.cssText =
            'font-size:10px;letter-spacing:4px;font-weight:900;text-transform:uppercase;' +
            'padding:2px 14px;border:1px solid;';

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

        hintEl = document.createElement('div');
        hintEl.style.cssText =
            'font-size:8px;letter-spacing:1.5px;color:rgba(255,255,255,0.28);' +
            'margin-top:1px;text-transform:uppercase;';

        hudEl.appendChild(modeLbl);
        hudEl.appendChild(pieceLbl);
        hudEl.appendChild(slotsWrap);
        hudEl.appendChild(countLbl);
        hudEl.appendChild(hintEl);
        document.body.appendChild(hudEl);

        notifEl = document.createElement('div');
        notifEl.style.cssText =
            'position:fixed;top:56px;left:50%;transform:translateX(-50%);' +
            'background:rgba(0,0,0,0.82);border:1px solid rgba(74,222,128,0.45);' +
            'padding:5px 18px;font-size:10px;letter-spacing:2px;text-transform:uppercase;' +
            'color:#4ade80;font-weight:700;z-index:65;opacity:0;transition:opacity 0.35s;' +
            'pointer-events:none;white-space:nowrap;' + F;
        document.body.appendChild(notifEl);

        // Snap grid indicator labels (floor level)
        var gridHint = document.createElement('div');
        gridHint.id  = 'bld-grid-hint';
        gridHint.style.cssText =
            'position:fixed;bottom:62px;right:22px;font-size:9px;letter-spacing:2px;' +
            'color:rgba(74,222,128,0.55);font-weight:700;text-transform:uppercase;' +
            'z-index:60;pointer-events:none;display:none;' + F;
        document.body.appendChild(gridHint);
        window._bldGridHint = gridHint;
    }

    function updateHUD() {
        if (!hudEl) return;
        var active = buildMode || editMode;
        hudEl.style.display = active ? 'flex' : 'none';

        if (window._bldGridHint) {
            window._bldGridHint.style.display = buildMode ? 'block' : 'none';
            window._bldGridHint.textContent =
                'FLOOR ' + buildLevel + '  ·  ROT ' + snapRot + '\u00b0  ·  GRID ' + GRID + 'm';
        }

        if (editMode) {
            modeLbl.textContent = '\u270E  EDIT MODE';
            modeLbl.style.color  = 'rgba(255,200,50,0.9)';
            modeLbl.style.borderColor = 'rgba(255,200,50,0.4)';
            modeLbl.style.textShadow  = '0 0 8px rgba(255,200,50,0.5)';
            pieceLbl.style.display = 'none';
            slotEls.forEach(function (s) { s.style.display = 'none'; });
            if (hintEl) hintEl.textContent =
                'aim+F:select  R:rotate  X:delete  ESC:deselect  G:exit';
            if (countLbl) countLbl.textContent =
                builtPieces.length + ' piece' + (builtPieces.length !== 1 ? 's' : '') +
                (selectedPiece ? '  ·  1 selected' : '');
        } else if (buildMode) {
            modeLbl.textContent = '\u{1F528}  BUILD MODE';
            modeLbl.style.color  = 'rgba(74,222,128,0.9)';
            modeLbl.style.borderColor = 'rgba(74,222,128,0.4)';
            modeLbl.style.textShadow  = '0 0 8px rgba(74,222,128,0.5)';
            pieceLbl.style.display = '';
            slotEls.forEach(function (s) { s.style.display = ''; });
            if (pieceLbl) pieceLbl.textContent = BUILD_PIECES[pieceIdx].label;
            if (countLbl) countLbl.textContent =
                builtPieces.length + ' piece' + (builtPieces.length !== 1 ? 's' : '') + ' placed';
            if (hintEl) hintEl.textContent =
                'F:place  E:cycle  R:rotate  ]:up  [:down  Z:undo  G:edit  Q:exit';
            slotEls.forEach(function (s, i) {
                if (i === pieceIdx) {
                    s.style.background = 'rgba(74,222,128,0.18)';
                    s.style.color      = '#4ade80';
                    s.style.border     = '1px solid #4ade80';
                    s.style.boxShadow  = '0 0 6px rgba(74,222,128,0.35)';
                } else {
                    s.style.background = 'rgba(0,0,0,0.6)';
                    s.style.color      = 'rgba(255,255,255,0.38)';
                    s.style.border     = '1px solid rgba(255,255,255,0.15)';
                    s.style.boxShadow  = 'none';
                }
            });
        }
    }

    function showNotif(msg) {
        if (!notifEl) return;
        notifEl.textContent = msg;
        notifEl.style.opacity = '1';
        clearTimeout(notifTmr);
        notifTmr = setTimeout(function () { notifEl.style.opacity = '0'; }, 2800);
    }

})();
