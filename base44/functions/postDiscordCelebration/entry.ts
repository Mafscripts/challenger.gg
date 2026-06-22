import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const body = await req.json();

    // Build the celebration message
    let title, description, color, createdById;

    if (body.event && body.data) {
      // Called from entity automation
      const entityName = body.event.entity_name;
      const data = body.data;
      createdById = data.created_by_id;

      if (entityName === "TournamentWin") {
        title = "🏆 Major Tournament Victory!";
        description = `**${data.player_name}** just won **${data.tournament_name}**!\nTier: ${data.tournament_tier || "standard"}${data.prize ? ` · Prize: ${data.prize}` : ""}${data.wins_count ? ` · Career Wins: ${data.wins_count}` : ""}`;
        color = 0xf59e0b;
      } else if (entityName === "KnifeUnlock") {
        title = "🗡️ Exclusive Knife Unlocked!";
        description = `**${data.player_name}** unlocked the **${data.knife_name}**!\nRarity: ${(data.rarity || "exclusive").toUpperCase()}${data.wins_required ? ` · Required Wins: ${data.wins_required}` : ""}`;
        color = 0x06b6d4;
      } else {
        return Response.json({ error: "Unknown entity for celebration" }, { status: 400 });
      }
    } else if (body.event_type) {
      // Direct invocation (e.g. test button from Settings)
      if (body.event_type === "tournament_win") {
        title = "🏆 Major Tournament Victory!";
        description = `**${body.player_name}** just won **${body.tournament_name}**!${body.prize ? ` · Prize: ${body.prize}` : ""}`;
        color = 0xf59e0b;
      } else if (body.event_type === "knife_unlock") {
        title = "🗡️ Exclusive Knife Unlocked!";
        description = `**${body.player_name}** unlocked the **${body.knife_name}**!${body.rarity ? ` · Rarity: ${body.rarity.toUpperCase()}` : ""}`;
        color = 0x06b6d4;
      } else if (body.event_type === "test") {
        title = "🔔 Discord Alerts Connected!";
        description = `**${body.player_name || "Unnamed player"}** — your Discord alerts are now active. You'll receive notifications here for tournament wins and exclusive knife unlocks.`;
        color = 0x06b6d4;
      } else {
        return Response.json({ error: "Unknown event type" }, { status: 400 });
      }
    } else {
      return Response.json({ error: "Missing event data" }, { status: 400 });
    }

    const embed = {
      username: "Challenger.gg Alerts",
      embeds: [{
        title,
        description,
        color,
        footer: { text: "Challenger.gg · Community Alerts" },
        timestamp: new Date().toISOString(),
      }],
    };

    const results = { success: true, posted: title, sentTo: [] };

    // 1. Community webhook (if configured as env secret)
    const communityWebhook = Deno.env.get("DISCORD_WEBHOOK_URL");
    if (communityWebhook) {
      try {
        const res = await fetch(communityWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(embed),
        });
        if (res.ok) results.sentTo.push("community");
      } catch (e) { /* community webhook failure is non-fatal */ }
    }

    // 2. Winner's personal webhook (automation call with created_by_id)
    if (createdById) {
      try {
        const base44 = createClientFromRequest(req);
        const users = await base44.asServiceRole.entities.User.filter({ id: createdById });
        const user = users[0];
        if (user && user.discord_alerts_enabled && user.discord_webhook_url) {
          const res = await fetch(user.discord_webhook_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(embed),
          });
          if (res.ok) results.sentTo.push("personal");
        }
      } catch (e) { /* personal webhook lookup failure is non-fatal */ }
    }

    // 3. Explicit webhook from direct call (test button)
    if (body.webhook_url) {
      try {
        const res = await fetch(body.webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(embed),
        });
        if (res.ok) results.sentTo.push("test");
      } catch (e) { /* test webhook failure is non-fatal */ }
    }

    if (results.sentTo.length === 0) {
      return Response.json({ error: "No Discord webhook configured (community or personal)", status: "no_webhook" }, { status: 500 });
    }

    return Response.json(results);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
