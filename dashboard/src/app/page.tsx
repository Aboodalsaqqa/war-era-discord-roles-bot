import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0e1a] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#10b981]/5 rounded-full blur-[100px] pointer-events-none"></div>
      
      <div className="glass-card max-w-md w-full p-8 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl text-center relative z-10">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
            <ShieldAlert className="w-10 h-10 text-[#10b981]" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2 uppercase tracking-widest">Misr HQ</h1>
        <p className="text-slate-400 mb-8">Military Command Center & Tactical Dashboard</p>
        
        <Link 
          href="/api/auth/discord"
          className="w-full block py-3 px-4 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-lg font-medium transition-colors shadow-lg shadow-[#5865F2]/20"
        >
          Login with Discord
        </Link>
        <p className="mt-4 text-xs text-slate-500">Authorized Personnel Only</p>
      </div>
    </div>
  );
}
