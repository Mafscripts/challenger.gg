export const commerceUnavailableMessage = (
  'Purchases are temporarily unavailable during public testing. Credits and funds can only be granted by Topfragg staff.'
);

export const publicCommerceEnabled = (
  String(Deno.env.get('PUBLIC_COMMERCE_ENABLED') || '').toLowerCase() === 'true'
);

export const commercePausedResponse = () => (
  publicCommerceEnabled
    ? null
    : Response.json({
      error: commerceUnavailableMessage,
      code: 'PUBLIC_COMMERCE_DISABLED',
    }, { status: 503 })
);
