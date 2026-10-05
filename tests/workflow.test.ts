import assert from 'node:assert/strict';
import test from 'node:test';
import { queueStages, resolveNextStage } from '../services/crm-service/src/workflow.ts';

test('department queues map to the intended lifecycle stage', () => {
  assert.deepEqual(queueStages.marketing, ['new_lead']);
  assert.deepEqual(queueStages['inside-sales'], ['warm_lead']);
  assert.deepEqual(queueStages.ordering, ['closed_won', 'renewal_due']);
  assert.deepEqual(queueStages.delivery, ['awaiting_delivery']);
  assert.deepEqual(queueStages.retention, ['active_customer']);
});

test('customer can move through the primary lifecycle in order', () => {
  assert.equal(resolveNextStage('marketing', 'engage_lead', 'new_lead'), 'warm_lead');
  assert.equal(resolveNextStage('inside-sales', 'qualify', 'warm_lead'), 'qualified');
  assert.equal(resolveNextStage('sales', 'close_won', 'qualified'), 'closed_won');
  assert.equal(resolveNextStage('ordering', 'create_order', 'closed_won'), 'awaiting_delivery');
  assert.equal(resolveNextStage('delivery', 'mark_delivered', 'awaiting_delivery'), 'active_customer');
});

test('invalid department or out-of-order transitions are rejected', () => {
  assert.equal(resolveNextStage('sales', 'close_won', 'warm_lead'), undefined);
  assert.equal(resolveNextStage('marketing', 'qualify', 'warm_lead'), undefined);
  assert.equal(resolveNextStage('delivery', 'create_order', 'closed_won'), undefined);
});

test('retention can route an account back into renewals or marketing', () => {
  assert.equal(resolveNextStage('retention', 'start_renewal', 'active_customer'), 'renewal_due');
  assert.equal(resolveNextStage('retention', 'cross_sell', 'active_customer'), 'new_lead');
  assert.equal(resolveNextStage('ordering', 'create_order', 'renewal_due'), 'awaiting_delivery');
});
