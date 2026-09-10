import * as React from "react";
import { format, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateRangePickerProps {
  from: string; // yyyy-MM-dd or ''
  to: string;   // yyyy-MM-dd or ''
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  className?: string;
  align?: "start" | "center" | "end";
  size?: "sm" | "default";
}

export function DateRangePicker({
  from,
  to,
  onFromChange,
  onToChange,
  className,
  align = "start",
  size = "default",
}: DateRangePickerProps) {
  const fromDate = from ? parse(from, "yyyy-MM-dd", new Date()) : undefined;
  const toDate = to ? parse(to, "yyyy-MM-dd", new Date()) : undefined;

  const selected: DateRange | undefined =
    fromDate || toDate ? { from: fromDate, to: toDate } : undefined;

  const handleSelect = (range: DateRange | undefined) => {
    onFromChange(range?.from ? format(range.from, "yyyy-MM-dd") : "");
    onToChange(range?.to ? format(range.to, "yyyy-MM-dd") : "");
  };

  const isSmall = size === "sm";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size={isSmall ? "sm" : "default"}
          className={cn(
            "justify-start text-left font-normal",
            !from && !to && "text-muted-foreground",
            isSmall ? "h-8 text-xs" : "",
            className
          )}
        >
          <CalendarIcon className={cn("mr-2", isSmall ? "h-3 w-3" : "h-4 w-4")} />
          {from && to ? (
            <>
              {format(parse(from, "yyyy-MM-dd", new Date()), "dd/MM/yyyy")} –{" "}
              {format(parse(to, "yyyy-MM-dd", new Date()), "dd/MM/yyyy")}
            </>
          ) : from ? (
            <>
              {format(parse(from, "yyyy-MM-dd", new Date()), "dd/MM/yyyy")} – …
            </>
          ) : (
            <span>Pick date range</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <Calendar
          mode="range"
          selected={selected}
          onSelect={handleSelect}
          numberOfMonths={2}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}
