/** Exact single-test activation metadata. Source defaults remain closed. No provider or DB mutations. */
export const WORKFLOW_TEST_BINDING_DEFAULTS = Object.freeze({
  GELATO_WORKFLOW_TEST_SUBMISSION_ENABLED: 'false',
  GELATO_WORKFLOW_TEST_SUBMISSION_ORDER_ID: '',
  GELATO_WORKFLOW_TEST_SUBMISSION_ACCOUNT_SHA256: '',
  GELATO_WORKFLOW_TEST_SUBMISSION_EXPIRES_AT: '',
  GELATO_ORDINARY_RELEASE_ENABLED: 'false',
  GELATO_ORDINARY_RELEASE_ACCOUNT_SHA256: '',
  GELATO_ORDINARY_RELEASE_APPROVERS: '',
  GELATO_ORDINARY_RELEASE_TEST_ORDER_ID: '',
  GELATO_ORDINARY_RELEASE_TEST_EXPIRES_AT: '',
});
const fail = () => { throw Error('Invalid exact workflow-test runtime settings'); };
export function workflowTestBindingValues(settings) {
  const values = {};
  for (const [name, fallback] of Object.entries(WORKFLOW_TEST_BINDING_DEFAULTS)) {
    const entry = settings[name];
    if (entry === undefined) values[name] = fallback;
    else { if (!entry || entry.type !== 'plain_text' || typeof entry.value !== 'string') fail(); values[name] = entry.value; }
  }
  validateWorkflowTestBindings(values);
  return values;
}
export function validateWorkflowTestBindings(values) {
  if (Object.keys(values).sort().join() !== Object.keys(WORKFLOW_TEST_BINDING_DEFAULTS).sort().join()) fail();
  for (const [key,value] of Object.entries(values)) {
    if (typeof value !== 'string' || value.length > 2000 || /[\r\n\x00]/.test(value)) fail();
    if (key.endsWith('_ENABLED') && !['true','false'].includes(value)) fail();
    if (key.endsWith('_ORDER_ID') && value && !/^[A-Za-z0-9_-]{1,200}$/.test(value)) fail();
    if (key.endsWith('_SHA256') && value && !/^[a-f0-9]{64}$/.test(value)) fail();
    if (key.endsWith('_EXPIRES_AT') && value && !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)) fail();
  }
  const approvers = values.GELATO_ORDINARY_RELEASE_APPROVERS;
  if (approvers && !['jeff@littleherolabs.com','john@littleherolabs.com'].includes(approvers)) fail();
  for (const [flag, order, account, expiry] of [
    ['GELATO_WORKFLOW_TEST_SUBMISSION_ENABLED','GELATO_WORKFLOW_TEST_SUBMISSION_ORDER_ID','GELATO_WORKFLOW_TEST_SUBMISSION_ACCOUNT_SHA256','GELATO_WORKFLOW_TEST_SUBMISSION_EXPIRES_AT'],
    ['GELATO_ORDINARY_RELEASE_ENABLED','GELATO_ORDINARY_RELEASE_TEST_ORDER_ID','GELATO_ORDINARY_RELEASE_ACCOUNT_SHA256','GELATO_ORDINARY_RELEASE_TEST_EXPIRES_AT'],
  ]) {
    if(values[flag] === 'true') {
      const at=Date.parse(values[expiry]);
      if(!values[order] || !values[account] || !Number.isFinite(at) || at<=Date.now() || at>Date.now()+86400000) fail();
    }
  }
  if(values.GELATO_ORDINARY_RELEASE_ENABLED==='true' && !approvers) fail();
  if(values.GELATO_WORKFLOW_TEST_SUBMISSION_ENABLED==='true' && values.GELATO_ORDINARY_RELEASE_ENABLED==='true' &&
    (values.GELATO_WORKFLOW_TEST_SUBMISSION_ORDER_ID!==values.GELATO_ORDINARY_RELEASE_TEST_ORDER_ID ||
     values.GELATO_WORKFLOW_TEST_SUBMISSION_ACCOUNT_SHA256!==values.GELATO_ORDINARY_RELEASE_ACCOUNT_SHA256)) fail();
}
export function applyWorkflowTestBindings(text, values=WORKFLOW_TEST_BINDING_DEFAULTS) {
  validateWorkflowTestBindings(values);
  const start=text.indexOf('[vars]'),end=text.indexOf('\n[',start+1);
  if(start<0)fail();
  for(const [name,fallback] of Object.entries(WORKFLOW_TEST_BINDING_DEFAULTS)) {
    const assignments=[...text.matchAll(new RegExp('^[^#\\r\\n]*\\b'+name+'\\b[^=\\r\\n]*=.*$','gm'))];
    if(assignments.length!==1 || assignments[0].index<start || (end>=0&&assignments[0].index>=end) || assignments[0][0]!==name+' = '+JSON.stringify(fallback))fail();
    text=text.replace(assignments[0][0],name+' = '+JSON.stringify(values[name]));
  }
  return text;
}
