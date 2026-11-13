
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
    1: {
        name: 'Official Warning',
        duration: null
    },
    2: {
        name: '1-minute timeout',
        duration: 60 * 1000
    },
    3: {
        name: '10-minute timeout',
        duration: 10 * 60 * 1000
    },
    4: {
        name: '1-hour timeout',
        duration: 60 * 60 * 1000
    },
    5: {
        name: '8-hour timeout',
        duration: 8 * 60 * 60 * 1000
    },
    6: {
        name: '24-hour timeout',
        duration: 24 * 60 * 60 * 1000
    },
    7: {
        name: 'Permanent Ban',
        duration: null
    }
});

// ==========================================
// DATABASE RETRIEVAL
// ==========================================


// ==========================================
// CLEAR ALL STRIKES
// ==========================================

export async function clearStrikes(
    client,
    guildId,
    userId
) {
    // Retrieve existing strike records
    const previousData = await getStrikeData(
        client,
        guildId,
        userId
    );

    const previousCount = previousData.count;

    // Reset strike count and history
    const newData = {
        count: 0,
        history: []
    };

    await saveStrikeData(
        client,
        guildId,
        userId,
        newData
    );

    logger.info(
        `All strikes cleared for user ${userId} in IRV ${guildId}. Previous strikes: ${previousCount}`
    );

    // Return information for confirmation embeds
    return {
        previousCount,
        count: 0,
        history: []
    };
}

    } catch (error) {
        logger.error('Failed to retrieve strike data:', error);
        throw error;
    }
}

// ==========================================
// DATABASE SAVING
// ==========================================

export async function saveStrikeData(
    client,
    guildId,
    userId,
    data
) {
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
    if (!member || !member.guild || !member.id) {
        throw new Error('Invalid member provided to issueStrike.');
    }

    if (!reason || typeof reason !== 'string') {
        throw new Error('A valid strike reason is required.');
    }

    const guildId = member.guild.id;
    const userId = member.id;

    const data = await getStrikeData(
        client,
        guildId,
        userId
    );

    // MAXIMUM STRIKES REACHED
    if (data.count >= MAX_STRIKES) {
        return null;
    }

    const strike = data.count + 1;
    const punishment = PUNISHMENTS[strike];

    // CHECK TIMEOUT PERMISSIONS
    if (strike >= 2 && strike <= 6) {
        if (!member.moderatable) {
            throw new Error(
                `Cannot timeout ${member.user.tag}. Check bot permissions and role hierarchy.`
            );
        }
    }

    // CHECK BAN PERMISSIONS
    if (strike === 7) {
        if (!member.bannable) {
            throw new Error(
                `Cannot ban ${member.user.tag}. Check bot permissions and role hierarchy.`
            );
        }
    }

    // APPLY PUNISHMENT
    try {
        if (strike >= 2 && strike <= 6) {
            await member.timeout(
                punishment.duration,
                reason
            );
        }

        if (strike === 7) {
            await member.ban({
                reason: `IRV Strike 7: ${reason}`
            });
        }

    } catch (error) {
        logger.error(
            `Failed to apply strike ${strike} punishment to ${member.user.tag}:`,
            error
        );

        throw error;
    }

    // UPDATE STRIKE DATA
    data.count = strike;

    data.history.push({
        strike,
        reason,
        punishment: punishment.name,
        moderator,
        date: new Date().toISOString()
    });

    // KEEP HISTORY MANAGEABLE
    if (data.history.length > MAX_HISTORY) {
        data.history = data.history.slice(-MAX_HISTORY);
    }

    // SAVE TO DATABASE
    await saveStrikeData(
        client,
        guildId,
        userId,
        data
    );

    logger.info(
        `Strike ${strike} issued to ${member.user.tag}: ${reason}`
    );

    // RETURN RESULT TO AUTOMODERATION
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

export async function changeStrikeCount(
    client,
    guildId,
    userId,
    amount
) {
    if (!Number.isInteger(amount)) {
        throw new Error('Strike amount must be an integer.');
    }

    const data = await getStrikeData(
        client,
        guildId,
        userId
    );

    data.count = Math.max(
        0,
        Math.min(MAX_STRIKES, amount)
    );

    await saveStrikeData(
        client,
        guildId,
        userId,
        data
    );

    return data;
}

// ==========================================
// REDUCE STRIKES
// ==========================================

export async function reduceStrikes(
    client,
    guildId,
    userId,
    amount
) {
    if (!Number.isInteger(amount) || amount < 0) {
        throw new Error('Reduction amount must be a non-negative integer.');
    }

    const data = await getStrikeData(
        client,
        guildId,
        userId
    );

    data.count = Math.max(
        0,
        data.count - amount
    );

    await saveStrikeData(
        client,
        guildId,
        userId,
        data
    );

    return data;
}

// ==========================================
// CLEAR ALL STRIKES
// ==========================================

export async function clearStrikes(
    client,
    guildId,
    userId
) {
    const data = {
        count: 0,
        history: []
    };

    await saveStrikeData(
        client,
        guildId,
        userId,
        data
    );

    return data;
}

// ==========================================
// EXPORT PUNISHMENT CONFIGURATION
// ==========================================

export { PUNISHMENTS };
