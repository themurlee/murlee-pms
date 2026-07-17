export const Dashboard = () => {
  // Mock data for graphs
  const cashflowData = [12000, 14200, 11500, 16800, 15400, 18900];
  const months = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
  const maxVal = Math.max(...cashflowData);
  const minVal = Math.min(...cashflowData);

  // Generate SVG path points for cashflow line chart
  const width = 500;
  const height = 150;
  const padding = 20;
  const points = cashflowData.map((val, idx) => {
    const x = padding + (idx * (width - 2 * padding)) / (cashflowData.length - 1);
    const y = height - padding - ((val - minVal) * (height - 2 * padding)) / (maxVal - minVal);
    return { x, y };
  });

  const pathD = points.reduce((acc, p, idx) => {
    return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, '');

  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

  return (
    <div className="flex flex-col gap-8">
      {/* Dashboard Heading */}
      <div>
        <h1 className="text-3xl font-extrabold text-white text-outfit tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">
          Dashboard
        </h1>
        <p className="text-slate-400 text-sm mt-1">Aggregated portfolio financials and connected feeds</p>
      </div>
      
      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-6 rounded-2xl flex flex-col justify-between">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Gross Monthly Income</span>
          <p className="text-3xl font-extrabold mt-3 text-emerald-400 text-outfit tracking-tight">$26,600</p>
          <span className="text-xs text-slate-500 mt-2">Target matching verified</span>
        </div>
        
        <div className="glass-card p-6 rounded-2xl flex flex-col justify-between">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Occupied Units</span>
          <p className="text-3xl font-extrabold mt-3 text-indigo-400 text-outfit tracking-tight">20 / 25</p>
          <span className="text-xs text-slate-500 mt-2">80% occupancy rate</span>
        </div>
        
        <div className="glass-card p-6 rounded-2xl flex flex-col justify-between">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Plaid Connection Health</span>
          <div className="mt-3 flex items-center">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Active
            </span>
          </div>
          <span className="text-xs text-slate-500 mt-4">Synced 2 hours ago</span>
        </div>
      </div>

      {/* Visual Analytics Graphs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cashflow Performance Area Chart */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-white text-outfit">Cashflow Trend</h3>
              <p className="text-xs text-slate-400">Monthly Net Profit (Feb - Jul 2026)</p>
            </div>
            <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded">+12.4% MoM</span>
          </div>

          <div className="relative w-full h-[160px] bg-slate-950/20 rounded-xl overflow-hidden border border-white/5 flex items-end">
            <svg className="w-full h-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(99, 102, 241)" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="rgb(99, 102, 241)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Background grid lines */}
              <line x1="0" y1={height/2} x2={width} y2={height/2} stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
              {/* Area path */}
              <path d={areaD} fill="url(#chartGradient)" />
              {/* Line path */}
              <path d={pathD} fill="none" stroke="rgb(99, 102, 241)" strokeWidth="3" />
              {/* Data points */}
              {points.map((p, idx) => (
                <circle 
                  key={idx} 
                  cx={p.x} 
                  cy={p.y} 
                  r="4" 
                  fill="rgb(99, 102, 241)" 
                  stroke="rgba(255, 255, 255, 0.8)" 
                  strokeWidth="2" 
                />
              ))}
            </svg>
          </div>

          <div className="flex justify-between text-[10px] font-semibold text-slate-400 px-2">
            {months.map((m, idx) => (
              <div key={idx} className="flex flex-col items-center">
                <span>{m}</span>
                <span className="text-white mt-0.5">${(cashflowData[idx] / 1000).toFixed(1)}k</span>
              </div>
            ))}
          </div>
        </div>

        {/* Rent Collection & Recent Transactions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Rent Collection Rate */}
          <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-white text-outfit">Rent Collection</h3>
              <p className="text-xs text-slate-400">Current cycle completion</p>
            </div>
            
            <div className="flex items-center justify-center relative py-2">
              <svg className="w-24 h-24 transform -rotate-90">
                <circle 
                  cx="48" 
                  cy="48" 
                  r="38" 
                  stroke="rgba(255,255,255,0.05)" 
                  strokeWidth="8" 
                  fill="transparent" 
                />
                <circle 
                  cx="48" 
                  cy="48" 
                  r="38" 
                  stroke="rgb(16, 185, 129)" 
                  strokeWidth="8" 
                  fill="transparent" 
                  strokeDasharray={`${2 * Math.PI * 38}`}
                  strokeDashoffset={`${2 * Math.PI * 38 * (1 - 0.94)}`}
                  className="transition-all duration-500"
                />
              </svg>
              <div className="absolute text-center">
                <span className="text-xl font-extrabold text-white text-outfit">94%</span>
                <span className="text-[8px] text-slate-400 block uppercase font-bold tracking-widest mt-0.5">Cleared</span>
              </div>
            </div>

            <div className="flex justify-between text-xs text-slate-400 font-semibold mt-2">
              <span>Paid: <strong className="text-emerald-400">$25,004</strong></span>
              <span>Pending: <strong className="text-amber-400">$1,596</strong></span>
            </div>
          </div>

          {/* Recent Transaction volume */}
          <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-white text-outfit">Expenses vs Rent</h3>
              <p className="text-xs text-slate-400">Transaction split</p>
            </div>

            <div className="flex flex-col gap-4 mt-2">
              {/* Rent volume */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-xs font-semibold text-slate-300">
                  <span>Gross Rent</span>
                  <span className="text-emerald-400">$26,600</span>
                </div>
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: '85%' }}></div>
                </div>
              </div>

              {/* Expense volume */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-xs font-semibold text-slate-300">
                  <span>Operating Expenses</span>
                  <span className="text-rose-400">$4,120</span>
                </div>
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-rose-500 rounded-full" style={{ width: '15%' }}></div>
                </div>
              </div>
            </div>

            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-4">Synced from Plaid Feed</span>
          </div>
        </div>
      </div>
    </div>
  );
};
