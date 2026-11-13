import { EmbedBuilder, PermissionsBitField } from 'discord.js';
import { issueStrike } from './strikeSystem.js';

const SPAM_LIMIT = 5;
const SPAM_WINDOW = 5000;
const recentMessages = new Map();


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

    // COMMON ALTERNATIVE SPELLINGS
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
    'a55hole',
    'dik',
    'd1ck',
    'kunt',
    'cnt',
    'mthrfkr',
    'mofucka',
    'bullshyt',
    'dipshyt',
    'dumbazz',
    'jackazz',

    // RACIAL SLURS
    // Add the exact prohibited terms to your private list.
    // The normalization system below handles common
    // punctuation, spacing and number substitutions.
];

function normalizeText(text) {
    return text
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
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

function createProfanityPattern(word) {
    const normalized = normalizeText(word)
        .replace(/[^a-z]/g, '');

    const letters = [...normalized];

    const pattern = letters
        .map(letter => `${letter}+`)
        .join('[^a-z0-9]*');

    return new RegExp(
        `(^|[^a-z0-9])${pattern}($|[^a-z0-9])`,
        'i'
    );
}

function containsProfanity(content) {
    const normalized = normalizeText(content);

    return PROFANITY.some(word => {
        const pattern = createProfanityPattern(word);
        return pattern.test(normalized);
    });
}


export async function checkAutomaticModeration(message, client) {
    if (!message.guild || message.author.bot || !message.member) return false;

    const member = message.member;

    // Exempt administrators and moderators.
    if (
        member.permissions.has(PermissionsBitField.Flags.Administrator) ||
        member.permissions.has(PermissionsBitField.Flags.ManageMessages) ||
        member.permissions.has(PermissionsBitField.Flags.ModerateMembers)
    ) return;

  const hasProfanity = containsProfanity(message.content);

if (hasProfanity) {
    // Keep your existing strike, message deletion,
    // and moderation notification code here.
}

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
