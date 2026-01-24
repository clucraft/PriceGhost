import { useMemo } from 'react';

// Generate random box-shadow particles
function generateParticles(count: number, spacing: number, color: string): string {
  const shadows: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = Math.floor(Math.random() * spacing);
    const y = Math.floor(Math.random() * spacing);
    shadows.push(`${x}px ${y}px ${color}`);
  }
  return shadows.join(', ');
}

interface ParticleLayerProps {
  count: number;
  size: number;
  duration: number;
  color: string;
  spacing: number;
}

function ParticleLayer({ count, size, duration, color, spacing }: ParticleLayerProps) {
  const boxShadow = useMemo(() => generateParticles(count, spacing, color), [count, spacing, color]);
  const boxShadowAfter = useMemo(() => generateParticles(Math.floor(count * 0.8), spacing, color), [count, spacing, color]);

  return (
    <div
      className="particle-layer"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: `${size}px`,
        height: `${size}px`,
        background: 'transparent',
        boxShadow,
        borderRadius: '50%',
        animation: `particleFloat ${duration}s linear infinite`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: `${spacing}px`,
          left: 0,
          width: `${size}px`,
          height: `${size}px`,
          background: 'transparent',
          boxShadow: boxShadowAfter,
          borderRadius: '50%',
        }}
      />
    </div>
  );
}

export default function ParticleBackground() {
  const spacing = 2000;

  return (
    <div className="particle-background">
      <style>{`
        .particle-background {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: -1;
          pointer-events: none;
          overflow: hidden;
        }

        @keyframes particleFloat {
          from {
            transform: translateY(0px);
          }
          to {
            transform: translateY(-${spacing}px);
          }
        }

        /* Light mode - subtle gray particles */
        [data-theme="light"] .particle-background {
          opacity: 0.3;
        }

        [data-theme="light"] .particle-layer {
          --particle-color: #6366f1;
        }

        /* Dark mode - white particles */
        [data-theme="dark"] .particle-background {
          opacity: 0.4;
        }

        [data-theme="dark"] .particle-layer {
          --particle-color: #ffffff;
        }
      `}</style>

      {/* Multiple layers with different speeds for depth effect */}
      <ParticleLayer count={300} size={1} duration={80} color="var(--particle-color, #fff)" spacing={spacing} />
      <ParticleLayer count={200} size={2} duration={120} color="var(--particle-color, #fff)" spacing={spacing} />
      <ParticleLayer count={100} size={2} duration={160} color="var(--particle-color, #fff)" spacing={spacing} />
    </div>
  );
}
