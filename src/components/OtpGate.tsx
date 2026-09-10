import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useAuth } from '@/hooks/useAuth';
import { ShieldCheck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

export function OtpGate() {
  const { otpEmailMasked, verifyOtp, resendOtp, signOut } = useAuth();
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');

  const handleVerify = async () => {
    if (code.length !== 6) return;
    setVerifying(true);
    setError('');
    const { error } = await verifyOtp(code);
    setVerifying(false);
    if (error) {
      setError(error);
      setCode('');
    } else {
      toast.success('Verified');
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError('');
    const { error } = await resendOtp();
    setResending(false);
    if (error) setError(error);
    else toast.success('New code sent');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="pt-8 pb-6 px-6 flex flex-col items-center">
          <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mb-3">
            <ShieldCheck className="w-6 h-6 text-accent" />
          </div>
          <h1 className="text-lg font-bold text-foreground">Two-factor verification</h1>
          <p className="text-sm text-muted-foreground text-center mt-1 mb-5">
            We sent a 6-digit code to <span className="font-medium text-foreground">{otpEmailMasked || 'your email'}</span>.
          </p>

          <InputOTP maxLength={6} value={code} onChange={setCode} disabled={verifying}>
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map(i => <InputOTPSlot key={i} index={i} />)}
            </InputOTPGroup>
          </InputOTP>

          {error && <p className="text-xs text-destructive font-medium mt-3 text-center">{error}</p>}

          <Button className="w-full mt-5" onClick={handleVerify} disabled={code.length !== 6 || verifying}>
            {verifying ? <Skeleton className="h-4 w-24 bg-primary-foreground/30" /> : 'Verify & continue'}
          </Button>

          <div className="flex items-center justify-between w-full mt-4 text-xs">
            <button
              className="text-accent hover:underline disabled:opacity-50"
              onClick={handleResend}
              disabled={resending}
            >
              {resending ? 'Sending…' : 'Resend code'}
            </button>
            <button className="text-muted-foreground hover:underline" onClick={() => signOut()}>
              Cancel & sign out
            </button>
          </div>

          <p className="text-[10px] text-muted-foreground mt-6 text-center">
            Code expires in 10 minutes. Max 5 attempts.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
