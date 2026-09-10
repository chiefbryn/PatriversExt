import { useState, useEffect } from 'react';
import { Plus, Users as UsersIcon, UserCheck, UserX, Shield, Trash2, KeyRound, MoreHorizontal, Mail } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { RecordsToolbar } from '@/components/RecordsToolbar';
import { ContentSkeleton, InlineSkeleton } from '@/components/LoadingSkeletons';
import { useOutlets } from '@/hooks/useOutlets';

async function getFunctionErrorMessage(err: any, fallback: string) {
  const genericMessage = 'Edge Function returned a non-2xx status code';

  if (err?.message && err.message !== genericMessage) {
    return err.message;
  }

  const response = err?.context;
  if (response instanceof Response) {
    try {
      const payload = await response.clone().json();
      if (payload?.error) return payload.error;
    } catch {
      // ignore JSON parsing issues
    }

    try {
      const text = await response.clone().text();
      if (text) return text;
    } catch {
      // ignore text parsing issues
    }
  }

  return err?.message || fallback;
}

export default function UsersAndSecurity() {
  const queryClient = useQueryClient();
  const { user, role: currentRole } = useAuth();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ full_name: '', username: '', password: '', role: 'cashier', outlet_id: '' });
  const [saving, setSaving] = useState(false);
  const { data: outlets = [] } = useOutlets();

  // Reset password dialog
  const [resetOpen, setResetOpen] = useState(false);
  const [resetUserId, setResetUserId] = useState('');
  const [resetUserName, setResetUserName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  // Delete confirmation
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState('');
  const [deleteUserName, setDeleteUserName] = useState('');
  const [deleting, setDeleting] = useState(false);

  // 2FA settings dialog
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpUserId, setOtpUserId] = useState('');
  const [otpUserName, setOtpUserName] = useState('');
  const [otpEmail, setOtpEmail] = useState('');
  const [otpEnabled, setOtpEnabled] = useState(false);
  const [otpSaving, setOtpSaving] = useState(false);

  const openOtpDialog = (p: any) => {
    setOtpUserId(p.user_id);
    setOtpUserName(p.full_name);
    setOtpEmail(p.otp_email || '');
    setOtpEnabled(!!p.otp_enabled);
    setOtpOpen(true);
  };

  const saveOtpSettings = async () => {
    if (otpEnabled && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(otpEmail.trim())) {
      toast.error('Enter a valid email address');
      return;
    }
    setOtpSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ otp_email: otpEmail.trim() || null, otp_enabled: otpEnabled })
      .eq('user_id', otpUserId);
    setOtpSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('2FA settings updated');
    setOtpOpen(false);
    queryClient.invalidateQueries({ queryKey: ['profiles'] });
  };

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').order('full_name');
      return data || [];
    },
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['user-roles'],
    queryFn: async () => {
      const { data } = await supabase.from('user_roles').select('*');
      return data || [];
    },
  });

  const { data: activityLog = [] } = useQuery({
    queryKey: ['activity-log'],
    queryFn: async () => {
      const { data } = await supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(100);
      return data || [];
    },
  });

  const { data: loginLog = [] } = useQuery({
    queryKey: ['login-log'],
    queryFn: async () => {
      const { data } = await supabase.from('login_log').select('*').order('attempted_at', { ascending: false }).limit(100);
      return data || [];
    },
  });

  useEffect(() => {
    const ch = supabase.channel('users-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, () => {
        queryClient.invalidateQueries({ queryKey: ['activity-log'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  const getUserRole = (userId: string) => roles.find(r => r.user_id === userId)?.role || '—';
  const isSystemAdmin = (profile: any) => profile.username?.toLowerCase() === 'admin' && getUserRole(profile.user_id) === 'admin';

  const generateStrongPassword = () => {
    const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%^&*-_+='];
    const rand = (s: string) => s[Math.floor(Math.random() * s.length)];
    const chars = sets.map(rand);
    const all = sets.join('');
    while (chars.length < 16) chars.push(rand(all));
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  };

  const passwordErrorMessage = (msg: string) =>
    /weak|easy to guess|pwned|compromis/i.test(msg)
      ? 'That password appears in known breach lists. Use the Generate button or pick a longer, unique password.'
      : msg;


  const handleCreateUser = async () => {
    if (!form.full_name.trim() || !form.username.trim() || !form.password.trim()) {
      toast.error('Full name, username and password are required');
      return;
    }
    if (currentRole === 'ceo' && form.role === 'admin') {
      toast.error('CEOs cannot create System Admin accounts');
      return;
    }
    if ((form.role === 'cashier' || form.role === 'pharmacist') && !form.outlet_id) {
      toast.error('Select a branch for this staff account');
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          action: 'create',
          password: form.password,
          full_name: form.full_name,
          role: form.role,
          username: form.username,
          outlet_id: form.outlet_id || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('User created successfully');
      setFormOpen(false);
      setForm({ full_name: '', username: '', password: '', role: 'cashier', outlet_id: '' });
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['user-roles'] });
    } catch (err: any) {
      toast.error(passwordErrorMessage(await getFunctionErrorMessage(err, 'Failed to create user')));
    }

    setSaving(false);
  };

  const handleResetPassword = async () => {
    if (!newPassword.trim() || newPassword.length < 10) {
      toast.error('Password must be at least 10 characters');
      return;
    }
    setResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: { action: 'reset_password', user_id: resetUserId, new_password: newPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Password reset for ${resetUserName}. They will be required to change it on next login.`);
      setResetOpen(false);
      setNewPassword('');
    } catch (err: any) {
      toast.error(passwordErrorMessage(await getFunctionErrorMessage(err, 'Failed to reset password')));
    }
    setResetting(false);
  };

  const handleDeleteUser = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: { action: 'delete', user_id: deleteUserId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`User ${deleteUserName} permanently deleted`);
      setDeleteOpen(false);
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['user-roles'] });
    } catch (err: any) {
      toast.error(await getFunctionErrorMessage(err, 'Failed to delete user'));
    }
    setDeleting(false);
  };

  const toggleStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: { action: 'set_status', user_id: userId, status: newStatus },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`User ${newStatus}`);
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
    } catch (err: any) {
      toast.error(await getFunctionErrorMessage(err, 'Failed to update user status'));
    }
  };

  const totalUsers = profiles.length;
  const activeUsers = profiles.filter(p => p.status === 'active').length;
  const inactiveUsers = profiles.filter(p => p.status !== 'active').length;
  const rolesAssigned = roles.length;

  const SUMMARY = [
    { label: 'Total users', value: String(totalUsers), icon: UsersIcon },
    { label: 'Active', value: String(activeUsers), icon: UserCheck },
    { label: 'Inactive', value: String(inactiveUsers), icon: UserX },
    { label: 'Roles assigned', value: String(rolesAssigned), icon: Shield },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Users & security</h1>
        <Button className="gap-2" onClick={() => setFormOpen(true)}><Plus className="w-4 h-4" /> Add user</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {SUMMARY.map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3 px-4">
              <s.icon className="w-4 h-4 text-muted-foreground mb-1" />
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="activity">Activity Log</TabsTrigger>
          <TabsTrigger value="logins">Login Log</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <div className="flex justify-end mt-4 mb-2">
            <RecordsToolbar
              disabled={profiles.length === 0}
              getData={() => ({
                title: 'Users Report',
                subtitle: `${profiles.length} user(s)`,
                filename: 'users',
                headers: ['#', 'Name', 'Username', 'Role', 'Status', 'Last Login'],
                rows: profiles.map((p: any, i) => [
                  i + 1, p.full_name, p.username || '—', getUserRole(p.user_id), p.status,
                  p.last_login ? new Date(p.last_login).toLocaleString('en-GB') : 'Never',
                ]),
              })}
            />
          </div>
          {isLoading ? (
            <Card><CardContent className="p-0"><ContentSkeleton rows={6} /></CardContent></Card>
          ) : profiles.length === 0 ? (
            <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">No users created yet.</CardContent></Card>
          ) : (
            <div className="border rounded-lg overflow-auto">

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead className="w-16 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map(p => {
                    const isSelf = p.user_id === user?.id;
                    const protectedAdmin = isSystemAdmin(p);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.full_name}</TableCell>
                        <TableCell className="text-xs font-mono">{p.username || '—'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">{getUserRole(p.user_id)}</Badge>
                            {protectedAdmin && <span className="text-xs text-muted-foreground">Protected</span>}
                          </div>
                        </TableCell>
                        <TableCell><Badge variant={p.status === 'active' ? 'default' : 'destructive'} className="text-[10px]">{p.status}</Badge></TableCell>
                        <TableCell className="text-xs">{p.last_login ? new Date(p.last_login).toLocaleString('en-GB') : 'Never'}</TableCell>
                        <TableCell className="text-right">
                          {currentRole === 'admin' && (!protectedAdmin || isSelf) ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {!protectedAdmin && (
                                <DropdownMenuItem onClick={() => toggleStatus(p.user_id, p.status)}>
                                  {p.status === 'active' ? (
                                    <><UserX className="w-4 h-4 mr-2" /> Suspend</>
                                  ) : (
                                    <><UserCheck className="w-4 h-4 mr-2" /> Activate</>
                                  )}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => {
                                setResetUserId(p.user_id);
                                setResetUserName(p.full_name);
                                setNewPassword('');
                                setResetOpen(true);
                              }}>
                                <KeyRound className="w-4 h-4 mr-2" /> Reset Password
                              </DropdownMenuItem>
                              {!protectedAdmin && (
                                <DropdownMenuItem onClick={() => openOtpDialog(p)}>
                                  <Mail className="w-4 h-4 mr-2" /> Email 2FA
                                </DropdownMenuItem>
                              )}
                              {!protectedAdmin && !isSelf && (
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => {
                                    setDeleteUserId(p.user_id);
                                    setDeleteUserName(p.full_name);
                                    setDeleteOpen(true);
                                  }}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" /> Delete Permanently
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          ) : protectedAdmin ? (
                            <span className="text-xs text-muted-foreground">System Admin</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">View only</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="activity">
          <div className="flex justify-end mt-4 mb-2">
            <RecordsToolbar
              disabled={activityLog.length === 0}
              getData={() => ({
                title: 'Activity Log',
                subtitle: `Last ${activityLog.length} record(s)`,
                filename: 'activity_log',
                headers: ['#', 'Module', 'Action', 'Document', 'Date'],
                rows: activityLog.map((a: any, i) => [
                  i + 1, a.module, a.action, a.document_ref || '—',
                  new Date(a.created_at).toLocaleString('en-GB'),
                ]),
              })}
            />
          </div>
          {activityLog.length === 0 ? (
            <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">No activity logged.</CardContent></Card>
          ) : (
            <div className="border rounded-lg overflow-auto">

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Module</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activityLog.map(a => (
                    <TableRow key={a.id}>
                      <TableCell>{a.module}</TableCell>
                      <TableCell>{a.action}</TableCell>
                      <TableCell className="text-xs">{a.document_ref || '—'}</TableCell>
                      <TableCell className="text-xs">{new Date(a.created_at).toLocaleString('en-GB')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="logins">
          <div className="flex justify-end mt-4 mb-2">
            <RecordsToolbar
              disabled={loginLog.length === 0}
              getData={() => ({
                title: 'Login Log',
                subtitle: `Last ${loginLog.length} attempt(s)`,
                filename: 'login_log',
                headers: ['#', 'User', 'Status', 'Date'],
                rows: loginLog.map((l: any, i) => {
                  const p = profiles.find((pr: any) => pr.user_id === l.user_id);
                  return [
                    i + 1, p?.full_name || (l.user_id?.slice(0, 8) + '...'),
                    l.status, new Date(l.attempted_at).toLocaleString('en-GB'),
                  ];
                }),
              })}
            />
          </div>
          {loginLog.length === 0 ? (
            <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">No login records.</CardContent></Card>
          ) : (
            <div className="border rounded-lg overflow-auto">

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loginLog.map(l => {
                    const p = profiles.find(pr => pr.user_id === l.user_id);
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs">{p?.full_name || l.user_id?.slice(0, 8) + '...'}</TableCell>
                        <TableCell><Badge variant={l.status === 'success' ? 'default' : 'destructive'} className="text-[10px]">{l.status}</Badge></TableCell>
                        <TableCell className="text-xs">{new Date(l.attempted_at).toLocaleString('en-GB')}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add User Dialog - username + password only, no email */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add New User</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Full Name *</Label><Input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} placeholder="e.g. John Smith" /></div>
            <div><Label>Username *</Label><Input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} placeholder="e.g. jsmith" /></div>
            <div>
              <Label>Password *</Label>
              <div className="flex gap-2">
                <Input type="text" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="At least 8 unique characters" />
                <Button type="button" variant="outline" onClick={() => setForm(p => ({ ...p, password: generateStrongPassword() }))}>Generate</Button>
              </div>
            </div>
            <div>
              <Label>Role *</Label>
              <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v, outlet_id: v === 'cashier' || v === 'pharmacist' ? p.outlet_id : '' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {currentRole === 'admin' && <SelectItem value="admin">System Admin</SelectItem>}
                  <SelectItem value="ceo">CEO</SelectItem>
                  <SelectItem value="pharmacist">Pharmacist</SelectItem>
                  <SelectItem value="cashier">Cashier</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(form.role === 'cashier' || form.role === 'pharmacist') && (
              <div>
                <Label>Branch *</Label>
                <Select value={form.outlet_id} onValueChange={outlet_id => setForm(p => ({ ...p, outlet_id }))}>
                  <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>
                    {outlets.filter(outlet => outlet.is_active).map(outlet => (
                      <SelectItem key={outlet.id} value={outlet.id}>{outlet.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button className="w-full" onClick={handleCreateUser} disabled={saving}>
              {saving ? <InlineSkeleton className="h-4 w-20 bg-primary-foreground/30" /> : 'Create User'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reset Password</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Set a new password for <strong>{resetUserName}</strong>. They will be required to change it on next login.</p>
          <div className="space-y-4 mt-2">
            <div>
              <Label>New Password *</Label>
              <div className="flex gap-2">
                <Input type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 8 unique characters" />
                <Button type="button" variant="outline" onClick={() => setNewPassword(generateStrongPassword())}>Generate</Button>
              </div>
            </div>
            <Button className="w-full" onClick={handleResetPassword} disabled={resetting}>
              {resetting ? <InlineSkeleton className="h-4 w-20 bg-primary-foreground/30" /> : 'Reset Password'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User Permanently</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteUserName}</strong> and all their associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <InlineSkeleton className="h-4 w-20 bg-destructive-foreground/30" /> : 'Delete Permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Email 2FA Settings */}
      <Dialog open={otpOpen} onOpenChange={setOtpOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Email 2FA — {otpUserName}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            When enabled, this user must enter a 6-digit code sent to the email below after every password sign-in.
          </p>
          <div className="space-y-4 mt-3">
            <div className="space-y-2">
              <Label>Recipient email</Label>
              <Input
                type="email"
                value={otpEmail}
                onChange={e => setOtpEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Require code on every login</p>
                <p className="text-xs text-muted-foreground">Email-based 2FA</p>
              </div>
              <Switch checked={otpEnabled} onCheckedChange={setOtpEnabled} />
            </div>
            <Button className="w-full" onClick={saveOtpSettings} disabled={otpSaving}>
              {otpSaving ? <InlineSkeleton className="h-4 w-16 bg-primary-foreground/30" /> : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
