// menu.js — Main menu for Box Em Like a Fish
(function () {
    'use strict';

    var menuEl  = null;
    var playBtn = null;
    var ready   = false;

    // ── Build the DOM menu immediately ────────────────────────────────
    function build() {
        injectStyles();

        menuEl = el('div', {
            id: 'zb-menu',
            style: [
                'position:fixed;inset:0;z-index:1000',
                'background:#0a0502',
                'display:flex;flex-direction:column;align-items:center;justify-content:center',
                'transition:opacity 0.9s ease',
                'overflow:hidden',
                'user-select:none',
            ].join(';'),
        });

        // ── Animated perspective grid ──────────────────────────────────
        var grid = el('canvas', { id: 'zb-grid', style: 'position:absolute;inset:0;z-index:1;' });
        menuEl.appendChild(grid);

        // ── Scanline overlay ──────────────────────────────────────────
        menuEl.appendChild(el('div', {
            style: 'position:absolute;inset:0;z-index:10;pointer-events:none;' +
                   'background:linear-gradient(to bottom,' +
                   'rgba(255,255,255,0),rgba(255,255,255,0) 50%,' +
                   'rgba(0,0,0,0.2) 50%,rgba(0,0,0,0.2));' +
                   'background-size:100% 4px;',
        }));

        // ── Vignette ──────────────────────────────────────────────────
        menuEl.appendChild(el('div', {
            style: 'position:absolute;inset:0;z-index:11;pointer-events:none;' +
                   'background:radial-gradient(circle at center,transparent 30%,#0a0502 100%);',
        }));

        // ── Top accent line ───────────────────────────────────────────
        menuEl.appendChild(el('div', {
            style: 'position:absolute;top:40px;left:0;right:0;height:1px;z-index:20;opacity:0.5;' +
                   'background:linear-gradient(90deg,transparent 0%,#FF6A00 50%,transparent 100%);',
        }));

        // ── Bottom accent line ────────────────────────────────────────
        menuEl.appendChild(el('div', {
            style: 'position:absolute;bottom:40px;left:0;right:0;height:1px;z-index:20;opacity:0.5;' +
                   'background:linear-gradient(90deg,transparent 0%,#FF6A00 50%,transparent 100%);',
        }));

        // ── Content ───────────────────────────────────────────────────
        var content = el('div', {
            style: 'position:relative;z-index:30;display:flex;flex-direction:column;' +
                   'align-items:center;gap:0;padding-top:5vh;height:100%;justify-content:center;',
        });

        // Pre-title
        content.appendChild(el('div', {
            class: 'zb-fadein zb-d03',
            style: 'font-size:10px;letter-spacing:8px;text-transform:uppercase;' +
                   'color:#cccccc;font-weight:400;margin-bottom:20px;opacity:0;',
            text: 'CRAZE STUDIOS PRESENTS...',
        }));

        // Main title
        var titleWrap = el('div', { class: 'zb-fadein', style: 'text-align:center;opacity:0;line-height:1.1;' });
        titleWrap.innerHTML =
            '<div style="font-size:clamp(48px,8vw,8rem);font-weight:900;letter-spacing:-1px;' +
            'line-height:0.9;color:#fff;font-family:GroovyTexbox,sans-serif;margin:0;">' +
            'BOX EM</div>' +
            '<div class="zb-pulse-glow" ' +
            'style="font-size:clamp(38px,6vw,6rem);font-weight:900;letter-spacing:-1px;' +
            'line-height:0.9;color:#FF6A00;font-family:GroovyTexbox,sans-serif;margin:0;">' +
            'LIKE A FISH</div>';
        content.appendChild(titleWrap);

        // Divider
        content.appendChild(el('div', {
            class: 'zb-fadein zb-d04',
            style: 'width:150px;height:2px;margin:28px 0 32px;opacity:0;' +
                   'background:#FF6A00;',
        }));

        // PLAY button
        playBtn = el('button', {
            id: 'zb-play',
            class: 'zb-fadein zb-d05',
            style: 'opacity:0;',
            text: 'LOADING\u2026',
        });
        playBtn.disabled = true;
        playBtn.addEventListener('click', startGame);
        content.appendChild(playBtn);

        // Sub-hint beneath button
        content.appendChild(el('div', {
            class: 'zb-fadein zb-d06',
            style: 'margin-top:14px;font-size:9px;letter-spacing:2px;' +
                   'color:rgba(255,255,255,0.4);opacity:0;text-transform:none;',
            text: 'Press ENTER or click to start',
        }));

        // Controls grid — inline "KEY / Desc" style
        var ctrlGrid = el('div', {
            class: 'zb-fadein zb-d07',
            style: 'margin-top:auto;margin-bottom:2rem;display:grid;' +
                   'grid-template-columns:repeat(3,1fr);gap:10px 48px;opacity:0;font-size:11px;',
        });
        [
            ['WASD',  'Move'],       ['MOUSE', 'Aim+Shoot'],  ['R',     'Reload'],
            ['Q',     'Build Mode'], ['F',     'Place Piece'], ['E',     'Cycle Piece'],
            ['1 2 3', 'Weapons'],    ['SPACE', 'Jump'],        ['SHIFT', 'Sprint'],
        ].forEach(function (b) {
            var c2 = el('div', { style: 'display:flex;gap:6px;align-items:center;' });
            c2.innerHTML =
                '<span style="color:#FF6A00;font-weight:700;letter-spacing:1px;">' + b[0] + '</span>' +
                '<span style="color:rgba(255,255,255,0.4);">/</span>' +
                '<span style="color:#cccccc;">' + b[1] + '</span>';
            ctrlGrid.appendChild(c2);
        });
        content.appendChild(ctrlGrid);

        menuEl.appendChild(content);

        // Version tag
        menuEl.appendChild(el('div', {
            style: 'position:absolute;bottom:15px;right:25px;z-index:30;' +
                   'font-size:9px;letter-spacing:2px;color:rgba(255,255,255,0.25);',
            text: 'BOX EM LIKE A FISH  v1.0',
        }));

        // Corner brackets — orange, 30px, 2px border
        [
            { top: '20px', left: '20px' },
            { top: '20px', right: '20px' },
            { bottom: '20px', left: '20px' },
            { bottom: '20px', right: '20px' },
        ].forEach(function (pos, i) {
            var b2 = el('div', { style: 'position:absolute;z-index:20;width:30px;height:30px;opacity:0.6;' });
            Object.keys(pos).forEach(function (k) { b2.style[k] = pos[k]; });
            b2.style.borderColor = '#FF6A00';
            b2.style.borderStyle = 'solid';
            b2.style.borderWidth = '0';
            if (pos.top)    b2.style.borderTopWidth = '2px';
            if (pos.bottom) b2.style.borderBottomWidth = '2px';
            if (pos.left)   b2.style.borderLeftWidth = '2px';
            if (pos.right)  b2.style.borderRightWidth = '2px';
            menuEl.appendChild(b2);
        });

        document.body.appendChild(menuEl);

        // Start animated grid
        startGrid(grid);

        // Keyboard shortcut
        document.addEventListener('keydown', function (e) {
            if (!menuEl) return;
            if (e.code === 'Enter' || e.code === 'NumpadEnter') startGame();
        });
    }

    // ── Enable play button when PC app is ready ───────────────────────
    var pcWait = setInterval(function () {
        if (!window.pc || !pc.Application) return;
        var app = pc.Application.getApplication();
        if (!app) return;
        clearInterval(pcWait);
        var enablePlay = function () {
            ready = true;
            if (playBtn) {
                playBtn.textContent = 'PLAY';
                playBtn.disabled    = false;
                playBtn.classList.add('zb-ready');
            }
        };
        if (app.root && app.root.findComponents('camera').length) {
            enablePlay();
        } else {
            app.on('start', function () { setTimeout(enablePlay, 300); });
        }
    }, 150);

    // ── Start game ────────────────────────────────────────────────────
    function startGame() {
        if (!ready || !menuEl) return;
        menuEl.style.opacity = '0';
        menuEl.style.pointerEvents = 'none';

        setTimeout(function () {
            var canvas = document.getElementById('application-canvas');
            if (canvas && canvas.requestPointerLock) {
                canvas.requestPointerLock().catch(function () {});
            }
        }, 300);

        setTimeout(function () {
            if (menuEl && menuEl.parentNode) {
                menuEl.parentNode.removeChild(menuEl);
                menuEl = null;
            }
        }, 950);
    }

    // ── Animated perspective grid (Ember: forward-scrolling) ──────────
    function startGrid(canvas) {
        var ctx = canvas.getContext('2d');
        var W, H, offset = 0;

        function resize() {
            W = canvas.width  = window.innerWidth;
            H = canvas.height = window.innerHeight;
        }
        resize();
        window.addEventListener('resize', resize);

        (function frame() {
            if (!menuEl) return;
            requestAnimationFrame(frame);

            ctx.clearRect(0, 0, W, H);

            var horizonY = H * 0.4;
            var fov      = 300;
            offset = (offset + 2) % 40;

            ctx.strokeStyle = '#FF6A00';
            ctx.lineWidth   = 1;

            // Horizontal lines — scroll forward toward viewer
            for (var z = 10; z < 1000; z += 40) {
                var adjZ = z - offset;
                if (adjZ <= 0) continue;
                var scale = fov / adjZ;
                var y = horizonY + scale * 50;
                if (y < H) {
                    var alpha = Math.min(0.5, (adjZ - 10) / 200) * 0.5;
                    ctx.globalAlpha = 0.5 - alpha;
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(W, y);
                    ctx.stroke();
                }
            }

            // Vertical lines — converge to horizon centre
            ctx.globalAlpha = 0.15;
            var cx = W / 2;
            for (var x = -2000; x <= 2000; x += 150) {
                ctx.beginPath();
                ctx.moveTo(cx, horizonY);
                ctx.lineTo(cx + x, H);
                ctx.stroke();
            }

            ctx.globalAlpha = 1;
        })();
    }

    // ── Styles ────────────────────────────────────────────────────────
    function injectStyles() {
        var s = document.createElement('style');
        s.textContent = [
            '@font-face {',
            '  font-family:"GroovyTexbox";',
            '  src:url("/files/fonts/GroovyTexboxDemo-BL5pw.ttf") format("truetype");',
            '  font-weight:normal; font-style:normal;',
            '}',
            '@keyframes zbFadeUp {',
            '  from { opacity:0; transform:translateY(14px); }',
            '  to   { opacity:1; transform:translateY(0); }',
            '}',
            '@keyframes zbPulseGlow {',
            '  0%,100% { text-shadow:0 0 10px rgba(255,106,0,0.5),0 0 20px rgba(255,106,0,0.3); }',
            '  50%     { text-shadow:0 0 20px rgba(255,106,0,0.8),0 0 40px rgba(255,106,0,0.5); }',
            '}',
            '@keyframes zbPulse {',
            '  0%,100% { box-shadow:0 0 20px rgba(255,106,0,0.25),inset 0 0 20px rgba(255,106,0,0.06); }',
            '  50%     { box-shadow:0 0 35px rgba(255,106,0,0.45),inset 0 0 30px rgba(255,106,0,0.12); }',
            '}',
            '#zb-menu * { font-family:"Segoe UI",Arial,sans-serif; box-sizing:border-box; }',
            '.zb-fadein  { animation: zbFadeUp 0.8s ease forwards; }',
            '.zb-d03     { animation-delay:0.3s; }',
            '.zb-d04     { animation-delay:0.45s; }',
            '.zb-d05     { animation-delay:0.6s; }',
            '.zb-d06     { animation-delay:0.72s; }',
            '.zb-d07     { animation-delay:0.85s; }',
            '.zb-pulse-glow { animation: zbPulseGlow 2s infinite ease-in-out; }',
            '#zb-play {',
            '  font-size:13px; font-weight:800; letter-spacing:7px; text-transform:uppercase;',
            '  color:rgba(255,255,255,0.5); background:transparent;',
            '  border:2px solid rgba(255,106,0,0.3); padding:16px 68px;',
            '  cursor:default; outline:none; transition:all 0.22s; pointer-events:none;',
            '}',
            '#zb-play.zb-ready {',
            '  color:#FF6A00; border-color:#FF6A00; cursor:pointer; pointer-events:all;',
            '  box-shadow:0 0 15px rgba(255,106,0,0.3) inset,0 0 15px rgba(255,106,0,0.3);',
            '  animation: zbPulse 2.4s ease-in-out infinite;',
            '}',
            '#zb-play.zb-ready:hover {',
            '  background:rgba(255,106,0,0.1);',
            '  color:#fff;',
            '  box-shadow:0 0 45px rgba(255,106,0,0.5),inset 0 0 35px rgba(255,106,0,0.12);',
            '  letter-spacing:10px;',
            '}',
            '#zb-play.zb-ready:active { transform:scale(0.97); }',
        ].join('\n');
        document.head.appendChild(s);
    }

    // ── Tiny DOM helper ───────────────────────────────────────────────
    function el(tag, opts) {
        var d = document.createElement(tag);
        if (opts.id)    d.id = opts.id;
        if (opts.class) d.className = opts.class;
        if (opts.style) d.setAttribute('style', opts.style);
        if (opts.text)  d.textContent = opts.text;
        return d;
    }

    // ── Boot ──────────────────────────────────────────────────────────
    if (document.body) {
        build();
    } else {
        window.addEventListener('DOMContentLoaded', build);
    }

})();
