
import {
    EmbedBuilder,
    PermissionsBitField,
    ApplicationCommandOptionType
} from 'discord.js';

import {
    clearStrikes
} from '../services/moderation/strikeSystem.js';

export default {
    name: 'clear-strikes',

    data: {
        name: 'clear-strikes',
        description: 'Clear all strikes from a member.',
        options: [
            {
                name: 'member',
                description: 'The member whose strikes you want to clear.',
                type: ApplicationCommandOptionType.User,
                required: true
            }
        ]
    },

    legacyPrefix: true,

    aliases: [
        'clearstrikes',
        'reset-strikes'
    ],

    description: 'Clear all strikes from a member.',

    usage: 'clear-strikes @member',

    async execute(message, args, client) {
        try {
            if (!message.guild || !message.member) {
                return message.reply('This command can only be used in a server.');
            }

            if (!message.member.permissions.has(
                PermissionsBitField.Flags.ManageGuild
            )) {
                return message.reply({
                    content: 'You need **Manage Server** permission to use this command.',
                    allowedMentions: {
                        repliedUser: false
                    }
                });
            }

            const input = args?.[0];

            if (!input) {
                return message.reply({
                    content: 'Please mention a member or provide their user ID.\nExample: `!clear-strikes @member`',
                    allowedMentions: {
                        repliedUser: false
                    }
                });
            }

            const mentionMatch = input.match(/^<@!?(\d+)>$/);
            const userId = mentionMatch ? mentionMatch[1] : input;

            const target = await message.guild.members
                .fetch(userId)
                .catch(() => null);

            if (!target) {
                return message.reply({
                    content: 'I could not find that member.',
                    allowedMentions: {
                        repliedUser: false
                    }
                });
            }

            if (target.user.bot) {
                return message.reply({
                    content: 'You cannot clear strikes for a bot.',
                    allowedMentions: {
                        repliedUser: false
                    }
                });
            }

            const result = await clearStrikes(
                client,
                message.guild.id,
                target.id
            );

            if (!result) {
                throw new Error('Strike system returned no result.');
            }

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

            return message.reply({
                embeds: [embed],
                allowedMentions: {
                    repliedUser: false
                }
            });

        } catch (error) {
            console.error('[IRV CLEAR STRIKES ERROR]', error);

            return message.reply({
                content: 'Failed to clear strikes. Check the bot console for the exact error.',
                allowedMentions: {
                    repliedUser: false
                }
            });
        }
    }
};
