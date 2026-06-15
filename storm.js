// storm.js — Battle Royale storm circle for Box Em Like a Fish
(function () {
    'use strict';

    // Storm shrink phases
    var PHASES = [
        { wait: 60, shrink: 40, outerR: 120, innerR: 75,  dmg: 2  },
        { wait: 30, shrink: 35, outerR: 75,  innerR: 45,  dmg: 4  },
        { wait: 25, shrink: 30, outerR: 45,  innerR: 25,  dmg: 6  },
        { wait: 20, shrink: 25, outerR: 25,  innerR: 12,  dmg: 10 },
        { wait: 15, shrink: 20, outerR: 12,  innerR: 4,   dmg: 15 },
    ];

    var CX = 0, CZ = 0;            // storm centre (world XZ)
    var phase       = 0;
    var stormR      = PHASES[0].outerR;
    var isShrinking = false;
    var timer       = PHASES[0].wait;   // counts down to next event
    var shrinkFull  = PHASES[0].shrink;
    var outerAtStart = PHASES[0].outerR;
    var dmgAccum    = 0;

    var PILLAR_N = 40;
    var pillars  = [];
    var appRef, camRef;

    // ── Boot ──────────────────────────────────────────────────────────
    var waitI = setInterval(function () {
        if (!window.pc || !pc.Application) return;
        var app = pc.Application.getApplication();
        if (!app) return;
        clearInterval(waitI);
        var tryInit = function () {
            var cams = app.root.findComponents('camera');
            if (!cams || !cams.length) { setTimeout(tryInit, 300); return; }
            init(app, cams[0].entity);
        };
        if (app.root && app.root.findComponents('camera').length) tryInit();
        else app.on('start', function () { setTimeout(tryInit, 300); });
    }, 150);

    // ── Init ──────────────────────────────────────────────────────────
    function init(app, cam) {
        appRef = app; camRef = cam;
        buildRing(app);
        buildHUD();
        buildRadar();
        app.on('update', function (dt) { update(dt, cam); });
    }

    // ── Storm ring (pillar walls) ─────────────────────────────────────
    function buildRing(app) {
        var mat = new pc.StandardMaterial();
        mat.diffuse    = new pc.Color(0.45, 0.5,  1.0);
        mat.emissive   = new pc.Color(0.12, 0.18, 0.8);
        mat.emissiveIntensity = 0.6;
        mat.opacity    = 0.28;
        mat.blendType  = pc.BLEND_NORMAL;
        mat.depthWrite = false;
        mat.cull       = pc.CULLFACE_NONE;
        mat.update();

        // Load electric storm texture
        var texAsset = new pc.Asset('stormTex', 'texture', { url: '/storm_texture.gif' });
        app.assets.add(texAsset);
        texAsset.on('load', function () {
            mat.diffuseMap  = texAsset.resource;
            mat.emissiveMap = texAsset.resource;
            mat.emissiveIntensity = 0.55;
            mat.opacity = 0.28;
            mat.update();
        });
        app.assets.load(texAsset);

        for (var i = 0; i < PILLAR_N; i++) {
            var e = new pc.Entity('storm-p' + i);
            e.addComponent('render', { type: 'box', castShadows: false, receiveShadows: false });
            applyMat(e, mat);
            app.root.addChild(e);
            pillars.push(e);
        }
        placeRing();
    }

    function placeRing() {
        var H    = 130;
        var segW = (2 * Math.PI * stormR / PILLAR_N) * 1.08;
        for (var i = 0; i < PILLAR_N; i++) {
            var a = (i / PILLAR_N) * Math.PI * 2;
            var x = CX + Math.cos(a) * stormR;
            var z = CZ + Math.sin(a) * stormR;
            pillars[i].setPosition(x, H / 2, z);
            pillars[i].setLocalScale(segW, H, 1.5);
            pillars[i].setEulerAngles(0, -(a * 180 / Math.PI), 0);
        }
    }

    function applyMat(ent, mat) {
        if (ent.render && ent.render.meshInstances) {
            ent.render.meshInstances.forEach(function (mi) { mi.material = mat; });
        }
    }

    // ── Per-frame update ──────────────────────────────────────────────
    function update(dt, cam) {
        var finished = phase >= PHASES.length;

        if (!finished) {
            timer -= dt;
            if (!isShrinking && timer <= 0) {
                // Start shrinking
                isShrinking  = true;
                timer        = PHASES[phase].shrink;
                shrinkFull   = PHASES[phase].shrink;
                outerAtStart = stormR;
            } else if (isShrinking && timer <= 0) {
                // Finish shrink
                stormR      = PHASES[phase].innerR;
                isShrinking = false;
                phase++;
                if (phase < PHASES.length) {
                    timer = PHASES[phase].wait;
                }
                placeRing();
            }

            if (isShrinking) {
                var t  = 1 - Math.max(0, timer / shrinkFull);
                var t2 = t < 0.5 ? 2*t*t : -1 + (4 - 2*t) * t;
                stormR = outerAtStart + (PHASES[phase].innerR - outerAtStart) * t2;
                placeRing();
            }
        }

        // Damage
        var pos  = cam.getPosition();
        var dx   = pos.x - CX;
        var dz   = pos.z - CZ;
        var dist = Math.sqrt(dx*dx + dz*dz);
        var out  = dist > stormR;

        if (out && !finished) {
            var dmgRate = PHASES[Math.min(phase, PHASES.length - 1)].dmg;
            dmgAccum += dmgRate * dt;
            if (dmgAccum >= 1) {
                var d = Math.floor(dmgAccum);
                dmgAccum -= d;
                if (typeof window.damagePlayer === 'function') window.damagePlayer(d);
            }
        } else {
            dmgAccum = 0;
        }

        refreshHUD(out, finished);
        drawRadar(pos);
    }

    // ── HUD ───────────────────────────────────────────────────────────
    var timerEl, phaseEl, warnBorder, warnTxt;

    function buildHUD() {
        var F = 'font-family:"Segoe UI",Arial,sans-serif;pointer-events:none;';

        var wrap = document.createElement('div');
        wrap.style.cssText =
            'position:fixed;top:18px;left:50%;transform:translateX(-50%);' +
            'display:flex;flex-direction:column;align-items:center;gap:3px;' +
            'z-index:55;' + F;

        phaseEl = document.createElement('div');
        phaseEl.style.cssText =
            'font-size:9px;letter-spacing:3px;text-transform:uppercase;' +
            'color:rgba(100,150,255,0.9);font-weight:700;';
        phaseEl.textContent = 'STORM  ·  PHASE 1';

        timerEl = document.createElement('div');
        timerEl.style.cssText =
            'font-size:26px;font-weight:900;color:#fff;letter-spacing:3px;' +
            'font-variant-numeric:tabular-nums;line-height:1;' +
            'text-shadow:0 0 14px rgba(80,100,255,0.85);';
        timerEl.textContent = fmt(PHASES[0].wait);

        wrap.appendChild(phaseEl);
        wrap.appendChild(timerEl);
        document.body.appendChild(wrap);

        // Storm border glow
        warnBorder = document.createElement('div');
        warnBorder.style.cssText =
            'position:fixed;inset:0;pointer-events:none;z-index:52;' +
            'border:8px solid rgba(60,90,255,0.65);' +
            'box-shadow:inset 0 0 90px rgba(40,60,220,0.38);' +
            'opacity:0;transition:opacity 0.5s;';
        document.body.appendChild(warnBorder);

        warnTxt = document.createElement('div');
        warnTxt.style.cssText =
            'position:fixed;top:38%;left:50%;transform:translateX(-50%);' +
            'font-size:12px;letter-spacing:4px;color:#5070ff;font-weight:900;' +
            'text-transform:uppercase;pointer-events:none;z-index:56;' +
            'opacity:0;transition:opacity 0.5s;' + F;
        warnTxt.textContent = '\u26a0  STORM DAMAGE  \u26a0';
        document.body.appendChild(warnTxt);
    }

    var prevOut = false;
    function refreshHUD(out, finished) {
        if (finished) {
            phaseEl.textContent = 'STORM  CLOSED';
            timerEl.textContent = '\u2014\u2014';
            timerEl.style.color = '#ff6644';
            timerEl.style.textShadow = '0 0 14px rgba(255,80,50,0.7)';
        } else if (isShrinking) {
            phaseEl.textContent = 'CLOSING  \u00b7  PHASE ' + (phase + 1);
            timerEl.textContent = fmt(Math.ceil(timer));
            timerEl.style.color = '#ff9944';
            timerEl.style.textShadow = '0 0 14px rgba(255,130,50,0.8)';
        } else {
            phaseEl.textContent = 'STORM  \u00b7  PHASE ' + (phase + 1);
            timerEl.textContent = fmt(Math.ceil(timer));
            timerEl.style.color = '#fff';
            timerEl.style.textShadow = '0 0 14px rgba(80,100,255,0.85)';
        }

        if (out !== prevOut) {
            prevOut = out;
            warnBorder.style.opacity = out ? '1' : '0';
            warnTxt.style.opacity    = out ? '1' : '0';
        }
    }

    function fmt(secs) {
        var s = Math.max(0, secs);
        var m = Math.floor(s / 60);
        var r = s % 60;
        return m + ':' + (r < 10 ? '0' : '') + r;
    }

    // ── Minimap radar ─────────────────────────────────────────────────
    var rcanvas, rctx;

    function buildRadar() {
        rcanvas = document.createElement('canvas');
        rcanvas.width = 110; rcanvas.height = 110;
        rcanvas.style.cssText =
            'position:fixed;top:18px;right:20px;width:110px;height:110px;' +
            'border-radius:50%;border:1px solid rgba(255,255,255,0.18);' +
            'z-index:55;pointer-events:none;';
        rctx = rcanvas.getContext('2d');
        document.body.appendChild(rcanvas);
    }

    function drawRadar(playerPos) {
        if (!rctx) return;
        var W = 110, H = 110, cx = W/2, cy = H/2, r = W/2 - 2;
        rctx.clearRect(0, 0, W, H);

        // BG
        rctx.save();
        rctx.beginPath();
        rctx.arc(cx, cy, r, 0, Math.PI*2);
        rctx.clip();

        rctx.fillStyle = 'rgba(0,5,20,0.65)';
        rctx.fillRect(0, 0, W, H);

        // Storm ring on radar
        var maxR  = PHASES[0].outerR;
        var ringR = Math.max(4, Math.min(r - 2, (stormR / maxR) * r));

        rctx.beginPath();
        rctx.arc(cx, cy, ringR, 0, Math.PI*2);
        rctx.fillStyle = 'rgba(50,80,220,0.10)';
        rctx.fill();

        rctx.beginPath();
        rctx.arc(cx, cy, ringR, 0, Math.PI*2);
        rctx.strokeStyle = 'rgba(80,120,255,0.95)';
        rctx.lineWidth = 2;
        rctx.stroke();

        // Player dot
        if (playerPos) {
            var px = cx + ((playerPos.x - CX) / maxR) * r;
            var py = cy + ((playerPos.z - CZ) / maxR) * r;
            px = Math.max(4, Math.min(W-4, px));
            py = Math.max(4, Math.min(H-4, py));

            rctx.beginPath();
            rctx.arc(px, py, 3.5, 0, Math.PI*2);
            rctx.fillStyle = '#4ade80';
            rctx.fill();

            rctx.beginPath();
            rctx.arc(px, py, 5.5, 0, Math.PI*2);
            rctx.strokeStyle = 'rgba(74,222,128,0.5)';
            rctx.lineWidth = 1.5;
            rctx.stroke();
        }

        rctx.restore();

        // Border
        rctx.beginPath();
        rctx.arc(cx, cy, r, 0, Math.PI*2);
        rctx.strokeStyle = 'rgba(255,255,255,0.18)';
        rctx.lineWidth = 1.5;
        rctx.stroke();
    }

})();
