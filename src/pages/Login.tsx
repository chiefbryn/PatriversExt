import { useState, useEffect } from 'react';
import { Eye, EyeOff, Clock } from 'lucide-react';
import pharmacyBg from '@/assets/pharmacy-bg.jpg';
import { BrandMark, BRAND_NAME } from '@/components/BrandMark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';

function LiveClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const time = now.toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const date = now.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="flex flex-col items-center gap-1 text-accent">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4" />
        <span className="text-2xl font-bold tabular-nums tracking-wide">{time}</span>
        <span className="text-xs font-medium opacity-70">GMT</span>
      </div>
      <p className="text-xs font-medium opacity-70">{date}</p>
    </div>
  );
}

export default function Login() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await signIn(username.trim(), password);
    setLoading(false);

    if (result.error) {
      setError(result.error);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 relative bg-primary bg-cover bg-center bg-no-repeat"
      style={{
        backgroundColor: 'hsl(var(--primary))',
        backgroundImage: `url(${pharmacyBg})`,
      }}
    >
      <div className="absolute inset-0 bg-primary/60 z-0" />
      <Card className="w-full max-w-xs bg-white shadow-2xl border-accent/30 relative z-10">
        <CardContent className="pt-4 pb-4 px-5">
          <div className="flex flex-col items-center mb-3">
            <BrandMark size="lg" className="mb-2" />
            <h1 className="text-lg font-bold text-accent tracking-tight">{BRAND_NAME} Management Login</h1>
            <p className="text-accent/60 text-xs mt-1">Sign in to access your dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-2.5" autoComplete="off">
            {/* Hidden decoy fields to defeat browser autofill heuristics */}
            <input type="text" name="fakeusernameremembered" autoComplete="username" style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" />
            <input type="password" name="fakepasswordremembered" autoComplete="new-password" style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" />
            <div className="space-y-1">
              <Label htmlFor="username" className="text-sm font-semibold text-accent">Username</Label>
              <Input
                id="username"
                name="jp-user"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-lpignore="true"
                data-form-type="other"
                data-1p-ignore="true"
                className="h-9 bg-white border-border focus:border-accent focus:ring-1 focus:ring-accent transition-colors text-foreground font-medium"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password" className="text-sm font-semibold text-accent">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="jp-pass"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-form-type="other"
                  data-1p-ignore="true"
                  className="h-9 bg-white border-border focus:border-accent focus:ring-1 focus:ring-accent transition-colors pr-10 text-foreground font-medium"
                />

                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-accent/50 hover:text-accent transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
                <p className="text-xs text-destructive font-medium">{error}</p>
              </div>
            )}

            <Button type="submit" className="w-full h-9 text-sm font-semibold bg-accent hover:bg-accent/90 text-accent-foreground" disabled={loading}>
              {loading ? (
                <Skeleton className="h-4 w-20 bg-accent-foreground/30" />
              ) : (
                'Sign in'
              )}
            </Button>
          </form>

          <p className="text-center text-xs text-accent/50 mt-6">
            Authorized personnel only. Contact admin for access.
          </p>
          <p className="text-center text-[10px] text-accent/40 mt-2">
            System designed &amp; powered by <span className="font-semibold text-accent/60">Chief Alltechs Ventures</span>
          </p>

          <div className="mt-6 pt-4 border-t border-accent/30">
            <LiveClock />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
