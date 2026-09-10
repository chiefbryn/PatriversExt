import { Skeleton } from '@/components/ui/skeleton';
import { TableCell, TableRow } from '@/components/ui/table';

export function TableRowsSkeleton({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <TableRow key={row} aria-hidden="true">
          {Array.from({ length: columns }, (_, column) => (
            <TableCell key={column}>
              <Skeleton className={column === 0 ? 'h-4 w-32' : 'h-4 w-20'} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function ContentSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5" aria-label="Loading content" role="status">
      <Skeleton className="h-5 w-40" />
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-4 border-t pt-3" aria-hidden="true">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/5" />
          <Skeleton className="ml-auto h-4 w-16" />
        </div>
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function AppShellSkeleton() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-6" aria-label="Loading application" role="status">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between border-b pb-4">
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, item) => <Skeleton key={item} className="h-24 w-full" />)}
        </div>
        <Skeleton className="h-10 w-full" />
        <ContentSkeleton rows={7} />
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function InlineSkeleton({ className = 'h-4 w-20' }: { className?: string }) {
  return <Skeleton className={className} aria-label="Loading" role="status" />;
}