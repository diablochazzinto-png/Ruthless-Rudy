
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
        try {
            // Check permissions
            if (!message.member.permissions.has(
                PermissionsBitField.Flags.ManageGuild
            )) {
                return message.reply({
                    content: 'You need **Manage Server** permission to use this command.',
                    allowedMentions: { repliedUser: false }
                });
            }

            // Find target member
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
                return message.reply({
                    content: 'You cannot clear strikes for a bot.',
                    allowedMentions: { repliedUser: false }
                });
            }

            // Clear strikes
            const result = await clearStrikes(
                client,
                message.guild.id,
                target.id
            );

            if (!result) {
                throw new Error('The strike system returned no result.');
            }

            // Create confirmation embed
            const embed = new EmbedBuilder()
                .setColor(0x8B0000)
                .setTitle('STRIKES CLEARED')
                .setDescription(
                    `All strike records for **${target.user.tag}** have been successfully reset.`
                )
                .addFields(
                    {
                        name: 'Member',
                        value: `${target}`,
                        inline: true
                    },
                    {
                        name: 'Previous Strikes',
                        value: `**${result.previousCount ?? 0}**`,
                        inline: true
                    },
                    {
                        name: 'Current Strikes',
                        value: '**0 / 7**',
                        inline: true
                    },
                    {
                        name: 'Cleared By',
                        value: `${message.author}`,
                        inline: true
                    },
                    {
                        name: 'Strike History',
                        value: 'All previous strike records have been cleared.',
                        inline: false
                    }
                )
                .setThumbnail(
                    target.user.displayAvatarURL({ size: 256 })
                )
                .setFooter({
                    text: 'IRV • Imperium Revenant Empire'
                })
                .setTimestamp();

            return await message.reply({
                embeds: [embed],
                allowedMentions: { repliedUser: false }
            });

        } catch (error) {
            console.error('[IRV CLEAR STRIKES ERROR]', error);

            return message.reply({
                content: 'Failed to clear strikes. Check the bot console for the exact error.',
                allowedMentions: { repliedUser: false }
            });
        }
    }
};
