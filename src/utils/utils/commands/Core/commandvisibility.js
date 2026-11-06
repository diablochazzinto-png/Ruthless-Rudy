import { SlashCommandBuilder } from 'discord.js';
import { isBotOwner } from '../../config/bot.js';
import { updateGuildConfig } from '../../services/config/guildConfig.js';

export default {
  category: 'Core',
  data: new SlashCommandBuilder()
    .setName('commandvisibility')
    .setDescription('Manage command visibility (bot owner only)')
    .addSubcommand(sub => sub
      .setName('hide')
      .setDescription('Hide a command from regular members')
      .addStringOption(option => option
        .setName('command')
        .setDescription('Command to hide')
        .setRequired(true)
        .setAutocomplete(true)))
    .addSubcommand(sub => sub
      .setName('show')
      .setDescription('Show a hidden command')
      .addStringOption(option => option
        .setName('command')
        .setDescription('Command to show')
        .setRequired(true)
        .setAutocomplete(true)))
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List hidden commands')),

  async autocomplete(interaction, client) {
    if (!isBotOwner(interaction.user.id)) return interaction.respond([]);

    const focused = interaction.options.getFocused().toLowerCase();
    const names = [...client.commands.keys()]
      .filter(name => !['commandvisibility', 'help'].includes(name))
      .filter(name => name.toLowerCase().includes(focused))
      .slice(0, 25);

    await interaction.respond(names.map(name => ({
      name: `/${name}`,
      value: name
    })));
  },

  async execute(interaction, guildConfig, client) {
    if (!isBotOwner(interaction.user.id)) {
      return interaction.reply({
        content: 'Only the bot owner can manage command visibility.',
        ephemeral: true
      });
    }

    if (!interaction.guildId) {
      return interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true
      });
    }

    const action = interaction.options.getSubcommand();
    const current = Array.isArray(guildConfig?.commandVisibility?.hiddenCommands)
      ? [...guildConfig.commandVisibility.hiddenCommands]
      : [];

    if (action === 'list') {
      return interaction.reply({
        content: current.length
          ? `**Hidden commands:**\n${current.map(name => `• /${name}`).join('\n')}`
          : 'No commands are currently hidden.',
        ephemeral: true
      });
    }

    const name = interaction.options.getString('command', true);

    if (!client.commands.has(name)) {
      return interaction.reply({
        content: `Command /${name} was not found.`,
        ephemeral: true
      });
    }

    if (['help', 'commandvisibility'].includes(name)) {
      return interaction.reply({
        content: `/${name} cannot be hidden.`,
        ephemeral: true
      });
    }

    const wasHidden = current.includes(name);

    if (action === 'hide' && !wasHidden) current.push(name);
    if (action === 'show' && wasHidden) {
      current.splice(current.indexOf(name), 1);
    }

    await updateGuildConfig(
      client,
      interaction.guildId,
      {
        commandVisibility: {
          ...(guildConfig?.commandVisibility || {}),
          hiddenCommands: current
        }
      },
      {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        commandName: 'commandvisibility'
      }
    );

    return interaction.reply({
      content: action === 'hide'
        ? `🔒 /${name} is now hidden from regular members.`
        : `🔓 /${name} is now visible to regular members.`,
      ephemeral: true
    });
  }
};
