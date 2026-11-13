<CodeBlock language="javascript" editable>
import { logger } from '../../utils/logger.js';

// ==========================================
// IRV STRIKE SYSTEM CONFIGURATION
// ==========================================

const STRIKE_KEY = (guildId, userId) =>
guild:$DIL0:strikes:$DIL1;

const MAX_STRIKES = 7;
const MAX_HISTORY = 100;

const DEFAULT_STRIKE_DATA = {
    count: 0,
    history: []
};

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
// VALIDATION
// ==========================================

function validateIdentifiers(guildId, userId) {
    if (!guildId || typeof guildId !== 'string') {
        throw new Error('A valid guild ID is required.');
    }

if (!userId || typeof userId !== 'string') {
        throw new Error('A valid user ID is required.');
    }
}

function validateDatabase(client) {
    if (
        !client?.db ||
        typeof client.db.get !== 'function' ||
        typeof client.db.set !== 'function'
    ) {
        throw new Error(
            'Database is not initialized or does not support get() and set().'
        );
    }
}

// ==========================================
// NORMALIZE STRIKE DATA
// ==========================================

function normalizeStrikeData(data) {
    const count = Number(data?.count);

return {
        count: Number.isFinite(count)
            ? Math.max(
                0,
                Math.min(MAX_STRIKES, Math.floor(count))
            )
            : 0,

history: Array.isArray(data?.history)
            ? data.history.slice(-MAX_HISTORY)
            : []
    };
}

// ==========================================
// DATABASE RETRIEVAL
// ==========================================

export async function getStrikeData(
    client,
    guildId,
    userId
) {
    validateDatabase(client);
    validateIdentifiers(guildId, userId);

    const key = STRIKE_KEY(guildId, userId);

try {
        const storedData = await client.db.get(
            key,
            DEFAULT_STRIKE_DATA
        );

        return normalizeStrikeData(storedData);

} catch (error) {
logger.error(
[STRIKES] Failed to retrieve data for $DIL0:,
error
);

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
    validateDatabase(client);
    validateIdentifiers(guildId, userId);

if (!data || typeof data !== 'object') {
        throw new Error('Invalid strike data provided.');
    }

    const key = STRIKE_KEY(guildId, userId);

    const normalizedData = normalizeStrikeData(data);

try {
        await client.db.set(key, normalizedData);

logger.debug(
[STRIKES] Saved $DIL0 strikes for $DIL1.
);

        return true;

} catch (error) {
logger.error(
[STRIKES] Failed to save data for $DIL0:,
error
);

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
    if (!member?.guild || !member?.id || !member?.user) {
        throw new Error(
            'A valid Discord guild member is required.'
        );
    }

if (
        typeof reason !== 'string' ||
        !reason.trim()
    ) {
        throw new Error('A valid strike reason is required.');
    }

const guildId = member.guild.id;
    const userId = member.id;

const data = await getStrikeData(
        client,
        guildId,
        userId
    );

if (data.count >= MAX_STRIKES) {
logger.info(
[STRIKES] Maximum strikes already reached for $DIL0.
);

return null;
    }

const strikeNumber = data.count + 1;
    const punishment = PUNISHMENTS[strikeNumber];

if (!punishment) {
throw new Error(
No punishment configuration exists for strike $DIL0.
);
}

// Check timeout permissions.
if (strikeNumber >= 2 && strikeNumber <= 6) {
if (!member.moderatable) {
throw new Error(
Cannot timeout $DIL0. Check bot permissions and role hierarchy.
);
}
}

// Check ban permissions.
if (strikeNumber === 7) {
if (!member.bannable) {
throw new Error(
Cannot ban $DIL0. Check bot permissions and role hierarchy.
);
}
}

    const cleanReason = reason.trim();

// Apply punishment.
    if (strikeNumber >= 2 && strikeNumber <= 6) {
        await member.timeout(
            punishment.duration,
            cleanReason
        );
    }

if (strikeNumber === 7) {
await member.ban({
reason: IRV Strike 7: $DIL0
});
}

// Update records after punishment succeeds.
    data.count = strikeNumber;

data.history.push({
        strike: strikeNumber,
        reason: cleanReason,
        punishment: punishment.name,
        moderator,
        date: new Date().toISOString()
    });

    data.history = data.history.slice(-MAX_HISTORY);

await saveStrikeData(
        client,
        guildId,
        userId,
        data
    );

logger.info(
[STRIKES] Strike $DIL0 issued to $DIL1: $DIL2
);

return {
        strike: strikeNumber,
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
if (
!Number.isInteger(amount) ||
amount < 0 ||
amount > MAX_STRIKES
) {
throw new Error(
Strike count must be an integer between 0 and $DIL0.
);
}

const data = await getStrikeData(
        client,
        guildId,
        userId
    );

    data.count = amount;

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
    if (
        !Number.isInteger(amount) ||
        amount < 0
    ) {
        throw new Error(
            'Strike reduction must be a non-negative integer.'
        );
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
    validateDatabase(client);
    validateIdentifiers(guildId, userId);

try {
        const previousData = await getStrikeData(
            client,
            guildId,
            userId
        );

const clearedData = {
            count: 0,
            history: []
        };

await saveStrikeData(
            client,
            guildId,
            userId,
            clearedData
        );

logger.info(
[STRIKES] Cleared all strikes for $DIL0 in guild $DIL1. Previous count: $DIL2.
);

return {
            previousCount: previousData.count,
            count: 0,
            history: []
        };

} catch (error) {
logger.error(
[STRIKES] Failed to clear strikes for $DIL0:,
error
);

throw error;
    }
}

// ==========================================
// GET STRIKE COUNT
// ==========================================

export async function getStrikeCount(
    client,
    guildId,
    userId
) {
    const data = await getStrikeData(
        client,
        guildId,
        userId
    );

return data.count;
}

// ==========================================
// GET STRIKE HISTORY
// ==========================================

export async function getStrikeHistory(
    client,
    guildId,
    userId
) {
    const data = await getStrikeData(
        client,
        guildId,
        userId
    );

return data.history;
}

// ==========================================
// EXPORT CONFIGURATION
// ==========================================

export {
    PUNISHMENTS,
    MAX_STRIKES
};
</CodeBlock>
