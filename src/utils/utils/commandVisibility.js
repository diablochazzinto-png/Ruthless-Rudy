import { PermissionFlagsBits } from 'discord.js';
import { isBotOwner } from '../config/bot.js';
import { getGuildConfig } from '../services/config/guildConfig.js';

export async function getHiddenCommands(client, guildId) {
  if (!guildId) return [];
  const config = await getGuildConfig(client, guildId);
  const hidden = config?.commandVisibility?.hiddenCommands;
  return Array.isArray(hidden) ? hidden : [];
}

export function canBypassCommandVisibility(interaction) {
  return isBotOwner(interaction?.user?.id) ||
    Boolean(interaction?.memberPermissions?.has(PermissionFlagsBits.Administrator)) ||
    Boolean(interaction?.memberPermissions?.has(PermissionFlagsBits.ManageGuild));
}

export async function isHiddenFromMember(client, guildId, commandName) {
  const hidden = await getHiddenCommands(client, guildId);
  return hidden.includes(commandName);
}
