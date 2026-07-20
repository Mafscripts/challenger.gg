import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { commercePausedResponse } from '../_shared/commerce.ts';

const creditPacks = {
  starter: { name: "Starter Pack - 5 Credits", credits: 5, price: "5.00" },
  pro: { name: "Pro Pack - 10 Credits", credits: 10, price: "10.00" },
  mega: { name: "Mega Pack - 35 Credits", credits: 35, price: "25.00" },
  ultimate: { name: "Ultimate Pack - 70 Credits", credits: 70, price: "50.00" },
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const pausedResponse = commercePausedResponse();
    if (pausedResponse) return pausedResponse;

    const body = await req.json();
    const pack = creditPacks[body.pack_id];
    if (!pack) return Response.json({ error: 'Invalid credit pack' }, { status: 400 });

    const origin = req.headers.get("Origin") || "https://app.base44.com";

    const response = await fetch(
      "https://www.wixapis.com/payments/platform/v1/checkout-sessions/construct",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": Deno.env.get("WIX_PAYMENTS_API_KEY"),
          "wix-site-id": Deno.env.get("WIX_PAYMENTS_SITE_ID"),
        },
        body: JSON.stringify({
          cart: {
            items: [{
              name: pack.name,
              quantity: 1,
              price: pack.price,
            }],
          },
          callbackUrls: {
            postFlowUrl: origin,
            thankYouPageUrl: `${origin}/thank-you`,
          },
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      console.error("Wix checkout error:", JSON.stringify(data));
      return Response.json({ error: data.message || "Failed to create checkout" }, { status: 500 });
    }

    const checkoutId = data.checkoutSession.id;
    const redirectUrl = data.checkoutSession.redirectUrl;

    // Store pending purchase so the webhook can match it to the user
    await base44.asServiceRole.entities.CreditPurchase.create({
      user_id: user.id,
      checkout_id: checkoutId,
      credits: pack.credits,
      price: pack.price,
      status: "pending",
    });

    return Response.json({ checkout_url: redirectUrl });
  } catch (error) {
    console.error("Checkout error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
