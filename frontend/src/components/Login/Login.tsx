import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';

export const Login = () => {
  const { login, isLoading, error } = useAuth();
  const [email, setEmail] = useState('landlord@murlee.test');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
    } catch {
      // error surfaced via useAuth().error
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-950/20 backdrop-blur-3xl">
      <div className="w-full max-w-sm bg-slate-900/60 border border-white/10 rounded-2xl shadow-2xl p-8 flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30 text-outfit">M</div>
          <span className="text-xl font-bold tracking-tight text-white text-outfit">Murlee PMS</span>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs text-slate-400 font-bold uppercase tracking-wider text-outfit">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password123"
              className="bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600 transition-colors"
              required
            />
          </div>

          {error && <p className="text-rose-400 text-xs font-semibold">{error}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="mt-2 px-5 py-3 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 font-bold text-white text-sm shadow-lg shadow-indigo-500/20 hover:scale-[1.02] hover:shadow-indigo-500/35 transition-all duration-200 text-outfit disabled:opacity-50"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>

          <p className="text-[11px] text-slate-500 text-center">Demo: landlord@murlee.test / password123</p>
        </form>
      </div>
    </div>
  );
};
