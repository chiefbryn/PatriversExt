import { useState } from 'react';
import { Search, X, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useProductSearch } from '@/hooks/useDocuments';
import { RequestRestockDialog, LOW_STOCK_THRESHOLD } from '@/components/RequestRestockDialog';

interface Product {
  id: string;
  name: string;
  category: string;
  qty: number;
  cost_price: number;
  sales_price: number;
  uom: string;
  batch_number?: string | null;
  expiry_date?: string | null;
}

interface Props {
  onSelect: (product: Product) => void;
  priceField?: 'cost_price' | 'sales_price';
}

export function ProductPicker({ onSelect, priceField = 'sales_price' }: Props) {
  const [term, setTerm] = useState('');
  const { data: results = [] } = useProductSearch(term);
  const [reqProduct, setReqProduct] = useState<Product | null>(null);

  const openRequest = (p: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    setReqProduct(p);
    setTerm('');
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search product to add..."
          className="pl-9 pr-8"
          value={term}
          onChange={e => setTerm(e.target.value)}
        />
        {term && (
          <button onClick={() => setTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {results.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-72 overflow-auto">
          {results.map((p: Product) => {
            const isLow = p.qty < LOW_STOCK_THRESHOLD;
            return (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-accent/10 border-b last:border-0"
              >
                <button
                  onClick={() => { onSelect(p); setTerm(''); }}
                  className="flex-1 flex items-center justify-between text-left min-w-0"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-muted-foreground text-xs ml-2">({p.category})</span>
                  </div>
                  <div className="text-right text-xs text-muted-foreground shrink-0 ml-3">
                    <div className={isLow ? 'text-destructive font-semibold flex items-center gap-1 justify-end' : ''}>
                      {isLow && <AlertTriangle className="w-3 h-3" />}
                      Stock: {p.qty} {p.uom}
                    </div>
                    <div>GH₵ {Number(p[priceField]).toFixed(2)}</div>
                  </div>
                </button>
                {isLow && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={(e) => openRequest(p, e)}
                  >
                    Request
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <RequestRestockDialog
        product={reqProduct ? { name: reqProduct.name, qty: reqProduct.qty, uom: reqProduct.uom } : null}
        onClose={() => setReqProduct(null)}
      />
    </div>
  );
}
