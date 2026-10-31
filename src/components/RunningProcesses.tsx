import React, { useEffect, useState } from 'react';
import { X, Square, Terminal } from 'lucide-react';

interface Proc {
  id: string;
  packName: string;
  status: string;
  pid?: number;
  startedAt: number;
  logs: string[];
}

const RunningProcesses: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [procs, setProcs] = useState<Proc[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (window.electronAPI?.getRunningProcesses) {
      window.electronAPI.getRunningProcesses().then(setProcs).catch(() => {});
    }
    const handler = (p: Proc[]) => setProcs(p);
    if ((window.electronAPI as any)?.onRunningProcesses) {
      (window.electronAPI as any).onRunningProcesses(handler);
    }
    const i = setInterval(() => {
      if (window.electronAPI?.getRunningProcesses) {
        window.electronAPI.getRunningProcesses().then(setProcs).catch(() => {});
      }
    }, 2000);
    return () => clearInterval(i);
  }, []);

  const stop = async (id: string) => {
    if ((window.electronAPI as any)?.stopMinecraft) {
      try { await (window.electronAPI as any).stopMinecraft(id); } catch {}
    }
    if (window.electronAPI?.getRunningProcesses) {
      window.electronAPI.getRunningProcesses().then(setProcs).catch(() => {});
    }
  };

  const sel = procs.find(p => p.id === selected) || procs[0];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#1e1e2e] border border-white/10 rounded-xl w-[900px] h-[600px] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2"><Terminal size={18}/> Background Processes</div>
          <button onClick={onClose}><X size={18}/></button>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="w-64 border-r border-white/10 overflow-y-auto">
            {procs.map(p => (
              <div key={p.id} onClick={() => setSelected(p.id)} className={`p-3 cursor-pointer border-b border-white/5 ${selected === p.id ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                <div className="font-semibold truncate">{p.packName}</div>
                <div className="text-xs opacity-60">{p.status} {p.pid ? `(pid ${p.pid})` : ''}</div>
              </div>
            ))}
            {procs.length === 0 && <div className="p-4 opacity-60 text-sm">No running processes</div>}
          </div>
          <div className="flex-1 flex flex-col">
            {sel && (
              <>
                <div className="flex items-center justify-between p-3 border-b border-white/10">
                  <div>{sel.packName} - {sel.status}</div>
                  {(sel.status === 'running' || sel.status === 'launching') && (
                    <button onClick={() => stop(sel.id)} className="flex items-center gap-1 px-3 py-1 bg-red-600 rounded"><Square size={14}/> Stop</button>
                  )}
                </div>
                <div className="flex-1 overflow-auto p-3 text-xs font-mono space-y-1">
                  {(sel.logs || []).map((l, i) => <div key={i}>{l}</div>)}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RunningProcesses;
