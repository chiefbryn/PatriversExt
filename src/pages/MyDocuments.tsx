import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { InlineSkeleton } from '@/components/LoadingSkeletons';
import { toast } from 'sonner';
import {
  FolderOpen, Upload, Download, Trash2, FileSpreadsheet,
  FileText, FileImage, File, Search, Clock
} from 'lucide-react';
import { format } from 'date-fns';

interface UserFile {
  id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string | null;
  description: string | null;
  created_at: string;
}

const FILE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'spreadsheet': FileSpreadsheet,
  'document': FileText,
  'image': FileImage,
};

function getFileIcon(type: string | null) {
  if (!type) return File;
  if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) return FILE_ICONS.spreadsheet;
  if (type.includes('pdf') || type.includes('document') || type.includes('text')) return FILE_ICONS.document;
  if (type.includes('image')) return FILE_ICONS.image;
  return File;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MyDocuments() {
  const { user } = useAuth();
  const [files, setFiles] = useState<UserFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('user_files')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setFiles((data as UserFile[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchFiles();
  }, [user]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || !user) return;

    setUploading(true);
    let uploaded = 0;

    for (const file of Array.from(selectedFiles)) {
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 20MB limit`);
        continue;
      }

      const filePath = `${user.id}/${Date.now()}_${file.name}`;

      const { error: storageError } = await supabase.storage
        .from('user-files')
        .upload(filePath, file);

      if (storageError) {
        toast.error(`Failed to upload ${file.name}: ${storageError.message}`);
        continue;
      }

      const { error: dbError } = await supabase.from('user_files').insert({
        user_id: user.id,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        file_type: file.type || null,
      });

      if (dbError) {
        toast.error(`Failed to save record for ${file.name}`);
        continue;
      }

      uploaded++;
    }

    if (uploaded > 0) {
      toast.success(`${uploaded} file(s) uploaded successfully`);
      fetchFiles();
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownload = async (file: UserFile) => {
    const { data, error } = await supabase.storage
      .from('user-files')
      .download(file.file_path);

    if (error || !data) {
      toast.error('Download failed');
      return;
    }

    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.file_name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (file: UserFile) => {
    if (!confirm(`Delete "${file.file_name}"?`)) return;

    await supabase.storage.from('user-files').remove([file.file_path]);
    await supabase.from('user_files').delete().eq('id', file.id);
    toast.success('File deleted');
    fetchFiles();
  };

  const filtered = files.filter(f =>
    f.file_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <FolderOpen className="w-6 h-6 text-accent" />
          <h1 className="text-xl font-bold text-foreground">My Documents</h1>
          <Badge variant="outline">{files.length} files</Badge>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            size="sm"
            className="gap-2"
          >
            {!uploading && <Upload className="w-4 h-4" />}
            {uploading ? <InlineSkeleton className="h-4 w-20 bg-primary-foreground/30" /> : 'Upload Files'}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search files…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {/* File list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>{files.length === 0 ? 'No files uploaded yet. Click "Upload Files" to get started.' : 'No files match your search.'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(file => {
            const Icon = getFileIcon(file.file_type);
            return (
              <Card key={file.id} className="hover:border-accent/50 transition-colors">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-accent/10 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-accent" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{file.file_name}</p>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                      <span>{formatFileSize(file.file_size)}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(file.created_at), 'dd/MM/yyyy HH:mm')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownload(file)} title="Download">
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(file)} title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
