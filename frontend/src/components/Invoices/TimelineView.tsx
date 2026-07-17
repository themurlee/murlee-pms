import { TimelineEvent } from '../../types/invoice';

interface TimelineViewProps {
  data: TimelineEvent[];
}

export const TimelineView = ({ data }: TimelineViewProps) => {
  return (
    <div className="relative border-l border-white/10 ml-4 my-6">
      {data.map((event, index) => (
        <div key={index} className="mb-10 ml-6 relative">
          {/* Status Indicator Orb */}
          <span className="absolute flex items-center justify-center w-6 h-6 bg-indigo-950/40 rounded-full -left-[37px] ring-4 ring-slate-900 border border-indigo-500/30">
            <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse" />
          </span>
          
          <div className="glass-panel p-4 rounded-xl border border-white/5 shadow-sm transition-all duration-200 hover:border-white/10">
            <time className="block mb-1 text-xs font-bold uppercase tracking-wider text-slate-400 text-outfit">
              {new Date(event.timestamp).toLocaleString()}
            </time>
            <h4 className="text-sm font-bold text-slate-200 text-outfit">
              {event.event}
            </h4>
            <p className="mt-1 text-xs text-slate-400 leading-relaxed">
              {event.description}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};
