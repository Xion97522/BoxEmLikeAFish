// voxels.js — Destructible voxel world for Box Em Like a Fish
(function () {
    'use strict';

    var BS     = 1.5;   // block size metres
    var blocks = [];
    var debris = [];
    var mats   = {};
    var appRef = null;

    var TYPES = {
        GRASS: { r:0.20, g:0.52, b:0.18, shine:20, metal:0.00 },
        DIRT:  { r:0.48, g:0.30, b:0.14, shine:10, metal:0.00 },
        STONE: { r:0.40, g:0.40, b:0.44, shine:35, metal:0.00 },
        WOOD:  { r:0.55, g:0.36, b:0.18, shine:12, metal:0.00 },
        METAL: { r:0.30, g:0.36, b:0.44, shine:90, metal:0.85 },
        SNOW:  { r:0.88, g:0.92, b:0.96, shine:50, metal:0.00 },
    };

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
        if (app.root.findComponents('camera').length) tryInit();
        else app.on('start', function () { setTimeout(tryInit, 200); });
    }, 150);

    function init(app, cam) {
        appRef = app;
        buildMaterials();
        buildWorld(app);
        hookGun();
        app.on('update', function (dt) {
            updateBlocks(dt);
            updateDebris(dt);
        });
    }

    // ── Materials ─────────────────────────────────────────────────────
    function buildMaterials() {
        Object.keys(TYPES).forEach(function (key) {
            var t = TYPES[key];
            var m = new pc.StandardMaterial();
            m.diffuse    = new pc.Color(t.r, t.g, t.b);
            m.shininess  = t.shine;
            m.metalness  = t.metal;
            m.useLighting = true;
            m.update();
            mats[key] = m;
        });
    }

    function applyMat(entity, mat) {
        var rc = entity.render;
        if (!rc) return;
        rc.meshInstances.forEach(function (mi) { mi.material = mat; });
    }

    // ── Block creation helpers ────────────────────────────────────────
    function addBlock(app, wx, wy, wz, typeKey) {
        var e = new pc.Entity('vox');
        e.addComponent('render', { type: 'box', castShadows: true, receiveShadows: true });
        var scaled = BS * 0.97;
        e.setLocalScale(scaled, scaled, scaled);
        var cy = wy * BS + BS * 0.5;
        e.setPosition(wx * BS, cy, wz * BS);
        applyMat(e, mats[typeKey] || mats.STONE);
        app.root.addChild(e);
        blocks.push({ e: e, cx: wx*BS, cy: cy, cz: wz*BS, hs: BS*0.5,
                      dead: false, destroyT: -1, typeKey: typeKey });
    }

    function fillRect(app, x1, y1, z1, x2, y2, z2, typeKey) {
        for (var x = x1; x <= x2; x++)
        for (var y = y1; y <= y2; y++)
        for (var z = z1; z <= z2; z++)
            addBlock(app, x, y, z, typeKey);
    }

    function fillShell(app, x1, y1, z1, x2, y2, z2, typeKey) {
        for (var x = x1; x <= x2; x++)
        for (var y = y1; y <= y2; y++)
        for (var z = z1; z <= z2; z++)
            if (x===x1||x===x2||y===y1||y===y2||z===z1||z===z2)
                addBlock(app, x, y, z, typeKey);
    }

    // ── World layout ─────────────────────────────────────────────────
    function buildWorld(app) {

        // ── Stone building (hollow) ──────────────────────────────────
        fillShell(app,  10, 0, 14,  15, 4, 19, 'STONE');
        fillRect(app,   10, 5, 14,  15, 5, 19, 'METAL');   // metal roof

        // ── Metal tower ──────────────────────────────────────────────
        fillRect(app,   1, 0, -18,   3, 9, -16, 'METAL');
        fillRect(app,   0, 10,-19,   4, 10, -14, 'METAL');   // platform top

        // ── Wooden bunker ────────────────────────────────────────────
        fillShell(app, -14, 0,-12,  -10, 2,  -8, 'WOOD');
        fillRect(app,  -14, 3,-12,  -10, 3,  -8, 'WOOD');   // roof

        // ── Stone ruins (L-wall) ─────────────────────────────────────
        fillRect(app,  -20, 0,  8,  -16, 3,   9, 'STONE');
        fillRect(app,  -20, 0,  9,  -19, 3,  14, 'STONE');
        fillRect(app,  -20, 4,  8,  -18, 4,   9, 'STONE');  // broken top

        // ── Long defensive wall ──────────────────────────────────────
        fillRect(app,    5, 0,-12,   12, 2, -12, 'STONE');
        fillRect(app,   12, 0,-12,   12, 2,  -6, 'STONE');

        // ── Compound: stone base, metal top ──────────────────────────
        fillRect(app,  -22, 0, -8,  -18, 2,  -4, 'STONE');
        fillRect(app,  -22, 3, -8,  -18, 5,  -4, 'METAL');

        // ── Stone pillars (central) ───────────────────────────────────
        [[-8,-8],[8,8],[-8,8],[8,-8]].forEach(function (p) {
            fillRect(app, p[0], 0, p[1], p[0], 4, p[1], 'STONE');
        });

        // ── Terrain mounds ────────────────────────────────────────────
        // Mound 1
        fillRect(app,  -7, 0, 20,  -5, 0, 22, 'GRASS');
        fillRect(app,  -8, 0, 19,  -4, 0, 23, 'DIRT');
        addBlock(app,  -6, 1, 21, 'GRASS');
        // Mound 2
        fillRect(app,  17, 0, -2,  19, 0,  1, 'GRASS');
        addBlock(app,  18, 1, -1, 'GRASS');
        addBlock(app,  18, 2, -1, 'SNOW');
        // Mound 3
        fillRect(app, -13, 0, 21,  -9, 0, 24, 'GRASS');
        fillRect(app, -12, 1, 22, -10, 1, 23, 'GRASS');
        fillRect(app, -11, 2, 22, -11, 2, 23, 'SNOW');
        // Mound 4
        fillRect(app,  20, 0, 10,  22, 0, 13, 'DIRT');
        addBlock(app,  21, 1, 11, 'GRASS');

        // ── Wooden crate clusters ─────────────────────────────────────
        var crates = [
            [4,5],[-4,-6],[8,-4],[-8,8],[12,4],
            [-6,15],[3,-14],[-14,2],[7,12],[-3,10],
            [18,8],[-18,-5],[6,-8],[-10,-8],[15,-10],
            [2,-8],[-5,-15],[10,-16],[-16,8],[5,22],
        ];
        crates.forEach(function (c) {
            if (!isFinite(c[0]) || !isFinite(c[1])) return;
            addBlock(app, c[0], 0, c[1], 'WOOD');
            if (Math.random() > 0.4) addBlock(app, c[0], 1, c[1], 'WOOD');
        });

        // ── Rubble scatter ────────────────────────────────────────────
        [
            [13,-3,'STONE'],[-3,18,'DIRT'],[19,-12,'METAL'],
            [-17,18,'WOOD'],[8,-20,'STONE'],[-9,4,'DIRT'],
        ].forEach(function (r) {
            addBlock(app, r[0], 0, r[1], r[2]);
        });
    }

    // ── Ray-AABB intersection ─────────────────────────────────────────
    function rayBox(ro, rd, bx, by, bz, hs) {
        var ox=ro.x, oy=ro.y, oz=ro.z;
        var dx=rd.x, dy=rd.y, dz=rd.z;
        var t1x=(bx-hs-ox)/dx, t2x=(bx+hs-ox)/dx;
        var t1y=(by-hs-oy)/dy, t2y=(by+hs-oy)/dy;
        var t1z=(bz-hs-oz)/dz, t2z=(bz+hs-oz)/dz;
        if(t1x>t2x){var tx=t1x;t1x=t2x;t2x=tx;}
        if(t1y>t2y){var ty=t1y;t1y=t2y;t2y=ty;}
        if(t1z>t2z){var tz=t1z;t1z=t2z;t2z=tz;}
        var tmin=Math.max(t1x,t1y,t1z);
        var tmax=Math.min(t2x,t2y,t2z);
        if(tmin>tmax||tmax<0) return -1;
        return tmin>0?tmin:tmax;
    }

    // ── Hook into gun system ──────────────────────────────────────────
    function hookGun() {
        var iv = setInterval(function () {
            if (!window.checkEnemyHits) return;
            clearInterval(iv);
            var orig = window.checkEnemyHits;
            window.checkEnemyHits = function (origin, dir, pellets, spread) {
                orig(origin, dir, pellets, spread);
                shootVoxel(origin, dir);
            };
        }, 100);
        window.checkVoxelHit = function (origin, dir) { shootVoxel(origin, dir); };
    }

    function shootVoxel(origin, dir) {
        var bestBlock = null, bestT = Infinity;
        for (var i = 0; i < blocks.length; i++) {
            var b = blocks[i];
            if (b.dead) continue;
            var t = rayBox(origin, dir, b.cx, b.cy, b.cz, b.hs);
            if (t >= 0 && t < bestT && t < 80) { bestT = t; bestBlock = b; }
        }
        if (bestBlock) destroyBlock(bestBlock);
    }

    // ── Block destruction ─────────────────────────────────────────────
    function destroyBlock(block) {
        if (block.dead) return;
        block.dead = true;
        block.destroyT = 0;

        // Brief flash
        var td = TYPES[block.typeKey] || TYPES.STONE;
        var fm = new pc.StandardMaterial();
        fm.diffuse  = new pc.Color(Math.min(td.r*2,1), Math.min(td.g*2,1), Math.min(td.b*2,1));
        fm.emissive = new pc.Color(0.5, 0.45, 0.2);
        fm.emissiveIntensity = 1.5;
        fm.update();
        if (block.e) applyMat(block.e, fm);

        // Debris
        for (var i = 0; i < 5; i++) spawnDebris(block);
    }

    function updateBlocks(dt) {
        for (var i = 0; i < blocks.length; i++) {
            var b = blocks[i];
            if (!b.dead || b.destroyT < 0) continue;
            b.destroyT += dt;
            var s = Math.max(0, 1 - b.destroyT / 0.16);
            if (s <= 0) {
                if (b.e) { b.e.destroy(); b.e = null; }
                b.destroyT = -2;
            } else {
                if (b.e) { var sc = BS * s * 0.97; b.e.setLocalScale(sc, sc, sc); }
            }
        }
    }

    // ── Debris particles ──────────────────────────────────────────────
    function spawnDebris(block) {
        var e = new pc.Entity('dbr');
        e.addComponent('render', { type: 'box' });
        var s = BS * (0.12 + Math.random() * 0.2);
        e.setLocalScale(s, s, s);
        e.setPosition(
            block.cx + (Math.random()-0.5)*BS,
            block.cy + (Math.random()-0.5)*BS*0.4,
            block.cz + (Math.random()-0.5)*BS
        );
        var td = TYPES[block.typeKey] || TYPES.STONE;
        var dm = new pc.StandardMaterial();
        var jitter = (Math.random()-0.5)*0.25;
        dm.diffuse = new pc.Color(
            Math.max(0,Math.min(1,td.r+jitter)),
            Math.max(0,Math.min(1,td.g+jitter)),
            Math.max(0,Math.min(1,td.b+jitter))
        );
        dm.update();
        applyMat(e, dm);
        appRef.root.addChild(e);
        debris.push({
            e: e,
            vx: (Math.random()-0.5)*7,
            vy: 2.5 + Math.random()*5,
            vz: (Math.random()-0.5)*7,
            rx: (Math.random()-0.5)*360,
            rz: (Math.random()-0.5)*360,
            life: 0.45 + Math.random()*0.45, t: 0
        });
    }

    function updateDebris(dt) {
        for (var i = debris.length-1; i >= 0; i--) {
            var d = debris[i];
            d.t  += dt;
            d.vy -= 16 * dt;
            var p = d.e.getPosition();
            d.e.setPosition(p.x + d.vx*dt, Math.max(0, p.y + d.vy*dt), p.z + d.vz*dt);
            d.e.rotate(d.rx*dt, 0, d.rz*dt);
            if (d.t >= d.life) { d.e.destroy(); debris.splice(i,1); }
        }
    }

})();
