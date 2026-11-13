
import { resolveSubcommandAlias } from '../config/commands/commandAliases.js';
import { logger } from './logger.js';

/**
 * Convert command data into a regular JSON object.
 */
function getCommandData(commandData) {
    if (!commandData) return null;

    try {
        return typeof commandData.toJSON === 'function'
            ? commandData.toJSON()
            : commandData;
    } catch (error) {
        logger.error('Failed to read command data:', error);
        return null;
    }
}

/**
 * Parse quoted and unquoted command arguments.
 *
 * Example:
 * !warn @user "Repeated spam"
 *
 * Result:
 * ["warn", "@user", "Repeated spam"]
 */
function parseArguments(input) {
    const args = [];

    let current = '';
    let quoteChar = null;
    let escaped = false;

    for (const char of input) {
        if (escaped) {
            current += char;
            escaped = false;
            continue;
        }

        if (char === '\\') {
            escaped = true;
            continue;
        }

        if (quoteChar) {
            if (char === quoteChar) {
                quoteChar = null;
            } else {
                current += char;
            }

            continue;
        }

        if (char === '"' || char === "'") {
            quoteChar = char;
            continue;
        }

        if (/\s/.test(char)) {
            if (current.length > 0) {
                args.push(current);
                current = '';
            }

            continue;
        }

        current += char;
    }

    if (escaped) {
        current += '\\';
    }

    if (current.length > 0) {
        args.push(current);
    }

    return args;
}

/**
 * Parse a prefix command.
 */
export function parsePrefixCommand(content, prefix) {
    if (
        typeof content !== 'string' ||
        typeof prefix !== 'string' ||
        !prefix ||
        !content.startsWith(prefix)
    ) {
        return null;
    }

    const withoutPrefix = content
        .slice(prefix.length)
        .trim();

    if (!withoutPrefix) return null;

    const args = parseArguments(withoutPrefix);

    if (args.length === 0) return null;

    const commandName = args.shift().toLowerCase();

    if (!commandName) return null;

    return {
        commandName,
        args
    };
}

/**
 * Normalize a Discord mention or ID.
 */
function normalizeId(value) {
    if (typeof value !== 'string') return value;

    const mentionMatch = value.match(
        /^<@!?(\d+)>$|^<#(\d+)>$|^<@&(\d+)>$/
    );

    if (mentionMatch) {
        return mentionMatch[1] || mentionMatch[2] || mentionMatch[3];
    }

    return value;
}

/**
 * Find a subcommand alias safely.
 */
function findSubcommand(name, subcommands) {
    if (!name || !Array.isArray(subcommands)) return null;

    const resolved = resolveSubcommandAlias(name);

    return subcommands.find(
        subcommand => subcommand.name === resolved
    ) || null;
}

/**
 * Map prefix arguments to command options.
 */
export function mapArgumentsToOptions(args = [], commandData = null) {
    const safeArgs = Array.isArray(args)
        ? args.map(arg => String(arg))
        : [];

    const cmdData = getCommandData(commandData);

    const options = {};
    let subcommandName = null;
    let subcommandGroupName = null;
    let optionDefs = [];

    if (!cmdData || !Array.isArray(cmdData.options)) {
        return createOptionsResult(
            options,
            safeArgs,
            null,
            null,
            [],
            []
        );
    }

    const commandOptions = cmdData.options;

    const subcommandGroup = commandOptions.find(
        option => option.type === 2
    );

    const subcommands = commandOptions.filter(
        option => option.type === 1
    );

    const hasSubcommands =
        subcommands.length > 0 && !subcommandGroup;

    let currentArgs = [...safeArgs];

    logger.debug(
        `Parsing prefix command: ${cmdData.name}, args=${JSON.stringify(safeArgs)}`
    );

    /**
     * Subcommand groups.
     */
    if (subcommandGroup) {
        const groupInput = currentArgs[0]?.toLowerCase();

        const group = subcommandGroup.options?.find(
            item => item.name === groupInput
        );

        if (group) {
            subcommandGroupName = group.name;
            currentArgs = currentArgs.slice(1);

            const sub = findSubcommand(
                currentArgs[0],
                group.options
            );

            if (sub) {
                subcommandName = sub.name;
                currentArgs = currentArgs.slice(1);

                optionDefs = (sub.options || []).filter(
                    option => option.type !== 1 && option.type !== 2
                );
            }
        }
    }

    /**
     * Regular subcommands.
     */
    else if (hasSubcommands) {
        const sub = findSubcommand(
            currentArgs[0],
            subcommands
        );

        if (sub) {
            subcommandName = sub.name;
            currentArgs = currentArgs.slice(1);

            optionDefs = (sub.options || []).filter(
                option => option.type !== 1 && option.type !== 2
            );
        }
    }

    /**
     * Normal command options.
     */
    else {
        optionDefs = commandOptions.filter(
            option => option.type !== 1 && option.type !== 2
        );
    }

    /**
     * Map arguments to option definitions.
     */
    for (
        let index = 0;
        index < Math.min(currentArgs.length, optionDefs.length);
        index++
    ) {
        const definition = optionDefs[index];

        options[definition.name] = normalizeId(
            currentArgs[index]
        );
    }

    /**
     * Check required options.
     */
    const missing = [];

    const shouldValidate =
        Boolean(subcommandName) ||
        (!hasSubcommands && !subcommandGroup);

    if (shouldValidate) {
        for (const option of optionDefs) {
            const value = options[option.name];

            if (
                option.required &&
                (value === undefined || value === null || value === '')
            ) {
                missing.push({
                    name: option.name,
                    description: option.description,
                    type: option.type
                });
            }
        }
    }

    /**
     * Check missing subcommands.
     */
    if (hasSubcommands && !subcommandName) {
        missing.push({
            name: 'subcommand',
            description: `Available: ${subcommands.map(item => item.name).join(', ')}`,
            type: 1
        });
    }

    if (subcommandGroup && !subcommandGroupName) {
        missing.push({
            name: 'subcommand group',
            description: `Available: ${subcommandGroup.options?.map(item => item.name).join(', ') || 'none'}`,
            type: 2
        });
    } else if (subcommandGroup && subcommandGroupName && !subcommandName) {
        const group = subcommandGroup.options?.find(
            item => item.name === subcommandGroupName
        );

        missing.push({
            name: 'subcommand',
            description: `Available: ${group?.options?.map(item => item.name).join(', ') || 'none'}`,
            type: 1
        });
    }

    logger.debug(
        `Finished parsing ${cmdData.name}: ${JSON.stringify(options)}`
    );

    return createOptionsResult(
        options,
        safeArgs,
        subcommandName,
        subcommandGroupName,
        optionDefs,
        missing
    );
}

/**
 * Create the options interface used by the command adapter.
 */
function createOptionsResult(
    options,
    positional,
    subcommandName,
    subcommandGroupName,
    optionDefs,
    missing
) {
    const getValue = name => options[name] ?? null;

    return {
        ...options,

        _positional: positional,

        get: getValue,

        getString: name => {
            const value = getValue(name);
            return value === null ? null : String(value);
        },

        getUser: name => getValue(name),

        getMember: name => getValue(name),

        getChannel: name => getValue(name),

        getRole: name => getValue(name),

        getInteger: name => {
            const value = getValue(name);

            if (value === null) return null;

            const parsed = Number.parseInt(value, 10);

            return Number.isNaN(parsed) ? null : parsed;
        },

        getBoolean: name => {
            const value = getValue(name);

            if (value === null) return null;

            return value === true || value === 'true';
        },

        getSubcommand: () => subcommandName,

        getSubcommandGroup: () => subcommandGroupName,

        validateRequired: () => ({
            valid: missing.length === 0,
            missing,
            subcommandName,
            subcommandGroupName,
            optionDefs
        })
    };
}
