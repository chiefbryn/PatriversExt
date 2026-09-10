import * as React from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Drop-in searchable Select.
 * Exports the same API as before (Select, SelectTrigger, SelectValue, SelectContent, SelectItem, ...)
 * so every existing usage in the app gains type-to-filter + free-text entry automatically.
 */

interface Ctx {
  value: string;
  onValueChange: (v: string) => void;
  open: boolean;
  setOpen: (b: boolean) => void;
  search: string;
  setSearch: (s: string) => void;
  registerLabel: (value: string, label: React.ReactNode) => void;
  labels: Map<string, React.ReactNode>;
  allowCustom: boolean;
  disabled?: boolean;
}
const SelectCtx = React.createContext<Ctx | null>(null);
const useCtx = () => {
  const c = React.useContext(SelectCtx);
  if (!c) throw new Error("Select subcomponents must be used within <Select>");
  return c;
};

interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  children: React.ReactNode;
  /** Allow typing a value that isn't in the list (default true). */
  allowCustom?: boolean;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}

const Select: React.FC<SelectProps> = ({
  value: controlled,
  defaultValue,
  onValueChange,
  children,
  allowCustom = true,
  disabled,
  open: openProp,
  onOpenChange,
}) => {
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? "");
  const value = controlled !== undefined ? controlled : internalValue;
  const setValue = (v: string) => {
    if (controlled === undefined) setInternalValue(v);
    onValueChange?.(v);
  };

  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = openProp !== undefined ? openProp : internalOpen;
  const setOpen = (o: boolean) => {
    if (openProp === undefined) setInternalOpen(o);
    onOpenChange?.(o);
  };

  const [search, setSearch] = React.useState("");
  const labelsRef = React.useRef<Map<string, React.ReactNode>>(new Map());
  const [, force] = React.useReducer((x) => x + 1, 0);
  const registerLabel = React.useCallback((v: string, l: React.ReactNode) => {
    if (labelsRef.current.get(v) !== l) {
      labelsRef.current.set(v, l);
      force();
    }
  }, []);

  React.useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  return (
    <SelectCtx.Provider
      value={{
        value,
        onValueChange: setValue,
        open,
        setOpen,
        search,
        setSearch,
        registerLabel,
        labels: labelsRef.current,
        allowCustom,
        disabled,
      }}
    >
      <Popover open={open} onOpenChange={setOpen}>
        {children}
      </Popover>
    </SelectCtx.Provider>
  );
};

const SelectGroup: React.FC<{ children?: React.ReactNode }> = ({ children }) => <>{children}</>;

interface SelectValueProps {
  placeholder?: string;
  className?: string;
}
const SelectValue: React.FC<SelectValueProps> = ({ placeholder, className }) => {
  const ctx = useCtx();
  const display = ctx.value ? ctx.labels.get(ctx.value) ?? ctx.value : null;
  return (
    <span className={cn("truncate", !display && "text-muted-foreground", className)}>
      {display ?? placeholder ?? ""}
    </span>
  );
};

const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => {
  const ctx = useCtx();
  return (
    <PopoverTrigger asChild>
      <button
        ref={ref}
        type="button"
        disabled={ctx.disabled || props.disabled}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
      </button>
    </PopoverTrigger>
  );
});
SelectTrigger.displayName = "SelectTrigger";

interface FilteredChildProps {
  __hide?: boolean;
}

function getItemSearchText(el: React.ReactElement): string {
  const { value, children } = el.props as { value?: string; children?: React.ReactNode };
  const collect = (n: React.ReactNode): string => {
    if (n == null || typeof n === "boolean") return "";
    if (typeof n === "string" || typeof n === "number") return String(n);
    if (Array.isArray(n)) return n.map(collect).join(" ");
    if (React.isValidElement(n)) return collect((n.props as any).children);
    return "";
  };
  return `${value ?? ""} ${collect(children)}`.toLowerCase();
}

function filterChildren(children: React.ReactNode, q: string): { nodes: React.ReactNode; visible: number } {
  let visible = 0;
  const walk = (nodes: React.ReactNode): React.ReactNode => {
    return React.Children.map(nodes, (child) => {
      if (!React.isValidElement(child)) return child;
      const displayName = (child.type as any)?.displayName;
      if (displayName === "SelectItem") {
        if (!q || getItemSearchText(child).includes(q)) {
          visible++;
          return child;
        }
        return React.cloneElement(child as React.ReactElement<FilteredChildProps>, { __hide: true });
      }
      // Recurse into wrappers / groups / fragments
      const kids = (child.props as any)?.children;
      if (kids != null) {
        return React.cloneElement(child, child.props, walk(kids));
      }
      return child;
    });
  };
  const nodes = walk(children);
  return { nodes, visible };
}

const SelectContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { position?: "popper" | "item-aligned" }
>(({ className, children, ...props }, ref) => {
  const ctx = useCtx();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const q = ctx.search.trim().toLowerCase();
  const { nodes, visible } = React.useMemo(() => filterChildren(children, q), [children, q]);

  return (
    <PopoverContent
      ref={ref}
      align="start"
      sideOffset={4}
      className={cn(
        "p-0 w-[var(--radix-popover-trigger-width)] min-w-[12rem] max-h-[min(20rem,60vh)] overflow-hidden",
        className,
      )}
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        setTimeout(() => inputRef.current?.focus(), 0);
      }}
      {...props}
    >
      <div className="flex items-center border-b px-2 gap-1">
        <Search className="h-3.5 w-3.5 shrink-0 opacity-50" />
        <input
          ref={inputRef}
          value={ctx.search}
          onChange={(e) => ctx.setSearch(e.target.value)}
          placeholder="Search or type..."
          className="flex h-9 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (ctx.allowCustom && ctx.search.trim()) {
                ctx.onValueChange(ctx.search.trim());
                ctx.setOpen(false);
              }
            } else if (e.key === "Escape") {
              ctx.setOpen(false);
            }
          }}
        />
        {ctx.search && (
          <button
            type="button"
            onClick={() => ctx.setSearch("")}
            className="text-muted-foreground hover:text-foreground p-0.5"
            tabIndex={-1}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="max-h-[16rem] overflow-y-auto p-1">
        {nodes}
        {visible === 0 && (
          <div className="py-3 px-2 text-center text-xs text-muted-foreground">
            {ctx.allowCustom && ctx.search.trim() ? (
              <button
                type="button"
                className="hover:text-foreground underline-offset-2 hover:underline"
                onClick={() => {
                  ctx.onValueChange(ctx.search.trim());
                  ctx.setOpen(false);
                }}
              >
                Use “{ctx.search.trim()}”
              </button>
            ) : (
              "No results"
            )}
          </div>
        )}
      </div>
    </PopoverContent>
  );
});
SelectContent.displayName = "SelectContent";

interface SelectItemProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> {
  value: string;
  disabled?: boolean;
  __hide?: boolean;
}
const SelectItem = React.forwardRef<HTMLDivElement, SelectItemProps>(
  ({ value, children, disabled, __hide, className, ...props }, ref) => {
    const ctx = useCtx();
    React.useEffect(() => {
      ctx.registerLabel(value, children);
    }, [value, children, ctx]);
    if (__hide) return null;
    const selected = ctx.value === value;
    return (
      <div
        ref={ref}
        role="option"
        aria-selected={selected}
        data-disabled={disabled || undefined}
        className={cn(
          "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none",
          "hover:bg-accent hover:text-accent-foreground",
          selected && "bg-accent/40",
          disabled && "pointer-events-none opacity-50",
          className,
        )}
        onClick={() => {
          if (disabled) return;
          ctx.onValueChange(value);
          ctx.setOpen(false);
        }}
        {...props}
      >
        {selected && (
          <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
            <Check className="h-4 w-4" />
          </span>
        )}
        <span className="truncate">{children}</span>
      </div>
    );
  },
);
SelectItem.displayName = "SelectItem";

const SelectLabel: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn("py-1.5 pl-8 pr-2 text-xs font-semibold text-muted-foreground", className)} {...props} />
);
SelectLabel.displayName = "SelectLabel";

const SelectSeparator: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
);
SelectSeparator.displayName = "SelectSeparator";

// No-op shims to preserve old API surface
const SelectScrollUpButton: React.FC = () => null;
const SelectScrollDownButton: React.FC = () => null;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
