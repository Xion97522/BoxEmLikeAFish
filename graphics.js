// graphics.js — Enhanced visuals & screen effects for Box Em Like a Fish
(function () {
    'use strict';

    var wi = setInterval(function () {
        if (!window.pc || !pc.Application) return;
        var app = pc.Application.getApplication();
        if (!app) return;
        clearInterval(wi);
        var tryInit = function () {
            if (!app.root.findComponents('camera').length) { setTimeout(tryInit, 200); return; }
            init(app);
        };
        if (app.root.findComponents('camera').length) tryInit();
        else app.on('start', function () { setTimeout(tryInit, 200); });
    }, 150);

    function init(app) {
        applySceneSettings(app);
        injectCSS();
        buildOverlays();
        patchDamage();
    }

    // ── PlayCanvas scene ──────────────────────────────────────────────
    function applySceneSettings(app) {
        // Atmospheric fog
        try {
            app.scene.fog      = pc.FOG_LINEAR;
            app.scene.fogColor = new pc.Color(0.04, 0.07, 0.05);
            app.scene.fogStart = 32;
            app.scene.fogEnd   = 80;
        } catch(e) {}

        // Ambient light (dark green-tinted night feel)
        try {
            app.scene.ambientLight = new pc.Color(0.10, 0.15, 0.11);
        } catch(e) {}

        // Tone-mapping
        try { app.scene.toneMapping = pc.TONEMAP_ACES; } catch(e) {}

        // Enhance existing lights
        try {
            app.root.findComponents('light').forEach(function (l) {
                if (l.type === 'directional' || l.type === 0) {
                    l.color     = new pc.Color(1.0, 0.94, 0.78);
                    l.intensity = 1.45;
                    try {
                        l.castShadows       = true;
                        l.shadowResolution  = 2048;
                        l.shadowBias        = 0.06;
                        l.normalOffsetBias  = 0.06;
                    } catch(se) {}
                }
            });
        } catch(e) {}

        // Camera settings
        try {
            var cam = app.root.findComponents('camera')[0];
            if (cam) {
                cam.nearClip = 0.08;
                cam.farClip  = 120;
                cam.fov      = 75;
                // Dark sky to match fog colour
                cam.clearColor = new pc.Color(0.03, 0.06, 0.04, 1);
            }
        } catch(e) {}
    }

    // ── CSS ───────────────────────────────────────────────────────────
    function injectCSS() {
        var s = document.createElement('style');
        s.textContent = [
            '@keyframes gfx-shake {',
            '  0%{transform:translate(0,0)rotate(0)}',
            '  18%{transform:translate(-5px,3px)rotate(-0.6deg)}',
            '  36%{transform:translate(5px,-3px)rotate(0.6deg)}',
            '  54%{transform:translate(-4px,5px)rotate(-0.4deg)}',
            '  72%{transform:translate(4px,-2px)rotate(0.3deg)}',
            '  100%{transform:translate(0,0)rotate(0)}',
            '}',
            '@keyframes gfx-red-in {',
            '  0%{opacity:0.7}',
            '  100%{opacity:0}',
            '}',
            '@keyframes gfx-hit-ring {',
            '  0%{transform:translate(-50%,-50%) scale(0.5);opacity:0.9}',
            '  100%{transform:translate(-50%,-50%) scale(1.6);opacity:0}',
            '}',
            '#application-canvas { transform-origin:center center; }',
            '#gfx-dmg-flash {',
            '  position:fixed;inset:0;z-index:998;pointer-events:none;',
            '  background:radial-gradient(ellipse at center,transparent 35%,rgba(210,15,15,0.75) 100%);',
            '  opacity:0;',
            '}',
            '#gfx-low-vignette {',
            '  position:fixed;inset:0;z-index:996;pointer-events:none;',
            '  background:radial-gradient(ellipse at center,transparent 18%,rgba(160,0,0,0.38) 100%);',
            '  opacity:0;transition:opacity 0.6s;',
            '}',
            '#gfx-hit-ring {',
            '  position:fixed;left:50%;top:50%;z-index:997;pointer-events:none;',
            '  width:120px;height:120px;border-radius:50%;',
            '  border:2px solid rgba(255,60,60,0.8);opacity:0;',
            '}',
            '#gfx-crosshair {',
            '  position:fixed;left:50%;top:50%;z-index:50;pointer-events:none;',
            '  transform:translate(-50%,-50%);',
            '  width:14px;height:14px;',
            '}',
            '#gfx-crosshair::before,#gfx-crosshair::after {',
            '  content:"";position:absolute;background:#fff;',
            '  box-shadow:0 0 3px rgba(0,0,0,0.8);',
            '}',
            '#gfx-crosshair::before { width:2px;height:14px;left:6px;top:0; }',
            '#gfx-crosshair::after  { width:14px;height:2px;left:0;top:6px; }',
            '#gfx-scope-dot {',
            '  position:absolute;left:50%;top:50%;',
            '  width:3px;height:3px;border-radius:50%;',
            '  background:rgba(255,80,80,0.9);',
            '  transform:translate(-50%,-50%);',
            '  box-shadow:0 0 4px rgba(255,80,80,0.7);',
            '}',
            /* ── WASTED overlay ── */
            '@keyframes wasted-desaturate {',
            '  0%   { filter:saturate(1) brightness(1); }',
            '  100% { filter:saturate(0) brightness(0.55); }',
            '}',
            '@keyframes wasted-bar-in {',
            '  0%   { transform:scaleY(0); }',
            '  100% { transform:scaleY(1); }',
            '}',
            '@keyframes wasted-text-in {',
            '  0%   { opacity:0; transform:translateX(-50%) scale(1.8); letter-spacing:0.35em; }',
            '  60%  { opacity:1; transform:translateX(-50%) scale(0.96); letter-spacing:0.12em; }',
            '  100% { opacity:1; transform:translateX(-50%) scale(1); letter-spacing:0.14em; }',
            '}',
            '@keyframes wasted-btn-in {',
            '  0%   { opacity:0; transform:translateX(-50%) translateY(18px); }',
            '  100% { opacity:1; transform:translateX(-50%) translateY(0); }',
            '}',
            '#gfx-wasted-overlay {',
            '  position:fixed;inset:0;z-index:1200;pointer-events:none;',
            '  display:flex;align-items:center;justify-content:center;',
            '  opacity:0;transition:opacity 0.35s ease;',
            '}',
            '#gfx-wasted-overlay.visible { opacity:1;pointer-events:all; }',
            '#gfx-wasted-canvas-shade {',
            '  position:fixed;inset:0;z-index:1199;pointer-events:none;',
            '  background:rgba(0,0,0,0);transition:background 1.4s ease;',
            '}',
            '#gfx-wasted-canvas-shade.active {',
            '  background:rgba(0,0,0,0.18);',
            '}',
            '.gfx-wasted-bar {',
            '  position:fixed;left:0;right:0;height:90px;z-index:1201;pointer-events:none;',
            '  background:#000;transform-origin:top;transform:scaleY(0);',
            '}',
            '.gfx-wasted-bar.top    { top:0;    transform-origin:top; }',
            '.gfx-wasted-bar.bottom { bottom:0; transform-origin:bottom; }',
            '.gfx-wasted-bar.animate {',
            '  animation:wasted-bar-in 0.55s cubic-bezier(0.22,1,0.36,1) forwards;',
            '}',
            '#gfx-wasted-text {',
            '  position:fixed;top:50%;left:50%;',
            '  transform:translateX(-50%) scale(1.8);',
            '  font-family:"Arial Black","Arial",sans-serif;',
            '  font-size:clamp(64px,12vw,120px);',
            '  font-weight:900;',
            '  color:#c8c8c8;',
            '  text-transform:uppercase;',
            '  letter-spacing:0.14em;',
            '  text-shadow:',
            '    0 0 0 #000,',
            '    4px 4px 0 #000,',
            '    -2px -2px 0 #1a1a1a,',
            '    0 6px 24px rgba(0,0,0,0.9);',
            '  pointer-events:none;',
            '  z-index:1202;',
            '  opacity:0;',
            '  white-space:nowrap;',
            '}',
            '#gfx-wasted-text.animate {',
            '  animation:wasted-text-in 0.7s cubic-bezier(0.22,1,0.36,1) forwards;',
            '}',
            '#gfx-wasted-btn {',
            '  position:fixed;top:calc(50% + clamp(56px,9vw,96px));left:50%;',
            '  transform:translateX(-50%) translateY(18px);',
            '  font-family:"Segoe UI",Arial,sans-serif;',
            '  font-size:13px;font-weight:700;letter-spacing:4px;text-transform:uppercase;',
            '  color:#fff;',
            '  background:rgba(0,0,0,0.75);',
            '  border:2px solid rgba(255,255,255,0.35);',
            '  padding:14px 36px;',
            '  cursor:pointer;',
            '  outline:none;',
            '  z-index:1203;',
            '  opacity:0;',
            '  pointer-events:none;',
            '  transition:background 0.2s,border-color 0.2s,color 0.2s;',
            '}',
            '#gfx-wasted-btn.animate {',
            '  animation:wasted-btn-in 0.5s ease forwards;',
            '  pointer-events:all;',
            '}',
            '#gfx-wasted-btn:hover {',
            '  background:rgba(255,255,255,0.12);',
            '  border-color:rgba(255,255,255,0.7);',
            '}',
            '#gfx-wasted-btn:active { transform:translateX(-50%) translateY(2px); }',
        ].join('\n');
        document.head.appendChild(s);
    }

    function buildOverlays() {
        var flash = document.createElement('div'); flash.id = 'gfx-dmg-flash'; document.body.appendChild(flash);
        var vig   = document.createElement('div'); vig.id   = 'gfx-low-vignette'; document.body.appendChild(vig);
        var ring  = document.createElement('div'); ring.id  = 'gfx-hit-ring'; document.body.appendChild(ring);

        // Improved crosshair (replaces any existing basic dot)
        var existing = document.getElementById('crosshair');
        if (existing) existing.style.display = 'none';
        var ch = document.createElement('div');
        ch.id = 'gfx-crosshair';
        var dot = document.createElement('div'); dot.id = 'gfx-scope-dot';
        ch.appendChild(dot);
        document.body.appendChild(ch);

        window._gfxFlash = flash;
        window._gfxVig   = vig;
        window._gfxRing  = ring;

        // ── WASTED overlay pieces ──
        var shade = document.createElement('div');
        shade.id = 'gfx-wasted-canvas-shade';
        document.body.appendChild(shade);

        var barTop = document.createElement('div');
        barTop.className = 'gfx-wasted-bar top';
        document.body.appendChild(barTop);

        var barBot = document.createElement('div');
        barBot.className = 'gfx-wasted-bar bottom';
        document.body.appendChild(barBot);

        var wastedText = document.createElement('div');
        wastedText.id = 'gfx-wasted-text';
        wastedText.textContent = 'WASTED';
        document.body.appendChild(wastedText);

        var menuBtn = document.createElement('button');
        menuBtn.id = 'gfx-wasted-btn';
        menuBtn.textContent = 'GO BACK TO MAIN MENU';
        menuBtn.addEventListener('click', function () {
            window.location.reload();
        });
        document.body.appendChild(menuBtn);

        window._gfxWastedShown = false;
    }

    // ── WASTED screen ─────────────────────────────────────────────────
    function showWasted() {
        if (window._gfxWastedShown) return;
        window._gfxWastedShown = true;

        // Exit pointer lock
        try { document.exitPointerLock(); } catch(e) {}

        var canvas   = document.getElementById('application-canvas');
        var shade    = document.getElementById('gfx-wasted-canvas-shade');
        var barTop   = document.querySelector('.gfx-wasted-bar.top');
        var barBot   = document.querySelector('.gfx-wasted-bar.bottom');
        var text     = document.getElementById('gfx-wasted-text');
        var btn      = document.getElementById('gfx-wasted-btn');
        var cross    = document.getElementById('gfx-crosshair');

        // Hide crosshair
        if (cross) cross.style.display = 'none';

        // 0 ms: start desaturating the game canvas
        if (canvas) {
            canvas.style.transition = 'filter 1.6s ease';
            canvas.style.filter = 'saturate(0) brightness(0.5)';
        }
        if (shade) shade.classList.add('active');

        // 200 ms: cinematic black bars slide in
        setTimeout(function () {
            if (barTop) barTop.classList.add('animate');
            if (barBot) barBot.classList.add('animate');
        }, 200);

        // 700 ms: WASTED text slams in
        setTimeout(function () {
            if (text) text.classList.add('animate');
        }, 700);

        // 1400 ms: menu button fades up
        setTimeout(function () {
            if (btn) btn.classList.add('animate');
        }, 1400);
    }

    // ── Screen-shake & flash on damage ────────────────────────────────
    function patchDamage() {
        var tryPatch = function () {
            if (!window.damagePlayer) { setTimeout(tryPatch, 150); return; }
            var orig = window.damagePlayer;
            window.damagePlayer = function (amt) {
                orig(amt);
                triggerDamageEffects(amt);
                // Check for death
                var hp = window._playerHP !== undefined ? window._playerHP : 100;
                if (hp <= 0 && !window._gfxWastedShown) {
                    setTimeout(showWasted, 300);
                }
            };
        };
        tryPatch();

        // Poll HP for vignette
        setInterval(function () {
            if (!window._gfxVig) return;
            var hp = window._playerHP !== undefined ? window._playerHP : 100;
            window._gfxVig.style.opacity = hp < 35 ? String((35 - hp) / 35 * 0.9) : '0';
        }, 400);
    }

    function triggerDamageEffects(amt) {
        var intensity = Math.min((amt || 10) / 20, 1);
        // Canvas shake
        var canvas = document.getElementById('application-canvas');
        if (canvas) {
            canvas.style.animation = 'none';
            void canvas.offsetHeight;
            canvas.style.animation = 'gfx-shake ' + (0.25 + intensity * 0.15) + 's ease-out';
        }
        // Red flash
        if (window._gfxFlash) {
            window._gfxFlash.style.animation = 'none';
            void window._gfxFlash.offsetHeight;
            window._gfxFlash.style.animation = 'gfx-red-in ' + (0.3 + intensity * 0.2) + 's ease-out forwards';
        }
        // Hit ring
        if (window._gfxRing) {
            window._gfxRing.style.animation = 'none';
            void window._gfxRing.offsetHeight;
            window._gfxRing.style.animation = 'gfx-hit-ring 0.35s ease-out forwards';
        }
    }

})();
