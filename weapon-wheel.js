// weapon-wheel.js — GTA-style radial weapon wheel
(function () {
    'use strict';

    var WEAPONS = [
        { name: 'PISTOL',        sub: '12 / ∞',  color: '#4fc3f7', idx: 0 },
        { name: 'ASSAULT RIFLE', sub: '30 / 150', color: '#1db31d', idx: 1 },
        { name: 'SHOTGUN',       sub: '8 / 40',   color: '#f5c518', idx: 2 },
    ];
    var COUNT    = WEAPONS.length;
    var SLICE    = (Math.PI * 2) / COUNT;

    var wheelOpen    = false;
    var highlighted  = 0;
    var stickX = 0, stickY = 0;   // accumulated mouse or right-stick direction
    var prevLB = false;

    var overlay  = null;
    var cvs      = null;
    var ctx2d    = null;
    var nameTag  = null;

    var _rawPads = navigator.getGamepads.bind(navigator);

    // ── Boot ──────────────────────────────────────────────────────────
    var wi = setInterval(function () {
        if (!window.pc || !pc.Application) return;
        var app = pc.Application.getApplication();
        if (!app) return;
        clearInterval(wi);
        var tryInit = function () {
            if (app.root && app.root.findComponents('camera').length) {
                init(app);
            } else {
                setTimeout(tryInit, 200);
            }
        };
        if (app.root && app.root.findComponents('camera').length) init(app);
        else app.on('start', function () { setTimeout(tryInit, 200); });
    }, 150);

    function init(app) {
        buildOverlay();

        // Mouse delta while wheel is open (pointer lock mode)
        document.addEventListener('mousemove', function (e) {
            if (!wheelOpen) return;
            stickX += (e.movementX || 0) * 0.8;
            stickY -= (e.movementY || 0) * 0.8;
            highlightFromStick();
            drawWheel();
        });

        // Keyboard Q = hold to open
        document.addEventListener('keydown', function (e) {
            if (e.repeat) return;
            if (e.key === 'q' || e.key === 'Q') openWheel();
        });
        document.addEventListener('keyup', function (e) {
            if (e.key === 'q' || e.key === 'Q') closeWheel(true);
        });

        // Gamepad polling (LB hold)
        app.on('update', function () {
            // Update ammo sub-text from gun state
            syncAmmo();

            var pads = _rawPads();
            for (var i = 0; i < pads.length; i++) {
                var pad = pads[i];
                if (!pad || !pad.connected) continue;

                var lb = pad.buttons[4] && pad.buttons[4].pressed;
                if (lb && !prevLB) openWheel();
                if (!lb && prevLB) closeWheel(true);
                prevLB = lb;

                // Right stick to aim inside wheel
                if (wheelOpen && pad.axes && pad.axes.length >= 4) {
                    var rx = pad.axes[2], ry = pad.axes[3];
                    if (Math.abs(rx) > 0.25 || Math.abs(ry) > 0.25) {
                        stickX = rx; stickY = -ry;
                        highlightFromStick();
                        drawWheel();
                    }
                }
                break;
            }
        });
    }

    // ── Overlay ───────────────────────────────────────────────────────
    function buildOverlay() {
        overlay = document.createElement('div');
        overlay.style.cssText =
            'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
            'z-index:200;pointer-events:none;' +
            'background:radial-gradient(circle at 50% 50%,rgba(0,0,0,0.18) 0%,rgba(0,0,0,0.62) 100%);' +
            'backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);';

        var wrap = document.createElement('div');
        wrap.style.cssText =
            'position:relative;display:flex;align-items:center;justify-content:center;';

        cvs = document.createElement('canvas');
        cvs.width = 520; cvs.height = 520;
        cvs.style.cssText = 'width:380px;height:380px;';
        ctx2d = cvs.getContext('2d');

        // Hint label
        var hint = document.createElement('div');
        hint.style.cssText =
            'position:absolute;bottom:-36px;left:50%;transform:translateX(-50%);' +
            'font-size:10px;letter-spacing:3px;color:rgba(255,255,255,0.35);' +
            'text-transform:uppercase;font-family:"Segoe UI",Arial,sans-serif;white-space:nowrap;';
        hint.textContent = 'MOVE STICK / MOUSE · RELEASE TO SELECT';

        wrap.appendChild(cvs);
        wrap.appendChild(hint);
        overlay.appendChild(wrap);
        document.body.appendChild(overlay);
    }

    function openWheel() {
        if (wheelOpen) return;
        wheelOpen = true;
        window.wheelOpen = true;
        stickX = 0; stickY = 0;
        // Pre-highlight current weapon
        if (window.gunCurrentWeapon !== undefined) highlighted = window.gunCurrentWeapon;
        overlay.style.display = 'flex';
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.12s';
        requestAnimationFrame(function () { overlay.style.opacity = '1'; });
        drawWheel();
    }

    function closeWheel(apply) {
        if (!wheelOpen) return;
        wheelOpen = false;
        window.wheelOpen = false;
        overlay.style.opacity = '0';
        setTimeout(function () { overlay.style.display = 'none'; }, 130);
        if (apply && window.gunSwitchWeapon) window.gunSwitchWeapon(highlighted);
    }

    function highlightFromStick() {
        if (Math.abs(stickX) < 0.1 && Math.abs(stickY) < 0.1) return;
        // atan2 gives angle from +X axis; we want sector centered at top = -π/2
        var angle = Math.atan2(-stickY, stickX); // standard math angle
        // Rotate so top = 0 → add π/2 then normalize 0..2π
        var a = (angle + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
        // Offset by half a slice so sector i is centered at i*SLICE
        a = (a + SLICE / 2) % (Math.PI * 2);
        highlighted = Math.floor(a / SLICE) % COUNT;
    }

    function syncAmmo() {
        if (!window.gunAmmoState) return;
        var am = window.gunAmmoState;
        WEAPONS[0].sub = am[0].mag + ' / ' + (am[0].res === Infinity ? '∞' : am[0].res);
        WEAPONS[1].sub = am[1].mag + ' / ' + (am[1].res === Infinity ? '∞' : am[1].res);
        WEAPONS[2].sub = am[2].mag + ' / ' + (am[2].res === Infinity ? '∞' : am[2].res);
    }

    // ── Draw ──────────────────────────────────────────────────────────
    function drawWheel() {
        var W = cvs.width, H = cvs.height;
        var cx = W / 2, cy = H / 2;
        var outerR = 230, innerR = 82;
        var GAP = 0.025; // radians gap between sectors

        ctx2d.clearRect(0, 0, W, H);

        for (var i = 0; i < COUNT; i++) {
            // Sectors rotate so first is at top — start angle for sector i:
            var sa = i * SLICE - Math.PI / 2 - SLICE / 2 + GAP;
            var ea = sa + SLICE - GAP * 2;
            var isSel = (i === highlighted);
            var wp = WEAPONS[i];

            // Background fill
            ctx2d.beginPath();
            ctx2d.moveTo(cx, cy);
            ctx2d.arc(cx, cy, outerR, sa, ea);
            ctx2d.closePath();
            if (isSel) {
                var grd = ctx2d.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
                grd.addColorStop(0, 'rgba(29,179,29,0.08)');
                grd.addColorStop(1, 'rgba(29,179,29,0.28)');
                ctx2d.fillStyle = grd;
            } else {
                ctx2d.fillStyle = 'rgba(10,10,10,0.72)';
            }
            ctx2d.fill();

            // Border
            ctx2d.beginPath();
            ctx2d.moveTo(cx, cy);
            ctx2d.arc(cx, cy, outerR, sa, ea);
            ctx2d.closePath();
            ctx2d.strokeStyle = isSel ? wp.color : 'rgba(255,255,255,0.10)';
            ctx2d.lineWidth   = isSel ? 2.2 : 1;
            ctx2d.stroke();

            // Outer rim arc highlight when selected
            if (isSel) {
                ctx2d.beginPath();
                ctx2d.arc(cx, cy, outerR - 1, sa, ea);
                ctx2d.strokeStyle = wp.color;
                ctx2d.lineWidth   = 3;
                ctx2d.globalAlpha = 0.7;
                ctx2d.stroke();
                ctx2d.globalAlpha = 1;
            }

            // Label — centered on sector arc at midpoint radius
            var mid = sa + (ea - sa) / 2;
            var lr  = (outerR + innerR) / 2;
            var lx  = cx + Math.cos(mid) * lr;
            var ly  = cy + Math.sin(mid) * lr;

            // Weapon name
            ctx2d.textAlign    = 'center';
            ctx2d.textBaseline = 'middle';
            ctx2d.fillStyle    = isSel ? '#ffffff' : 'rgba(255,255,255,0.45)';
            ctx2d.font         = isSel ? 'bold 15px "Segoe UI",Arial,sans-serif'
                                       : '13px "Segoe UI",Arial,sans-serif';
            ctx2d.fillText(wp.name, lx, ly - 9);

            // Ammo sub-text
            ctx2d.fillStyle = isSel ? wp.color : 'rgba(255,255,255,0.25)';
            ctx2d.font      = '11px "Segoe UI",Arial,sans-serif';
            ctx2d.fillText(wp.sub, lx, ly + 10);
        }

        // Inner hole
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, innerR, 0, Math.PI * 2);
        ctx2d.fillStyle = 'rgba(6,6,6,0.92)';
        ctx2d.fill();
        ctx2d.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx2d.lineWidth   = 1;
        ctx2d.stroke();

        // Selected weapon text in center
        var wp = WEAPONS[highlighted];
        ctx2d.textAlign    = 'center';
        ctx2d.textBaseline = 'middle';
        ctx2d.fillStyle    = wp.color;
        ctx2d.font         = 'bold 13px "Segoe UI",Arial,sans-serif';
        ctx2d.fillText(wp.name, cx, cy - 9);
        ctx2d.fillStyle = 'rgba(255,255,255,0.35)';
        ctx2d.font      = '10px "Segoe UI",Arial,sans-serif';
        ctx2d.fillText('EQUIPPED', cx, cy + 10);

        // Direction indicator line
        if (Math.abs(stickX) > 0.05 || Math.abs(stickY) > 0.05) {
            var angle = Math.atan2(-stickY, stickX);
            var lineR = innerR - 8;
            ctx2d.beginPath();
            ctx2d.moveTo(cx, cy);
            ctx2d.lineTo(cx + Math.cos(angle) * lineR, cy + Math.sin(angle) * lineR);
            ctx2d.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx2d.lineWidth   = 2;
            ctx2d.stroke();

            // Arrowhead
            ctx2d.beginPath();
            ctx2d.arc(cx + Math.cos(angle) * lineR, cy + Math.sin(angle) * lineR, 4, 0, Math.PI * 2);
            ctx2d.fillStyle = 'rgba(255,255,255,0.6)';
            ctx2d.fill();
        }
    }

})();
