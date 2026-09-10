import { useState, useEffect } from 'react';
import { Pill } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export function IdleScreensaver() {
  const { dismissIdle, signOut } = useAuth();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const seconds = time.getSeconds().toString().padStart(2, '0');
  const dateStr = time.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center cursor-pointer select-none"
      style={{ background: 'linear-gradient(135deg, hsl(211, 52%, 12%), hsl(211, 52%, 22%))' }}
      onClick={dismissIdle}
    >
      {/* Subtle animated glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute rounded-full opacity-10"
          style={{
            width: '600px',
            height: '600px',
            background: 'radial-gradient(circle, hsl(142, 71%, 45%) 0%, transparent 70%)',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            animation: 'pulse 4s ease-in-out infinite',
          }}
        />
      </div>

      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
          <Pill className="w-5 h-5 text-accent-foreground" />
        </div>
        <span className="text-lg font-medium" style={{ color: 'hsl(210, 20%, 80%)' }}>
          Patrivers Pharmacy
        </span>
      </div>

      {/* Digital clock */}
      <div className="flex items-baseline gap-1 mb-3">
        <span
          className="font-mono font-bold tracking-wider"
          style={{ fontSize: '6rem', lineHeight: 1, color: 'hsl(0, 0%, 100%)' }}
        >
          {hours}
        </span>
        <span
          className="font-mono font-bold"
          style={{
            fontSize: '6rem',
            lineHeight: 1,
            color: 'hsl(142, 71%, 45%)',
            animation: 'blink 1s step-end infinite',
          }}
        >
          :
        </span>
        <span
          className="font-mono font-bold tracking-wider"
          style={{ fontSize: '6rem', lineHeight: 1, color: 'hsl(0, 0%, 100%)' }}
        >
          {minutes}
        </span>
        <span
          className="font-mono font-light tracking-wider ml-2"
          style={{ fontSize: '2.5rem', lineHeight: 1, color: 'hsl(210, 20%, 60%)' }}
        >
          {seconds}
        </span>
      </div>

      {/* Date */}
      <p className="text-base mb-12" style={{ color: 'hsl(210, 20%, 60%)' }}>{dateStr}</p>

      {/* Prompt */}
      <p
        className="text-sm tracking-wide"
        style={{ color: 'hsl(210, 20%, 50%)', animation: 'pulse 2s ease-in-out infinite' }}
      >
        Click anywhere to resume your session
      </p>

      {/* Sign out link */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          signOut();
        }}
        className="mt-6 text-xs underline transition-colors"
        style={{ color: 'hsl(210, 20%, 45%)' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'hsl(0, 84%, 60%)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'hsl(210, 20%, 45%)')}
      >
        Sign out instead
      </button>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
