import React, { useEffect, useRef, useState } from 'react';

export function Steel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    
    window.addEventListener('resize', resize);
    resize();

    const render = () => {
      time += 0.005;
      ctx.fillStyle = '#080808';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height * 0.4; // Horizon line slightly above center
      
      ctx.lineWidth = 1;
      
      // Draw grid
      const fov = 300;
      const gridSpacing = 50;
      const speed = time * 200;

      // Draw horizontal lines (depth)
      for (let z = 10; z < 1000; z += gridSpacing) {
        let currentZ = z - (speed % gridSpacing);
        if (currentZ < 1) continue;

        const scale = fov / currentZ;
        const y = cy + cy * scale;
        
        if (y > canvas.height || y < cy) continue;

        // Fade out in distance
        const alpha = Math.max(0, 1 - (currentZ / 1000));
        ctx.strokeStyle = `rgba(232, 93, 0, ${alpha * 0.3})`;
        
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Draw vertical lines (perspective)
      for (let x = -2000; x < 2000; x += gridSpacing * 2) {
        ctx.beginPath();
        // Start from far away
        const startScale = fov / 1000;
        const startX = cx + x * startScale;
        const startY = cy + cy * startScale;
        
        // Go to screen
        const endScale = fov / 10;
        const endX = cx + x * endScale;
        const endY = cy + cy * endScale;
        
        // Gradient for vertical lines
        const grad = ctx.createLinearGradient(0, cy, 0, canvas.height);
        grad.addColorStop(0, 'rgba(232, 93, 0, 0)');
        grad.addColorStop(1, 'rgba(232, 93, 0, 0.4)');
        
        ctx.strokeStyle = grad;
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

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
      backgroundColor: '#080808',
      overflow: 'hidden',
      color: '#ffffff',
      fontFamily: 'sans-serif',
      userSelect: 'none'
    }}>
      <style>
        {`
          @font-face {
            font-family: "GroovyTexbox";
            src: url("/__mockup/fonts/GroovyTexboxDemo-BL5pw.ttf") format("truetype");
          }
          
          @keyframes scanline {
            0% { transform: translateY(0); }
            100% { transform: translateY(100vh); }
          }
          
          @keyframes pulse {
            0% { opacity: 0.8; }
            50% { opacity: 1; text-shadow: 0 0 20px rgba(232, 93, 0, 0.5); }
            100% { opacity: 0.8; }
          }

          @keyframes glow-border {
            0% { box-shadow: 0 0 10px rgba(232,93,0,0); }
            50% { box-shadow: 0 0 20px rgba(232,93,0,0.4); }
            100% { box-shadow: 0 0 10px rgba(232,93,0,0); }
          }
          
          .custom-font {
            font-family: "GroovyTexbox", system-ui, sans-serif;
            text-transform: uppercase;
            line-height: 1.1;
          }
        `}
      </style>

      {/* Background Canvas */}
      <canvas 
        ref={canvasRef} 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1
        }}
      />

      {/* Scanlines & Vignette */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))',
        backgroundSize: '100% 4px, 3px 100%',
        zIndex: 2,
        pointerEvents: 'none',
        opacity: 0.4
      }} />
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(circle at center, transparent 30%, #080808 100%)',
        zIndex: 3,
        pointerEvents: 'none'
      }} />

      {/* Top and Bottom Accent Lines */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        right: '20px',
        height: '1px',
        background: 'linear-gradient(90deg, transparent, #ffffff, #E85D00, transparent)',
        zIndex: 4,
        opacity: 0.6
      }} />
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        right: '20px',
        height: '1px',
        background: 'linear-gradient(90deg, transparent, #E85D00, #ffffff, transparent)',
        zIndex: 4,
        opacity: 0.6
      }} />

      {/* Corner Brackets */}
      <div style={{ position: 'absolute', inset: '40px', pointerEvents: 'none', zIndex: 4 }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '40px', height: '40px', borderTop: '2px solid white', borderLeft: '2px solid white' }} />
        <div style={{ position: 'absolute', top: 0, right: 0, width: '40px', height: '40px', borderTop: '2px solid white', borderRight: '2px solid white' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: '40px', height: '40px', borderBottom: '2px solid white', borderLeft: '2px solid white' }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: '40px', height: '40px', borderBottom: '2px solid white', borderRight: '2px solid white' }} />
      </div>

      {/* Main UI */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '0 20px',
        textAlign: 'center'
      }}>
        <div style={{
          fontSize: '0.8rem',
          letterSpacing: '0.4em',
          color: 'rgba(255,255,255,0.7)',
          marginBottom: '2rem',
          textTransform: 'uppercase'
        }}>
          Craze Studios Presents...
        </div>

        <h1 className="custom-font" style={{ margin: 0, fontSize: '8vw' }}>
          <div style={{ color: '#ffffff', textShadow: '0 0 10px rgba(255,255,255,0.3)' }}>BOX EM</div>
          <div style={{ color: '#E85D00', textShadow: '0 0 20px rgba(232,93,0,0.6)' }}>LIKE A FISH</div>
        </h1>

        <div style={{
          width: '200px',
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(232,93,0,0.8), transparent)',
          margin: '3rem 0 4rem 0'
        }} />

        <button 
          disabled={isLoading}
          style={{
            background: 'transparent',
            border: `2px solid ${isLoading ? 'rgba(255,255,255,0.5)' : '#E85D00'}`,
            color: isLoading ? 'rgba(255,255,255,0.5)' : '#ffffff',
            padding: '1.2rem 4rem',
            fontSize: '1.2rem',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            cursor: isLoading ? 'default' : 'pointer',
            transition: 'all 0.3s ease',
            animation: isLoading ? 'none' : 'glow-border 2s infinite',
            outline: 'none',
          }}
          onMouseOver={(e) => {
            if(!isLoading) {
              e.currentTarget.style.backgroundColor = 'rgba(232,93,0,0.1)';
              e.currentTarget.style.color = '#E85D00';
            }
          }}
          onMouseOut={(e) => {
            if(!isLoading) {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#ffffff';
            }
          }}
        >
          {isLoading ? 'LOADING...' : 'PLAY'}
        </button>
        
        <div style={{
          marginTop: '1.5rem',
          fontSize: '0.8rem',
          letterSpacing: '0.1em',
          color: 'rgba(255,255,255,0.4)',
          textTransform: 'uppercase',
          animation: isLoading ? 'none' : 'pulse 2s infinite'
        }}>
          Press ENTER or click to start
        </div>
      </div>

      {/* Controls Grid */}
      <div style={{
        position: 'absolute',
        bottom: '80px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '1rem 3rem',
        fontSize: '0.75rem',
        textAlign: 'left'
      }}>
        {[
          { k: 'WASD', v: 'Move' },
          { k: 'MOUSE', v: 'Aim+Shoot' },
          { k: 'R', v: 'Reload' },
          { k: 'Q', v: 'Build Mode' },
          { k: 'F', v: 'Place Piece' },
          { k: 'E', v: 'Cycle Piece' },
          { k: '1 2 3', v: 'Weapons' },
          { k: 'SPACE', v: 'Jump' },
          { k: 'SHIFT', v: 'Sprint' },
        ].map(ctrl => (
          <div key={ctrl.k} style={{ display: 'flex', gap: '10px' }}>
            <span style={{ color: '#E85D00', fontWeight: 'bold' }}>{ctrl.k}</span>
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>{ctrl.v}</span>
          </div>
        ))}
      </div>

      {/* Version Tag */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        right: '40px',
        zIndex: 10,
        fontSize: '0.7rem',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: '0.1em'
      }}>
        BOX EM LIKE A FISH v1.0
      </div>
    </div>
  );
}
