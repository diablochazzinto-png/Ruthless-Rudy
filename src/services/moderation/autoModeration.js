import { EmbedBuilder, PermissionsBitField } from 'discord.js';
import { issueStrike } from './strikeSystem.js';

const SPAM_LIMIT = 5;
const SPAM_WINDOW = 5000;
const recentMessages = new Map();

const PROFANITY = [
    // Add your prohibited words here.
];

export async function checkAutomaticModeration(message, client) {
    if (!message.guild || message.author.bot || !message.member) return false;

    const member = message.member;

    // Exempt administrators and moderators.
    if (
        member.permissions.has(PermissionsBitField.Flags.Administrator) ||
        member.permissions.has(PermissionsBitField.Flags.ManageMessages) ||
        member.permissions.has(PermissionsBitField.Flags.ModerateMembers)
    ) return;

    const content = message.content.toLowerCase();
    let reason = null;

    // Detect repeated messages / flooding.
    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const messages = (recentMessages.get(key) || [])
        .filter(time => now - time < SPAM_WINDOW);

    messages.push(now);
    recentMessages.set(key, messages);

    if (messages.length >= SPAM_LIMIT) {
        reason = 'Repeated messages / flooding';
        recentMessages.delete(key);
    }

    // Detect configured prohibited words.
    if (!reason && PROFANITY.some(word =>
        new RegExp(`\\b${word}\\b`, 'i').test(content)
    )) {
        reason = 'Prohibited language';
    }

if (!reason) return false;

    try {
        const result = await issueStrike(client, member, reason);

        if (!result) return false;

        await message.delete().catch(() => {});

        const embed = new EmbedBuilder()
            .setColor(result.strike >= 5 ? 0xC0392B : 0xE0A526)
            .setTitle(`⚠️ STRIKE ${result.strike}`)
            .setDescription(
                `**Member:** ${member}\n` +
                `**Violation:** ${reason}\n` +
                `**Punishment:** ${result.punishment}\n` +
                `**Strike Record:** ${result.count} / 7`
            )
            .setFooter({ text: 'IRV • Imperium Revenant Empire' })
            .setTimestamp();

        const notice = await message.channel.send({
            content: `${member}`,
            embeds: [embed],
            allowedMentions: { users: [member.id] }
        });

        setTimeout(() => {
            notice.delete().catch(() => {});
        }, 5000);

        return true;
    } catch (error) {
        console.error('Automatic moderation error:', error);
    }
}
