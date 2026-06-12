// mobile.js — Virtual joystick + touch controls for Zone Breach
(function () {
    'use strict';

    var isMobile = ('ontouchstart' in window) ||
                   navigator.maxTouchPoints > 0 ||
                   /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (!isMobile) return;   // skip on desktop

    // ── Virtual key state (monkey-patched into pc.Keyboard) ───────────
    var vkeys = {};

    // Patch pc.Keyboard.isPressed as soon as pc is available
    var kbPatch = setInterval(function () {
        if (!window.pc || !pc.Keyboard) return;
        clearInterval(kbPatch);
        var orig = pc.Keyboard.prototype.isPressed;
        pc.Keyboard.prototype.isPressed = function (key) {
            return orig.call(this, key) || !!vkeys[key];
        };
    }, 50);

    // ── Look-delta state (applied to camera each frame) ───────────────
    var vLookX = 0, vLookY = 0;   // normalised -1..+1

    // ── Wait for PlayCanvas app ───────────────────────────────────────
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

    function init(app, cam) {
        buildOverlay();

        // Apply look each frame
        var euler = cam.getEulerAngles().clone();
        app.on('update', function (dt) {
            if (Math.abs(vLookX) > 0.04 || Math.abs(vLookY) > 0.04) {
                euler.y -= vLookX * dt * 160;
                euler.x -= vLookY * dt * 100;
                euler.x  = Math.max(-82, Math.min(82, euler.x));
                cam.setEulerAngles(euler.x, euler.y, 0);
            }
        });
    }

    // ── Overlay ───────────────────────────────────────────────────────
    function buildOverlay() {
        injectCSS();

        // Prevent default touch on canvas so swipes don't scroll
        var canvas = document.getElementById('application-canvas');
        if (canvas) {
            canvas.addEventListener('touchstart',  function (e) { e.preventDefault(); }, { passive: false });
            canvas.addEventListener('touchmove',   function (e) { e.preventDefault(); }, { passive: false });
            canvas.addEventListener('touchend',    function (e) { e.preventDefault(); }, { passive: false });
        }

        // ── Single wrapper — hidden when a controller is connected ──────
        var overlay = document.createElement('div');
        overlay.id  = 'mb-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:199;pointer-events:none;' +
                                 'transition:opacity 0.35s;';
        document.body.appendChild(overlay);

        // ── Left joystick (move) ─────────────────────────────────────
        var lBase  = mkCircle('lj-base');
        var lKnob  = mkKnob('lj-knob');
        lBase.appendChild(lKnob);
        lBase.style.cssText += 'left:36px;bottom:80px;';
        overlay.appendChild(lBase);

        // ── Right joystick (look) ────────────────────────────────────
        var rBase  = mkCircle('rj-base');
        var rKnob  = mkKnob('rj-knob');
        rBase.appendChild(rKnob);
        rBase.style.cssText += 'right:180px;bottom:80px;';
        overlay.appendChild(rBase);

        // ── Action buttons (right cluster) ───────────────────────────
        var btnFire   = mkBtn('FIRE',   '255,70,70',   'right:36px;bottom:80px;');
        var btnJump   = mkBtn('JUMP',   '74,222,128',  'right:36px;bottom:150px;');
        var btnBuild  = mkBtn('BUILD',  '100,180,255', 'right:104px;bottom:116px;');
        var btnReload = mkBtn('RELOAD', '255,200,60',  'right:36px;bottom:220px;');

        overlay.appendChild(btnFire);
        overlay.appendChild(btnJump);
        overlay.appendChild(btnBuild);
        overlay.appendChild(btnReload);

        // Labels
        mkLabel('MOVE', 'left:36px;bottom:198px;',  overlay);
        mkLabel('LOOK', 'right:210px;bottom:198px;', overlay);

        // ── Show / hide based on gamepad connection ───────────────────
        function anyPadConnected() {
            var pads = navigator.getGamepads ? navigator.getGamepads() : [];
            for (var i = 0; i < pads.length; i++) {
                if (pads[i] && pads[i].connected) return true;
            }
            return false;
        }

        function releaseVkeys() {
            if (window.pc) {
                vkeys[pc.KEY_W] = vkeys[pc.KEY_S] =
                vkeys[pc.KEY_A] = vkeys[pc.KEY_D] =
                vkeys[pc.KEY_SPACE] = false;
            }
            vLookX = 0; vLookY = 0;
            lTid = null; rTid = null;
            lKnob.style.transform = 'translate(-50%,-50%)';
            rKnob.style.transform = 'translate(-50%,-50%)';
        }

        function hideOverlay() {
            overlay.style.opacity = '0';
            overlay.style.pointerEvents = 'none';
            releaseVkeys();
        }

        function showOverlay() {
            overlay.style.opacity = '1';
            overlay.style.pointerEvents = 'none'; // children handle their own events
        }

        window.addEventListener('gamepadconnected', function () {
            hideOverlay();
        });

        window.addEventListener('gamepaddisconnected', function () {
            if (!anyPadConnected()) showOverlay();
        });

        // Hide immediately if a controller is already plugged in
        if (anyPadConnected()) hideOverlay();

        // ── Touch state ──────────────────────────────────────────────
        var lTid = null, lCX = 0, lCY = 0;
        var rTid = null, rPX = 0, rPY = 0;
        var MAX  = 36;

        function center(el) {
            var r = el.getBoundingClientRect();
            return { x: r.left + r.width/2, y: r.top + r.height/2 };
        }

        // Left joystick – START
        lBase.addEventListener('touchstart', function (e) {
            e.preventDefault();
            var t  = e.changedTouches[0];
            lTid   = t.identifier;
            var c  = center(lBase);
            lCX    = c.x; lCY = c.y;
        }, { passive: false });

        // Right joystick – START
        rBase.addEventListener('touchstart', function (e) {
            e.preventDefault();
            var t = e.changedTouches[0];
            rTid  = t.identifier;
            rPX   = t.clientX;
            rPY   = t.clientY;
        }, { passive: false });

        // Global MOVE
        document.addEventListener('touchmove', function (e) {
            e.preventDefault();
            for (var i = 0; i < e.changedTouches.length; i++) {
                var t  = e.changedTouches[i];

                if (t.identifier === lTid) {
                    var dx  = t.clientX - lCX;
                    var dy  = t.clientY - lCY;
                    var len = Math.sqrt(dx*dx + dy*dy);
                    if (len > MAX) { dx = dx/len*MAX; dy = dy/len*MAX; }
                    lKnob.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';

                    var nx = dx / MAX, ny = dy / MAX;
                    if (window.pc) {
                        vkeys[pc.KEY_W] = ny < -0.28;
                        vkeys[pc.KEY_S] = ny >  0.28;
                        vkeys[pc.KEY_A] = nx < -0.28;
                        vkeys[pc.KEY_D] = nx >  0.28;
                    }
                }

                if (t.identifier === rTid) {
                    var rdx = t.clientX - rPX;
                    var rdy = t.clientY - rPY;
                    rPX = t.clientX; rPY = t.clientY;
                    vLookX = Math.max(-1, Math.min(1, rdx / 8));
                    vLookY = Math.max(-1, Math.min(1, rdy / 8));

                    var crx = Math.max(-MAX, Math.min(MAX, rdx * 3));
                    var cry = Math.max(-MAX, Math.min(MAX, rdy * 3));
                    rKnob.style.transform = 'translate(calc(-50% + ' + crx + 'px), calc(-50% + ' + cry + 'px))';
                }
            }
        }, { passive: false });

        // Global END
        document.addEventListener('touchend', function (e) {
            for (var i = 0; i < e.changedTouches.length; i++) {
                var t = e.changedTouches[i];
                if (t.identifier === lTid) {
                    lTid = null;
                    lKnob.style.transform = 'translate(-50%,-50%)';
                    if (window.pc) {
                        vkeys[pc.KEY_W] = false;
                        vkeys[pc.KEY_S] = false;
                        vkeys[pc.KEY_A] = false;
                        vkeys[pc.KEY_D] = false;
                    }
                }
                if (t.identifier === rTid) {
                    rTid   = null;
                    vLookX = 0; vLookY = 0;
                    rKnob.style.transform = 'translate(-50%,-50%)';
                }
            }
        }, { passive: false });

        // ── Action buttons ────────────────────────────────────────────
        btnFire.addEventListener('touchstart', function (e) {
            e.preventDefault(); e.stopPropagation();
            var cv = document.getElementById('application-canvas');
            if (cv) {
                cv.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: cv.clientWidth/2, clientY: cv.clientHeight/2 }));
            }
        }, { passive: false });
        btnFire.addEventListener('touchend', function (e) {
            e.preventDefault(); e.stopPropagation();
            var cv = document.getElementById('application-canvas');
            if (cv) {
                cv.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: cv.clientWidth/2, clientY: cv.clientHeight/2 }));
            }
        }, { passive: false });

        btnJump.addEventListener('touchstart', function (e) {
            e.preventDefault();
            if (window.pc) vkeys[pc.KEY_SPACE] = true;
        }, { passive: false });
        btnJump.addEventListener('touchend', function (e) {
            e.preventDefault();
            if (window.pc) vkeys[pc.KEY_SPACE] = false;
        }, { passive: false });

        btnBuild.addEventListener('touchstart', function (e) {
            e.preventDefault();
            if (typeof window.toggleBuildMode === 'function') window.toggleBuildMode();
            else if (typeof window.placeBuildPiece === 'function') window.placeBuildPiece();
        }, { passive: false });

        btnReload.addEventListener('touchstart', function (e) {
            e.preventDefault();
            document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', key: 'r', bubbles: true }));
        }, { passive: false });
        btnReload.addEventListener('touchend', function (e) {
            e.preventDefault();
            document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyR', key: 'r', bubbles: true }));
        }, { passive: false });
    }

    // ── Helpers ───────────────────────────────────────────────────────
    function mkCircle(id) {
        var d = document.createElement('div');
        d.id  = id;
        d.className = 'mb-joy-base';
        return d;
    }

    function mkKnob(id) {
        var d = document.createElement('div');
        d.id  = id;
        d.className = 'mb-joy-knob';
        return d;
    }

    function mkBtn(label, rgb, posCSS) {
        var d = document.createElement('div');
        d.className = 'mb-btn';
        d.style.cssText += posCSS +
            'background:rgba(' + rgb + ',0.22);' +
            'border-color:rgba(' + rgb + ',0.75);' +
            'color:rgba(' + rgb + ',1);';
        d.textContent = label;
        return d;
    }

    function mkLabel(text, posCSS, parent) {
        var d = document.createElement('div');
        d.className = 'mb-label';
        d.style.cssText += posCSS;
        d.textContent = text;
        (parent || document.body).appendChild(d);
        return d;
    }

    function injectCSS() {
        var style = document.createElement('style');
        style.textContent = [
            '.mb-joy-base {',
            '  position:fixed;z-index:200;touch-action:none;',
            '  width:116px;height:116px;border-radius:50%;',
            '  background:rgba(255,255,255,0.07);',
            '  border:2px solid rgba(255,255,255,0.22);',
            '}',
            '.mb-joy-knob {',
            '  position:absolute;top:50%;left:50%;',
            '  transform:translate(-50%,-50%);',
            '  width:50px;height:50px;border-radius:50%;',
            '  background:rgba(255,255,255,0.32);',
            '  border:2px solid rgba(255,255,255,0.65);',
            '  pointer-events:none;transition:transform 0.04s;',
            '}',
            '.mb-btn {',
            '  position:fixed;z-index:200;touch-action:none;',
            '  width:58px;height:58px;border-radius:50%;',
            '  border:2px solid;display:flex;align-items:center;justify-content:center;',
            '  font-size:9px;font-weight:800;letter-spacing:1.2px;',
            '  font-family:"Segoe UI",Arial,sans-serif;',
            '  text-transform:uppercase;',
            '}',
            '.mb-label {',
            '  position:fixed;z-index:200;pointer-events:none;',
            '  font-size:8px;letter-spacing:1.5px;text-transform:uppercase;',
            '  color:rgba(255,255,255,0.38);',
            '  font-family:"Segoe UI",Arial,sans-serif;',
            '}',
        ].join('\n');
        document.head.appendChild(style);
    }

})();
