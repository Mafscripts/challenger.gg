import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { commercePausedResponse } from '../_shared/commerce.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const pausedResponse = commercePausedResponse();
    if (pausedResponse) return pausedResponse;

    return Response.json({
      error: 'Direct wallet deposits are disabled. Deposits must be completed through a verified payment provider webhook.',
      providers_ready: ['stripe', 'paypal', 'ideal', 'revolut'],
    }, { status: 400 });
  } catch (error) {
    console.error('Deposit guard error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
