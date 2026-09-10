import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

// Maps document type codes to their specific metadata fields
const EXPENSE_FIELD_CONFIGS: Record<string, { key: string; label: string; type: 'text' | 'number' | 'textarea' }[]> = {
  ELC: [
    { key: 'meter_number', label: 'Meter Number', type: 'text' },
    { key: 'units_consumed', label: 'Units Consumed', type: 'number' },
    { key: 'rate_per_unit', label: 'Rate per Unit (GH₵)', type: 'number' },
  ],
  WTR: [
    { key: 'meter_number', label: 'Meter Number', type: 'text' },
    { key: 'units_consumed', label: 'Units Consumed', type: 'number' },
    { key: 'rate_per_unit', label: 'Rate per Unit (GH₵)', type: 'number' },
  ],
  RNT: [
    { key: 'property_name', label: 'Property Name', type: 'text' },
    { key: 'landlord_name', label: 'Landlord Name', type: 'text' },
    { key: 'rental_period', label: 'Rental Period', type: 'text' },
  ],
  MNT: [
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'service_provider', label: 'Service Provider', type: 'text' },
  ],
  TRN: [
    { key: 'transport_type', label: 'Transport Type', type: 'text' },
    { key: 'origin', label: 'Origin', type: 'text' },
    { key: 'destination', label: 'Destination', type: 'text' },
  ],
  PAY: [
    { key: 'employee_id', label: 'Employee ID', type: 'text' },
    { key: 'salary_amount', label: 'Salary Amount (GH₵)', type: 'number' },
    { key: 'bonus', label: 'Bonus (GH₵)', type: 'number' },
    { key: 'deductions', label: 'Deductions (GH₵)', type: 'number' },
  ],
  MIS: [
    { key: 'description', label: 'Description', type: 'textarea' },
  ],
};

interface Props {
  typeCode: string;
  metadata: Record<string, any>;
  onChange: (metadata: Record<string, any>) => void;
  readOnly?: boolean;
}

export function ExpenseFields({ typeCode, metadata, onChange, readOnly = false }: Props) {
  const fields = EXPENSE_FIELD_CONFIGS[typeCode];
  if (!fields || fields.length === 0) return null;

  const handleChange = (key: string, value: string | number) => {
    onChange({ ...metadata, [key]: value });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Type-Specific Details
      </p>
      {fields.map(field => (
        <div key={field.key}>
          <Label className="text-xs">{field.label}</Label>
          {field.type === 'textarea' ? (
            <Textarea
              rows={2}
              placeholder={field.label}
              value={metadata[field.key] || ''}
              onChange={e => handleChange(field.key, e.target.value)}
              readOnly={readOnly}
              className={readOnly ? 'bg-muted' : ''}
            />
          ) : (
            <Input
              type={field.type}
              placeholder={field.label}
              className={`h-9 ${readOnly ? 'bg-muted' : ''}`}
              value={metadata[field.key] ?? ''}
              onChange={e => handleChange(
                field.key,
                field.type === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value
              )}
              readOnly={readOnly}
              step={field.type === 'number' ? '0.01' : undefined}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function getExpenseFieldConfig(typeCode: string) {
  return EXPENSE_FIELD_CONFIGS[typeCode] || [];
}

export function hasExpenseFields(typeCode: string) {
  return !!EXPENSE_FIELD_CONFIGS[typeCode];
}
