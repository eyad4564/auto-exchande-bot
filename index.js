const {
    Client,
    GatewayIntentBits,
    Partials,
    ChannelType,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    PermissionsBitField,
    ActivityType,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ==================================================
// FILES
// ==================================================

const CONFIG_FILE = path.join(__dirname, "config.json");
const DATA_FILE = path.join(__dirname, "data.json");

// ==================================================
// DEFAULT CONFIG
// ==================================================

const DEFAULT_CONFIG = {
    token: "",
    ownerId: "",
    postIntervalMinutes: 10
};

// ==================================================
// DEFAULT DATA
// ==================================================

const DEFAULT_DATA = {
    guilds: {},
    posts: {},
    temporaryRoles: {},
    autoTargets: {}
};

// ==================================================
// JSON HELPERS
// ==================================================

function cloneObject(object) {
    return JSON.parse(JSON.stringify(object));
}

function loadJSON(file, fallback) {
    try {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(
                file,
                JSON.stringify(fallback, null, 4),
                "utf8"
            );

            return cloneObject(fallback);
        }

        const raw = fs.readFileSync(file, "utf8").trim();

        if (!raw) {
            fs.writeFileSync(
                file,
                JSON.stringify(fallback, null, 4),
                "utf8"
            );

            return cloneObject(fallback);
        }

        const parsed = JSON.parse(raw);

        if (
            !parsed ||
            typeof parsed !== "object" ||
            Array.isArray(parsed)
        ) {
            throw new Error("JSON root is not an object");
        }

        return parsed;
    } catch (error) {
        console.error(`Error loading JSON file: ${file}`);
        console.error(error);

        try {
            fs.writeFileSync(
                file,
                JSON.stringify(fallback, null, 4),
                "utf8"
            );
        } catch (writeError) {
            console.error("Could not recreate JSON file:");
            console.error(writeError);
        }

        return cloneObject(fallback);
    }
}

function saveJSON(file, object) {
    try {
        const tempFile = `${file}.tmp`;

        fs.writeFileSync(
            tempFile,
            JSON.stringify(object, null, 4),
            "utf8"
        );

        fs.renameSync(tempFile, file);
    } catch (error) {
        console.error(`Error saving JSON file: ${file}`);
        console.error(error);

        try {
            if (fs.existsSync(`${file}.tmp`)) {
                fs.unlinkSync(`${file}.tmp`);
            }
        } catch (_) {}
    }
}

// ==================================================
// LOAD DATA
// ==================================================

let config = loadJSON(
    CONFIG_FILE,
    DEFAULT_CONFIG
);

let data = loadJSON(
    DATA_FILE,
    DEFAULT_DATA
);

if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config)
) {
    config = cloneObject(DEFAULT_CONFIG);
}

if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
) {
    data = cloneObject(DEFAULT_DATA);
}

if (
    !data.guilds ||
    typeof data.guilds !== "object" ||
    Array.isArray(data.guilds)
) {
    data.guilds = {};
}

if (
    !data.posts ||
    typeof data.posts !== "object" ||
    Array.isArray(data.posts)
) {
    data.posts = {};
}

if (
    !data.temporaryRoles ||
    typeof data.temporaryRoles !== "object" ||
    Array.isArray(data.temporaryRoles)
) {
    data.temporaryRoles = {};
}

if (
    !data.autoTargets ||
    typeof data.autoTargets !== "object" ||
    Array.isArray(data.autoTargets)
) {
    data.autoTargets = {};
}

// ==================================================
// TOKEN / OWNER
// ==================================================

const TOKEN =
    process.env.DISCORD_TOKEN ||
    config.token ||
    process.env.TOKEN ||
    "";

const OWNER_ID =
    process.env.OWNER_ID ||
    config.ownerId ||
    "";

// ==================================================
// CONSTANTS
// ==================================================

/*
 * هذه الرومات مخصصة للوحة Auto Exchange.
 *
 * مهم:
 * أمر /auto الجديد لن ينشر داخلها.
 */

const ALLOWED_EXCHANGE_CHANNELS = [
    "1547162535164379146",
    "1547162513899126906",
    "1547162510879101028",
    "1547162619054653491",
    "1547162615917056092",
    "1547162338195406909",
    "1547162551102734397",
    "1547162391672922132",
    "1547162207626727434",
    "1547162211821035611"
];

const ROLE_POST_LIMITS = {
    "1547161680209772544": 1,
    "1547161717841068083": 2,
    "1547161721737711616": 2
};

const TIME_OPTIONS = {
    "1m": {
        label: "1 دقيقة",
        minutes: 1
    },

    "5m": {
        label: "5 دقائق",
        minutes: 5
    },

    "10m": {
        label: "10 دقائق",
        minutes: 10
    },

    "15m": {
        label: "15 دقيقة",
        minutes: 15
    },

    "30m": {
        label: "30 دقيقة",
        minutes: 30
    },

    "1h": {
        label: "ساعة",
        minutes: 60
    },

    "2h": {
        label: "ساعتين",
        minutes: 120
    },

    "6h": {
        label: "6 ساعات",
        minutes: 360
    },

    "12h": {
        label: "12 ساعة",
        minutes: 720
    },

    "24h": {
        label: "24 ساعة",
        minutes: 1440
    }
};

// ==================================================
// CLIENT
// ==================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],

    partials: [
        Partials.Channel,
        Partials.Message
    ]
});

// ==================================================
// STATE
// ==================================================

let backgroundStarted = false;

// ==================================================
// BASIC HELPERS
// ==================================================

function saveData() {
    saveJSON(
        DATA_FILE,
        data
    );
}

function getGuildData(guildId) {
    if (!data.guilds[guildId]) {
        data.guilds[guildId] = {
            exchangeChannels: [],
            postIntervalMinutes:
                Number(config.postIntervalMinutes) || 10,
            setupCompleted: false,
            autoPanels: {}
        };
    }

    const guildData =
        data.guilds[guildId];

    if (!Array.isArray(guildData.exchangeChannels)) {
        guildData.exchangeChannels = [];
    }

    guildData.exchangeChannels =
        guildData.exchangeChannels.filter(
            id =>
                ALLOWED_EXCHANGE_CHANNELS.includes(
                    String(id)
                )
        );

    const interval =
        Number(
            guildData.postIntervalMinutes
        );

    if (
        !Number.isFinite(interval) ||
        interval <= 0
    ) {
        guildData.postIntervalMinutes =
            Number(config.postIntervalMinutes) > 0
                ? Number(config.postIntervalMinutes)
                : 10;
    }

    if (
        typeof guildData.setupCompleted !==
        "boolean"
    ) {
        guildData.setupCompleted =
            guildData.exchangeChannels.length > 0;
    }

    if (
        !guildData.autoPanels ||
        typeof guildData.autoPanels !== "object" ||
        Array.isArray(guildData.autoPanels)
    ) {
        guildData.autoPanels = {};
    }

    return guildData;
}

function isOwner(userId) {
    return Boolean(
        OWNER_ID &&
        String(userId) === String(OWNER_ID)
    );
}

function isAdministrator(member) {
    return Boolean(
        member &&
        member.permissions &&
        member.permissions.has(
            PermissionsBitField.Flags.Administrator
        )
    );
}

function canManageBot(member) {
    return Boolean(
        member &&
        (
            isOwner(member.id) ||
            isAdministrator(member)
        )
    );
}

function generatePostId() {
    return `${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 10)}`;
}

function safeDisplayAvatarURL(user) {
    try {
        if (
            !user ||
            typeof user.displayAvatarURL !== "function"
        ) {
            return undefined;
        }

        return user.displayAvatarURL({
            extension: "png",
            size: 256
        });
    } catch (_) {
        return undefined;
    }
}

// ==================================================
// POST LIMIT
// ==================================================

function getRolePostLimit(member) {
    if (!member) {
        return 0;
    }

    let highestLimit = 0;

    for (
        const role of member.roles.cache.values()
    ) {
        const limit =
            ROLE_POST_LIMITS[role.id];

        if (limit) {
            highestLimit =
                Math.max(
                    highestLimit,
                    Number(limit)
                );
        }
    }

    return highestLimit;
}

// ==================================================
// POSTS
// ==================================================

const ACTIVE_POST_STATUSES = [
    "waiting_channel",
    "waiting_content",
    "draft",
    "active"
];

function getActivePostsForUser(
    guildId,
    userId
) {
    return Object.values(
        data.posts
    ).filter(
        post =>
            post &&
            String(post.guildId) === String(guildId) &&
            String(post.userId) === String(userId) &&
            ACTIVE_POST_STATUSES.includes(post.status)
    );
}

function getPendingPostForUser(userId) {
    const posts =
        Object.values(data.posts)
            .filter(
                post =>
                    post &&
                    String(post.userId) === String(userId) &&
                    post.status === "waiting_content"
            )
            .sort(
                (a, b) =>
                    Number(
                        b.updatedAt ||
                        b.createdAt ||
                        0
                    ) -
                    Number(
                        a.updatedAt ||
                        a.createdAt ||
                        0
                    )
            );

    return posts[0] || null;
}

function hasPendingDMPost(userId) {
    return Boolean(
        getPendingPostForUser(userId)
    );
}

// ==================================================
// DURATION
// ==================================================

function parseDuration(value) {
    if (!value) {
        return null;
    }

    const match =
        String(value)
            .trim()
            .toLowerCase()
            .match(/^(\d+)\s*(m|h|d|w|y)$/);

    if (!match) {
        return null;
    }

    const amount =
        Number(match[1]);

    const unit =
        match[2];

    if (
        !Number.isFinite(amount) ||
        amount <= 0
    ) {
        return null;
    }

    const multipliers = {
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
        w: 7 * 24 * 60 * 60 * 1000,
        y: 365 * 24 * 60 * 60 * 1000
    };

    return amount * multipliers[unit];
}

function formatDuration(value) {
    const ms =
        Number(value);

    if (
        !Number.isFinite(ms) ||
        ms <= 0
    ) {
        return "غير محدد";
    }

    const minutes =
        Math.floor(
            ms / 60000
        );

    if (minutes < 60) {
        return `${minutes} دقيقة`;
    }

    const hours =
        Math.floor(
            minutes / 60
        );

    if (hours < 24) {
        return `${hours} ساعة`;
    }

    const days =
        Math.floor(
            hours / 24
        );

    if (days < 7) {
        return `${days} يوم`;
    }

    const weeks =
        Math.floor(
            days / 7
        );

    if (weeks < 52) {
        return `${weeks} أسبوع`;
    }

    const years =
        Math.floor(
            days / 365
        );

    return `${years} سنة`;
}

// ==================================================
// PUBLISH ERRORS
// ==================================================

function getPublishError(error) {
    const errors = {
        GUILD_NOT_FOUND:
            "السيرفر غير موجود.",

        CHANNEL_NOT_FOUND:
            "روم النشر غير موجود.",

        CHANNEL_NOT_ENABLED:
            "هذا الروم غير مفعل في إعدادات Auto Exchange.",

        INVALID_CHANNEL:
            "الروم المختار ليس رومًا نصيًا.",

        MISSING_PERMISSIONS:
            "البوت لا يملك صلاحيات كافية في روم النشر.",

        WEBHOOK_CREATE_FAILED:
            "فشل إنشاء Webhook للنشر.",

        WEBHOOK_SEND_FAILED:
            "فشل إرسال المنشور.",

        NO_CONTENT:
            "المنشور لا يحتوي على محتوى.",

        CONTENT_TOO_LONG:
            "محتوى المنشور طويل جدًا. الحد الأقصى 2000 حرف.",

        TOO_MANY_ATTACHMENTS:
            "لا يمكن إرسال أكثر من 10 ملفات أو صور في المنشور."
    };

    return (
        errors[error] ||
        "حدث خطأ غير معروف أثناء النشر."
    );
}

// ==================================================
// EXCHANGE CHANNELS
// ==================================================

function getActiveExchangeChannels(guild) {
    if (!guild) {
        return [];
    }

    const guildData =
        getGuildData(guild.id);

    const configured =
        Array.isArray(
            guildData.exchangeChannels
        )
            ? guildData.exchangeChannels
            : [];

    const channels = [];

    for (
        const channelId of configured
    ) {
        if (
            !ALLOWED_EXCHANGE_CHANNELS.includes(
                String(channelId)
            )
        ) {
            continue;
        }

        const channel =
            guild.channels.cache.get(
                channelId
            );

        if (
            channel &&
            channel.type ===
            ChannelType.GuildText
        ) {
            channels.push(channel);
        }
    }

    return channels;
}

// ==================================================
// PERSISTENT PANEL
// ==================================================

function createPersistentAutoPanel(guild) {
    const guildData =
        getGuildData(
            guild.id
        );

    const activeChannels =
        guildData.exchangeChannels
            .filter(
                id =>
                    ALLOWED_EXCHANGE_CHANNELS.includes(
                        String(id)
                    )
            )
            .map(
                id =>
                    guild.channels.cache.get(id)
            )
            .filter(
                channel =>
                    channel &&
                    channel.type ===
                    ChannelType.GuildText
            );

    const channelText =
        activeChannels.length > 0
            ? activeChannels
                .map(
                    channel =>
                        `• <#${channel.id}>`
                )
                .join("\n")
            : "لا توجد رومات مفعلة.";

    const embed =
        new EmbedBuilder()
            .setTitle(
                "📢 Auto Exchange"
            )
            .setDescription(
                [
                    "استخدم القائمة بالأسفل لإدارة منشوراتك.",
                    "",
                    "✅ النظام جاهز لجميع الأعضاء.",
                    "📌 لا تحتاج إلى كتابة أي أمر.",
                    "",
                    `⏱️ إعادة النشر كل **${guildData.postIntervalMinutes} دقيقة**`,
                    "",
                    "📍 رومات التبادل:",
                    channelText,
                    "",
                    "اختر العملية من القائمة:"
                ].join("\n")
            )
            .setFooter({
                text:
                    "Auto Exchange • لوحة ثابتة"
            });

    const options = [
        new StringSelectMenuOptionBuilder()
            .setLabel(
                "بدء نشر"
            )
            .setDescription(
                "إنشاء منشور جديد"
            )
            .setValue(
                "start_post"
            )
            .setEmoji("📢"),

        new StringSelectMenuOptionBuilder()
            .setLabel(
                "إيقاف منشور"
            )
            .setDescription(
                "إيقاف أحد منشوراتك"
            )
            .setValue(
                "stop_post"
            )
            .setEmoji("🛑"),

        new StringSelectMenuOptionBuilder()
            .setLabel(
                "منشوراتي"
            )
            .setDescription(
                "عرض منشوراتك الحالية"
            )
            .setValue(
                "my_posts"
            )
            .setEmoji("📋")
    ];

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "auto_main_menu"
            )
            .setPlaceholder(
                "اختر العملية..."
            )
            .addOptions(
                options
            );

    return {
        embeds: [
            embed
        ],

        components: [
            new ActionRowBuilder()
                .addComponents(
                    menu
                )
        ]
    };
}

// ==================================================
// ENSURE PERSISTENT PANELS
// ==================================================

async function ensurePersistentPanels(guild) {
    if (!guild) {
        return;
    }

    const guildData =
        getGuildData(
            guild.id
        );

    if (!guildData.setupCompleted) {
        return;
    }

    const channels =
        getActiveExchangeChannels(
            guild
        );

    for (
        const channelId of Object.keys(
            guildData.autoPanels
        )
    ) {
        if (
            !guildData.exchangeChannels.includes(
                channelId
            )
        ) {
            delete guildData.autoPanels[channelId];
        }
    }

    for (
        const channel of channels
    ) {
        try {
            const botMember =
                guild.members.me ||
                await guild.members
                    .fetch(
                        client.user.id
                    )
                    .catch(
                        () => null
                    );

            if (!botMember) {
                continue;
            }

            const permissions =
                channel.permissionsFor(
                    botMember
                );

            if (
                !permissions ||
                !permissions.has(
                    PermissionsBitField.Flags.ViewChannel
                ) ||
                !permissions.has(
                    PermissionsBitField.Flags.SendMessages
                ) ||
                !permissions.has(
                    PermissionsBitField.Flags.EmbedLinks
                )
            ) {
                console.error(
                    `Panel permissions missing in #${channel.name} (${channel.id})`
                );

                continue;
            }

            const panelPayload =
                createPersistentAutoPanel(
                    guild
                );

            let panelMessage =
                null;

            const storedMessageId =
                guildData.autoPanels[
                    channel.id
                ];

            if (storedMessageId) {
                try {
                    panelMessage =
                        await channel.messages.fetch(
                            storedMessageId
                        );
                } catch (_) {
                    panelMessage =
                        null;
                }
            }

            if (!panelMessage) {
                panelMessage =
                    await channel.send(
                        panelPayload
                    );

                guildData.autoPanels[
                    channel.id
                ] =
                    panelMessage.id;

                saveData();

                console.log(
                    `Created Auto Exchange panel in #${channel.name}`
                );
            } else if (
                panelMessage.author.id ===
                client.user.id
            ) {
                await panelMessage.edit(
                    panelPayload
                );
            } else {
                guildData.autoPanels[
                    channel.id
                ] = null;

                saveData();
            }
        } catch (error) {
            console.error(
                `ensurePersistentPanels error in channel ${channel.id}:`
            );

            console.error(error);
        }
    }

    saveData();
}

// ==================================================
// POST SLOT MENU
// ==================================================

function createPostSlotMenu(
    limit,
    guildId,
    userId
) {
    const usedSlots =
        new Set(
            getActivePostsForUser(
                guildId,
                userId
            )
                .map(
                    post =>
                        Number(
                            post.slot
                        )
                )
                .filter(Boolean)
        );

    const options = [];

    for (
        let i = 1;
        i <= limit;
        i++
    ) {
        const used =
            usedSlots.has(i);

        options.push(
            new StringSelectMenuOptionBuilder()
                .setLabel(
                    used
                        ? `منشور ${i} - مستخدم`
                        : `منشور ${i}`
                )
                .setDescription(
                    used
                        ? "هذا المكان مستخدم بالفعل"
                        : "اختيار هذا المكان لمنشورك"
                )
                .setValue(
                    String(i)
                )
                .setEmoji(
                    used
                        ? "🔴"
                        : "🟢"
                )
        );
    }

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "post_slot_menu"
            )
            .setPlaceholder(
                "اختر رقم المنشور..."
            )
            .addOptions(
                options
            );

    return new ActionRowBuilder()
        .addComponents(
            menu
        );
}

// ==================================================
// OWNER SETUP MENU
// ==================================================

function createOwnerChannelSetupMenu(
    guild
) {
    const guildData =
        getGuildData(
            guild.id
        );

    const options =
        ALLOWED_EXCHANGE_CHANNELS
            .slice(0, 25)
            .map(
                channelId => {
                    const channel =
                        guild.channels.cache.get(
                            channelId
                        );

                    return new StringSelectMenuOptionBuilder()
                        .setLabel(
                            channel
                                ? channel.name.slice(
                                    0,
                                    100
                                )
                                : `روم ${channelId}`
                        )
                        .setDescription(
                            channel
                                ? "سيظهر داخله نظام Auto Exchange"
                                : "الروم غير موجود في السيرفر"
                        )
                        .setValue(
                            channelId
                        )
                        .setDefault(
                            guildData.exchangeChannels.includes(
                                channelId
                            )
                        );
                }
            );

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "owner_exchange_channel_setup"
            )
            .setPlaceholder(
                "اختر رومات التبادل..."
            )
            .setMinValues(1)
            .setMaxValues(
                options.length
            )
            .addOptions(
                options
            );

    return new ActionRowBuilder()
        .addComponents(
            menu
        );
}

// ==================================================
// MY POSTS MENU
// ==================================================

function createMyPostsMenu(
    guildId,
    userId
) {
    const posts =
        getActivePostsForUser(
            guildId,
            userId
        ).slice(
            0,
            25
        );

    if (
        posts.length === 0
    ) {
        return null;
    }

    const options =
        posts.map(
            post =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(
                        `منشور ${post.slot}`
                    )
                    .setDescription(
                        post.channelName
                            ? `الروم: #${post.channelName}`.slice(
                                0,
                                100
                            )
                            : "بدون روم"
                    )
                    .setValue(
                        `stop_post:${post.id}`
                    )
                    .setEmoji(
                        post.status ===
                        "active"
                            ? "🟢"
                            : "🟡"
                    )
        );

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "my_posts_menu"
            )
            .setPlaceholder(
                "اختر المنشور..."
            )
            .addOptions(
                options
            );

    return new ActionRowBuilder()
        .addComponents(
            menu
        );
}

// ==================================================
// WEBHOOK
// ==================================================

async function getOrCreateWebhook(
    channel
) {
    try {
        if (
            !channel ||
            channel.type !==
            ChannelType.GuildText
        ) {
            return null;
        }

        const webhooks =
            await channel.fetchWebhooks();

        let webhook =
            webhooks.find(
                hook =>
                    hook.name ===
                    "Auto Exchange" &&
                    hook.owner &&
                    hook.owner.id ===
                    client.user.id
            );

        if (webhook) {
            return webhook;
        }

        webhook =
            await channel.createWebhook({
                name:
                    "Auto Exchange",

                reason:
                    "Auto Exchange publishing system"
            });

        return webhook;
    } catch (error) {
        console.error(
            "Webhook error:"
        );

        console.error(
            error
        );

        return null;
    }
}

// ==================================================
// DELETE POST MESSAGES
// ==================================================

async function deletePostMessages(
    post
) {
    if (!post) {
        return;
    }

    const messageIds =
        Array.isArray(
            post.messageIds
        )
            ? [...post.messageIds]
            : [];

    if (
        messageIds.length === 0
    ) {
        return;
    }

    const guild =
        client.guilds.cache.get(
            post.guildId
        );

    if (!guild) {
        post.messageIds = [];
        return;
    }

    const channel =
        guild.channels.cache.get(
            post.channelId
        );

    if (
        !channel ||
        channel.type !==
        ChannelType.GuildText
    ) {
        post.messageIds = [];
        return;
    }

    const webhook =
        await getOrCreateWebhook(
            channel
        );

    if (!webhook) {
        return;
    }

    for (
        const messageId of messageIds
    ) {
        try {
            await webhook.deleteMessage(
                messageId
            );
        } catch (error) {
            if (
                error &&
                (
                    error.code ===
                    10008 ||
                    error.code ===
                    10003
                )
            ) {
                continue;
            }

            console.error(
                `Could not delete post message ${messageId}:`
            );

            console.error(
                error
            );
        }
    }

    post.messageIds = [];
}

// ==================================================
// PUBLISH POST
// ==================================================

async function publishPost(
    post
) {
    try {
        if (!post) {
            return {
                success: false,
                error:
                    "WEBHOOK_SEND_FAILED"
            };
        }

        const guild =
            client.guilds.cache.get(
                post.guildId
            );

        if (!guild) {
            return {
                success: false,
                error:
                    "GUILD_NOT_FOUND"
            };
        }

        if (!post.channelId) {
            return {
                success: false,
                error:
                    "CHANNEL_NOT_FOUND"
            };
        }

        /*
         * مهم:
         *
         * /auto الجديد لا يعتمد على
         * ALLOWED_EXCHANGE_CHANNELS.
         *
         * لذلك لا نفحص هنا أن الروم موجود
         * داخل exchangeChannels.
         */

        const channel =
            guild.channels.cache.get(
                post.channelId
            );

        if (!channel) {
            return {
                success: false,
                error:
                    "CHANNEL_NOT_FOUND"
            };
        }

        if (
            channel.type !==
            ChannelType.GuildText
        ) {
            return {
                success: false,
                error:
                    "INVALID_CHANNEL"
            };
        }

        /*
         * حماية إضافية:
         * لا نسمح بنشر /auto داخل
         * رومات التبادل المحددة.
         */

        if (
            ALLOWED_EXCHANGE_CHANNELS.includes(
                String(post.channelId)
            )
        ) {
            return {
                success: false,
                error:
                    "CHANNEL_NOT_ENABLED"
            };
        }

        const botMember =
            guild.members.me ||
            await guild.members
                .fetch(
                    client.user.id
                )
                .catch(
                    () => null
                );

        if (!botMember) {
            return {
                success: false,
                error:
                    "MISSING_PERMISSIONS"
            };
        }

        const permissions =
            channel.permissionsFor(
                botMember
            );

        if (
            !permissions ||
            !permissions.has(
                PermissionsBitField.Flags.ViewChannel
            ) ||
            !permissions.has(
                PermissionsBitField.Flags.SendMessages
            ) ||
            !permissions.has(
                PermissionsBitField.Flags.ManageWebhooks
            )
        ) {
            return {
                success: false,
                error:
                    "MISSING_PERMISSIONS"
            };
        }

        const webhook =
            await getOrCreateWebhook(
                channel
            );

        if (!webhook) {
            return {
                success: false,
                error:
                    "WEBHOOK_CREATE_FAILED"
            };
        }

        let member = null;

        try {
            member =
                await guild.members.fetch(
                    post.userId
                );
        } catch (_) {
            member = null;
        }

        const username =
            member
                ? member.displayName
                : "Auto Exchange User";

        const avatarURL =
            post.avatarURL ||
            (
                member
                    ? safeDisplayAvatarURL(
                        member.user
                    )
                    : undefined
            );

        const originalContent =
            String(
                post.content || ""
            ).trim();

        const attachments =
            Array.isArray(
                post.attachments
            )
                ? post.attachments
                : [];

        if (
            !originalContent &&
            attachments.length === 0
        ) {
            return {
                success: false,
                error:
                    "NO_CONTENT"
            };
        }

        if (
            attachments.length > 10
        ) {
            return {
                success: false,
                error:
                    "TOO_MANY_ATTACHMENTS"
            };
        }

        const footer =
            `\n\nتواصل مع <@${post.userId}> للعمل المنشور`;

        const content =
            originalContent +
            footer;

        if (
            content.length > 2000
        ) {
            return {
                success: false,
                error:
                    "CONTENT_TOO_LONG"
            };
        }

        const files =
            attachments
                .filter(
                    attachment =>
                        attachment &&
                        attachment.url
                )
                .slice(
                    0,
                    10
                )
                .map(
                    attachment => ({
                        attachment:
                            attachment.url,

                        name:
                            attachment.name ||
                            `attachment_${Date.now()}`
                    })
                );

        let sentMessage;

        try {
            const payload = {
                content,
                username,
                files,

                allowedMentions: {
                    parse: [],
                    users: [
                        post.userId
                    ]
                },

                wait: true
            };

            if (avatarURL) {
                payload.avatarURL =
                    avatarURL;
            }

            sentMessage =
                await webhook.send(
                    payload
                );
        } catch (error) {
            console.error(
                "Webhook send error:"
            );

            console.error(
                error
            );

            return {
                success: false,
                error:
                    "WEBHOOK_SEND_FAILED"
            };
        }

        if (
            sentMessage &&
            sentMessage.id
        ) {
            if (
                !Array.isArray(
                    post.messageIds
                )
            ) {
                post.messageIds =
                    [];
            }

            post.messageIds.push(
                sentMessage.id
            );

            if (
                post.messageIds.length >
                100
            ) {
                post.messageIds =
                    post.messageIds.slice(
                        -100
                    );
            }
        }

        post.lastPublishedAt =
            Date.now();

        post.status =
            "active";

        post.publishCount =
            Number(
                post.publishCount ||
                0
            ) + 1;

        post.updatedAt =
            Date.now();

        post.lastError =
            null;

        saveData();

        return {
            success: true
        };
    } catch (error) {
        console.error(
            "publishPost error:"
        );

        console.error(
            error
        );

        return {
            success: false,
            error:
                "WEBHOOK_SEND_FAILED"
        };
    }
}

// ==================================================
// AUTO EXCHANGE LOOP
// ==================================================

async function runAutoExchange() {
    const now =
        Date.now();

    const posts =
        Object.values(
            data.posts
        );

    for (
        const post of posts
    ) {
        try {
            if (!post) {
                continue;
            }

            if (
                post.status !==
                "active"
            ) {
                continue;
            }

            if (!post.channelId) {
                continue;
            }

            if (
                !post.lastPublishedAt
            ) {
                continue;
            }

            const guild =
                client.guilds.cache.get(
                    post.guildId
                );

            if (!guild) {
                continue;
            }

            const guildData =
                getGuildData(
                    guild.id
                );

            const interval =
                Number(
                    guildData.postIntervalMinutes
                ) || 10;

            const intervalMs =
                interval *
                60 *
                1000;

            if (
                now -
                Number(
                    post.lastPublishedAt
                ) <
                intervalMs
            ) {
                continue;
            }

            const result =
                await publishPost(
                    post
                );

            if (
                !result.success
            ) {
                post.lastError =
                    result.error;

                post.updatedAt =
                    Date.now();

                if (
                    result.error ===
                    "CHANNEL_NOT_FOUND" ||
                    result.error ===
                    "INVALID_CHANNEL"
                ) {
                    post.status =
                        "inactive";
                }

                saveData();
            }
        } catch (error) {
            console.error(
                "Auto Exchange loop error:"
            );

            console.error(
                error
            );
        }
    }
}

// ==================================================
// TEMPORARY ROLE DATA
// ==================================================

function getTemporaryRolesForUser(
    userId
) {
    if (
        !data.temporaryRoles[userId] ||
        typeof data.temporaryRoles[userId] !==
        "object"
    ) {
        data.temporaryRoles[userId] = {
            roles: []
        };
    }

    if (
        !Array.isArray(
            data.temporaryRoles[
                userId
            ].roles
        )
    ) {
        data.temporaryRoles[
            userId
        ].roles = [];
    }

    return data.temporaryRoles[
        userId
    ].roles;
}

function addTemporaryRole(
    userId,
    guildId,
    roleId,
    expiresAt,
    addedByBot = true
) {
    const roles =
        getTemporaryRolesForUser(
            userId
        );

    const existingIndex =
        roles.findIndex(
            item =>
                item &&
                String(
                    item.guildId
                ) ===
                String(guildId) &&
                String(
                    item.roleId
                ) ===
                String(roleId)
        );

    if (
        existingIndex !== -1
    ) {
        const oldData =
            roles[
                existingIndex
            ];

        const oldExpires =
            Number(
                oldData.expiresAt ||
                0
            );

        const newExpires =
            Number(
                expiresAt
            );

        roles[
            existingIndex
        ] = {
            guildId,
            roleId,

            expiresAt:
                Math.max(
                    oldExpires,
                    newExpires
                ),

            addedByBot:
                oldData.addedByBot ===
                false
                    ? false
                    : Boolean(
                        oldData.addedByBot ??
                        addedByBot
                    )
        };
    } else {
        roles.push({
            guildId,
            roleId,
            expiresAt,
            addedByBot:
                Boolean(
                    addedByBot
                )
        });
    }

    data.temporaryRoles[
        userId
    ] = {
        roles
    };

    saveData();
}

// ==================================================
// +رول COMMAND
// ==================================================

async function handleRoleCommand(
    message
) {
    if (
        !message ||
        message.author.bot
    ) {
        return false;
    }

    const content =
        String(
            message.content || ""
        ).trim();

    if (
        !content.startsWith(
            "+رول"
        )
    ) {
        return false;
    }

    if (
        content !== "+رول" &&
        !content.startsWith(
            "+رول "
        )
    ) {
        return false;
    }

    if (!message.guild) {
        await message.reply(
            "❌ هذا الأمر يعمل داخل السيرفر فقط."
        );

        return true;
    }

    if (
        !canManageBot(
            message.member
        )
    ) {
        await message.reply(
            "❌ ليس لديك صلاحية استخدام هذا الأمر."
        );

        return true;
    }

    const args =
        content.split(
            /\s+/
        );

    if (
        args.length !== 4
    ) {
        await message.reply(
            [
                "❌ الاستخدام غير صحيح.",
                "",
                "استخدم:",
                "`+رول @العضو @الرتبة 1m`",
                "`+رول @العضو @الرتبة 1h`",
                "`+رول @العضو @الرتبة 1d`",
                "`+رول @العضو @الرتبة 1w`",
                "`+رول @العضو @الرتبة 1y`"
            ].join("\n")
        );

        return true;
    }

    const target =
        message.mentions.members.first();

    const role =
        message.mentions.roles.first();

    const durationText =
        args[3];

    if (!target) {
        await message.reply(
            "❌ منشن العضو المطلوب."
        );

        return true;
    }

    if (!role) {
        await message.reply(
            "❌ منشن الرتبة المطلوبة."
        );

        return true;
    }

    const duration =
        parseDuration(
            durationText
        );

    if (!duration) {
        await message.reply(
            [
                "❌ مدة غير صحيحة.",
                "",
                "استخدم:",
                "`1m` = دقيقة",
                "`1h` = ساعة",
                "`1d` = يوم",
                "`1w` = أسبوع",
                "`1y` = سنة"
            ].join("\n")
        );

        return true;
    }

    if (
        target.user.bot
    ) {
        await message.reply(
            "❌ لا يمكنك إعطاء رتبة لبوت."
        );

        return true;
    }

    if (
        role.id ===
        message.guild.id
    ) {
        await message.reply(
            "❌ لا يمكن إعطاء رتبة @everyone."
        );

        return true;
    }

    if (
        role.managed
    ) {
        await message.reply(
            "❌ لا يمكن إعطاء رتبة Managed."
        );

        return true;
    }

    const botMember =
        message.guild.members.me ||
        await message.guild.members
            .fetch(
                client.user.id
            )
            .catch(
                () => null
            );

    if (!botMember) {
        await message.reply(
            "❌ لم أستطع معرفة رتبة البوت."
        );

        return true;
    }

    if (
        !botMember.permissions.has(
            PermissionsBitField.Flags.ManageRoles
        )
    ) {
        await message.reply(
            "❌ البوت لا يملك صلاحية Manage Roles."
        );

        return true;
    }

    if (
        role.position >=
        botMember.roles.highest.position
    ) {
        await message.reply(
            "❌ رتبة البوت يجب أن تكون أعلى من الرتبة المطلوبة."
        );

        return true;
    }

    if (
        !isOwner(
            message.author.id
        ) &&
        role.position >=
        message.member.roles.highest.position
    ) {
        await message.reply(
            "❌ لا يمكنك إعطاء رتبة مساوية أو أعلى من أعلى رتبة لديك."
        );

        return true;
    }

    try {
        const expiresAt =
            Date.now() +
            duration;

        const alreadyHasRole =
            target.roles.cache.has(
                role.id
            );

        if (!alreadyHasRole) {
            await target.roles.add(
                role,
                `Temporary role by ${message.author.tag}`
            );
        }

        addTemporaryRole(
            target.id,
            message.guild.id,
            role.id,
            expiresAt,
            !alreadyHasRole
        );

        await message.reply(
            [
                "✅ تم إعطاء الرتبة بنجاح.",
                "",
                `👤 العضو: ${target}`,
                `🎭 الرتبة: ${role}`,
                `⏱️ المدة: **${formatDuration(duration)}**`,
                "",
                "🕒 سيتم حذف الرتبة تلقائيًا بعد انتهاء المدة."
            ].join("\n")
        );
    } catch (error) {
        console.error(
            "+رول error:"
        );

        console.error(
            error
        );

        if (
            error &&
            error.code === 50013
        ) {
            await message.reply(
                "❌ البوت لا يملك صلاحية إدارة هذه الرتبة."
            );
        } else {
            await message.reply(
                "❌ حدث خطأ أثناء إعطاء الرتبة."
            );
        }
    }

    return true;
}

// ==================================================
// REMOVE EXPIRED ROLES
// ==================================================

async function removeExpiredRoles() {
    const now =
        Date.now();

    let changed =
        false;

    for (
        const [
            userId,
            userData
        ] of Object.entries(
            data.temporaryRoles
        )
    ) {
        if (
            !userData ||
            !Array.isArray(
                userData.roles
            )
        ) {
            delete data.temporaryRoles[
                userId
            ];

            changed =
                true;

            continue;
        }

        const remaining = [];

        for (
            const roleData of userData.roles
        ) {
            if (
                !roleData ||
                !roleData.guildId ||
                !roleData.roleId ||
                !roleData.expiresAt
            ) {
                changed =
                    true;

                continue;
            }

            const expiresAt =
                Number(
                    roleData.expiresAt
                );

            if (
                !Number.isFinite(
                    expiresAt
                )
            ) {
                changed =
                    true;

                continue;
            }

            if (
                expiresAt > now
            ) {
                remaining.push(
                    roleData
                );

                continue;
            }

            const guild =
                client.guilds.cache.get(
                    roleData.guildId
                );

            if (!guild) {
                changed =
                    true;

                continue;
            }

            try {
                const member =
                    await guild.members.fetch(
                        userId
                    );

                const role =
                    guild.roles.cache.get(
                        roleData.roleId
                    );

                if (!role) {
                    changed =
                        true;

                    continue;
                }

                const botMember =
                    guild.members.me ||
                    await guild.members
                        .fetch(
                            client.user.id
                        )
                        .catch(
                            () => null
                        );

                if (!botMember) {
                    remaining.push(
                        roleData
                    );

                    continue;
                }

                if (
                    role.managed ||
                    role.position >=
                    botMember.roles.highest.position
                ) {
                    console.error(
                        `Cannot remove role ${role.id}: role is above bot.`
                    );

                    remaining.push(
                        roleData
                    );

                    continue;
                }

                if (
                    roleData.addedByBot ===
                    false
                ) {
                    changed =
                        true;

                    continue;
                }

                if (
                    member.roles.cache.has(
                        role.id
                    )
                ) {
                    await member.roles.remove(
                        role,
                        "Temporary role expired"
                    );
                }

                changed =
                    true;
            } catch (error) {
                console.error(
                    `Error removing expired role ${roleData.roleId} from ${userId}:`
                );

                console.error(
                    error
                );

                if (
                    error &&
                    (
                        error.code ===
                        10007 ||
                        error.code ===
                        10011
                    )
                ) {
                    changed =
                        true;
                } else {
                    remaining.push(
                        roleData
                    );
                }
            }
        }

        if (
            remaining.length > 0
        ) {
            data.temporaryRoles[
                userId
            ] = {
                roles:
                    remaining
            };
        } else {
            delete data.temporaryRoles[
                userId
            ];

            changed =
                true;
        }
    }

    if (changed) {
        saveData();
    }
}

// ==================================================
// CLEANUP
// ==================================================

function cleanupData() {
    const now =
        Date.now();

    let changed =
        false;

    for (
        const [
            postId,
            post
        ] of Object.entries(
            data.posts
        )
    ) {
        if (!post) {
            delete data.posts[
                postId
            ];

            changed =
                true;

            continue;
        }

        const createdAt =
            Number(
                post.createdAt ||
                0
            );

        if (
            [
                "waiting",
                "waiting_channel",
                "waiting_content",
                "draft"
            ].includes(
                post.status
            ) &&
            createdAt &&
            now -
            createdAt >
            15 *
            60 *
            1000
        ) {
            delete data.posts[
                postId
            ];

            changed =
                true;
        }
    }

    for (
        const [
            postId,
            post
        ] of Object.entries(
            data.posts
        )
    ) {
        if (
            !post ||
            !post.guildId ||
            !post.userId ||
            !post.status
        ) {
            delete data.posts[
                postId
            ];

            changed =
                true;
        }
    }

    for (
        const post of Object.values(
            data.posts
        )
    ) {
        if (!post) {
            continue;
        }

        if (
            !Array.isArray(
                post.messageIds
            )
        ) {
            post.messageIds =
                [];

            changed =
                true;
        }

        if (
            !Array.isArray(
                post.attachments
            )
        ) {
            post.attachments =
                [];

            changed =
                true;
        }

        if (
            typeof post.publishCount !==
            "number"
        ) {
            post.publishCount =
                Number(
                    post.publishCount
                ) || 0;

            changed =
                true;
        }
    }

    /*
     * تنظيف جلسات /auto القديمة
     */

    if (
        data.autoTargets &&
        typeof data.autoTargets === "object"
    ) {
        for (
            const [
                userId,
                target
            ] of Object.entries(
                data.autoTargets
            )
        ) {
            if (
                !target ||
                !target.createdAt ||
                now -
                Number(target.createdAt) >
                15 *
                60 *
                1000
            ) {
                delete data.autoTargets[
                    userId
                ];

                changed =
                    true;
            }
        }
    }

    if (changed) {
        saveData();
    }
}

// ==================================================
// DM POST HANDLER
// ==================================================

async function handleDMPost(
    message
) {
    if (
        message.author.bot
    ) {
        return false;
    }

    if (message.guild) {
        return false;
    }

    const post =
        getPendingPostForUser(
            message.author.id
        );

    if (!post) {
        return false;
    }

    const guild =
        client.guilds.cache.get(
            post.guildId
        );

    if (!guild) {
        await message.reply(
            "❌ السيرفر غير موجود أو البوت لم يعد فيه."
        );

        return true;
    }

    let member;

    try {
        member =
            await guild.members.fetch(
                message.author.id
            );
    } catch (_) {
        await message.reply(
            "❌ لم أستطع العثور عليك داخل السيرفر."
        );

        return true;
    }

    if (!member) {
        await message.reply(
            "❌ لم أستطع العثور عليك داخل السيرفر."
        );

        return true;
    }

    const content =
        String(
            message.content || ""
        ).trim();

    const attachments =
        Array.from(
            message.attachments.values()
        ).map(
            attachment => ({
                url:
                    attachment.url,

                name:
                    attachment.name ||
                    `attachment_${Date.now()}`,

                contentType:
                    attachment.contentType ||
                    null
            })
        );

    if (
        !content &&
        attachments.length === 0
    ) {
        await message.reply(
            "❌ أرسل نصًا أو صورة أو ملفًا في المنشور."
        );

        return true;
    }

    if (
        attachments.length > 10
    ) {
        await message.reply(
            "❌ لا يمكنك إرسال أكثر من 10 ملفات أو صور في المنشور."
        );

        return true;
    }

    post.content =
        content;

    post.attachments =
        attachments;

    post.avatarURL =
        safeDisplayAvatarURL(
            message.author
        );

    post.updatedAt =
        Date.now();

    post.status =
        "draft";

    saveData();

    await message.reply(
        [
            "جاري نشر منشورك...",
            "",
            `رقم المنشور: **${post.slot}**`,
            `الروم: <#${post.channelId}>`
        ].join("\n")
    );

    const result =
        await publishPost(
            post
        );

    if (
        !result.success
    ) {
        post.status =
            "waiting_content";

        post.lastError =
            result.error;

        post.updatedAt =
            Date.now();

        saveData();

        await message.reply(
            [
                "❌ فشل نشر المنشور.",
                "",
                `السبب: ${getPublishError(result.error)}`,
                "",
                "يمكنك إرسال المحتوى مرة أخرى في الخاص بعد حل المشكلة."
            ].join("\n")
        );

        return true;
    }

    await message.reply(
        [
            "✅ تم نشر المنشور بنجاح!",
            "",
            `رقم المنشور: **${post.slot}**`,
            `الروم: <#${post.channelId}>`,
            "",
            "سيتم إعادة نشره تلقائيًا حسب المدة المحددة."
        ].join("\n")
    );

    return true;
}

// ==================================================
// SLASH COMMAND BUILDERS
// ==================================================

function buildSlashCommands() {
    const setupAuto =
        new SlashCommandBuilder()
            .setName(
                "setupauto"
            )
            .setDescription(
                "إعداد Auto Exchange للـOwner فقط"
            );

    const autoTime =
        new SlashCommandBuilder()
            .setName(
                "autotime"
            )
            .setDescription(
                "تغيير مدة إعادة نشر Auto Exchange للـOwner فقط"
            )
            .addStringOption(
                option =>
                    option
                        .setName(
                            "duration"
                        )
                        .setDescription(
                            "اختر مدة إعادة النشر"
                        )
                        .setRequired(
                            true
                        )
                        .addChoices(
                            ...Object.entries(
                                TIME_OPTIONS
                            ).map(
                                ([
                                    value,
                                    info
                                ]) => ({
                                    name:
                                        info.label,
                                    value
                                })
                            )
                        )
            );

    const auto =
        new SlashCommandBuilder()
            .setName(
                "auto"
            )
            .setDescription(
                "إنشاء منشور في الروم الحالي"
            );

    return [
        setupAuto.toJSON(),
        autoTime.toJSON(),
        auto.toJSON()
    ];
}

// ==================================================
// HANDLE /SETUPAUTO
// ==================================================

async function handleSetupAutoInteraction(
    interaction
) {
    if (!interaction.guild) {
        await interaction.reply({
            content:
                "❌ هذا الأمر يعمل داخل السيرفر فقط.",
            ephemeral:
                true
        });

        return;
    }

    if (
        !isOwner(
            interaction.user.id
        )
    ) {
        await interaction.reply({
            content:
                "❌ هذا الأمر للـOwner فقط.",
            ephemeral:
                true
        });

        return;
    }

    const guildData =
        getGuildData(
            interaction.guild.id
        );

    if (
        guildData.setupCompleted
    ) {
        await interaction.reply({
            content:
                [
                    "✅ Auto Exchange تم إعداده بالفعل.",
                    "",
                    "📌 لا تحتاج أنت ولا أي عضو لكتابة أمر الإعداد مرة أخرى.",
                    "",
                    "👥 الأعضاء يستخدمون اللوحة الموجودة داخل روم التبادل مباشرة.",
                    "",
                    "⏱️ لتغيير المدة استخدم:",
                    "`/autotime`"
                ].join("\n"),
            ephemeral:
                true
        });

        return;
    }

    const embed =
        new EmbedBuilder()
            .setTitle(
                "⚙️ إعداد Auto Exchange"
            )
            .setDescription(
                [
                    "هذا الإعداد يتم بواسطة الـOwner فقط.",
                    "",
                    "اختر رومات التبادل التي تريد أن يظهر فيها نظام Auto Exchange.",
                    "",
                    "بعد الحفظ سيقوم البوت بوضع لوحة ثابتة داخل الرومات.",
                    "",
                    "⚠️ لن يحتاج الأعضاء إلى كتابة `/auto` أو أي أمر آخر لاستخدام لوحة التبادل."
                ].join("\n")
            );

    await interaction.reply({
        embeds: [
            embed
        ],

        components: [
            createOwnerChannelSetupMenu(
                interaction.guild
            )
        ],

        ephemeral:
            true
    });
}

// ==================================================
// HANDLE /AUTOTIME
// ==================================================

async function handleAutoTimeInteraction(
    interaction
) {
    if (!interaction.guild) {
        await interaction.reply({
            content:
                "❌ هذا الأمر يعمل داخل السيرفر فقط.",
            ephemeral:
                true
        });

        return;
    }

    if (
        !isOwner(
            interaction.user.id
        )
    ) {
        await interaction.reply({
            content:
                "❌ هذا الأمر للـOwner فقط.",
            ephemeral:
                true
        });

        return;
    }

    const value =
        interaction.options.getString(
            "duration",
            true
        );

    const info =
        TIME_OPTIONS[value];

    if (!info) {
        await interaction.reply({
            content:
                "❌ المدة غير صالحة.",
            ephemeral:
                true
        });

        return;
    }

    const guildData =
        getGuildData(
            interaction.guild.id
        );

    guildData.postIntervalMinutes =
        info.minutes;

    saveData();

    await ensurePersistentPanels(
        interaction.guild
    );

    await interaction.reply({
        content:
            [
                "✅ تم تغيير مدة إعادة النشر.",
                "",
                `⏱️ المدة الجديدة: **${info.label}**`,
                "",
                "📌 تم تحديث اللوحة الموجودة في الروم.",
                "",
                "👑 هذا الخيار متاح للـOwner فقط."
            ].join("\n"),
        ephemeral:
            true
    });
}

// ==================================================
// HANDLE /AUTO
// ==================================================

async function handleAutoInteraction(
    interaction
) {
    if (!interaction.guild) {
        await interaction.reply({
            content:
                "❌ هذا الأمر يعمل داخل السيرفر فقط.",
            ephemeral:
                true
        });

        return;
    }

    const channel =
        interaction.channel;

    if (
        !channel ||
        channel.type !==
        ChannelType.GuildText
    ) {
        await interaction.reply({
            content:
                "❌ يجب استخدام `/auto` داخل روم نصي.",
            ephemeral:
                true
        });

        return;
    }

    /*
     * منع /auto داخل رومات التبادل.
     */

    if (
        ALLOWED_EXCHANGE_CHANNELS.includes(
            String(channel.id)
        )
    ) {
        await interaction.reply({
            content:
                [
                    "❌ لا يمكنك استخدام `/auto` داخل رومات التبادل.",
                    "",
                    "📌 استخدم `/auto` داخل الروم الذي تريد أن يظهر فيه المنشور."
                ].join("\n"),
            ephemeral:
                true
        });

        return;
    }

    const member =
        interaction.member;

    const limit =
        getRolePostLimit(
            member
        );

    if (
        limit <= 0
    ) {
        await interaction.reply({
            content:
                "❌ ليس لديك رتبة تسمح لك باستخدام Auto Exchange.",
            ephemeral:
                true
        });

        return;
    }

    const activePosts =
        getActivePostsForUser(
            interaction.guild.id,
            interaction.user.id
        );

    if (
        activePosts.length >=
        limit
    ) {
        await interaction.reply({
            content:
                `❌ وصلت للحد الأقصى من المنشورات. الحد الخاص بك: **${limit}**`,
            ephemeral:
                true
        });

        return;
    }

    if (
        hasPendingDMPost(
            interaction.user.id
        )
    ) {
        await interaction.reply({
            content:
                [
                    "❌ لديك منشور بالفعل ينتظر المحتوى في الخاص.",
                    "",
                    "📨 أرسل محتوى المنشور الموجود في الخاص أولًا."
                ].join("\n"),
            ephemeral:
                true
        });

        return;
    }

    const botMember =
        interaction.guild.members.me ||
        await interaction.guild.members
            .fetch(
                client.user.id
            )
            .catch(
                () => null
            );

    if (!botMember) {
        await interaction.reply({
            content:
                "❌ لم أستطع التحقق من صلاحيات البوت.",
            ephemeral:
                true
        });

        return;
    }

    const permissions =
        channel.permissionsFor(
            botMember
        );

    if (
        !permissions ||
        !permissions.has(
            PermissionsBitField.Flags.ViewChannel
        ) ||
        !permissions.has(
            PermissionsBitField.Flags.SendMessages
        ) ||
        !permissions.has(
            PermissionsBitField.Flags.ManageWebhooks
        )
    ) {
        await interaction.reply({
            content:
                [
                    "❌ البوت لا يملك الصلاحيات المطلوبة في هذا الروم.",
                    "",
                    "يحتاج:",
                    "• View Channel",
                    "• Send Messages",
                    "• Manage Webhooks"
                ].join("\n"),
            ephemeral:
                true
        });

        return;
    }

    /*
     * نحفظ مكان النشر =
     * نفس الروم الذي استُخدم فيه /auto
     */

    data.autoTargets[
        interaction.user.id
    ] = {
        guildId:
            interaction.guild.id,

        channelId:
            channel.id,

        channelName:
            channel.name,

        createdAt:
            Date.now()
    };

    saveData();

    await interaction.reply({
        content:
            [
                `📢 سيتم نشر المنشور داخل: <#${channel.id}>`,
                "",
                "اختر رقم المنشور الذي تريد إنشاءه:"
            ].join("\n"),

        components: [
            createPostSlotMenu(
                limit,
                interaction.guild.id,
                interaction.user.id
            )
        ],

        ephemeral:
            true
    });
}

// ==================================================
// INTERACTION HANDLER
// ==================================================

client.on(
    "interactionCreate",
    async interaction => {
        try {
            // ==================================================
            // SLASH COMMANDS
            // ==================================================

            if (
                interaction.isChatInputCommand()
            ) {
                if (
                    interaction.commandName ===
                    "setupauto"
                ) {
                    await handleSetupAutoInteraction(
                        interaction
                    );

                    return;
                }

                if (
                    interaction.commandName ===
                    "autotime"
                ) {
                    await handleAutoTimeInteraction(
                        interaction
                    );

                    return;
                }

                if (
                    interaction.commandName ===
                    "auto"
                ) {
                    await handleAutoInteraction(
                        interaction
                    );

                    return;
                }

                return;
            }

            // ==================================================
            // SELECT MENUS ONLY
            // ==================================================

            if (
                !interaction.isStringSelectMenu()
            ) {
                return;
            }

            const customId =
                interaction.customId;

            // ==================================================
            // MAIN PANEL
            // ==================================================

            if (
                customId ===
                "auto_main_menu"
            ) {
                if (
                    !interaction.guild
                ) {
                    await interaction.reply({
                        content:
                            "❌ هذا النظام يعمل داخل السيرفر فقط.",
                        ephemeral:
                            true
                    });

                    return;
                }

                const guildData =
                    getGuildData(
                        interaction.guild.id
                    );

                if (
                    !guildData.setupCompleted ||
                    guildData.exchangeChannels.length ===
                    0
                ) {
                    await interaction.reply({
                        content:
                            "❌ Auto Exchange غير مفعل حاليًا.",
                        ephemeral:
                            true
                    });

                    return;
                }

                const value =
                    interaction.values[0];

                // ==================================================
                // START POST FROM PANEL
                // ==================================================

                if (
                    value ===
                    "start_post"
                ) {
                    const member =
                        interaction.member;

                    const limit =
                        getRolePostLimit(
                            member
                        );

                    if (
                        limit <= 0
                    ) {
                        await interaction.reply({
                            content:
                                "❌ ليس لديك رتبة تسمح لك باستخدام Auto Exchange.",
                            ephemeral:
                                true
                        });

                        return;
                    }

                    /*
                     * اللوحة القديمة تبقى موجودة في رومات التبادل.
                     *
                     * لكن لا نطلب اختيار روم من هنا.
                     *
                     * سنجعل النشر يتم فقط باستخدام /auto.
                     */

                    await interaction.reply({
                        content:
                            [
                                "📢 لإنشاء منشور جديد استخدم:",
                                "",
                                "`/auto`",
                                "",
                                "📌 اكتب `/auto` داخل الروم الذي تريد أن يظهر فيه المنشور.",
                                "",
                                "⚠️ لا تستخدم `/auto` داخل رومات التبادل الموجودة في لوحة النظام."
                            ].join("\n"),
                        ephemeral:
                            true
                    });

                    return;
                }

                // ==================================================
                // STOP POST
                // ==================================================

                if (
                    value ===
                    "stop_post"
                ) {
                    const row =
                        createMyPostsMenu(
                            interaction.guild.id,
                            interaction.user.id
                        );

                    if (!row) {
                        await interaction.reply({
                            content:
                                "❌ ليس لديك أي منشورات.",
                            ephemeral:
                                true
                        });

                        return;
                    }

                    await interaction.reply({
                        content:
                            "🛑 اختر المنشور الذي تريد إيقافه:",
                        components: [
                            row
                        ],
                        ephemeral:
                            true
                    });

                    return;
                }

                // ==================================================
                // MY POSTS
                // ==================================================

                if (
                    value ===
                    "my_posts"
                ) {
                    const posts =
                        getActivePostsForUser(
                            interaction.guild.id,
                            interaction.user.id
                        );

                    if (
                        posts.length ===
                        0
                    ) {
                        await interaction.reply({
                            content:
                                "📋 ليس لديك أي منشورات حاليًا.",
                            ephemeral:
                                true
                        });

                        return;
                    }

                    const lines =
                        posts.map(
                            post =>
                                [
                                    `📢 **منشور ${post.slot}**`,

                                    `الحالة: ${
                                        post.status ===
                                        "active"
                                            ? "🟢 نشط"
                                            : "🟡 قيد التجهيز"
                                    }`,

                                    post.channelId
                                        ? `الروم: <#${post.channelId}>`
                                        : "الروم: غير محدد",

                                    `عدد مرات النشر: **${post.publishCount || 0}**`
                                ].join("\n")
                        );

                    await interaction.reply({
                        content:
                            lines.join(
                                "\n\n"
                            ),

                        ephemeral:
                            true
                    });

                    return;
                }
            }

            // ==================================================
            // POST SLOT
            // ==================================================

            if (
                customId ===
                "post_slot_menu"
            ) {
                if (
                    !interaction.guild
                ) {
                    await interaction.update({
                        content:
                            "❌ هذا النظام يعمل داخل السيرفر فقط.",

                        components:
                            []
                    });

                    return;
                }

                const member =
                    interaction.member;

                const limit =
                    getRolePostLimit(
                        member
                    );

                const slot =
                    Number(
                        interaction.values[0]
                    );

                if (
                    !slot ||
                    slot < 1 ||
                    slot > limit
                ) {
                    await interaction.update({
                        content:
                            "❌ رقم المنشور غير صالح.",

                        components:
                            []
                    });

                    return;
                }

                const activePosts =
                    getActivePostsForUser(
                        interaction.guild.id,
                        interaction.user.id
                    );

                if (
                    activePosts.some(
                        post =>
                            Number(
                                post.slot
                            ) ===
                            slot
                    )
                ) {
                    await interaction.update({
                        content:
                            "❌ هذا رقم المنشور مستخدم بالفعل.",

                        components:
                            []
                    });

                    return;
                }

                if (
                    hasPendingDMPost(
                        interaction.user.id
                    )
                ) {
                    await interaction.update({
                        content:
                            [
                                "❌ لديك منشور ينتظر المحتوى في الخاص.",
                                "",
                                "📨 أرسل المحتوى الحالي أولًا."
                            ].join("\n"),

                        components:
                            []
                    });

                    return;
                }

                /*
                 * نأخذ الروم الذي تم فيه استخدام /auto
                 */

                const autoTarget =
                    data.autoTargets[
                        interaction.user.id
                    ];

                if (!autoTarget) {
                    await interaction.update({
                        content:
                            [
                                "❌ لم يتم تحديد روم النشر.",
                                "",
                                "استخدم `/auto` داخل الروم الذي تريد النشر فيه."
                            ].join("\n"),

                        components:
                            []
                    });

                    return;
                }

                if (
                    String(
                        autoTarget.guildId
                    ) !==
                    String(
                        interaction.guild.id
                    )
                ) {
                    delete data.autoTargets[
                        interaction.user.id
                    ];

                    saveData();

                    await interaction.update({
                        content:
                            "❌ جلسة `/auto` غير صالحة. استخدم الأمر مرة أخرى.",

                        components:
                            []
                    });

                    return;
                }

                const targetChannel =
                    interaction.guild.channels.cache.get(
                        autoTarget.channelId
                    );

                if (
                    !targetChannel ||
                    targetChannel.type !==
                    ChannelType.GuildText
                ) {
                    delete data.autoTargets[
                        interaction.user.id
                    ];

                    saveData();

                    await interaction.update({
                        content:
                            "❌ الروم الذي استخدمت فيه `/auto` غير موجود.",

                        components:
                            []
                    });

                    return;
                }

                /*
                 * منع استخدام رومات التبادل للنشر.
                 */

                if (
                    ALLOWED_EXCHANGE_CHANNELS.includes(
                        String(
                            targetChannel.id
                        )
                    )
                ) {
                    delete data.autoTargets[
                        interaction.user.id
                    ];

                    saveData();

                    await interaction.update({
                        content:
                            [
                                "❌ لا يمكن نشر `/auto` داخل رومات التبادل.",
                                "",
                                "استخدم الأمر داخل روم آخر."
                            ].join("\n"),

                        components:
                            []
                    });

                    return;
                }

                /*
                 * نتأكد أن المكان ما زال صالحًا.
                 */

                const botMember =
                    interaction.guild.members.me ||
                    await interaction.guild.members
                        .fetch(
                            client.user.id
                        )
                        .catch(
                            () => null
                        );

                if (!botMember) {
                    await interaction.update({
                        content:
                            "❌ لم أستطع التحقق من صلاحيات البوت.",

                        components:
                            []
                    });

                    return;
                }

                const permissions =
                    targetChannel.permissionsFor(
                        botMember
                    );

                if (
                    !permissions ||
                    !permissions.has(
                        PermissionsBitField.Flags.ViewChannel
                    ) ||
                    !permissions.has(
                        PermissionsBitField.Flags.SendMessages
                    ) ||
                    !permissions.has(
                        PermissionsBitField.Flags.ManageWebhooks
                    )
                ) {
                    await interaction.update({
                        content:
                            [
                                "❌ البوت لا يملك الصلاحيات المطلوبة في روم النشر.",
                                "",
                                "يحتاج:",
                                "• View Channel",
                                "• Send Messages",
                                "• Manage Webhooks"
                            ].join("\n"),

                        components:
                            []
                    });

                    return;
                }

                const postId =
                    generatePostId();

                const post = {
                    id:
                        postId,

                    guildId:
                        interaction.guild.id,

                    userId:
                        interaction.user.id,

                    slot,

                    status:
                        "waiting_content",

                    createdAt:
                        Date.now(),

                    updatedAt:
                        Date.now(),

                    content:
                        "",

                    attachments:
                        [],

                    avatarURL:
                        safeDisplayAvatarURL(
                            interaction.user
                        ),

                    channelId:
                        targetChannel.id,

                    channelName:
                        targetChannel.name,

                    lastPublishedAt:
                        null,

                    publishCount:
                        0,

                    lastError:
                        null,

                    messageIds:
                        []
                };

                data.posts[
                    postId
                ] =
                    post;

                /*
                 * جلسة /auto انتهت بعد إنشاء المنشور.
                 */

                delete data.autoTargets[
                    interaction.user.id
                ];

                saveData();

                try {
                    await interaction.user.send(
                        [
                            "📨 تم تحديد مكان النشر بنجاح!",
                            "",
                            `📢 منشور رقم **${slot}**`,
                            `📍 روم النشر: <#${targetChannel.id}>`,
                            "",
                            "✏️ أرسل الآن محتوى المنشور هنا في الخاص.",
                            "",
                            "يمكنك إرسال:",
                            "• نص",
                            "• صور",
                            "• ملفات",
                            "• نص + صور + ملفات معًا",
                            "",
                            "📌 سيتم النشر في نفس الروم الذي استخدمت فيه `/auto`."
                        ].join("\n")
                    );

                    await interaction.update({
                        content:
                            [
                                "✅ تم إنشاء المنشور بنجاح.",
                                "",
                                `📢 رقم المنشور: **${slot}**`,
                                `📍 النشر في: <#${targetChannel.id}>`,
                                "",
                                "📨 أرسلت لك رسالة في الخاص.",
                                "✏️ أرسل محتوى المنشور هناك."
                            ].join("\n"),

                        components:
                            []
                    });
                } catch (_) {
                    delete data.posts[
                        postId
                    ];

                    saveData();

                    await interaction.update({
                        content:
                            [
                                "❌ لم أستطع إرسال رسالة لك في الخاص.",
                                "",
                                "افتح الخاص مع البوت ثم استخدم `/auto` مرة أخرى."
                            ].join("\n"),

                        components:
                            []
                    });
                }

                return;
            }

            // ==================================================
            // OWNER SETUP
            // ==================================================

            if (
                customId ===
                "owner_exchange_channel_setup"
            ) {
                if (
                    !interaction.guild
                ) {
                    await interaction.update({
                        content:
                            "❌ هذا النظام يعمل داخل السيرفر فقط.",

                        components:
                            []
                    });

                    return;
                }

                if (
                    !isOwner(
                        interaction.user.id
                    )
                ) {
                    await interaction.update({
                        content:
                            "❌ هذا الخيار للـOwner فقط.",

                        components:
                            []
                    });

                    return;
                }

                const guildData =
                    getGuildData(
                        interaction.guild.id
                    );

                if (
                    guildData.setupCompleted
                ) {
                    await interaction.update({
                        content:
                            [
                                "✅ تم إعداد Auto Exchange مسبقًا.",
                                "",
                                "الأعضاء يستخدمون اللوحة الموجودة داخل الروم مباشرة.",
                                "",
                                "📌 لإنشاء منشور في روم آخر استخدم `/auto` داخل الروم المطلوب."
                            ].join("\n"),

                        components:
                            []
                    });

                    return;
                }

                const selected =
                    interaction.values.filter(
                        channelId =>
                            ALLOWED_EXCHANGE_CHANNELS.includes(
                                String(channelId)
                            )
                    );

                if (
                    selected.length ===
                    0
                ) {
                    await interaction.update({
                        content:
                            "❌ يجب اختيار روم واحد على الأقل.",

                        components: [
                            createOwnerChannelSetupMenu(
                                interaction.guild
                            )
                        ]
                    });

                    return;
                }

                guildData.exchangeChannels =
                    selected;

                guildData.setupCompleted =
                    true;

                if (
                    !guildData.autoPanels
                ) {
                    guildData.autoPanels =
                        {};
                }

                saveData();

                await ensurePersistentPanels(
                    interaction.guild
                );

                const names =
                    selected.map(
                        channelId => {
                            const channel =
                                interaction.guild.channels.cache.get(
                                    channelId
                                );

                            return channel
                                ? `${channel}`
                                : channelId;
                        }
                    );

                await interaction.update({
                    content:
                        [
                            "✅ تم إعداد Auto Exchange بنجاح.",
                            "",
                            "🔒 تم حفظ الإعداد للسيرفر.",
                            "👑 الـOwner قام بالإعداد مرة واحدة.",
                            "👥 الآن الأعضاء يستخدمون اللوحة الموجودة في الروم مباشرة.",
                            "",
                            "📢 الرومات المفعلة:",
                            names.join("\n"),
                            "",
                            "📌 اللوحة ستبقى موجودة، وإذا اختفت سيعيدها البوت تلقائيًا.",
                            "",
                            "📢 للنشر في روم معين:",
                            "استخدم `/auto` داخل الروم المطلوب.",
                            "",
                            "⏱️ تغيير المدة:",
                            "`/autotime`"
                        ].join("\n"),

                    components:
                        []
                });

                return;
            }

            // ==================================================
            // MY POSTS STOP
            // ==================================================

            if (
                customId ===
                "my_posts_menu"
            ) {
                if (
                    !interaction.guild
                ) {
                    await interaction.update({
                        content:
                            "❌ هذا النظام يعمل داخل السيرفر فقط.",

                        components:
                            []
                    });

                    return;
                }

                const selected =
                    interaction.values[0];

                const parts =
                    selected.split(
                        ":"
                    );

                if (
                    parts.length !==
                    2 ||
                    parts[0] !==
                    "stop_post"
                ) {
                    await interaction.update({
                        content:
                            "❌ اختيار المنشور غير صالح.",

                        components:
                            []
                    });

                    return;
                }

                const postId =
                    parts[1];

                const post =
                    data.posts[
                        postId
                    ];

                if (!post) {
                    await interaction.update({
                        content:
                            "❌ المنشور غير موجود.",

                        components:
                            []
                    });

                    return;
                }

                if (
                    post.guildId !==
                    interaction.guild.id
                ) {
                    await interaction.update({
                        content:
                            "❌ هذا المنشور تابع لسيرفر آخر.",

                        components:
                            []
                    });

                    return;
                }

                if (
                    post.userId !==
                    interaction.user.id
                ) {
                    await interaction.update({
                        content:
                            "❌ هذا المنشور ليس لك.",

                        components:
                            []
                    });

                    return;
                }

                await deletePostMessages(
                    post
                );

                post.status =
                    "inactive";

                post.updatedAt =
                    Date.now();

                post.lastError =
                    null;

                saveData();

                await interaction.update({
                    content:
                        [
                            "🛑 تم إيقاف المنشور.",
                            "",
                            `📢 رقم المنشور: **${post.slot}**`,
                            "",
                            "🗑️ تم إيقاف إعادة النشر وحذف رسائل المنشور."
                        ].join("\n"),

                    components:
                        []
                });

                return;
            }
        } catch (error) {
            console.error(
                "interactionCreate error:"
            );

            console.error(
                error
            );

            try {
                if (
                    interaction.replied ||
                    interaction.deferred
                ) {
                    await interaction.followUp({
                        content:
                            "❌ حدث خطأ أثناء تنفيذ العملية.",

                        ephemeral:
                            true
                    });
                } else {
                    await interaction.reply({
                        content:
                            "❌ حدث خطأ أثناء تنفيذ العملية.",

                        ephemeral:
                            true
                    });
                }
            } catch (_) {}
        }
    }
);

// ==================================================
// MESSAGE HANDLER
// ==================================================

client.on(
    "messageCreate",
    async message => {
        try {
            if (
                message.author.bot
            ) {
                return;
            }

            if (
                !message.guild
            ) {
                await handleDMPost(
                    message
                );

                return;
            }

            await handleRoleCommand(
                message
            );
        } catch (error) {
            console.error(
                "messageCreate error:"
            );

            console.error(
                error
            );
        }
    }
);

// ==================================================
// READY
// ==================================================

client.once(
    "clientReady",
    async () => {
        console.log(
            `Logged in as ${client.user.tag}`
        );

        client.user.setPresence({
            activities: [
                {
                    name:
                        "Auto Exchange",

                    type:
                        ActivityType.Watching
                }
            ],

            status:
                "dnd"
        });

        console.log(
            "Bot status: Do Not Disturb"
        );

        if (!OWNER_ID) {
            console.warn(
                "WARNING: OWNER_ID is not configured. Owner-only commands will not work."
            );
        }

        cleanupData();

        await removeExpiredRoles();

        // ==================================================
        // SLASH COMMANDS
        // ==================================================

        const commands =
            buildSlashCommands();

        try {
            const rest =
                new REST({
                    version:
                        "10"
                }).setToken(
                    TOKEN
                );

            await rest.put(
                Routes.applicationCommands(
                    client.user.id
                ),
                {
                    body:
                        commands
                }
            );

            console.log(
                "Slash commands registered: /setupauto, /autotime, /auto"
            );
        } catch (error) {
            console.error(
                "Slash command registration error:"
            );

            console.error(
                error
            );
        }

        // ==================================================
        // REPAIR / CREATE PANELS
        // ==================================================

        for (
            const guild of client.guilds.cache.values()
        ) {
            try {
                await ensurePersistentPanels(
                    guild
                );
            } catch (error) {
                console.error(
                    `Panel startup error for guild ${guild.id}:`
                );

                console.error(
                    error
                );
            }
        }

        // ==================================================
        // BACKGROUND LOOP
        // ==================================================

        if (
            backgroundStarted
        ) {
            return;
        }

        backgroundStarted =
            true;

        setInterval(
            async () => {
                try {
                    await runAutoExchange();

                    await removeExpiredRoles();

                    cleanupData();

                    // ==================================================
                    // التأكد أن اللوحات الثابتة موجودة
                    // ==================================================

                    for (
                        const guild of client.guilds.cache.values()
                    ) {
                        try {
                            await ensurePersistentPanels(
                                guild
                            );
                        } catch (error) {
                            console.error(
                                `Persistent panel error in guild ${guild.id}:`
                            );

                            console.error(
                                error
                            );
                        }
                    }
                } catch (error) {
                    console.error(
                        "Background error:"
                    );

                    console.error(
                        error
                    );
                }
            },

            30 *
            1000
        );

        console.log(
            "Background systems started."
        );
    }
);

// ==================================================
// DISCORD ERRORS
// ==================================================

client.on(
    "error",
    error => {
        console.error(
            "Discord client error:"
        );

        console.error(
            error
        );
    }
);

client.on(
    "warn",
    warning => {
        console.warn(
            "Discord warning:"
        );

        console.warn(
            warning
        );
    }
);

// ==================================================
// PROCESS ERRORS
// ==================================================

process.on(
    "unhandledRejection",
    error => {
        console.error(
            "Unhandled Rejection:"
        );

        console.error(
            error
        );
    }
);

process.on(
    "uncaughtException",
    error => {
        console.error(
            "Uncaught Exception:"
        );

        console.error(
            error
        );
    }
);

// ==================================================
// LOGIN
// ==================================================

if (!TOKEN) {
    console.error(
        "Bot token is missing!"
    );

    console.error(
        "ضع التوكن في config.json أو DISCORD_TOKEN."
    );
} else {
    client.login(
        TOKEN
    ).catch(
        error => {
            console.error(
                "Login failed:"
            );

            console.error(
                error
            );
        }
    );
}
