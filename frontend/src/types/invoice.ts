export type InvoiceStatus = 'paid' | 'unpaid' | 'overdue' | 'processing';

export interface InvoiceActions {
  can_mark_as_paid: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export interface InvoiceBreakdown {
  base_rent: number;
  late_fee: number;
  total_due: number;
  payment_method: string;
}

export interface TimelineEvent {
  timestamp: string;
  event: string;
  description: string;
}

export interface Invoice {
  id: string;
  lease_id: string;
  due_date: string;
  amount_due: number;
  late_fee: number;
  status: InvoiceStatus;
  transfer_id?: string;
  created_at: string;
  actions: InvoiceActions;
  active_view: 'payment_timeline' | 'invoice_breakdown';
  timeline: TimelineEvent[];
  breakdown: InvoiceBreakdown;
}
