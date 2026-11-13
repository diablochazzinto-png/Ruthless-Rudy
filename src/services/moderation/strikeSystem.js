import { logger } from '../../utils/logger.js';

const STRIKE_KEY = (guildId, userId) =>
    `guild:${guildId}:strikes:${userId}`;

const PUNISHMENTS = {
    1: { name: 'Official Warning', duration: null },
    2: { name: '1-minute timeout', duration: 60 * 1000 },
    3: { name: '10-minute timeout', duration: 10 * 60 * 1000 },
    4: { name: '1-hour timeout', duration: 60 * 60 * 1000 },
    5: { name: '8-hour timeout', duration: 8 * 60 * 60 * 1000 },
    6: { name: '24-hour timeout', duration: 24 * 60 * 60 * 1000 },
    7: { name: 'Permanent Ban', duration: null }
};

export async function getStrikeData(client, guildId, userId) {
    const key = STRIKE_KEY(guildId, userId);

    try {
        return await client.db.get(key, {
            count: 0,
            history: []
        });
    } catch (error) {
        logger.error('Failed to retrieve strike data:', error);
        throw error;
    }
}

export async function saveStrikeData(client, guildId, userId, data) {
    const key = STRIKE_KEY(guildId, userId);

    try {
        await client.db.set(key, data);
        return true;
    } catch (error) {
        logger.error('Failed to save strike data:', error);
        throw error;
    }
}

export async function issueStrike(client, member, reason, moderator = 'Ruthless Rudy') {
    const guildId = member.guild.id;
    const userId = member.id;

    const data = await getStrikeData(client, guildId, userId);

    if (data.count >= 7) {
        return null;
    }

    const strike = data.count + 1;
    const punishment = PUNISHMENTS[strike];

    data.count = strike;
    data.history.push({
        strike,
        reason,
        punishment: punishment.name,
        moderator,
        date: new Date().toISOString()
    });

    await saveStrikeData(client, guildId, userId, data);

    if (strike >= 2 && strike <= 6) {
        await member.timeout(punishment.duration, reason);
    }

    if (strike === 7) {
        await member.ban({ reason: `Strike 7: ${reason}` });
    }

    return {
        strike,
        punishment: punishment.name,
        count: data.count,
        history: data.history
    };
}

export async function changeStrikeCount(client, guildId, userId, amount) {
    const data = await getStrikeData(client, guildId, userId);

    data.count = Math.max(0, Math.min(7, amount));

    await saveStrikeData(client, guildId, userId, data);
    return data;
}

export async function reduceStrikes(client, guildId, userId, amount) {
    const data = await getStrikeData(client, guildId, userId);

    data.count = Math.max(0, data.count - amount);

    await saveStrikeData(client, guildId, userId, data);
    return data;
}

export async function clearStrikes(client, guildId, userId) {
    const data = await getStrikeData(client, guildId, userId);

    data.count = 0;
    data.history = [];

    await saveStrikeData(client, guildId, userId, data);
    return data;
}

export { PUNISHMENTS };
