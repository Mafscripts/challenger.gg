import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { commercePausedResponse } from '../_shared/commerce.ts';

const playerName = (user) => user.display_name || user.full_name || user.email || 'Unnamed player';

const normalizeCategory = (category) => {
  const value = String(category || '').toLowerCase();
  const map = {
    'knife skins': 'knife',
    'weapon skins': 'weapon_skin',
    'calling cards': 'cosmetic',
    'tournament knives': 'knife',
    'rank cards': 'cosmetic',
    trophies: 'cosmetic',
    badges: 'patch',
    titles: 'cosmetic',
    avatars: 'agent',
    banners: 'cosmetic',
    frames: 'cosmetic',
    emblems: 'patch',
  };
  return map[value] || value || 'cosmetic';
};

const normalizeRarity = (rarity) => {
  const value = String(rarity || '').toLowerCase();
  return value === 'uncommon' ? 'common' : value || 'common';
};

const hasActivePremium = (user) => (
  user.is_premium === true && (!user.premium_expires || new Date(user.premium_expires) > new Date())
);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const pausedResponse = commercePausedResponse();
    if (pausedResponse) return pausedResponse;

    const body = await req.json();
    const itemId = String(body.item_id || '');
    if (!itemId || !body.item_name) {
      return Response.json({ error: 'Missing item details' }, { status: 400 });
    }

    let marketplaceItem = null;
    try {
      marketplaceItem = await base44.asServiceRole.entities.MarketplaceItem.get(itemId);
    } catch (_error) {
      marketplaceItem = null;
    }

    if (marketplaceItem?.is_premium_only && !hasActivePremium(user)) {
      return Response.json({ error: 'Premium membership required for this item' }, { status: 403 });
    }

    if (marketplaceItem && marketplaceItem.is_active === false) {
      return Response.json({ error: 'Item is not available' }, { status: 400 });
    }

    if (marketplaceItem && marketplaceItem.stock_quantity === 0) {
      return Response.json({ error: 'Item is out of stock' }, { status: 400 });
    }

    const itemName = marketplaceItem?.name || body.item_name;
    const itemImage = marketplaceItem?.image_url || body.item_image || '';
    const itemRarity = normalizeRarity(marketplaceItem?.rarity || body.item_rarity || 'common');
    const itemCategory = normalizeCategory(marketplaceItem?.category || body.item_category || 'cosmetic');
    const creditCost = Number(marketplaceItem?.price_credits ?? body.credit_cost ?? 0);

    if (!Number.isFinite(creditCost) || creditCost <= 0) {
      return Response.json({ error: 'Invalid credit cost' }, { status: 400 });
    }

    const existing = await base44.asServiceRole.entities.UserInventory.filter({
      user_id: user.id,
      item_id: itemId,
    });
    if (existing.length > 0) {
      return Response.json({ error: 'You already own this item' }, { status: 400 });
    }

    const currentCredits = user.credits || 0;
    if (currentCredits < creditCost) {
      return Response.json({
        error: 'Not enough credits',
        credits_needed: creditCost,
        credits_available: currentCredits,
      }, { status: 400 });
    }

    const remainingCredits = currentCredits - creditCost;

    await base44.asServiceRole.entities.User.update(user.id, {
      credits: remainingCredits,
    });

    const inventory = await base44.asServiceRole.entities.UserInventory.create({
      user_id: user.id,
      item_id: itemId,
      item_name: itemName,
      item_image: itemImage,
      item_rarity: itemRarity,
      item_category: itemCategory,
      purchase_method: 'credits',
      price_paid: creditCost,
      is_equipped: false,
      is_tradable: true,
      acquired_date: new Date().toISOString(),
    });

    await base44.asServiceRole.entities.Inventory.create({
      user_id: user.id,
      item_id: itemId,
      item_name: itemName,
      item_image: itemImage,
      item_rarity: itemRarity,
      item_category: itemCategory,
      purchase_method: 'credits',
      price_paid: creditCost,
      equipped: false,
    });

    const purchase = await base44.asServiceRole.entities.Purchase.create({
      user_id: user.id,
      item_id: itemId,
      item_name: itemName,
      quantity: 1,
      price_paid: creditCost,
      payment_method: 'credits',
      transaction_id: inventory.id,
      status: 'completed',
      created_date: new Date().toISOString(),
    });

    await base44.asServiceRole.entities.CreditTransaction.create({
      user_id: user.id,
      type: 'spend',
      amount: -creditCost,
      balance_before: currentCredits,
      balance_after: remainingCredits,
      description: `Purchased ${itemName}`,
      reference_id: purchase.id,
      reference_type: 'Purchase',
      created_date: new Date().toISOString(),
    });

    if (marketplaceItem && marketplaceItem.stock_quantity > 0) {
      await base44.asServiceRole.entities.MarketplaceItem.update(itemId, {
        stock_quantity: marketplaceItem.stock_quantity - 1,
      });
    }

    await base44.asServiceRole.entities.Notification.create({
      user_id: user.id,
      type: 'marketplace',
      title: 'Purchase Complete',
      message: `${itemName} was added to ${playerName(user)}'s inventory.`,
      is_read: false,
      action_url: '/inventory',
      related_entity_id: inventory.id,
      related_entity_type: 'UserInventory',
      created_date: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      remaining_credits: remainingCredits,
      inventory_id: inventory.id,
      purchase_id: purchase.id,
    });
  } catch (error) {
    console.error('Buy with credits error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
