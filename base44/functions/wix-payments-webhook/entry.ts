import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import jwt from 'npm:jsonwebtoken@9.0.2';

Deno.serve(async (req) => {
  try {
    const publicKey = Deno.env.get("WIX_PAYMENTS_WEBHOOK_PUBLIC_KEY");
    if (!publicKey) {
      console.error("Missing WIX_PAYMENTS_WEBHOOK_PUBLIC_KEY");
      return Response.json({ error: "Webhook not configured" }, { status: 500 });
    }

    const requestBody = await req.text();

    // Step 1: Verify JWT signature — fail closed if invalid
    const rawPayload = jwt.verify(requestBody, publicKey, { algorithms: ["RS256"] });

    // Step 2: Parse double-nested JSON
    const event = JSON.parse(rawPayload.data);
    const eventData = JSON.parse(event.data);

    if (event.eventType === "wix.ecom.v1.order_approved") {
      const order = eventData.actionEvent.body.order;
      const checkoutId = order.checkoutId;

      const base44 = createClientFromRequest(req);

      // Find the pending purchase matching this checkout
      const purchases = await base44.asServiceRole.entities.CreditPurchase.filter({
        checkout_id: checkoutId,
        status: "pending",
      });

      if (purchases.length > 0) {
        const purchase = purchases[0];

        // Add credits to the user
        const user = await base44.asServiceRole.entities.User.get(purchase.user_id);
        if (user) {
          const currentCredits = user.credits || 0;
          const nextCredits = currentCredits + purchase.credits;
          await base44.asServiceRole.entities.User.update(user.id, {
            credits: nextCredits,
          });

          await base44.asServiceRole.entities.CreditTransaction.create({
            user_id: user.id,
            type: "purchase",
            amount: purchase.credits,
            balance_before: currentCredits,
            balance_after: nextCredits,
            description: `Credit purchase - ${purchase.credits} Credits`,
            reference_id: purchase.id,
            reference_type: "CreditPurchase",
            created_date: new Date().toISOString(),
          });
        }

        // Mark purchase as completed (idempotent — duplicate webhooks won't double-credit)
        await base44.asServiceRole.entities.CreditPurchase.update(purchase.id, {
          status: "completed",
        });
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Webhook error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
