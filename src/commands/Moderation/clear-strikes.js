
import {
    EmbedBuilder,
    PermissionsBitField
} from 'discord.js';

import { clearStrikes } from '../services/moderation/strikeSystem.js';

export default {
    name: 'clear-strikes',
    aliases: ['clearstrikes', 'reset-strikes'],
    description: 'Clear all strikes from a member.',
    usage: 'clear-strikes @member',

    async execute(message, args, client) {
        // Check moderator permissions
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return message.reply({
                content: 'You need **Manage Server** permission to use this command.',
                allowedMentions: { repliedUser: false }
            });
        }

        // Get the mentioned member
        const target =
            message.mentions.members.first() ||
            await message.guild.members.fetch(args[0]).catch(() => null);

        if (!target) {
            return message.reply({
                content: 'Please mention a member or provide their user ID.\nExample: `!clear-strikes @member`',
                allowedMentions: { repliedUser: false }
            });
        }

        if (target.user.bot) {
            return message.reply('You cannot clear strikes for a bot.');
        }

        // Clear the member's strikes
        const result = await clearStrikes(client, message.guild.id, target.id);

        if (!result) {
            return message.reply('Something went wrong while clearing this member’s strikes.');
        }

        // Confirmation embed
        const embed = new EmbedBuilder()
            .setColor(0x8B0000)
            .setTitle('Strikes Cleared')
            .setDescription(
                `All strikes belonging to **${target.user.tag}** have been successfully cleared.`
            )
            .addFields(
                {
                    name: 'Member',
                    value: `${target}`,
                    inline: true
                },
                {
                    name: 'Previous Strikes',
                    value: `${result.previousCount ?? 0}`,
                    inline: true
                },
                {
                    name: 'Current Strikes',
                    value: '0',
                    inline: true
                },
                {
                    name: 'Cleared By',
                    value: `${message.author}`,
                    inline: true
                }
            )
            .setThumbnail(target.user.displayAvatarURL({ size: 256 }))
            .setFooter({ text: 'IRV Moderation System' })
            .setTimestamp();

        return message.reply({
            embeds: [embed],
            allowedMentions: { repliedUser: false }
        });
    }
};
