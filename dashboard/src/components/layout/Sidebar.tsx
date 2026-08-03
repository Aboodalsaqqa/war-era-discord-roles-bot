import Link from "next/link";
import { Home, Users, Activity, Crosshair, Package, TrendingUp, ShieldAlert, Trophy } from "lucide-react";

export default function Sidebar() {
  return (
    <aside className="w-64 bg-[#0a0e1a]/80 backdrop-blur-md border-r border-slate-800 h-screen flex flex-col p-4 space-y-6 fixed">
      <div className="flex items-center space-x-3 px-2">
        <ShieldAlert className="w-8 h-8 text-[#10b981]" />
        <h1 className="text-xl font-bold tracking-wider text-white uppercase">Misr HQ</h1>
      </div>
      <nav className="flex-1 space-y-2">
        <Link href="/overview" className="flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-slate-800/50 text-slate-300 hover:text-white transition-colors">
          <Home className="w-5 h-5" />
          <span>Overview</span>
        </Link>
        <Link href="/members" className="flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-slate-800/50 text-slate-300 hover:text-white transition-colors">
          <Users className="w-5 h-5" />
          <span>Roster</span>
        </Link>
        <div className="pt-4 pb-2">
          <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Analytics</p>
        </div>
        <Link href="/analytics/damage" className="flex items-center space-x-3 px-4 py-2 rounded-lg hover:bg-slate-800/50 text-slate-300 hover:text-white transition-colors">
          <Crosshair className="w-5 h-5" />
          <span>Damage Reports</span>
        </Link>
        <Link href="/analytics/attendance" className="flex items-center space-x-3 px-4 py-2 rounded-lg hover:bg-slate-800/50 text-slate-300 hover:text-white transition-colors">
          <Activity className="w-5 h-5" />
          <span>Attendance</span>
        </Link>
        <Link href="/analytics/equipment" className="flex items-center space-x-3 px-4 py-2 rounded-lg hover:bg-slate-800/50 text-slate-300 hover:text-white transition-colors">
          <Package className="w-5 h-5" />
          <span>Equipment</span>
        </Link>
        <Link href="/leaderboard" className="flex items-center space-x-3 px-4 py-2 rounded-lg hover:bg-slate-800/50 text-slate-300 hover:text-white transition-colors mt-4">
          <Trophy className="w-5 h-5" />
          <span>Leaderboard</span>
        </Link>
        <Link href="/market" className="flex items-center space-x-3 px-4 py-2 rounded-lg hover:bg-slate-800/50 text-slate-300 hover:text-white transition-colors mt-4">
          <TrendingUp className="w-5 h-5" />
          <span>Market Intel</span>
        </Link>
      </nav>
    </aside>
  );
}
