import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const newName = (body.new_name || '').trim();

    if (newName.length < 2 || newName.length > 24) {
      return Response.json({ error: 'Display name must be 2–24 characters.' }, { status: 400 });
    }

    const isPremium = user.is_premium === true && (!user.premium_expires || new Date(user.premium_expires) > new Date());
    const currentCredits = user.credits || 0;
    const NAME_CHANGE_COST = 5;

    if (!isPremium && currentCredits < NAME_CHANGE_COST) {
      return Response.json({
        error: `Insufficient credits. Name change costs ${NAME_CHANGE_COST} credits.`,
        needs_credits: true,
        cost: NAME_CHANGE_COST,
        balance: currentCredits
      }, { status: 402 });
    }

    const updateData = { display_name: newName };
    if (!isPremium) {
      updateData.credits = currentCredits - NAME_CHANGE_COST;
    }

    await base44.asServiceRole.entities.User.update(user.id, updateData);

    if (!isPremium) {
      await base44.asServiceRole.entities.CreditTransaction.create({
        user_id: user.id,
        type: 'spend',
        amount: -NAME_CHANGE_COST,
        balance_before: currentCredits,
        balance_after: currentCredits - NAME_CHANGE_COST,
        description: 'Display name change',
        reference_type: 'User',
        created_date: new Date().toISOString(),
      });
    }

    return Response.json({
      success: true,
      display_name: newName,
      credits: updateData.credits !== undefined ? updateData.credits : currentCredits,
      cost_charged: isPremium ? 0 : NAME_CHANGE_COST
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
