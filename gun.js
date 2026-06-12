// gun.js — Full gun system injected into the PlayCanvas FPS
(function () {
    'use strict';

    // ── Weapon definitions ────────────────────────────────────────────
    var WEAPONS = [
        { name: 'PISTOL',        mag: 12, res: Infinity, rate: 0.42, auto: false, pellets: 1, spread: 0.01,  reloadTime: 1.1 },
        { name: 'ASSAULT RIFLE', mag: 30, res: 150,      rate: 0.09, auto: true,  pellets: 1, spread: 0.035, reloadTime: 1.9 },
        { name: 'SHOTGUN',       mag: 8,  res: 40,       rate: 0.72, auto: false, pellets: 8, spread: 0.12,  reloadTime: 2.4 },
    ];

    // ── State ─────────────────────────────────────────────────────────
    var currentWeapon = 0;
    var ammo = [
        { mag: 12, res: Infinity },
        { mag: 30, res: 150 },
        { mag: 8,  res: 40 },
    ];
    var fireCooldown   = 0;
    var reloading      = false;
    var reloadTimer    = 0;
    var flashTimer     = 0;
    var hitmarkerTimer = 0;
    var gunBobTime     = 0;
    var recoilY = 0, recoilZ = 0;
    var chSpread = 0;

    // Gamepad prev state
    var prevRT = false, prevRB = false;

    // Keep reference to original getGamepads (before the A/X swap override)
    var _rawPads = navigator.getGamepads.bind(navigator);

    // ── Wait for PlayCanvas app ───────────────────────────────────────
    var waitInterval = setInterval(function () {
        if (!window.pc || !pc.Application) return;
        var app = pc.Application.getApplication();
        if (!app) return;
        clearInterval(waitInterval);

        // Scene may already be loaded or still loading
        if (app.scene && app.root && app.root.findComponents('camera').length) {
            init(app);
        } else {
            app.on('start', function () {
                setTimeout(function () { init(app); }, 80);
            });
        }
    }, 150);

    // ── Init ──────────────────────────────────────────────────────────
    function init(app) {
        var cams = app.root.findComponents('camera');
        if (!cams || !cams.length) { console.warn('[gun] no camera'); return; }
        var cam = cams[0].entity;

        // ── Build gun mesh ────────────────────────────────────────────
        // Material: dark metal
        var metal = new pc.StandardMaterial();
        metal.diffuse = new pc.Color(0.10, 0.10, 0.10);
        metal.shininess = 70;
        metal.update();

        // Accent material (slide detail)
        var accent = new pc.StandardMaterial();
        accent.diffuse = new pc.Color(0.05, 0.05, 0.05);
        accent.shininess = 90;
        accent.update();

        function makePart(name, type, sx, sy, sz, lx, ly, lz, mat) {
            var e = new pc.Entity(name);
            e.addComponent('render', { type: type });
            e.setLocalScale(sx, sy, sz);
            e.setLocalPosition(lx, ly, lz);
            if (e.render && e.render.meshInstances) {
                e.render.meshInstances.forEach(function (mi) { mi.material = mat || metal; });
            }
            cam.addChild(e);
            return e;
        }

        // Gun parts (local coords relative to camera: +X=right, +Y=up, -Z=forward)
        var barrel  = makePart('barrel',  'box', 0.055, 0.055, 0.38, 0.18, -0.14, -0.47);
        var slide   = makePart('slide',   'box', 0.10,  0.10,  0.24, 0.18, -0.16, -0.31, accent);
        var grip    = makePart('grip',    'box', 0.075, 0.14,  0.075, 0.18, -0.26, -0.26);
        var trigger = makePart('trigger', 'box', 0.02,  0.05,  0.04, 0.18, -0.22, -0.30);

        // Muzzle flash sphere
        var flash = new pc.Entity('mflash');
        flash.addComponent('render', { type: 'sphere' });
        flash.setLocalScale(0.09, 0.09, 0.09);
        flash.setLocalPosition(0.18, -0.14, -0.68);
        flash.enabled = false;
        var flashMat = new pc.StandardMaterial();
        flashMat.emissive = new pc.Color(1.0, 0.65, 0.1);
        flashMat.update();
        if (flash.render && flash.render.meshInstances) {
            flash.render.meshInstances.forEach(function (mi) { mi.material = flashMat; });
        }
        cam.addChild(flash);

        // Muzzle point light
        var muzzleLight = new pc.Entity('mlight');
        muzzleLight.addComponent('light', {
            type: 'point',
            color: new pc.Color(1, 0.55, 0.1),
            range: 6,
            intensity: 0,
            castShadows: false,
        });
        muzzleLight.setLocalPosition(0.18, -0.14, -0.8);
        cam.addChild(muzzleLight);

        // ── Build HUD ─────────────────────────────────────────────────
        var hud = buildHUD();

        // ── Audio ─────────────────────────────────────────────────────
        var actx = null;
        function audio() {
            if (!actx) try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){}
            return actx;
        }

        function playGunshot(idx) {
            var ctx = audio(); if (!ctx) return;
            try {
                var dur = idx === 2 ? 0.18 : idx === 1 ? 0.09 : 0.12;
                var buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
                var d   = buf.getChannelData(0);
                var dk  = idx === 2 ? 12 : idx === 1 ? 30 : 22;
                for (var i = 0; i < d.length; i++) {
                    d[i] = (Math.random() * 2 - 1) * Math.exp(-(i / ctx.sampleRate) * dk * 100);
                }
                var src  = ctx.createBufferSource(); src.buffer = buf;
                var filt = ctx.createBiquadFilter();
                filt.type = 'bandpass';
                filt.frequency.value = idx === 2 ? 380 : idx === 1 ? 1100 : 800;
                filt.Q.value = 1.5;
                var gain = ctx.createGain();
                gain.gain.value = idx === 2 ? 0.6 : 0.4;
                src.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
                src.start(); src.stop(ctx.currentTime + dur);
            } catch(e) {}
        }

        function playClick() {
            var ctx = audio(); if (!ctx) return;
            try {
                var o = ctx.createOscillator(); var g = ctx.createGain();
                o.type = 'square'; o.frequency.value = 220;
                g.gain.setValueAtTime(0.04, ctx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
                o.connect(g); g.connect(ctx.destination);
                o.start(); o.stop(ctx.currentTime + 0.06);
            } catch(e) {}
        }

        function playReload() {
            var ctx = audio(); if (!ctx) return;
            [300, 500].forEach(function(f, i) {
                setTimeout(function() {
                    try {
                        var o = ctx.createOscillator(); var g = ctx.createGain();
                        o.type = 'square'; o.frequency.value = f;
                        g.gain.setValueAtTime(0.05, ctx.currentTime);
                        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
                        o.connect(g); g.connect(ctx.destination);
                        o.start(); o.stop(ctx.currentTime + 0.07);
                    } catch(e) {}
                }, i * 140);
            });
        }

        // ── Shoot ─────────────────────────────────────────────────────
        function shoot() {
            if (window.wheelOpen) return;
            var wd = WEAPONS[currentWeapon];
            var am = ammo[currentWeapon];

            if (am.mag <= 0) {
                playClick();
                if (am.res > 0) startReload();
                return;
            }

            am.mag--;
            fireCooldown = wd.rate;
            recoilY = 0.028; recoilZ = 0.055;
            chSpread = Math.min(chSpread + 0.08, 0.26);

            playGunshot(currentWeapon);

            // Muzzle flash
            flash.enabled = true;
            if (muzzleLight.light) muzzleLight.light.intensity = 10;
            flashTimer = 0.07;

            // Raycast per pellet
            var hitAny = false;
            var camPos = cam.getPosition();
            var fwd    = cam.forward;   // world-space forward

            for (var p = 0; p < wd.pellets; p++) {
                var sx = (Math.random() - 0.5) * wd.spread;
                var sy = (Math.random() - 0.5) * wd.spread;
                var dx = fwd.x + sx, dy = fwd.y + sy, dz = fwd.z;
                var len = Math.sqrt(dx*dx + dy*dy + dz*dz);
                dx /= len; dy /= len; dz /= len;

                var endPos = new pc.Vec3(
                    camPos.x + dx * 120,
                    camPos.y + dy * 120,
                    camPos.z + dz * 120
                );

                var result = null;
                try {
                    result = app.systems.rigidbody.raycastFirst(camPos, endPos);
                } catch(e) {}

                if (result) {
                    hitAny = true;
                    spawnSpark(result.point);
                }
            }

            if (hitAny) showHitmarker();

            // Notify enemy system
            if (window.checkEnemyHits) {
                window.checkEnemyHits(camPos, {x: fwd.x, y: fwd.y, z: fwd.z}, wd.pellets, wd.spread);
            }

            if (am.mag === 0 && am.res > 0) setTimeout(startReload, 80);
            updateHUD();
        }

        function startReload() {
            if (reloading) return;
            var wd = WEAPONS[currentWeapon];
            var am = ammo[currentWeapon];
            if (am.mag >= wd.mag) return;
            if (am.res === 0) { showMsg('NO AMMO'); return; }
            reloading = true; reloadTimer = 0;
            playReload();
            hud.reloadWrap.style.display = 'flex';
        }

        function finishReload() {
            var wd   = WEAPONS[currentWeapon];
            var am   = ammo[currentWeapon];
            var need = wd.mag - am.mag;
            if (am.res === Infinity) {
                am.mag = wd.mag;
            } else {
                var take = Math.min(need, am.res);
                am.mag += take; am.res -= take;
            }
            reloading = false;
            hud.reloadWrap.style.display = 'none';
            updateHUD();
        }

        function switchWeapon(idx) {
            if (reloading || idx === currentWeapon) return;
            currentWeapon = idx;
            fireCooldown  = 0;
            recoilY = 0; recoilZ = 0;
            updateHUD();
        }

        // ── Effects ───────────────────────────────────────────────────
        function spawnSpark(pos) {
            var e = new pc.Entity('spark');
            e.addComponent('render', { type: 'sphere' });
            e.setLocalScale(0.09, 0.09, 0.09);
            e.setPosition(pos.x, pos.y, pos.z);
            var m = new pc.StandardMaterial();
            m.emissive = new pc.Color(1, 0.75, 0.15);
            m.update();
            if (e.render && e.render.meshInstances) {
                e.render.meshInstances.forEach(function (mi) { mi.material = m; });
            }
            app.root.addChild(e);

            // Add a short-lived point light at the hit
            var sl = new pc.Entity('slght');
            sl.addComponent('light', { type:'point', color: new pc.Color(1,0.5,0.1), range:2, intensity:6, castShadows:false });
            sl.setPosition(pos.x, pos.y, pos.z);
            app.root.addChild(sl);

            setTimeout(function () { e.destroy(); sl.destroy(); }, 130);
        }

        function showHitmarker() {
            hitmarkerTimer = 0.3;
            hud.hitmarker.style.display = 'block';
        }

        function showMsg(txt) {
            hud.msg.textContent = txt;
            hud.msg.style.opacity = '1';
            clearTimeout(hud.msg._t);
            hud.msg._t = setTimeout(function () { hud.msg.style.opacity = '0'; }, 1600);
        }

        // ── Main update loop ──────────────────────────────────────────
        app.on('update', function (dt) {
            fireCooldown = Math.max(0, fireCooldown - dt);
            chSpread     = Math.max(0, chSpread - dt * 0.35);

            // Muzzle flash decay
            flashTimer = Math.max(0, flashTimer - dt);
            if (flashTimer <= 0) {
                flash.enabled = false;
                if (muzzleLight.light) muzzleLight.light.intensity = 0;
            }

            // Hitmarker decay
            if (hitmarkerTimer > 0) {
                hitmarkerTimer -= dt;
                if (hitmarkerTimer <= 0) hud.hitmarker.style.display = 'none';
            }

            // Reload progress
            if (reloading) {
                reloadTimer += dt;
                var dur = WEAPONS[currentWeapon].reloadTime;
                hud.reloadBar.style.width = Math.min(100, (reloadTimer / dur) * 100) + '%';
                if (reloadTimer >= dur) finishReload();
            }

            // Gun bob + recoil
            var moving = app.keyboard && (
                app.keyboard.isPressed(pc.KEY_W) || app.keyboard.isPressed(pc.KEY_A) ||
                app.keyboard.isPressed(pc.KEY_S) || app.keyboard.isPressed(pc.KEY_D)
            );
            if (moving) gunBobTime += dt * 7;

            var bobX = moving ? Math.sin(gunBobTime) * 0.008 : 0;
            var bobY = moving ? Math.abs(Math.cos(gunBobTime)) * 0.005 : 0;
            recoilY = Math.max(0, recoilY - dt * 0.9);
            recoilZ = Math.max(0, recoilZ - dt * 2.2);

            var bx = 0.18 + bobX;
            barrel.setLocalPosition (bx, -0.14 + bobY - recoilY, -0.47 + recoilZ);
            slide.setLocalPosition  (bx, -0.16 + bobY - recoilY, -0.31 + recoilZ);
            grip.setLocalPosition   (bx, -0.26 + bobY - recoilY, -0.26 + recoilZ);
            trigger.setLocalPosition(bx, -0.22 + bobY - recoilY, -0.30 + recoilZ);
            flash.setLocalPosition  (bx, -0.14 + bobY - recoilY, -0.68 + recoilZ);
            muzzleLight.setLocalPosition(bx, -0.14 + bobY - recoilY, -0.80 + recoilZ);

            // ── Keyboard input ────────────────────────────────────────
            if (app.keyboard) {
                if (app.keyboard.wasPressed(pc.KEY_R)) startReload();
                if (app.keyboard.wasPressed(pc.KEY_1)) switchWeapon(0);
                if (app.keyboard.wasPressed(pc.KEY_2)) switchWeapon(1);
                if (app.keyboard.wasPressed(pc.KEY_3)) switchWeapon(2);
            }

            // Auto-fire (mouse hold for AR)
            if (app.mouse && WEAPONS[currentWeapon].auto &&
                app.mouse.isPressed(pc.MOUSEBUTTON_LEFT) &&
                fireCooldown <= 0 && !reloading) {
                shoot();
            }

            // ── Gamepad (RT=shoot, RB=reload, LB=switch) ──────────────
            var pads = _rawPads();
            for (var i = 0; i < pads.length; i++) {
                var pad = pads[i];
                if (!pad || !pad.connected) continue;

                var rt = pad.buttons[7] && pad.buttons[7].value > 0.5;
                var rb = pad.buttons[5] && pad.buttons[5].pressed;

                if (!window.wheelOpen) {
                    if (rt && fireCooldown <= 0 && !reloading) {
                        if (WEAPONS[currentWeapon].auto || !prevRT) shoot();
                    }
                    if (rb && !prevRB) startReload();
                }

                prevRT = rt; prevRB = rb;
                break;
            }

            // Crosshair spread update
            var sp = chSpread * 26;
            hud.chT.style.transform = 'translateX(-50%) translateY(-' + (sp) + 'px)';
            hud.chB.style.transform = 'translateX(-50%) translateY(' + (sp) + 'px)';
            hud.chL.style.transform = 'translateY(-50%) translateX(-' + (sp) + 'px)';
            hud.chR.style.transform = 'translateY(-50%) translateX(' + (sp) + 'px)';
        });

        // Mouse click for semi-auto
        document.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            if (!document.pointerLockElement) return;
            if (!WEAPONS[currentWeapon].auto && fireCooldown <= 0 && !reloading) shoot();
        });

        updateHUD();

        // Expose globals for weapon wheel + enemy system
        window.gunSwitchWeapon  = function (idx) { switchWeapon(idx); };
        window.gunAmmoState     = ammo;
        window.gunCurrentWeapon = currentWeapon;

        // Keep gunCurrentWeapon in sync
        var _origSwitch = switchWeapon;
        switchWeapon = function (idx) {
            _origSwitch(idx);
            window.gunCurrentWeapon = idx;
        };

        // ── HUD helpers ───────────────────────────────────────────────
        function updateHUD() {
            var wd = WEAPONS[currentWeapon];
            var am = ammo[currentWeapon];

            hud.wname.textContent = wd.name;
            hud.mag.textContent   = am.mag;
            hud.res.textContent   = am.res === Infinity ? '∞' : am.res;

            // Ammo color
            var pct = am.mag / wd.mag;
            hud.mag.style.color = am.mag === 0 ? '#ff4444' : pct <= 0.25 ? '#f5c518' : '#fff';

            // Slot highlight
            hud.slots.forEach(function (s, i) {
                s.style.color      = i === currentWeapon ? '#1db31d'              : 'rgba(255,255,255,0.3)';
                s.style.border     = i === currentWeapon ? '1px solid #107C10'    : '1px solid rgba(255,255,255,0.12)';
                s.style.background = i === currentWeapon ? 'rgba(16,124,16,0.18)' : 'rgba(0,0,0,0.45)';
                s.style.boxShadow  = i === currentWeapon ? '0 0 8px rgba(16,124,16,0.3)' : 'none';
            });
        }
    }

    // ── Build DOM HUD ─────────────────────────────────────────────────
    function buildHUD() {
        var S = 'font-family:"Segoe UI",Arial,sans-serif;';

        function div(css, parent) {
            var d = document.createElement('div');
            d.setAttribute('style', css);
            if (parent) parent.appendChild(d);
            return d;
        }
        function span(css, parent, txt) {
            var s = document.createElement('span');
            s.setAttribute('style', css);
            if (txt !== undefined) s.textContent = txt;
            if (parent) parent.appendChild(s);
            return s;
        }

        // ── Crosshair ─────────────────────────────────────────────────
        var xhair = div(
            'position:fixed;top:50%;left:50%;pointer-events:none;z-index:50;',
            document.body);

        var chBase = 'position:absolute;background:rgba(255,255,255,0.9);';
        var chT = div(chBase + 'width:2px;height:8px;top:-14px;left:-1px;transition:transform 0.05s;', xhair);
        var chB = div(chBase + 'width:2px;height:8px;top:6px;left:-1px;transition:transform 0.05s;', xhair);
        var chL = div(chBase + 'height:2px;width:8px;left:-14px;top:-1px;transition:transform 0.05s;', xhair);
        var chR = div(chBase + 'height:2px;width:8px;left:6px;top:-1px;transition:transform 0.05s;', xhair);
        div(chBase + 'width:3px;height:3px;border-radius:50%;top:-1.5px;left:-1.5px;', xhair);

        // ── Hitmarker ─────────────────────────────────────────────────
        var hitmarker = div(
            'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
            'font-size:20px;font-weight:900;color:#52e052;text-shadow:0 0 8px #107C10;' +
            'pointer-events:none;z-index:51;display:none;' + S,
            document.body);
        hitmarker.textContent = '✕';

        // ── Bottom-center: weapon name + ammo ─────────────────────────
        var ammoPanel = div(
            'position:fixed;bottom:22px;left:50%;transform:translateX(-50%);' +
            'display:flex;flex-direction:column;align-items:center;gap:3px;' +
            'pointer-events:none;z-index:50;' + S,
            document.body);

        var wname = div(
            'font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#1db31d;font-weight:700;',
            ammoPanel);

        var ammoRow = div('display:flex;align-items:baseline;gap:5px;', ammoPanel);
        var mag = span('font-size:46px;font-weight:800;color:#fff;font-variant-numeric:tabular-nums;line-height:1;', ammoRow);
        span('font-size:22px;color:rgba(255,255,255,0.3);', ammoRow, '/');
        var res = span('font-size:22px;font-weight:600;color:rgba(255,255,255,0.55);font-variant-numeric:tabular-nums;', ammoRow);

        // Reload bar
        var reloadWrap = div(
            'display:none;flex-direction:column;align-items:center;gap:3px;',
            ammoPanel);
        span('font-size:9px;letter-spacing:3px;color:#1db31d;text-transform:uppercase;', reloadWrap, 'RELOADING');
        var reloadOuter = div(
            'width:110px;height:4px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);' +
            'border-radius:2px;overflow:hidden;',
            reloadWrap);
        var reloadBar = div('height:100%;width:0%;background:#1db31d;box-shadow:0 0 5px #52e052;', reloadOuter);

        // ── Bottom-left: weapon slots ──────────────────────────────────
        var slotWrap = div(
            'position:fixed;bottom:22px;left:22px;display:flex;gap:5px;' +
            'pointer-events:none;z-index:50;' + S,
            document.body);

        var slotLabels = ['1  PISTOL', '2  A·RIFLE', '3  SHOTGUN'];
        var slots = slotLabels.map(function (lbl) {
            var s = div(
                'padding:5px 10px;font-size:9px;letter-spacing:2px;text-transform:uppercase;' +
                'color:rgba(255,255,255,0.3);border:1px solid rgba(255,255,255,0.12);' +
                'background:rgba(0,0,0,0.45);transition:all 0.1s;',
                slotWrap);
            s.textContent = lbl;
            return s;
        });

        // ── Centre message (NO AMMO etc) ───────────────────────────────
        var msg = div(
            'position:fixed;top:43%;left:50%;transform:translateX(-50%);' +
            'padding:8px 22px;background:rgba(5,5,5,0.88);border:1px solid rgba(16,124,16,0.55);' +
            'font-size:13px;letter-spacing:3px;text-transform:uppercase;font-weight:700;color:#fff;' +
            'pointer-events:none;z-index:60;opacity:0;transition:opacity 0.4s;white-space:nowrap;' + S,
            document.body);

        return { wname, mag, res, reloadWrap, reloadBar, slots, hitmarker, msg, chT, chB, chL, chR };
    }

})();
