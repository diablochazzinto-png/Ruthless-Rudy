
import { EmbedBuilder, PermissionsBitField } from 'discord.js';
import { issueStrike } from './strikeSystem.js';

// ==========================================
// IRV AUTOMATIC MODERATION CONFIGURATION
// ==========================================

const SPAM_LIMIT = 5;
const SPAM_WINDOW = 5000;
const NOTICE_DURATION = 5000;

const recentMessages = new Map();

// ==========================================
// PROFANITY DATABASE
// ==========================================

const PROFANITY = [
    // GENERAL PROFANITY
    'fuck',
    'fucking',
    'fucked',
    'fucker',
    'fuckers',
    'motherfucker',
    'motherfuckers',
    'motherfucking',
    'mothafucka',
    'muthafucker',
    'muthafucka',
    'mofo',

    'shit',
    'shitty',
    'bullshit',
    'shithead',
    'dipshit',
    'dumbshit',

    'bitch',
    'bitches',
    'bitching',
    'bastard',
    'bastards',
    'asshole',
    'assholes',
    'arsehole',

    'dick',
    'dicks',
    'dickhead',
    'cock',
    'cocks',
    'pussy',
    'pussies',
    'cunt',
    'cunts',
    'twat',
    'prick',
    'wanker',

    'whore',
    'whores',
    'slut',
    'sluts',
    'douche',
    'douchebag',
    'jackass',
    'dumbass',
    'asswipe',

    'piss',
    'pissed',
    'crap',
    'damn',
    'hell',

    // ALTERNATIVE SPELLINGS
    'fuk',
    'fuking',
    'fuker',
    'fck',
    'fuq',
    'phuck',
    'shyt',
    'biatch',
    'btch',
    'bich',
    'azzhole',
    'dik',
    'kunt',
    'mthrfkr',
    'mofucka',
    'bullshyt',
    'dipshyt',
    'dumbazz',
    'jackazz'
];

// Additional terms configured by server administrators.
const CUSTOM_BLOCKED_TERMS = [
    // Add additional prohibited terms here.
];

// ==========================================
// TEXT NORMALIZATION
// ==========================================

function normalizeText(text) {
    return text
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
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
// PROFANITY PATTERN GENERATOR
// ==========================================

function createProfanityPattern(word) {
    const normalized = normalizeText(word)
        .replace(/[^a-z]/g, '');

    if (!normalized) return null;

    const letters = [...normalized];

    const pattern = letters
        .map(letter => `${letter}+`)
        .join('[^a-z0-9]*');

    return new RegExp(
        `(^|[^a-z0-9])${pattern}($|[^a-z0-9])`,
        'i'
    );
}

// ==========================================
// PROFANITY DETECTION
// ==========================================

const PROFANITY_PATTERNS = [
    ...PROFANITY,
    ...CUSTOM_BLOCKED_TERMS
]
    .map(createProfanityPattern)
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

    // IGNORE INVALID MESSAGES
    if (
        !message.guild ||
        message.author.bot ||
        !message.member
    ) {
        return false;
    }

    const member = message.member;

    // EXEMPT ADMINISTRATORS AND MODERATORS
    if (
        member.permissions.has(
            PermissionsBitField.Flags.Administrator
        ) ||
        member.permissions.has(
            PermissionsBitField.Flags.ManageMessages
        ) ||
        member.permissions.has(
            PermissionsBitField.Flags.ModerateMembers
        )
    ) {
        return false;
    }

    let reason = null;

    // CHECK FOR SPAM
    if (containsSpam(message)) {
        reason = 'Repeated messages / flooding';
    }

    // CHECK FOR PROFANITY
    if (!reason && containsProfanity(message.content)) {
        reason = 'Prohibited language';
    }

    // NO VIOLATION
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

        if (!result) {
            return false;
        }

        // DELETE VIOLATING MESSAGE
        await message.delete().catch(error => {
            console.error(
                'Could not delete moderated message:',
                error
            );
        });

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

        return true;

    } catch (error) {
        console.error(
            'Automatic moderation error:',
            error
        );

        return false;
    }
}
