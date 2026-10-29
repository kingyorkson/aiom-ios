import React, { useEffect, useState } from 'react';
import LoaderIcon from '../assets/Loadericon.png';

const BootAnimation: React.FC = () => {
  const [phase, setPhase] = useState<'show' | 'fadeOut' | 'black' | 'fadeIn' | 'done'>('show');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('fadeOut'), 800);
    const t2 = setTimeout(() => setPhase('black'), 1200);
    const t3 = setTimeout(() => setPhase('fadeIn'), 1400);
    const t4 = setTimeout(() => setPhase('done'), 2200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, []);

  if (phase === 'done') return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center">
      {phase === 'show' && (
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <img src={LoaderIcon} alt="AIOM" className="w-32 h-32" />
          <div className="text-white text-4xl font-bold tracking-widest">iOM</div>
        </div>
      )}
      {(phase === 'fadeOut') && (
        <div className="flex flex-col items-center gap-4 opacity-0 transition-opacity duration-400">
          <img src={LoaderIcon} alt="AIOM" className="w-32 h-32" />
          <div className="text-white text-4xl font-bold tracking-widest">iOM</div>
        </div>
      )}
      {(phase === 'black' || phase === 'fadeIn') && (
        <div className={`w-full h-full bg-black ${phase === 'fadeIn' ? 'opacity-0 transition-opacity duration-800' : ''}`} />
      )}
    </div>
  );
};

export default BootAnimation;
