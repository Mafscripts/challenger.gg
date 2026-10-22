import 'dotenv/config';
import { REST, Routes, EmbedBuilder } from 'discord.js';
import { discordEnvironment, TOPFRAGG_COLORS } from '../discord/config.js';
import { mw4FreeEightsRules } from '../src/lib/mw4FreeEightsRules.js';
import { readFile, writeFile } from 'node:fs/promises';

const receiptPath = new URL('./mw4-live-announcement-receipts.json', import.meta.url);
const receipts = JSON.parse(await readFile(receiptPath, 'utf8').catch(() => '{}'));
const config = discordEnvironment();
const rest = new REST({ version: '10', timeout: 20000, retries: 0 }).setToken(config.token);
try {
  const channels = await rest.get(Routes.guildChannels(config.guildId));
  const targets = ['announcements', 'general'].map(name => {
    const found = channels.filter(channel => [0, 5].includes(channel.type) && (channel.name === name || channel.name.endsWith(`・${name}`) || channel.name.endsWith(`·${name}`)));
    if (found.length !== 1) throw new Error(`Expected one ${name} channel; found ${found.length}`);
    return found[0];
  });
  const embed = new EmbedBuilder().setColor(TOPFRAGG_COLORS.cyan)
    .setTitle('MW4 FREE 8s IS LIVE — TOPFRAGG RULES')
    .setDescription('MW4 Free 8s is now live and ready to play on **TopFragg**!\n\nJump into a lobby, squad up and compete. Before you play, check the new **MW4 Free 8s rules** below.\n\n**Modes:** Hardpoint · Hijacked · Search & Destroy\n**MW4 CDL:** Best of 3 using TopFragg rules.')
    .addFields(mw4FreeEightsRules.map(rule => ({ name: rule.label, value: rule.items ? rule.items.map(item => `• ${item}`).join('\n') : rule.text })))
    .addFields({ name: 'Ready to play?', value: '[Play MW4 Free 8s](https://topfragg.gg/ranked/8s?game=mw4)\n[Read the full MW4 Free 8s rules](https://topfragg.gg/rules#mw4-free-8s)\nSign up at [TopFragg.gg](https://topfragg.gg/) if you haven’t already, then connect your Discord account. Rules are also linked in your match room.' })
    .setFooter({ text: 'TOPFRAGG.GG • These loadout restrictions apply to MW4 Free 8s only.' }).setTimestamp();
  for (const channel of targets) {
    if (receipts[channel.id]) { console.log(JSON.stringify({ channel: channel.name, ...receipts[channel.id], existing: true })); continue; }
    const message = await rest.post(Routes.channelMessages(channel.id), { body: { embeds: [embed.toJSON()], allowed_mentions: { parse: [] }, nonce: `mw4live${channel.id}`.slice(0,25), enforce_nonce: true } });
    receipts[channel.id] = { id: message.id, url: `https://discord.com/channels/${config.guildId}/${channel.id}/${message.id}` };
    await writeFile(receiptPath, JSON.stringify(receipts, null, 2));
    console.log(JSON.stringify({ channel: channel.name, ...receipts[channel.id] }));
  }
} catch (error) {
  console.error(JSON.stringify({ error: error.message, code: error.code, status: error.status }));
  process.exitCode = 1;
}
