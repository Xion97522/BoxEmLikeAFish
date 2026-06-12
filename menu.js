// menu.js — Main menu for Box Em Like a Fish
(function () {
    'use strict';

    var menuEl  = null;
    var playBtn = null;
    var ready   = false;   // true once PlayCanvas is initialised

    // ── Build the DOM menu immediately ────────────────────────────────
    function build() {
        injectStyles();

        menuEl = el('div', {
            id: 'zb-menu',
            style: [
                'position:fixed;inset:0;z-index:1000',
                'background:#060c0d',
                'display:flex;flex-direction:column;align-items:center;justify-content:center',
                'transition:opacity 0.9s ease',
                'overflow:hidden',
                'user-select:none',
            ].join(';'),
        });

        // ── Animated grid background ──────────────────────────────────
        var grid = el('canvas', { id: 'zb-grid', style: 'position:absolute;inset:0;z-index:0;opacity:0.18;' });
        menuEl.appendChild(grid);

        // ── Scanline overlay ──────────────────────────────────────────
        menuEl.appendChild(el('div', {
            style: 'position:absolute;inset:0;z-index:1;pointer-events:none;' +
                   'background:repeating-linear-gradient(0deg,' +
                   'rgba(0,0,0,0.06) 0px,rgba(0,0,0,0.06) 1px,' +
                   'transparent 1px,transparent 3px);',
        }));

        // ── Vignette ──────────────────────────────────────────────────
        menuEl.appendChild(el('div', {
            style: 'position:absolute;inset:0;z-index:1;pointer-events:none;' +
                   'background:radial-gradient(ellipse at 50% 45%,' +
                   'transparent 30%,rgba(0,0,0,0.75) 100%);',
        }));

        // ── Top accent line ───────────────────────────────────────────
        menuEl.appendChild(el('div', {
            style: 'position:absolute;top:0;left:0;right:0;height:2px;z-index:2;' +
                   'background:linear-gradient(90deg,transparent 0%,#1db31d 50%,transparent 100%);',
        }));

        // ── Bottom accent line ────────────────────────────────────────
        menuEl.appendChild(el('div', {
            style: 'position:absolute;bottom:0;left:0;right:0;height:1px;z-index:2;' +
                   'background:linear-gradient(90deg,transparent 0%,rgba(29,179,29,0.4) 50%,transparent 100%);',
        }));

        // ── Content ───────────────────────────────────────────────────
        var content = el('div', {
            style: 'position:relative;z-index:10;display:flex;flex-direction:column;' +
                   'align-items:center;gap:0;',
        });

        // Pre-title
        content.appendChild(el('div', {
            class: 'zb-fadein zb-d03',
            style: 'font-size:10px;letter-spacing:10px;text-transform:uppercase;' +
                   'color:#1db31d;font-weight:700;margin-bottom:18px;opacity:0;',
            text: 'THE  ULTIMATE  FISH  BOXING  GAME',
        }));

        // Main title
        var titleWrap = el('div', { class: 'zb-fadein', style: 'text-align:center;opacity:0;' });
        titleWrap.innerHTML =
            '<div style="font-size:clamp(48px,7.5vw,88px);font-weight:900;letter-spacing:-1px;' +
            'line-height:0.88;color:#fff;' +
            'text-shadow:0 0 60px rgba(29,179,29,0.25),0 0 120px rgba(29,179,29,0.1);">' +
            'BOX EM</div>' +
            '<div class="zb-glitch" data-text="LIKE A FISH" ' +
            'style="font-size:clamp(52px,8.5vw,96px);font-weight:900;letter-spacing:-1px;' +
            'line-height:0.88;color:#1db31d;' +
            'text-shadow:0 0 40px rgba(29,179,29,0.5),0 0 80px rgba(29,179,29,0.2);">' +
            'LIKE A FISH</div>';
        content.appendChild(titleWrap);

        // Divider
        content.appendChild(el('div', {
            class: 'zb-fadein zb-d04',
            style: 'width:200px;height:1px;margin:32px 0 36px;opacity:0;' +
                   'background:linear-gradient(90deg,transparent,rgba(29,179,29,0.55),transparent);',
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
        var hint = el('div', {
            class: 'zb-fadein zb-d06',
            style: 'margin-top:14px;font-size:9px;letter-spacing:2px;' +
                   'color:rgba(255,255,255,0.28);opacity:0;text-transform:uppercase;',
            text: 'Press  ENTER  or  click  to  start',
        });
        content.appendChild(hint);

        // Controls grid
        var grid2 = el('div', {
            class: 'zb-fadein zb-d07',
            style: 'margin-top:52px;display:grid;grid-template-columns:repeat(3,1fr);' +
                   'gap:10px 44px;opacity:0;',
        });
        [
            ['WASD',  'Move'],       ['MOUSE',  'Aim / Shoot'],  ['R',    'Reload'],
            ['Q',     'Build Mode'], ['F',      'Place Piece'],   ['E',    'Cycle Piece'],
            ['1 2 3', 'Weapons'],    ['SPACE',  'Jump'],          ['SHIFT','Sprint'],
        ].forEach(function (b) {
            var c2 = el('div', { style: 'text-align:center;' });
            c2.innerHTML =
                '<div style="font-size:10px;letter-spacing:2px;color:#1db31d;font-weight:800;">' + b[0] + '</div>' +
                '<div style="font-size:8px;letter-spacing:1px;color:rgba(255,255,255,0.32);margin-top:2px;">' + b[1] + '</div>';
            grid2.appendChild(c2);
        });
        content.appendChild(grid2);

        menuEl.appendChild(content);

        // Version tag
        menuEl.appendChild(el('div', {
            style: 'position:absolute;bottom:20px;right:24px;z-index:10;' +
                   'font-size:9px;letter-spacing:2px;color:rgba(255,255,255,0.18);',
            text: 'BOX EM LIKE A FISH  v1.0',
        }));

        // Corner brackets
        ['top:20px;left:20px', 'top:20px;right:20px', 'bottom:20px;left:20px', 'bottom:20px;right:20px']
            .forEach(function (pos, i) {
                var b2 = el('div', {
                    style: 'position:absolute;' + pos + ';z-index:3;width:22px;height:22px;' +
                           'border-color:rgba(29,179,29,0.35);border-style:solid;border-width:0;',
                });
                if (i === 0) b2.style.borderTopWidth = b2.style.borderLeftWidth = '1px';
                if (i === 1) b2.style.borderTopWidth = b2.style.borderRightWidth = '1px';
                if (i === 2) b2.style.borderBottomWidth = b2.style.borderLeftWidth = '1px';
                if (i === 3) b2.style.borderBottomWidth = b2.style.borderRightWidth = '1px';
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

        // Request pointer lock after short delay (fade is 0.9s)
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

    // ── Animated perspective grid ─────────────────────────────────────
    function startGrid(canvas) {
        var ctx = canvas.getContext('2d');
        var W, H;

        function resize() {
            W = canvas.width  = window.innerWidth;
            H = canvas.height = window.innerHeight;
        }
        resize();
        window.addEventListener('resize', resize);

        var t = 0;
        (function frame() {
            if (!menuEl) return;
            requestAnimationFrame(frame);
            t += 0.004;

            ctx.clearRect(0, 0, W, H);
            ctx.strokeStyle = '#1db31d';
            ctx.lineWidth   = 0.6;

            var COLS = 14, ROWS = 10;
            var horizon = H * 0.48;
            var vp = { x: W / 2, y: horizon };
            var spread = W * 1.6;
            var bottom = H + 40;

            // Vertical lines
            for (var i = 0; i <= COLS; i++) {
                var fx   = -spread / 2 + (i / COLS) * spread;
                var topX = vp.x + fx * 0.01;
                ctx.beginPath();
                ctx.moveTo(topX, horizon);
                ctx.lineTo(vp.x + fx, bottom);
                ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 1.8 + i * 0.5);
                ctx.stroke();
            }

            // Horizontal lines (scrolling)
            for (var j = 0; j < ROWS; j++) {
                var p    = ((j / ROWS) + t * 0.35) % 1;
                var y    = horizon + Math.pow(p, 2) * (bottom - horizon);
                var frac = p;
                ctx.beginPath();
                ctx.moveTo(vp.x - spread / 2 * frac, y);
                ctx.lineTo(vp.x + spread / 2 * frac, y);
                ctx.globalAlpha = frac * 0.7;
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        })();
    }

    // ── Styles ────────────────────────────────────────────────────────
    function injectStyles() {
        var s = document.createElement('style');
        s.textContent = [
            '@keyframes zbFadeUp {',
            '  from { opacity:0; transform:translateY(14px); }',
            '  to   { opacity:1; transform:translateY(0); }',
            '}',
            '@keyframes zbGlitch {',
            '  0%,90%,100% { clip-path:none; transform:none; }',
            '  91% { clip-path:inset(30% 0 40% 0); transform:translate(-3px,0); }',
            '  93% { clip-path:inset(60% 0 10% 0); transform:translate( 3px,0); }',
            '  95% { clip-path:inset(10% 0 70% 0); transform:translate(-2px,0); }',
            '  97% { clip-path:none; transform:none; }',
            '}',
            '@keyframes zbPulse {',
            '  0%,100% { box-shadow:0 0 20px rgba(29,179,29,0.25),inset 0 0 20px rgba(29,179,29,0.06); }',
            '  50%     { box-shadow:0 0 35px rgba(29,179,29,0.45),inset 0 0 30px rgba(29,179,29,0.12); }',
            '}',
            '#zb-menu * { font-family:"Segoe UI",Arial,sans-serif; box-sizing:border-box; }',
            '.zb-fadein  { animation: zbFadeUp 0.8s ease forwards; }',
            '.zb-d03     { animation-delay:0.3s; }',
            '.zb-d04     { animation-delay:0.45s; }',
            '.zb-d05     { animation-delay:0.6s; }',
            '.zb-d06     { animation-delay:0.72s; }',
            '.zb-d07     { animation-delay:0.85s; }',
            '.zb-glitch  { animation: zbGlitch 5s infinite; }',
            '#zb-play {',
            '  font-size:13px; font-weight:800; letter-spacing:7px; text-transform:uppercase;',
            '  color:rgba(255,255,255,0.5); background:transparent;',
            '  border:1px solid rgba(29,179,29,0.3); padding:15px 68px;',
            '  cursor:default; outline:none; transition:all 0.22s; pointer-events:none;',
            '}',
            '#zb-play.zb-ready {',
            '  color:#fff; border-color:#1db31d; cursor:pointer; pointer-events:all;',
            '  animation: zbPulse 2.4s ease-in-out infinite;',
            '}',
            '#zb-play.zb-ready:hover {',
            '  background:rgba(29,179,29,0.14);',
            '  box-shadow:0 0 45px rgba(29,179,29,0.5),inset 0 0 35px rgba(29,179,29,0.12);',
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
