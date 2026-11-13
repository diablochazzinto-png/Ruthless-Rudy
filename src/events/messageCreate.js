
import { checkAutomaticModeration } from '../services/moderation/autoModeration.js';
import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';

import {
    getLevelingConfig,
    getUserLevelData
} from '../services/leveling/leveling.js';

import { addXp } from '../services/leveling/xpSystem.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { parsePrefixCommand } from '../utils/prefixParser.js';

import {
    supportsPrefixExecution,
    executePrefixCommand,
    resolvePrefixAccessKey
} from '../utils/messageAdapter.js';

import {
    resolveCommandAlias,
    resolveSubcommandAlias
} from '../config/commands/commandAliases.js';

import { getPrefixRestriction } from '../config/commands/prefixRestrictions.js';
import { getGuildConfig } from '../services/config/guildConfig.js';

import {
    getCommandPrefix,
    getBotMessage,
    isBotOwner,
    isCommandCategoryEnabled,
    isMaintenanceMode
} from '../config/bot.js';

import {
    enforceAbuseProtection,
    formatCooldownDuration
} from '../utils/abuseProtection.js';

import { createEmbed } from '../utils/embeds.js';
import { isCommandEnabled } from '../services/commandAccessService.js';

import {
    getCountingGameConfig,
    saveCountingGameConfig,
    isValidCountingMessage,
    recordCorrectCount
} from '../services/countingGameService.js';

const MESSAGE_XP_RATE_LIMIT_ATTEMPTS = 12;
const MESSAGE_XP_RATE_LIMIT_WINDOW_MS = 10000;

// ==========================================
// AUTO-REPLIES
// ==========================================

const AUTO_REPLIES = [
    {
        triggers: ['how do i join', 'how to join', 'join irv'],
        response: 'Interested in joining IRV? 👑 Head over to our tickets channel and submit a Military Application!'
    },
    {
        triggers: ['how do i ally', 'how to ally', 'alliance'],
        response: 'Interested in forming an alliance with IRV? 🤝 Open a ticket and our leadership will assist you!'
    },
    {
        triggers: ['what is irv', 'what does irv mean'],
        response: 'IRV stands for The Imperium Revenant Empire. An empire built upon strength, loyalty, and determination. 👑'
    },
    {
        triggers: ['who is the owner', 'who owns irv'],
        response: "Want to know who's behind the empire? Check our leadership roster! 👑"
    },
    {
        triggers: ['recruitment', 'recruiting', 'are you recruiting'],
        response: 'YES! IRV is welcoming new recruits. Head to our tickets channel to apply for the military!'
    },
    {
        triggers: ['what are the requirements', 'requirements to join'],
        response: 'Our military application team can provide you with the current requirements. Open a ticket to get started!'
    },
    {
        triggers: ['where is the application', 'where do i apply'],
        response: 'Look for the 🎫 tickets channel! Open a ticket and select the Military Application option.'
    },
    {
        triggers: ['what game do you play', 'what games'],
        response: 'IRV operates in Booga Booga SMP, CAA (Command an Army) and The Survival Game! Come join us on the battlefield.'
    },
    {
        triggers: ['is irv active', 'are you active'],
        response: 'Of course! IRV is continuously building its community. Stay tuned for announcements, activities, and events!'
    },
    {
        triggers: ['how do i contact staff', 'contact staff', 'need help'],
        response: 'Need assistance? Open a ticket and our staff team will help you out! 🎫'
    },
    {
        triggers: ['hi', 'hello', 'hey'],
        response: 'Hey there! 👋'
    },
    {
        triggers: ['good morning', 'morning'],
        response: 'Good morning! ☀️'
    },
    {
        triggers: ['good night'],
        response: 'Good night! Sleep well! 🌙'
    },
    {
        triggers: ['bye', 'goodbye'],
        response: 'See you later! 👋'
    },
    {
        triggers: ['i hate you rudy', 'rudy sucks', 'rudy is stupid', 'rudy dumb'],
        response: 'I may be artificial, but at least I have better manners than you. heh.'
    },
    {
        triggers: ['ruthless rudy'],
        response: 'You called? 💀'
    },
    {
        triggers: ['irv'],
        response: 'THE IMPERIUM REVENANT EMPIRE! 👑'
    },
    {
        triggers: ['are you alive'],
        response: 'Unfortunately, yes. 💀'
    }
];

// ==========================================
// MESSAGE CREATE EVENT
// ==========================================

export default {
    name: Events.MessageCreate,

    async execute(message, client) {
        try {
            if (!message.guild || message.author.bot) return;

            // 1. AUTOMATIC MODERATION
            const moderationProcessed =
                await checkAutomaticModeration(message, client);

            if (moderationProcessed) return;

            // 2. PREFIX COMMANDS
            // Run before counting so commands are not treated as invalid counts.
            const prefixProcessed =
                await handlePrefixCommand(message, client);

            if (prefixProcessed) return;

            // 3. COUNTING GAME
            const countingProcessed =
                await handleCountingGame(message, client);

            if (countingProcessed) return;

            // 4. AUTO-REPLIES
            await handleAutoReply(message);

            // 5. LEVELING
            await handleLeveling(message, client);

        } catch (error) {
            logger.error('Error in messageCreate event:', error);
        }
    }
};

// ==========================================
// PREFIX COMMAND HANDLER
// ==========================================

async function handlePrefixCommand(message, client) {
    try {
        const guildConfig = await getGuildConfig(
            client,
            message.guild.id
        );

        const prefix =
            guildConfig?.prefix || getCommandPrefix();

        const parsed = parsePrefixCommand(
            message.content,
            prefix
        );

        if (!parsed) return false;

        let { commandName, args } = parsed;

        const musicShortcuts = new Set([
            'leave',
            'pause',
            'resume',
            'skip',
            'stop',
            'volume'
        ]);

        if (musicShortcuts.has(commandName.toLowerCase())) {
            const shortcut = commandName.toLowerCase();

            commandName = 'music';
            args = [shortcut, ...args];
        }

        logger.info(
            `[PREFIX] Detected: ${commandName} | Args: ${JSON.stringify(args)}`
        );

        const resolvedCommandName =
            resolveCommandAlias(commandName);

        const command =
            client.commands?.get(resolvedCommandName);

        if (!command) {
            logger.warn(
                `[PREFIX] Command not found: ${resolvedCommandName}`
            );

            return true;
        }

        if (
            isMaintenanceMode() &&
            !isBotOwner(message.author.id)
        ) {
            await message.channel.send({
                embeds: [
                    createEmbed({
                        title: 'Maintenance Mode',
                        description: getBotMessage('maintenanceMode'),
                        color: 'warning'
                    })
                ]
            }).catch(() => {});

            return true;
        }

        if (!isCommandCategoryEnabled(command.category)) {
            await message.channel.send({
                embeds: [
                    createEmbed({
                        title: 'Feature Disabled',
                        description: getBotMessage('commandDisabled'),
                        color: 'error'
                    })
                ]
            }).catch(() => {});

            return true;
        }

        const restriction = getPrefixRestriction(
            command,
            args,
            resolveSubcommandAlias
        );

        if (
            !supportsPrefixExecution(command) ||
            restriction.blocked
        ) {
            if (restriction.blocked && restriction.reason) {
                await message.channel.send({
                    embeds: [
                        createEmbed({
                            title: 'Slash Command Only',
                            description:
                                `${restriction.reason}\nUse \`/${resolvedCommandName}\` instead.`,
                            color: 'info'
                        })
                    ]
                }).catch(() => {});
            }

            return true;
        }

        const accessKey = resolvePrefixAccessKey(
            command.data,
            args
        );

        const commandEnabled = await isCommandEnabled(
            client,
            message.guild.id,
            accessKey,
            command.category
        );

        if (!commandEnabled) {
            await message.channel.send({
                embeds: [
                    createEmbed({
                        title: 'Command Disabled',
                        description: 'This command has been disabled for this server.',
                        color: 'error'
                    })
                ]
            }).catch(() => {});

            return true;
        }

        const abuseProtection =
            await enforceAbuseProtection(
                {
                    guildId: message.guild.id,
                    user: message.author
                },
                command,
                resolvedCommandName
            );

        if (!abuseProtection.allowed) {
            const formattedCooldown =
                formatCooldownDuration(
                    abuseProtection.remainingMs
                );

            await message.channel.send({
                embeds: [
                    createEmbed({
                        title: 'Command Cooldown',
                        description:
                            `This command is on cooldown. Please wait ${formattedCooldown} before trying again.`,
                        color: 'error'
                    })
                ]
            }).catch(() => {});

            return true;
        }

        logger.info(
            `[PREFIX] Executing ${prefix}${commandName} for ${message.author.tag}`
        );

        await executePrefixCommand(
            command,
            message,
            args,
            client,
            prefix,
            guildConfig
        );

        return true;

    } catch (error) {
        logger.error(
            '[PREFIX] Error handling prefix command:',
            error
        );

        return true;
    }
}

// ==========================================
// COUNTING GAME
// ==========================================

async function handleCountingGame(message, client) {
    try {
        const config = await getCountingGameConfig(
            client,
            message.guild.id
        );

        if (
            !config?.enabled ||
            !config.channelId ||
            message.channel.id !== config.channelId
        ) {
            return false;
        }

        const content = message.content.trim();

        const validCount =
            isValidCountingMessage(content, config);

        const invalidAttempt =
            !validCount ||
            message.author.id === config.lastUserId;

        if (invalidAttempt) {
            await message.delete().catch(() => {});

            await saveCountingGameConfig(
                client,
                message.guild.id,
                {
                    ...config,
                    nextNumber: 1,
                    lastUserId: null,
                    currentStreak: 0
                }
            );

            const failureMessage =
                await message.channel.send(
                    `❌ Count broken by <@${message.author.id}>. The sequence has been reset to **1**.`
                );

            setTimeout(() => {
                failureMessage.delete().catch(() => {});
            }, 10000);

            return true;
        }

        await recordCorrectCount(
            client,
            message.guild.id,
            message.author.id
        );

        return true;

    } catch (error) {
        logger.error(
            'Error handling counting game:',
            error
        );

        return false;
    }
}

// ==========================================
// LEVELING
// ==========================================

async function handleLeveling(message, client) {
    try {
        const rateLimitKey =
            `xp-event:${message.guild.id}:${message.author.id}`;

        const canProcess = await checkRateLimit(
            rateLimitKey,
            MESSAGE_XP_RATE_LIMIT_ATTEMPTS,
            MESSAGE_XP_RATE_LIMIT_WINDOW_MS
        );

        if (!canProcess) return;

        const levelingConfig = await getLevelingConfig(
            client,
            message.guild.id
        );

        if (!levelingConfig?.enabled) return;

        if (
            levelingConfig.ignoredChannels?.includes(
                message.channel.id
            )
        ) {
            return;
        }

        if (levelingConfig.ignoredRoles?.length > 0) {
            const member = await message.guild.members
                .fetch(message.author.id)
                .catch(() => null);

            if (
                member &&
                member.roles.cache.some(role =>
                    levelingConfig.ignoredRoles.includes(role.id)
                )
            ) {
                return;
            }
        }

        if (
            levelingConfig.blacklistedUsers?.includes(
                message.author.id
            )
        ) {
            return;
        }

        if (!message.content?.trim()) return;

        const userData = await getUserLevelData(
            client,
            message.guild.id,
            message.author.id
        );

        const cooldownTime =
            levelingConfig.xpCooldown || 60;

        const timeSinceLastMessage =
            Date.now() - (userData.lastMessage || 0);

        if (timeSinceLastMessage < cooldownTime * 1000) {
            return;
        }

        const minXP =
            levelingConfig.xpRange?.min ||
            levelingConfig.xpPerMessage?.min ||
            15;

        const maxXP =
            levelingConfig.xpRange?.max ||
            levelingConfig.xpPerMessage?.max ||
            25;

        const safeMinXP = Math.max(1, minXP);
        const safeMaxXP = Math.max(safeMinXP, maxXP);

        const xpToGive =
            Math.floor(
                Math.random() * (safeMaxXP - safeMinXP + 1)
            ) + safeMinXP;

        let finalXP = xpToGive;

        if (
            levelingConfig.xpMultiplier &&
            levelingConfig.xpMultiplier > 1
        ) {
            finalXP = Math.floor(
                finalXP * levelingConfig.xpMultiplier
            );
        }

        const result = await addXp(
            client,
            message.guild,
            message.member,
            finalXP
        );

        if (result?.leveledUp) {
            logger.info(
                `${message.author.tag} leveled up to level ${result.level} in ${message.guild.name}`
            );
        }

    } catch (error) {
        logger.error(
            'Error handling leveling:',
            error
        );
    }
}

// ==========================================
// AUTO-REPLY
// ==========================================

async function handleAutoReply(message) {
    try {
        const content = message.content.toLowerCase();

        const matchedReply = AUTO_REPLIES.find(entry =>
            entry.triggers.some(trigger => {
                const escaped = trigger.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    '\\$&'
                );

                const pattern = new RegExp(
                    `(^|\\W)${escaped}(?=$|\\W)`,
                    'i'
                );

                return pattern.test(content);
            })
        );

        if (!matchedReply) return;

        await message.reply({
            content: matchedReply.response,
            allowedMentions: {
                repliedUser: false
            }
        });

    } catch (error) {
        logger.error(
            'Error handling auto-reply:',
            error
        );
    }
}
