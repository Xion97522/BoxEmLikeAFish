// enemies.js — Enemy AI system for PlayCanvas FPS
(function () {
    'use strict';

    // ── Config ────────────────────────────────────────────────────────
    var SPAWNS = [
        [8,  0.55,  8],  [-8,  0.55,  6],  [12, 0.55, -4],
        [-10,0.55, -5],  [3,   0.55, 15],  [-4, 0.55, 13],
    ];
    var ENEMY_HP       = 100;
    var DETECT_RANGE   = 18;
    var CHASE_SPEED    = 3.2;
    var PATROL_SPEED   = 1.4;
    var ATTACK_RANGE   = 2.0;
    var ATTACK_DAMAGE  = 12;
    var ATTACK_RATE    = 1.3;   // seconds between hits
    var RESPAWN_TIME   = 9;

    // Visual scale of the meat model (tweak to taste)
    var MODEL_SCALE    = 0.012;
    var MODEL_Y_OFFSET = -0.55; // shift model down so feet touch ground

    var enemies    = [];
    var playerHP   = 100;
    var hpEl       = null;
    var killsEl    = null;
    var killCount  = 0;
    var meatAsset  = null;   // preloaded container asset

    // ── Boot ──────────────────────────────────────────────────────────
    var wi = setInterval(function () {
        if (!window.pc || !pc.Application) return;
        var app = pc.Application.getApplication();
        if (!app) return;
        clearInterval(wi);
        var tryInit = function () {
            var cams = app.root.findComponents('camera');
            if (!cams || !cams.length) { setTimeout(tryInit, 200); return; }
            init(app, cams[0].entity);
        };
        if (app.root && app.root.findComponents('camera').length) tryInit();
        else app.on('start', function () { setTimeout(tryInit, 200); });
    }, 150);

    function init(app, cam) {
        buildHUD();

        // ── Preload the meat model, then spawn enemies ─────────────────
        meatAsset = new pc.Asset('meatEnemy', 'container', { url: '/models/enemy/meat.glb' });
        app.assets.add(meatAsset);

        meatAsset.on('load', function () {
            SPAWNS.forEach(function (pos, i) { spawnEnemy(app, cam, pos, i); });
        });
        meatAsset.on('error', function (err) {
            console.warn('Meat model failed to load, falling back to boxes:', err);
            SPAWNS.forEach(function (pos, i) { spawnEnemy(app, cam, pos, i); });
        });

        app.assets.load(meatAsset);

        // Hook gun.js shoot callback
        window.checkEnemyHits = function (origin, dir, pellets, spread) {
            enemies.forEach(function (en) {
                if (en.dead) return;
                for (var p = 0; p < pellets; p++) {
                    var ox = (Math.random() - 0.5) * spread;
                    var oy = (Math.random() - 0.5) * spread;
                    var dx = dir.x + ox, dy = dir.y + oy, dz = dir.z;
                    var len = Math.sqrt(dx*dx + dy*dy + dz*dz);
                    if (len > 0) { dx /= len; dy /= len; dz /= len; }
                    var hitHead = raySphere(origin, {x:dx,y:dy,z:dz}, en.headWorldPos(), 0.22);
                    var hitBody = raySphere(origin, {x:dx,y:dy,z:dz}, en.bodyWorldPos(), 0.42);
                    if (hitHead || hitBody) {
                        en.onHit(hitHead ? 60 : 22);
                        break;
                    }
                }
            });
        };

        // Expose player-damage for UI
        window.addKill = function () {
            killCount++;
            if (killsEl) killsEl.textContent = 'KILLS  ' + killCount;
        };

        // AI update
        app.on('update', function (dt) {
            enemies.forEach(function (en) { en.update(dt, cam.getPosition()); });
            enemies.forEach(function (en) { en.projectHPBar(app, cam); });
        });
    }

    // ── Ray-sphere intersection ───────────────────────────────────────
    function raySphere(ro, rd, sc, radius) {
        var ox = ro.x - sc.x, oy = ro.y - sc.y, oz = ro.z - sc.z;
        var b  = ox*rd.x + oy*rd.y + oz*rd.z;
        var c  = ox*ox + oy*oy + oz*oz - radius*radius;
        var d  = b*b - c;
        if (d < 0) return false;
        var t = -b - Math.sqrt(d);
        return t > 0 && t < 80;
    }

    // ── Collect all mesh instances from an entity tree ────────────────
    function collectMeshInstances(entity) {
        var mis = [];
        entity.findComponents('render').forEach(function (rc) {
            if (rc.meshInstances) mis = mis.concat(rc.meshInstances);
        });
        return mis;
    }

    // ── Spawn enemy ───────────────────────────────────────────────────
    function spawnEnemy(app, cam, pos, idx) {
        // Root hitbox entity (invisible, used for position/rotation and ray tests)
        var body = new pc.Entity('en-body-' + idx);
        body.setPosition(pos[0], pos[1], pos[2]);
        app.root.addChild(body);

        // ── 3-D model ──────────────────────────────────────────────────
        var modelEntity = null;
        var meshInstances = [];

        if (meatAsset && meatAsset.resource) {
            try {
                modelEntity = meatAsset.resource.instantiateRenderEntity();
                modelEntity.setLocalScale(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
                modelEntity.setLocalPosition(0, MODEL_Y_OFFSET, 0);
                body.addChild(modelEntity);
                meshInstances = collectMeshInstances(modelEntity);
            } catch (e) {
                console.warn('Could not instantiate meat model:', e);
                modelEntity = null;
            }
        }

        // Fallback: coloured box + sphere when model isn't available
        var bodyMat = null;
        if (!modelEntity) {
            body.addComponent('render', { type: 'box' });
            body.setLocalScale(0.5, 1.1, 0.3);
            bodyMat = new pc.StandardMaterial();
            bodyMat.diffuse = new pc.Color(0.65, 0.08, 0.08);
            bodyMat.update();
            applyMat(body, bodyMat);

            var head = new pc.Entity('en-head-' + idx);
            head.addComponent('render', { type: 'sphere' });
            head.setLocalScale(0.3, 0.3, 0.3);
            head.setLocalPosition(0, 0.78, 0);
            var headMat = new pc.StandardMaterial();
            headMat.diffuse = new pc.Color(0.82, 0.62, 0.48);
            headMat.update();
            applyMat(head, headMat);
            body.addChild(head);

            meshInstances = collectMeshInstances(body);
        }

        // ── DOM health bar ─────────────────────────────────────────────
        var hpBar = document.createElement('div');
        hpBar.style.cssText =
            'position:fixed;pointer-events:none;z-index:45;' +
            'display:flex;flex-direction:column;align-items:center;gap:2px;';
        var hpOuter = document.createElement('div');
        hpOuter.style.cssText =
            'width:42px;height:4px;background:rgba(0,0,0,0.55);' +
            'border:1px solid rgba(255,255,255,0.2);border-radius:2px;overflow:hidden;';
        var hpInner = document.createElement('div');
        hpInner.style.cssText = 'height:100%;width:100%;background:#e03030;border-radius:2px;transition:width 0.1s;';
        hpOuter.appendChild(hpInner);
        hpBar.appendChild(hpOuter);
        document.body.appendChild(hpBar);

        var en = {
            body:      body,
            modelEnt:  modelEntity,
            bodyMat:   bodyMat,
            meshInstances: meshInstances,
            hp:        ENEMY_HP,
            dead:      false,
            respawnT:  0,
            state:     'PATROL',
            stateT:    0,
            attackT:   0,
            hitFlash:  0,
            basePos:   new pc.Vec3(pos[0], pos[1], pos[2]),
            patrolDst: new pc.Vec3(pos[0], pos[1], pos[2]),
            hpBar:     hpBar,
            hpInner:   hpInner,
        };

        en.bodyWorldPos = function () { return en.body.getPosition(); };
        en.headWorldPos = function () { return en.body.getPosition().clone().add(new pc.Vec3(0, 0.78, 0)); };

        // ── Flash all mesh instances white on hit ──────────────────────
        en.setFlash = function (on) {
            en.meshInstances.forEach(function (mi) {
                if (!mi.material) return;
                if (on) {
                    mi.material.emissive = new pc.Color(1, 1, 1);
                    mi.material.emissiveIntensity = 2;
                } else {
                    mi.material.emissive = new pc.Color(0, 0, 0);
                    mi.material.emissiveIntensity = 1;
                }
                mi.material.update();
            });
            if (en.bodyMat) {
                en.bodyMat.emissive = on ? new pc.Color(1,1,1) : new pc.Color(0,0,0);
                en.bodyMat.update();
            }
        };

        en.onHit = function (dmg) {
            if (en.dead) return;
            en.hp = Math.max(0, en.hp - dmg);
            en.hitFlash = 0.12;
            en.setFlash(true);
            spawnDmgNum(app, en.headWorldPos(), dmg);
            en.state = 'CHASE';
            if (en.hp <= 0) en.die();
        };

        en.die = function () {
            en.dead = true; en.hp = 0;
            en.body.setEulerAngles(0, en.body.getEulerAngles().y, 90);
            en.setFlash(false);
            // Tint model dark on death
            en.meshInstances.forEach(function (mi) {
                if (!mi.material) return;
                mi.material.diffuse = new pc.Color(0.18, 0.18, 0.18);
                mi.material.update();
            });
            if (en.bodyMat) {
                en.bodyMat.diffuse = new pc.Color(0.18, 0.18, 0.18);
                en.bodyMat.update();
            }
            en.hpBar.style.display = 'none';
            en.respawnT = RESPAWN_TIME;
            window.addKill && window.addKill();
        };

        en.respawn = function () {
            en.dead = false; en.hp = ENEMY_HP;
            en.body.setEulerAngles(0, 0, 0);
            var ox = (Math.random() - 0.5) * 2, oz = (Math.random() - 0.5) * 2;
            en.body.setPosition(en.basePos.x + ox, en.basePos.y, en.basePos.z + oz);
            // Restore model tint
            en.meshInstances.forEach(function (mi) {
                if (!mi.material) return;
                mi.material.diffuse = new pc.Color(1, 1, 1);
                mi.material.emissive = new pc.Color(0, 0, 0);
                mi.material.update();
            });
            if (en.bodyMat) {
                en.bodyMat.diffuse = new pc.Color(0.65, 0.08, 0.08);
                en.bodyMat.emissive = new pc.Color(0, 0, 0);
                en.bodyMat.update();
            }
            en.hpInner.style.width = '100%';
            en.hpBar.style.display = 'flex';
            en.state = 'PATROL';
        };

        en.update = function (dt, playerPos) {
            if (en.dead) {
                en.respawnT -= dt;
                if (en.respawnT <= 0) en.respawn();
                return;
            }

            // Hit flash decay
            if (en.hitFlash > 0) {
                en.hitFlash -= dt;
                if (en.hitFlash <= 0) en.setFlash(false);
            }

            en.hpInner.style.width = en.hp + '%';

            var ep = en.body.getPosition();
            var dx = playerPos.x - ep.x, dz = playerPos.z - ep.z;
            var dist = Math.sqrt(dx*dx + dz*dz);

            en.stateT -= dt; en.attackT -= dt;

            if (en.state === 'PATROL') {
                if (dist < DETECT_RANGE) { en.state = 'CHASE'; return; }
                var pdx = en.patrolDst.x - ep.x, pdz = en.patrolDst.z - ep.z;
                var pd  = Math.sqrt(pdx*pdx + pdz*pdz);
                if (pd < 0.6 || en.stateT <= 0) {
                    en.patrolDst.set(
                        en.basePos.x + (Math.random() - 0.5) * 10,
                        en.basePos.y,
                        en.basePos.z + (Math.random() - 0.5) * 10
                    );
                    en.stateT = 2 + Math.random() * 3;
                } else {
                    en.body.translate(pdx/pd * PATROL_SPEED * dt, 0, pdz/pd * PATROL_SPEED * dt);
                    en.body.setEulerAngles(0, Math.atan2(pdx, pdz) * 180/Math.PI, 0);
                }
            } else if (en.state === 'CHASE') {
                if (dist > DETECT_RANGE + 8) { en.state = 'PATROL'; return; }
                if (dist < ATTACK_RANGE)     { en.state = 'ATTACK'; return; }
                en.body.translate(dx/dist * CHASE_SPEED * dt, 0, dz/dist * CHASE_SPEED * dt);
                en.body.setEulerAngles(0, Math.atan2(dx, dz) * 180/Math.PI, 0);
            } else if (en.state === 'ATTACK') {
                if (dist > ATTACK_RANGE + 0.5) { en.state = 'CHASE'; return; }
                en.body.setEulerAngles(0, Math.atan2(dx, dz) * 180/Math.PI, 0);
                if (en.attackT <= 0) {
                    en.attackT = ATTACK_RATE;
                    hitPlayer(ATTACK_DAMAGE);
                }
            }
        };

        en.projectHPBar = function (app, cam) {
            if (en.dead) { en.hpBar.style.display = 'none'; return; }
            try {
                var camComp = cam.camera;
                if (!camComp) return;
                var headPos = en.headWorldPos();
                headPos.y += 0.22;
                var sc = new pc.Vec4();
                camComp.worldToScreen(headPos, sc);
                if (sc.z < 0 || sc.z > 1) { en.hpBar.style.display = 'none'; return; }
                var vw = window.innerWidth, vh = window.innerHeight;
                var sx = sc.x / app.graphicsDevice.width  * vw;
                var sy = sc.y / app.graphicsDevice.height * vh;
                en.hpBar.style.display = 'flex';
                en.hpBar.style.left = (sx - 21) + 'px';
                en.hpBar.style.top  = (sy - 14) + 'px';
            } catch (e) { en.hpBar.style.display = 'none'; }
        };

        enemies.push(en);
    }

    // ── Floating damage number ────────────────────────────────────────
    function spawnDmgNum(app, worldPos, dmg) {
        try {
            var camComp = app.root.findComponents('camera')[0];
            if (!camComp) return;
            var sc = new pc.Vec4();
            camComp.worldToScreen(worldPos, sc);
            if (sc.z < 0 || sc.z > 1) return;
            var vw = window.innerWidth, vh = window.innerHeight;
            var sx = sc.x / app.graphicsDevice.width  * vw;
            var sy = sc.y / app.graphicsDevice.height * vh;
            var el = document.createElement('div');
            el.textContent = '-' + dmg;
            el.style.cssText =
                'position:fixed;left:' + (sx-12) + 'px;top:' + (sy-20) + 'px;' +
                'font-size:14px;font-weight:800;color:#ff5555;' +
                'text-shadow:0 0 4px rgba(0,0,0,0.8);pointer-events:none;z-index:60;' +
                'font-family:"Segoe UI",Arial,sans-serif;transition:top 0.6s,opacity 0.6s;';
            document.body.appendChild(el);
            requestAnimationFrame(function () {
                el.style.top  = (sy - 55) + 'px';
                el.style.opacity = '0';
            });
            setTimeout(function () { el.parentNode && el.parentNode.removeChild(el); }, 700);
        } catch (e) {}
    }

    // ── Player damage ─────────────────────────────────────────────────
    function hitPlayer(dmg) {
        playerHP = Math.max(0, playerHP - dmg);
        if (hpEl) {
            hpEl.bar.style.width = playerHP + '%';
            var c = playerHP > 60 ? '#1db31d' : playerHP > 25 ? '#f5c518' : '#ff4444';
            hpEl.bar.style.background = c;
            hpEl.num.textContent = playerHP;
        }
        var ov = document.createElement('div');
        ov.style.cssText =
            'position:fixed;inset:0;pointer-events:none;z-index:98;' +
            'background:radial-gradient(circle,transparent 40%,rgba(200,0,0,0.55) 100%);' +
            'transition:opacity 0.5s;';
        document.body.appendChild(ov);
        setTimeout(function () { ov.style.opacity = '0'; }, 60);
        setTimeout(function () { ov.parentNode && ov.parentNode.removeChild(ov); }, 600);
    }

    function applyMat(entity, mat) {
        if (entity.render && entity.render.meshInstances) {
            entity.render.meshInstances.forEach(function (mi) { mi.material = mat; });
        }
    }

    // ── HUD ───────────────────────────────────────────────────────────
    function buildHUD() {
        var S = 'font-family:"Segoe UI",Arial,sans-serif;pointer-events:none;';

        var wrap = document.createElement('div');
        wrap.style.cssText = 'position:fixed;bottom:22px;right:22px;' +
            'display:flex;flex-direction:column;align-items:flex-end;gap:3px;z-index:50;' + S;

        var lbl = document.createElement('div');
        lbl.style.cssText = 'font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#1db31d;font-weight:700;';
        lbl.textContent = 'HEALTH';
        wrap.appendChild(lbl);

        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;';

        var num = document.createElement('span');
        num.style.cssText = 'font-size:38px;font-weight:800;color:#fff;font-variant-numeric:tabular-nums;line-height:1;';
        num.textContent = '100';

        var outer = document.createElement('div');
        outer.style.cssText = 'width:80px;height:7px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:3px;overflow:hidden;';
        var bar = document.createElement('div');
        bar.style.cssText = 'height:100%;width:100%;background:#1db31d;border-radius:3px;transition:width 0.15s,background 0.3s;';
        outer.appendChild(bar);

        row.appendChild(num); row.appendChild(outer);
        wrap.appendChild(row);
        document.body.appendChild(wrap);
        hpEl = { bar, num };

        killsEl = document.createElement('div');
        killsEl.style.cssText =
            'position:fixed;top:20px;right:22px;font-size:11px;' +
            'letter-spacing:3px;text-transform:uppercase;color:#1db31d;font-weight:700;' +
            'z-index:50;' + S;
        killsEl.textContent = 'KILLS  0';
        document.body.appendChild(killsEl);
    }

})();
