
import { logger } from '../../utils/logger.js';

// ==========================================
// IRV STRIKE SYSTEM CONFIGURATION
// ==========================================

const STRIKE_KEY = (guildId, userId) =>
    `guild:${guildId}:strikes:${userId}`;

const MAX_STRIKES = 7;
const MAX_HISTORY = 100;

// ==========================================
// PUNISHMENT PROGRESSION
// ==========================================

const PUNISHMENTS = Object.freeze({
    1: { name: 'Official Warning', duration: null },
    2: { name: '1-minute timeout', duration: 60 * 1000 },
    3: { name: '10-minute timeout', duration: 10 * 60 * 1000 },
    4: { name: '1-hour timeout', duration: 60 * 60 * 1000 },
    5: { name: '8-hour timeout', duration: 8 * 60 * 60 * 1000 },
    6: { name: '24-hour timeout', duration: 24 * 60 * 60 * 1000 },
    7: { name: 'Permanent Ban', duration: null }
});

// ==========================================
// DATABASE RETRIEVAL
// ==========================================

export async function getStrikeData(client, guildId, userId) {
    if (!client?.db) {
        throw new Error('Database is not initialized.');
    }

    const key = STRIKE_KEY(guildId, userId);

    try {
        const storedData = await client.db.get(key, {
            count: 0,
            history: []
        });

        return {
            count: Number.isInteger(storedData?.count)
                ? Math.max(0, Math.min(MAX_STRIKES, storedData.count))
                : 0,
            history: Array.isArray(storedData?.history)
                ? storedData.history
                : []
        };
    } catch (error) {
        logger.error('Failed to retrieve strike data:', error);
        throw error;
    }
}

// ==========================================
// DATABASE SAVING
// ==========================================

export async function saveStrikeData(client, guildId, userId, data) {
    if (!client?.db) {
        throw new Error('Database is not initialized.');
    }

    const key = STRIKE_KEY(guildId, userId);

    try {
        await client.db.set(key, data);
        return true;
    } catch (error) {
        logger.error('Failed to save strike data:', error);
        throw error;
    }
}

// ==========================================
// ISSUE STRIKE
// ==========================================

export async function issueStrike(
    client,
    member,
    reason,
    moderator = 'Automatic Moderation'
) {
    if (!member?.guild || !member?.id) {
        throw new Error('Invalid member provided to issueStrike.');
    }

    if (!reason || typeof reason !== 'string') {
        throw new Error('A valid strike reason is required.');
    }

    const guildId = member.guild.id;
    const userId = member.id;

    const data = await getStrikeData(client, guildId, userId);

    if (data.count >= MAX_STRIKES) {
        logger.info(`Maximum strikes already reached for ${member.user.tag}.`);
        return null;
    }

    const strike = data.count + 1;
    const punishment = PUNISHMENTS[strike];

    // Check timeout permissions
    if (strike >= 2 && strike <= 6) {
        if (!member.moderatable) {
            throw new Error(
                `Cannot timeout ${member.user.tag}. Check bot permissions and role hierarchy.`
            );
        }
    }

    // Check ban permissions
    if (strike === 7) {
        if (!member.bannable) {
            throw new Error(
                `Cannot ban ${member.user.tag}. Check bot permissions and role hierarchy.`
            );
        }
    }

    // Apply punishment
    if (strike >= 2 && strike <= 6) {
        await member.timeout(punishment.duration, reason);
    }

    if (strike === 7) {
        await member.ban({
            reason: `IRV Strike 7: ${reason}`
        });
    }

    // Update strike record
    data.count = strike;

    data.history.push({
        strike,
        reason,
        punishment: punishment.name,
        moderator,
        date: new Date().toISOString()
    });

    if (data.history.length > MAX_HISTORY) {
        data.history = data.history.slice(-MAX_HISTORY);
    }

    await saveStrikeData(client, guildId, userId, data);

    logger.info(
        `Strike ${strike} issued to ${member.user.tag}: ${reason}`
    );

    return {
        strike,
        punishment: punishment.name,
        count: data.count,
        history: data.history
    };
}

// ==========================================
// SET STRIKE COUNT
// ==========================================

export async function changeStrikeCount(client, guildId, userId, amount) {
    if (!Number.isInteger(amount)) {
        throw new Error('Strike amount must be an integer.');
    }

    const data = await getStrikeData(client, guildId, userId);

    data.count = Math.max(0, Math.min(MAX_STRIKES, amount));

    await saveStrikeData(client, guildId, userId, data);

    return data;
}

// ==========================================
// REDUCE STRIKES
// ==========================================

export async function reduceStrikes(client, guildId, userId, amount) {
    if (!Number.isInteger(amount) || amount < 0) {
        throw new Error('Reduction amount must be a non-negative integer.');
    }

    const data = await getStrikeData(client, guildId, userId);

    data.count = Math.max(0, data.count - amount);

    await saveStrikeData(client, guildId, userId, data);

    return data;
}

// ==========================================
// CLEAR ALL STRIKES
// ==========================================

export async function clearStrikes(client, guildId, userId) {
    const previousData = await getStrikeData(client, guildId, userId);

    const newData = {
        count: 0,
        history: []
    };

    await saveStrikeData(client, guildId, userId, newData);

    logger.info(
        `All strikes cleared for user ${userId} in guild ${guildId}. Previous strikes: ${previousData.count}`
    );

    return {
        previousCount: previousData.count,
        count: 0,
        history: []
    };
}

// ==========================================
// EXPORT PUNISHMENT CONFIGURATION
// ==========================================

export { PUNISHMENTS };
