export const queueStages: Record<string, string[]> = {
  marketing: ['new_lead'],
  'inside-sales': ['warm_lead'],
  sales: ['qualified'],
  ordering: ['closed_won', 'renewal_due'],
  delivery: ['awaiting_delivery'],
  retention: ['active_customer'],
};

export const transitions: Record<string, { from: string[]; to: string; department: string }> = {
  engage_lead: { from: ['new_lead'], to: 'warm_lead', department: 'marketing' },
  qualify: { from: ['warm_lead'], to: 'qualified', department: 'inside-sales' },
  disqualify: { from: ['warm_lead', 'qualified'], to: 'closed_lost', department: 'inside-sales' },
  close_won: { from: ['qualified'], to: 'closed_won', department: 'sales' },
  close_lost: { from: ['qualified'], to: 'closed_lost', department: 'sales' },
  create_order: { from: ['closed_won', 'renewal_due'], to: 'awaiting_delivery', department: 'ordering' },
  mark_delivered: { from: ['awaiting_delivery'], to: 'active_customer', department: 'delivery' },
  start_renewal: { from: ['active_customer'], to: 'renewal_due', department: 'retention' },
  cross_sell: { from: ['active_customer'], to: 'new_lead', department: 'retention' },
};

export function resolveNextStage(department: string, action: string, currentStage: string): string | undefined {
  const transition = transitions[action];
  if (!transition || transition.department !== department || !transition.from.includes(currentStage)) return undefined;
  return transition.to;
}
