import { Bell, Search, User } from "lucide-react";

export default function TopBar() {
  return (
    <header className="h-16 border-b border-slate-800 bg-[#0a0e1a]/80 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="flex items-center bg-slate-900/50 border border-slate-800 rounded-lg px-3 py-1.5 w-96">
        <Search className="w-4 h-4 text-slate-400 mr-2" />
        <input 
          type="text" 
          placeholder="Search operatives, orders, reports..." 
          className="bg-transparent border-none outline-none text-sm text-slate-200 w-full placeholder:text-slate-500"
        />
      </div>
      <div className="flex items-center space-x-4">
        <button className="p-2 rounded-full hover:bg-slate-800/50 relative text-slate-300">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#ef4444] rounded-full"></span>
        </button>
        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
          <User className="w-4 h-4" />
        </div>
      </div>
    </header>
  );
}
