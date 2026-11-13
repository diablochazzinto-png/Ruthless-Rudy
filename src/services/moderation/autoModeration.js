
import {
    EmbedBuilder,
    PermissionsBitField
} from 'discord.js';

import { issueStrike } from './strikeSystem.js';

// ==========================================
// CONFIGURATION
// ==========================================

const SPAM_LIMIT = 5;
const SPAM_WINDOW = 5000;
const NOTICE_DURATION = 5000;

const recentMessages = new Map();

// ==========================================
// PROFANITY DATABASE
// ==========================================

const PROFANITY = [
    'fuck', 'fucking', 'fucked', 'fucker', 'fuckers',
    'motherfucker', 'motherfuckers', 'motherfucking',
    'mothafucka', 'muthafucker', 'muthafucka', 'mofo',
    'fuk', 'fuking', 'fuker', 'fck', 'fuq', 'phuck',

    'shit', 'shitty', 'bullshit', 'shithead',
    'dipshit', 'dumbshit', 'shyt', 'bullshyt',

    'bitch', 'bitches', 'bitching', 'bastard',
    'bastards', 'asshole', 'assholes', 'arsehole',
    'biatch', 'btch', 'bich', 'azzhole',

    'dick', 'dicks', 'dickhead', 'cock', 'cocks',
    'pussy', 'pussies', 'cunt', 'cunts', 'twat',
    'prick', 'wanker', 'dik', 'kunt',

    'whore', 'whores', 'slut', 'sluts',
    'douche', 'douchebag', 'jackass',
    'dumbass', 'asswipe', 'dumbazz', 'jackazz',

    'piss', 'pissed', 'crap', 'damn', 'hell',

    'mthrfkr', 'mofucka', 'motherfkr',
    'fcking', 'fcked', 'fcker',
    'azz', 'sh1t'
];

const CUSTOM_BLOCKED_TERMS = [];

// ==========================================
// TEXT NORMALIZATION
// ==========================================

function normalizeText(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\u200B-\u200F\uFEFF]/g, '')
        .replace(/[０-９]/g, char =>
            String.fromCharCode(char.charCodeAt(0) - 0xFEE0)
        )
        .replace(/0/g, 'o')
        .replace(/1/g, 'i')
        .replace(/3/g, 'e')
        .replace(/4/g, 'a')
        .replace(/5/g, 's')
        .replace(/7/g, 't')
        .replace(/@/g, 'a')
        .replace(/\$/g, 's')
        .replace(/!/g, 'i')
        .replace(/\+/g, 't');
}

// ==========================================
// PROFANITY PATTERNS
// ==========================================

function createPattern(word) {
    const letters = normalizeText(word)
        .replace(/[^a-z0-9]/g, '');

    if (!letters) return null;

    const pattern = [...letters]
        .map(letter => `${letter}+`)
        .join('[^a-z0-9]*');

    return new RegExp(
        `(^|[^a-z0-9])${pattern}($|[^a-z0-9])`,
        'i'
    );
}

const PROFANITY_PATTERNS = [
    ...PROFANITY,
    ...CUSTOM_BLOCKED_TERMS
]
    .map(createPattern)
    .filter(Boolean);

function containsProfanity(content) {
    const normalized = normalizeText(content);

    return PROFANITY_PATTERNS.some(pattern =>
        pattern.test(normalized)
    );
}

// ==========================================
// SPAM DETECTION
// ==========================================

function containsSpam(message) {
    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();

    const messages = (recentMessages.get(key) || [])
        .filter(time => now - time < SPAM_WINDOW);

    messages.push(now);
    recentMessages.set(key, messages);

    if (messages.length >= SPAM_LIMIT) {
        recentMessages.delete(key);
        return true;
    }

    return false;
}

// ==========================================
// AUTOMATIC MODERATION
// ==========================================

export async function checkAutomaticModeration(message, client) {

    console.log(
        '[IRV MODERATION] Message received:',
        message.content
    );

    if (
        !message.guild ||
        message.author.bot ||
        !message.member
    ) {
        return false;
    }

    const member = message.member;

    // MODERATOR EXEMPTIONS
    if (
        member.permissions.has(
            PermissionsBitField.Flags.Administrator
        ) ||
        member.permissions.has(
            PermissionsBitField.Flags.ModerateMembers
        )
    ) {
        console.log('[IRV MODERATION] Moderator exemption:', member.user.tag);
        return false;
    }

    // CHECK PROFANITY
    const hasProfanity = containsProfanity(message.content);

    console.log(
        '[IRV MODERATION] Profanity detected:',
        hasProfanity
    );

    // CHECK SPAM
    const hasSpam = containsSpam(message);

    console.log(
        '[IRV MODERATION] Spam detected:',
        hasSpam
    );

    let reason = null;

    if (hasSpam) {
        reason = 'Repeated messages / flooding';
    } else if (hasProfanity) {
        reason = 'Prohibited language';
    }

    if (!reason) {
        return false;
    }

    try {
        // ISSUE STRIKE
        const result = await issueStrike(
            client,
            member,
            reason
        );

        // DELETE THE OFFENDING MESSAGE
        await message.delete().catch(error => {
            console.error(
                '[IRV MODERATION] Message deletion failed:',
                error
            );
        });

        // HANDLE FAILED STRIKE
        if (!result) {
            console.error(
                '[IRV MODERATION] No strike was issued for:',
                member.user.tag
            );

            return true;
        }

        // CREATE STRIKE EMBED
        const embed = new EmbedBuilder()
            .setColor(
                result.strike >= 5
                    ? 0xC0392B
                    : 0xE0A526
            )
            .setTitle(`⚠️ STRIKE ${result.strike}`)
            .setDescription(
                `**Member:** ${member}\n` +
                `**Violation:** ${reason}\n` +
                `**Punishment:** ${result.punishment}\n` +
                `**Strike Record:** ${result.count} / 7`
            )
            .setFooter({
                text: 'IRV • Imperium Revenant Empire'
            })
            .setTimestamp();

        // SEND MODERATION NOTICE
        const notice = await message.channel.send({
            content: `${member}`,
            embeds: [embed],
            allowedMentions: {
                users: [member.id]
            }
        });

        // DELETE NOTICE AFTER 5 SECONDS
        setTimeout(() => {
            notice.delete().catch(() => {});
        }, NOTICE_DURATION);

        console.log(
            `[IRV MODERATION] Successfully issued strike ${result.strike} to ${member.user.tag}`
        );

        return true;

    } catch (error) {
        console.error(
            '[IRV MODERATION] Automatic moderation error:',
            error
        );

        return false;
    }
}
