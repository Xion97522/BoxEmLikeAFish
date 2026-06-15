import React, { useEffect, useRef, useState } from 'react';

export function Ember() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let offset = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#0a0502';
      ctx.fillRect(0, 0, w, h);

      const horizonY = h * 0.4;
      const fov = 300;
      
      ctx.strokeStyle = '#FF6A00';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.3;

      // Draw horizontal lines moving forward
      offset = (offset + 2) % 40;
      for (let z = 10; z < 1000; z += 40) {
        const adjustedZ = z - offset;
        if (adjustedZ <= 0) continue;
        
        const scale = fov / adjustedZ;
        const y = horizonY + scale * 50;
        
        if (y < h) {
          // Fade out near horizon
          const alpha = Math.min(0.5, (adjustedZ - 10) / 200) * 0.5;
          ctx.globalAlpha = 0.5 - alpha;
          
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
      }

      // Draw vertical lines converging
      ctx.globalAlpha = 0.15;
      const center_x = w / 2;
      for (let x = -2000; x <= 2000; x += 150) {
        ctx.beginPath();
        ctx.moveTo(center_x, horizonY);
        ctx.lineTo(center_x + x, h);
        ctx.stroke();
      }
      
      ctx.globalAlpha = 1.0;

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      backgroundColor: '#0a0502',
      color: 'white',
      overflow: 'hidden',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      userSelect: 'none'
    }}>
      <style>{`
        @font-face {
          font-family: "GroovyTexbox";
          src: url("/__mockup/fonts/GroovyTexboxDemo-BL5pw.ttf") format("truetype");
        }
        @keyframes pulseGlow {
          0% { text-shadow: 0 0 10px rgba(255,106,0,0.5), 0 0 20px rgba(255,106,0,0.3); }
          50% { text-shadow: 0 0 20px rgba(255,106,0,0.8), 0 0 40px rgba(255,106,0,0.5); }
          100% { text-shadow: 0 0 10px rgba(255,106,0,0.5), 0 0 20px rgba(255,106,0,0.3); }
        }
        @keyframes scanline {
          0% { background-position: 0 0; }
          100% { background-position: 0 100vh; }
        }
        .scanlines {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            to bottom,
            rgba(255,255,255,0),
            rgba(255,255,255,0) 50%,
            rgba(0,0,0,0.2) 50%,
            rgba(0,0,0,0.2)
          );
          background-size: 100% 4px;
          pointer-events: none;
          z-index: 10;
        }
        .vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, transparent 30%, #0a0502 100%);
          pointer-events: none;
          z-index: 11;
        }
      `}</style>

      {/* Background Canvas */}
      <canvas 
        ref={canvasRef} 
        style={{ position: 'absolute', inset: 0, zIndex: 1 }}
      />
      
      {/* Overlays */}
      <div className="scanlines" />
      <div className="vignette" />

      {/* Top/Bottom Accent Lines */}
      <div style={{
        position: 'absolute', top: '40px', left: '0', right: '0', height: '1px',
        background: 'linear-gradient(90deg, transparent, #FF6A00, transparent)',
        opacity: 0.5, zIndex: 20
      }} />
      <div style={{
        position: 'absolute', bottom: '40px', left: '0', right: '0', height: '1px',
        background: 'linear-gradient(90deg, transparent, #FF6A00, transparent)',
        opacity: 0.5, zIndex: 20
      }} />

      {/* Corner Brackets */}
      {[{top: 20, left: 20}, {top: 20, right: 20}, {bottom: 20, left: 20}, {bottom: 20, right: 20}].map((pos, i) => (
        <div key={i} style={{
          position: 'absolute', ...pos, width: '30px', height: '30px',
          borderTop: pos.top ? '2px solid #FF6A00' : 'none',
          borderBottom: pos.bottom ? '2px solid #FF6A00' : 'none',
          borderLeft: pos.left ? '2px solid #FF6A00' : 'none',
          borderRight: pos.right ? '2px solid #FF6A00' : 'none',
          opacity: 0.6, zIndex: 20
        }} />
      ))}

      {/* Main Content */}
      <div style={{
        position: 'relative', zIndex: 30, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', height: '100%',
        paddingTop: '5vh'
      }}>
        <div style={{
          letterSpacing: '0.4em', fontSize: '0.9rem', color: '#ccc',
          marginBottom: '2rem', textTransform: 'uppercase'
        }}>
          Craze Studios Presents...
        </div>
        
        <div style={{
          fontFamily: '"GroovyTexbox", sans-serif',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          lineHeight: '1.1'
        }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(4rem, 8vw, 8rem)', color: 'white' }}>
            BOX EM
          </h1>
          <h2 style={{ 
            margin: 0, fontSize: 'clamp(3rem, 6vw, 6rem)', 
            color: '#FF6A00',
            animation: 'pulseGlow 2s infinite ease-in-out'
          }}>
            LIKE A FISH
          </h2>
        </div>

        <div style={{
          width: '150px', height: '2px', backgroundColor: '#FF6A00',
          margin: '2rem 0', opacity: 0.7
        }} />

        <button 
          disabled={loading}
          style={{
            background: 'transparent',
            border: '2px solid #FF6A00',
            color: loading ? 'rgba(255, 255, 255, 0.5)' : '#FF6A00',
            padding: '1rem 4rem',
            fontSize: '1.2rem',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            cursor: loading ? 'default' : 'pointer',
            transition: 'all 0.2s ease',
            outline: 'none',
            boxShadow: loading ? 'none' : '0 0 15px rgba(255,106,0,0.3) inset, 0 0 15px rgba(255,106,0,0.3)'
          }}
          onMouseOver={(e) => {
            if (!loading) {
              e.currentTarget.style.backgroundColor = 'rgba(255,106,0,0.1)';
              e.currentTarget.style.color = '#fff';
            }
          }}
          onMouseOut={(e) => {
            if (!loading) {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#FF6A00';
            }
          }}
        >
          {loading ? 'LOADING...' : 'PLAY'}
        </button>

        <div style={{
          marginTop: '1rem',
          fontSize: '0.8rem',
          color: 'rgba(255,255,255,0.4)',
          letterSpacing: '0.1em'
        }}>
          Press ENTER or click to start
        </div>

        {/* Controls Grid */}
        <div style={{
          marginTop: 'auto',
          marginBottom: '2rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1rem 3rem',
          fontSize: '0.8rem',
          opacity: 0.8
        }}>
          {[
            { key: 'WASD', desc: 'Move' },
            { key: 'MOUSE', desc: 'Aim+Shoot' },
            { key: 'R', desc: 'Reload' },
            { key: 'Q', desc: 'Build Mode' },
            { key: 'F', desc: 'Place Piece' },
            { key: 'E', desc: 'Cycle Piece' },
            { key: '1 2 3', desc: 'Weapons' },
            { key: 'SPACE', desc: 'Jump' },
            { key: 'SHIFT', desc: 'Sprint' },
          ].map((ctrl, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ color: '#FF6A00', fontWeight: 'bold' }}>{ctrl.key}</span>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>/</span>
              <span style={{ color: '#ccc' }}>{ctrl.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Version Tag */}
      <div style={{
        position: 'absolute',
        bottom: '15px',
        right: '25px',
        fontSize: '0.7rem',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: '0.1em',
        zIndex: 30
      }}>
        BOX EM LIKE A FISH v1.0
      </div>
    </div>
  );
}
