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

const DEFAULT_DATA = {
    guilds: {},
    posts: {},
    temporaryRoles: {}
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

        if (!parsed || typeof parsed !== "object") {
            throw new Error("JSON root is not an object");
        }

        return parsed;
    } catch (error) {
        console.error("Error loading JSON file:", file);
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

        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }

        fs.renameSync(tempFile, file);
    } catch (error) {
        console.error("Error saving JSON file:", file);
        console.error(error);
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

if (!config || typeof config !== "object") {
    config = cloneObject(DEFAULT_CONFIG);
}

if (!data || typeof data !== "object") {
    data = cloneObject(DEFAULT_DATA);
}

if (!data.guilds || typeof data.guilds !== "object") {
    data.guilds = {};
}

if (!data.posts || typeof data.posts !== "object") {
    data.posts = {};
}

if (
    !data.temporaryRoles ||
    typeof data.temporaryRoles !== "object"
) {
    data.temporaryRoles = {};
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
    saveJSON(DATA_FILE, data);
}

function getGuildData(guildId) {
    if (!data.guilds[guildId]) {
        data.guilds[guildId] = {
            exchangeChannels: [],
            postIntervalMinutes:
                Number(config.postIntervalMinutes) || 10
        };
    }

    if (
        !Array.isArray(
            data.guilds[guildId].exchangeChannels
        )
    ) {
        data.guilds[guildId].exchangeChannels = [];
    }

    const interval = Number(
        data.guilds[guildId].postIntervalMinutes
    );

    if (!Number.isFinite(interval) || interval <= 0) {
        data.guilds[guildId].postIntervalMinutes =
            Number(config.postIntervalMinutes) > 0
                ? Number(config.postIntervalMinutes)
                : 10;
    }

    return data.guilds[guildId];
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

// ==================================================
// POST LIMIT
// ==================================================

function getRolePostLimit(member) {
    if (!member) {
        return 0;
    }

    let highestLimit = 0;

    for (const role of member.roles.cache.values()) {
        const limit = ROLE_POST_LIMITS[role.id];

        if (limit) {
            highestLimit = Math.max(
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

function getActivePostsForUser(guildId, userId) {
    return Object.values(data.posts).filter(
        post =>
            post &&
            String(post.guildId) === String(guildId) &&
            String(post.userId) === String(userId) &&
            ACTIVE_POST_STATUSES.includes(post.status)
    );
}

function getPendingPostForUser(userId) {
    const posts = Object.values(data.posts)
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

    const match = String(value)
        .trim()
        .toLowerCase()
        .match(/^(\d+)\s*(m|h|d|w|y)$/);

    if (!match) {
        return null;
    }

    const amount = Number(match[1]);
    const unit = match[2];

    if (!Number.isFinite(amount) || amount <= 0) {
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
    const ms = Number(value);

    if (!Number.isFinite(ms) || ms <= 0) {
        return "غير محدد";
    }

    const minutes = Math.floor(ms / 60000);

    if (minutes < 60) {
        return `${minutes} دقيقة`;
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
        return `${hours} ساعة`;
    }

    const days = Math.floor(hours / 24);

    if (days < 7) {
        return `${days} يوم`;
    }

    const weeks = Math.floor(days / 7);

    if (weeks < 52) {
        return `${weeks} أسبوع`;
    }

    const years = Math.floor(days / 365);

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

    for (const channelId of configured) {
        if (
            !ALLOWED_EXCHANGE_CHANNELS.includes(
                channelId
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
            channel.type === ChannelType.GuildText
        ) {
            channels.push(channel);
        }
    }

    return channels;
}

// ==================================================
// AUTO PANEL
// ==================================================

function createAutoPanel(guild, userId) {
    const guildData =
        getGuildData(guild.id);

    const activePosts =
        getActivePostsForUser(
            guild.id,
            userId
        ).filter(
            post =>
                post.status === "active"
        ).length;

    const embed =
        new EmbedBuilder()
            .setTitle("Auto Exchange")
            .setDescription(
                [
                    "من هنا تقدر تتحكم في منشورات التبادل الخاصة بك.",
                    "",
                    `وقت إعادة النشر: **${guildData.postIntervalMinutes} دقيقة**`,
                    `منشوراتك النشطة: **${activePosts}**`,
                    "",
                    "اختر العملية من القائمة بالأسفل."
                ].join("\n")
            )
            .setFooter({
                text: "Auto Exchange"
            });

    const options = [
        new StringSelectMenuOptionBuilder()
            .setLabel("بدء نشر")
            .setDescription(
                "إنشاء منشور جديد"
            )
            .setValue("start_post")
            .setEmoji("📢"),

        new StringSelectMenuOptionBuilder()
            .setLabel("إيقاف منشور")
            .setDescription(
                "إيقاف أحد منشوراتك"
            )
            .setValue("stop_post")
            .setEmoji("🛑"),

        new StringSelectMenuOptionBuilder()
            .setLabel("منشوراتي")
            .setDescription(
                "عرض منشوراتك الحالية"
            )
            .setValue("my_posts")
            .setEmoji("📋")
    ];

    if (isOwner(userId)) {
        options.push(
            new StringSelectMenuOptionBuilder()
                .setLabel(
                    "تغيير مدة النشر"
                )
                .setDescription(
                    "تغيير وقت إعادة نشر المنشورات"
                )
                .setValue("change_interval")
                .setEmoji("⏱️")
        );
    }

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "auto_main_menu"
            )
            .setPlaceholder(
                "اختر العملية..."
            )
            .addOptions(options);

    return {
        embeds: [embed],

        components: [
            new ActionRowBuilder()
                .addComponents(menu)
        ]
    };
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
                        Number(post.slot)
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
            .addOptions(options);

    return new ActionRowBuilder()
        .addComponents(menu);
}

// ==================================================
// CHANNEL MENU
// ==================================================

function createExchangeChannelMenu(
    guild,
    postId
) {
    const channels =
        getActiveExchangeChannels(guild);

    if (channels.length === 0) {
        return null;
    }

    const options =
        channels
            .slice(0, 25)
            .map(
                channel =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(
                            channel.name.slice(
                                0,
                                100
                            )
                        )
                        .setDescription(
                            "اختيار هذا الروم للنشر"
                        )
                        .setValue(
                            `exchange_select_channel:${postId}:${channel.id}`
                        )
                        .setEmoji("📢")
            );

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "exchange_channel_menu"
            )
            .setPlaceholder(
                "اختر روم النشر..."
            )
            .addOptions(options);

    return new ActionRowBuilder()
        .addComponents(menu);
}

// ==================================================
// OWNER SETUP MENU
// ==================================================

function createOwnerChannelSetupMenu(guild) {
    const guildData =
        getGuildData(guild.id);

    const options =
        ALLOWED_EXCHANGE_CHANNELS
            .slice(0, 25)
            .map(channelId => {
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
                            ? "السماح باستخدام هذا الروم"
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
            });

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "owner_exchange_channel_setup"
            )
            .setPlaceholder(
                "اختر رومات Auto Exchange..."
            )
            .setMinValues(0)
            .setMaxValues(
                options.length
            )
            .addOptions(options);

    return new ActionRowBuilder()
        .addComponents(menu);
}

// ==================================================
// TIME MENU
// ==================================================

function createTimeMenu() {
    const options =
        Object.entries(
            TIME_OPTIONS
        ).map(
            ([value, info]) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(
                        info.label
                    )
                    .setDescription(
                        `إعادة النشر كل ${info.label}`
                    )
                    .setValue(value)
                    .setEmoji("⏱️")
        );

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "auto_time_menu"
            )
            .setPlaceholder(
                "اختر مدة إعادة النشر..."
            )
            .addOptions(options);

    return new ActionRowBuilder()
        .addComponents(menu);
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
        ).slice(0, 25);

    if (posts.length === 0) {
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
                            ? `الروم: #${post.channelName}`
                            : "بدون روم"
                    )
                    .setValue(
                        `stop_post:${post.id}`
                    )
                    .setEmoji(
                        post.status === "active"
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
            .addOptions(options);

    return new ActionRowBuilder()
        .addComponents(menu);
}

// ==================================================
// WEBHOOK
// ==================================================

async function getOrCreateWebhook(channel) {
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
                name: "Auto Exchange",
                reason:
                    "Auto Exchange publishing system"
            });

        return webhook;
    } catch (error) {
        console.error(
            "Webhook error:"
        );
        console.error(error);

        return null;
    }
}

// ==================================================
// DELETE POST MESSAGES
// ==================================================

async function deletePostMessages(post) {
    if (!post) {
        return;
    }

    const messageIds =
        Array.isArray(
            post.messageIds
        )
            ? post.messageIds
            : [];

    if (messageIds.length === 0) {
        return;
    }

    const guild =
        client.guilds.cache.get(
            post.guildId
        );

    if (!guild) {
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
        return;
    }

    const webhook =
        await getOrCreateWebhook(
            channel
        );

    if (!webhook) {
        return;
    }

    for (const messageId of messageIds) {
        try {
            await webhook.deleteMessage(
                messageId
            );
        } catch (error) {
            if (
                error &&
                (
                    error.code === 10008 ||
                    error.code === 10003
                )
            ) {
                continue;
            }

            console.error(
                `Could not delete post message ${messageId}:`
            );
            console.error(error);
        }
    }

    post.messageIds = [];
}

// ==================================================
// PUBLISH POST
// ==================================================

async function publishPost(post) {
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

        const guildData =
            getGuildData(
                guild.id
            );

        if (
            !guildData.exchangeChannels.includes(
                post.channelId
            )
        ) {
            return {
                success: false,
                error:
                    "CHANNEL_NOT_ENABLED"
            };
        }

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

        const botMember =
            guild.members.me ||
            await guild.members.fetch(
                client.user.id
            ).catch(
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
                PermissionsBitField.Flags.ManageWebhooks
            ) ||
            !permissions.has(
                PermissionsBitField.Flags.SendMessages
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
                    ? member.user.displayAvatarURL({
                          extension:
                              "png",
                          size: 256
                      })
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

        if (content.length > 2000) {
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
                .slice(0, 10)
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
            sentMessage =
                await webhook.send({
                    content,
                    username,
                    avatarURL,
                    files,

                    allowedMentions: {
                        parse: [],
                        users: [
                            post.userId
                        ]
                    },

                    wait: true
                });
        } catch (error) {
            console.error(
                "Webhook send error:"
            );
            console.error(error);

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
                post.messageIds = [];
            }

            post.messageIds.push(
                sentMessage.id
            );

            // الاحتفاظ بآخر 100 رسالة فقط
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
                post.publishCount || 0
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
        console.error(error);

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

    for (const post of posts) {
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
                        "CHANNEL_NOT_ENABLED" ||
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
            console.error(error);
        }
    }
}

// ==================================================
// TEMPORARY ROLE DATA
// ==================================================

function getTemporaryRolesForUser(userId) {
    if (
        !data.temporaryRoles[userId]
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
                oldData.expiresAt || 0
            );

        const newExpires =
            Number(expiresAt);

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

            // لو كانت الرتبة موجودة مسبقًا،
            // لا نغير حالة أنها ليست مضافة من البوت.
            addedByBot:
                oldData.addedByBot === false
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

    if (target.user.bot) {
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

    if (role.managed) {
        await message.reply(
            "❌ لا يمكن إعطاء رتبة Managed."
        );

        return true;
    }

    const botMember =
        message.guild.members.me ||
        await message.guild.members.fetch(
            client.user.id
        ).catch(
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
        console.error(error);

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

    let changed = false;

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

            changed = true;
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
                changed = true;
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
                changed = true;
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
                changed = true;
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
                    changed = true;
                    continue;
                }

                const botMember =
                    guild.members.me ||
                    await guild.members.fetch(
                        client.user.id
                    ).catch(
                        () => null
                    );

                if (
                    !botMember
                ) {
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

                /*
                 * إذا الرتبة كانت موجودة عند العضو
                 * قبل الأمر +رول، لا نحذفها.
                 */
                if (
                    roleData.addedByBot ===
                    false
                ) {
                    changed = true;
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

                changed = true;
            } catch (error) {
                console.error(
                    `Error removing expired role ${roleData.roleId} from ${userId}:`
                );

                console.error(error);

                if (
                    error &&
                    (
                        error.code ===
                            10007 ||
                        error.code ===
                            10011
                    )
                ) {
                    changed = true;
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
                roles: remaining
            };
        } else {
            delete data.temporaryRoles[
                userId
            ];

            changed = true;
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

    let changed = false;

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

            changed = true;
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
                "waiting_content"
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

            changed = true;
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

            changed = true;
        }
    }

    /*
     * تنظيف messageIds القديمة/المكسورة.
     */
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
            post.messageIds = [];
            changed = true;
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
        message.author.displayAvatarURL({
            extension: "png",
            size: 256
        });

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

    if (!result.success) {
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
                // ==================================================
                // /auto
                // ==================================================

                if (
                    interaction.commandName ===
                    "auto"
                ) {
                    if (
                        !interaction.guild
                    ) {
                        await interaction.reply({
                            content:
                                "❌ هذا الأمر يعمل داخل السيرفر فقط.",
                            ephemeral:
                                true
                        });

                        return;
                    }

                    await interaction.reply({
                        ...createAutoPanel(
                            interaction.guild,
                            interaction.user.id
                        ),

                        ephemeral:
                            true
                    });

                    return;
                }

                // ==================================================
                // /setupauto
                // ==================================================

                if (
                    interaction.commandName ===
                    "setupauto"
                ) {
                    if (
                        !interaction.guild
                    ) {
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
                                "❌ هذا الأمر للـ Owner فقط.",
                            ephemeral:
                                true
                        });

                        return;
                    }

                    const guildData =
                        getGuildData(
                            interaction.guild.id
                        );

                    const selected =
                        guildData.exchangeChannels.filter(
                            channelId =>
                                ALLOWED_EXCHANGE_CHANNELS.includes(
                                    channelId
                                )
                        );

                    const names =
                        selected.map(
                            channelId => {
                                const channel =
                                    interaction.guild.channels.cache.get(
                                        channelId
                                    );

                                return channel
                                    ? `• ${channel}`
                                    : `• ${channelId}`;
                            }
                        );

                    const embed =
                        new EmbedBuilder()
                            .setTitle(
                                "إعداد Auto Exchange"
                            )
                            .setDescription(
                                [
                                    "اختر الرومات التي يسمح للبوت بالنشر فيها.",
                                    "",

                                    selected.length >
                                    0
                                        ? `الرومات الحالية:\n${names.join("\n")}`
                                        : "لا توجد رومات مفعلة حاليًا."
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

                    return;
                }

                return;
            }

            // ==================================================
            // SELECT MENUS
            // ==================================================

            if (
                interaction.isStringSelectMenu()
            ) {
                const customId =
                    interaction.customId;

                // ==================================================
                // MAIN AUTO MENU
                // ==================================================

                if (
                    customId ===
                    "auto_main_menu"
                ) {
                    if (
                        !interaction.guild
                    ) {
                        await interaction.update({
                            content:
                                "❌ هذا الأمر يعمل داخل السيرفر فقط.",
                            embeds: [],
                            components: []
                        });

                        return;
                    }

                    const value =
                        interaction.values[0];

                    // ==================================================
                    // START POST
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
                            await interaction.update({
                                content:
                                    "❌ ليس لديك رتبة تسمح لك باستخدام Auto Exchange.",
                                embeds: [],
                                components: []
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
                            await interaction.update({
                                content:
                                    `❌ وصلت للحد الأقصى من المنشورات. الحد الخاص بك: **${limit}**`,
                                embeds: [],
                                components: []
                            });

                            return;
                        }

                        /*
                         * منع إنشاء أكثر من منشور ينتظر DM.
                         * هذا يمنع إرسال المحتوى للمنشور الخطأ.
                         */
                        if (
                            hasPendingDMPost(
                                interaction.user.id
                            )
                        ) {
                            await interaction.update({
                                content:
                                    [
                                        "❌ لديك منشور بالفعل ينتظر المحتوى في الخاص.",
                                        "",
                                        "📨 أرسل محتوى المنشور الموجود في الخاص أولًا، وبعد نشره يمكنك إنشاء منشور آخر."
                                    ].join("\n"),
                                embeds: [],
                                components: []
                            });

                            return;
                        }

                        const row =
                            createPostSlotMenu(
                                limit,
                                interaction.guild.id,
                                interaction.user.id
                            );

                        await interaction.update({
                            content:
                                "📢 اختر رقم المنشور الذي تريد إنشاءه:",
                            embeds: [],
                            components: [
                                row
                            ]
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
                            await interaction.update({
                                content:
                                    "❌ ليس لديك أي منشورات.",
                                embeds: [],
                                components: []
                            });

                            return;
                        }

                        await interaction.update({
                            content:
                                "🛑 اختر المنشور الذي تريد إيقافه:",
                            embeds: [],
                            components: [
                                row
                            ]
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
                            await interaction.update({
                                content:
                                    "📋 ليس لديك أي منشورات حاليًا.",
                                embeds: [],
                                components: []
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

                        await interaction.update({
                            content:
                                lines.join(
                                    "\n\n"
                                ),
                            embeds: [],
                            components: []
                        });

                        return;
                    }

                    // ==================================================
                    // CHANGE INTERVAL
                    // ==================================================

                    if (
                        value ===
                        "change_interval"
                    ) {
                        if (
                            !isOwner(
                                interaction.user.id
                            )
                        ) {
                            await interaction.update({
                                content:
                                    "❌ هذا الخيار للـ Owner فقط.",
                                embeds: [],
                                components: []
                            });

                            return;
                        }

                        await interaction.update({
                            content:
                                "⏱️ اختر مدة إعادة النشر:",
                            embeds: [],
                            components: [
                                createTimeMenu()
                            ]
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
                        return;
                    }

                    const slot =
                        Number(
                            interaction.values[0]
                        );

                    const member =
                        interaction.member;

                    const limit =
                        getRolePostLimit(
                            member
                        );

                    if (
                        !slot ||
                        slot < 1 ||
                        slot > limit
                    ) {
                        await interaction.update({
                            content:
                                "❌ رقم المنشور غير صالح.",
                            embeds: [],
                            components: []
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
                            embeds: [],
                            components: []
                        });

                        return;
                    }

                    /*
                     * حماية إضافية من إنشاء DM post آخر
                     */
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
                            embeds: [],
                            components: []
                        });

                        return;
                    }

                    const channels =
                        getActiveExchangeChannels(
                            interaction.guild
                        );

                    if (
                        channels.length ===
                        0
                    ) {
                        await interaction.update({
                            content:
                                [
                                    "❌ لا توجد رومات مفعلة في Auto Exchange.",
                                    "",
                                    "يجب على الـ Owner استخدام `/setupauto` وتحديد الرومات أولًا."
                                ].join("\n"),
                            embeds: [],
                            components: []
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
                            "waiting_channel",

                        createdAt:
                            Date.now(),

                        updatedAt:
                            Date.now(),

                        content:
                            "",

                        attachments:
                            [],

                        avatarURL:
                            interaction.user.displayAvatarURL({
                                extension:
                                    "png",
                                size: 256
                            }),

                        channelId:
                            null,

                        channelName:
                            null,

                        lastPublishedAt:
                            null,

                        publishCount:
                            0,

                        lastError:
                            null,

                        /*
                         * IDs الخاصة برسائل Webhook
                         */
                        messageIds:
                            []
                    };

                    data.posts[
                        postId
                    ] = post;

                    saveData();

                    const channelMenu =
                        createExchangeChannelMenu(
                            interaction.guild,
                            postId
                        );

                    await interaction.update({
                        content:
                            [
                                `📢 تم إنشاء المنشور رقم **${slot}**.`,
                                "",
                                "📍 أولًا اختر **روم النشر** من القائمة:",
                                "",
                                "بعد اختيار الروم سأرسل لك رسالة في الخاص لإرسال محتوى المنشور."
                            ].join("\n"),

                        embeds: [],

                        components:
                            channelMenu
                                ? [
                                      channelMenu
                                  ]
                                : []
                    });

                    return;
                }

                // ==================================================
                // EXCHANGE CHANNEL MENU
                // ==================================================

                if (
                    customId ===
                    "exchange_channel_menu"
                ) {
                    if (
                        !interaction.guild
                    ) {
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
                            3 ||
                        parts[0] !==
                            "exchange_select_channel"
                    ) {
                        await interaction.update({
                            content:
                                "❌ اختيار الروم غير صالح.",
                            embeds: [],
                            components: []
                        });

                        return;
                    }

                    const postId =
                        parts[1];

                    const channelId =
                        parts[2];

                    const post =
                        data.posts[
                            postId
                        ];

                    if (!post) {
                        await interaction.update({
                            content:
                                "❌ المنشور غير موجود أو انتهت صلاحيته.",
                            embeds: [],
                            components: []
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
                            embeds: [],
                            components: []
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
                            embeds: [],
                            components: []
                        });

                        return;
                    }

                    if (
                        post.status !==
                        "waiting_channel"
                    ) {
                        await interaction.update({
                            content:
                                "❌ هذا المنشور لم يعد ينتظر اختيار الروم.",
                            embeds: [],
                            components: []
                        });

                        return;
                    }

                    if (
                        !ALLOWED_EXCHANGE_CHANNELS.includes(
                            channelId
                        )
                    ) {
                        await interaction.update({
                            content:
                                "❌ هذا الروم غير مسموح به.",
                            embeds: [],
                            components: []
                        });

                        return;
                    }

                    const guildData =
                        getGuildData(
                            interaction.guild.id
                        );

                    if (
                        !guildData.exchangeChannels.includes(
                            channelId
                        )
                    ) {
                        await interaction.update({
                            content:
                                "❌ هذا الروم غير مفعل حاليًا في Auto Exchange.",
                            embeds: [],
                            components: []
                        });

                        return;
                    }

                    const channel =
                        interaction.guild.channels.cache.get(
                            channelId
                        );

                    if (
                        !channel ||
                        channel.type !==
                            ChannelType.GuildText
                    ) {
                        await interaction.update({
                            content:
                                "❌ الروم غير موجود أو ليس رومًا نصيًا.",
                            embeds: [],
                            components: []
                        });

                        return;
                    }

                    /*
                     * حماية إضافية:
                     * لا نسمح بإنشاء انتظار DM آخر.
                     */
                    const anotherPending =
                        Object.values(
                            data.posts
                        ).some(
                            otherPost =>
                                otherPost &&
                                otherPost.id !==
                                    post.id &&
                                String(
                                    otherPost.userId
                                ) ===
                                    String(
                                        interaction.user.id
                                    ) &&
                                otherPost.status ===
                                    "waiting_content"
                        );

                    if (
                        anotherPending
                    ) {
                        await interaction.update({
                            content:
                                [
                                    "❌ لديك منشور آخر ينتظر المحتوى في الخاص.",
                                    "",
                                    "📨 أرسل المحتوى الموجود في الخاص أولًا."
                                ].join("\n"),
                            embeds: [],
                            components: []
                        });

                        return;
                    }

                    post.channelId =
                        channelId;

                    post.channelName =
                        channel.name;

                    post.status =
                        "waiting_content";

                    post.updatedAt =
                        Date.now();

                    saveData();

                    try {
                        await interaction.user.send(
                            [
                                "📨 تم اختيار روم النشر بنجاح!",
                                "",
                                `📢 منشور رقم **${post.slot}**`,
                                `📍 روم النشر: <#${channelId}>`,
                                "",
                                "✏️ أرسل الآن محتوى المنشور هنا في الخاص.",
                                "",
                                "يمكنك إرسال:",
                                "• نص",
                                "• صور",
                                "• ملفات",
                                "• نص + صور + ملفات معًا",
                                "",
                                "📌 سيتم النشر تلقائيًا في الروم الذي اخترته."
                            ].join("\n")
                        );

                        await interaction.update({
                            content:
                                [
                                    "✅ تم اختيار الروم بنجاح.",
                                    "",
                                    `📢 منشور رقم **${post.slot}**`,
                                    `📍 الروم: <#${channelId}>`,
                                    "",
                                    "📨 أرسلت لك رسالة في الخاص.",
                                    "✏️ أرسل محتوى المنشور هناك."
                                ].join("\n"),

                            embeds: [],

                            components: []
                        });
                    } catch (_) {
                        post.status =
                            "waiting_channel";

                        post.channelId =
                            null;

                        post.channelName =
                            null;

                        post.updatedAt =
                            Date.now();

                        saveData();

                        await interaction.update({
                            content:
                                [
                                    "❌ لم أستطع إرسال رسالة لك في الخاص.",
                                    "",
                                    "افتح الخاص مع البوت ثم حاول مرة أخرى."
                                ].join("\n"),
                            embeds: [],
                            components: []
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
                        return;
                    }

                    if (
                        !isOwner(
                            interaction.user.id
                        )
                    ) {
                        await interaction.update({
                            content:
                                "❌ هذا الخيار للـ Owner فقط.",
                            embeds: [],
                            components: []
                        });

                        return;
                    }

                    const selected =
                        interaction.values.filter(
                            channelId =>
                                ALLOWED_EXCHANGE_CHANNELS.includes(
                                    channelId
                                )
                        );

                    const guildData =
                        getGuildData(
                            interaction.guild.id
                        );

                    guildData.exchangeChannels =
                        selected;

                    saveData();

                    if (
                        selected.length ===
                        0
                    ) {
                        await interaction.update({
                            content:
                                [
                                    "⚠️ لم يتم اختيار أي روم.",
                                    "",
                                    "سيتم إيقاف استخدام Auto Exchange حتى يتم تحديد الرومات من `/setupauto`."
                                ].join("\n"),
                            embeds: [],
                            components: []
                        });

                        return;
                    }

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
                                "✅ تم حفظ رومات Auto Exchange.",
                                "",
                                "📢 الرومات المفعلة:",
                                names.join(
                                    "\n"
                                )
                            ].join("\n"),

                        embeds: [],

                        components: []
                    });

                    return;
                }

                // ==================================================
                // TIME MENU
                // ==================================================

                if (
                    customId ===
                    "auto_time_menu"
                ) {
                    if (
                        !interaction.guild
                    ) {
                        return;
                    }

                    if (
                        !isOwner(
                            interaction.user.id
                        )
                    ) {
                        await interaction.update({
                            content:
                                "❌ هذا الخيار للـ Owner فقط.",
                            embeds: [],
                            components: []
                        });

                        return;
                    }

                    const value =
                        interaction.values[0];

                    const info =
                        TIME_OPTIONS[
                            value
                        ];

                    if (!info) {
                        await interaction.update({
                            content:
                                "❌ المدة غير صالحة.",
                            embeds: [],
                            components: []
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

                    await interaction.update({
                        content:
                            [
                                "✅ تم تغيير مدة إعادة النشر.",
                                "",
                                `⏱️ المدة الجديدة: **${info.label}**`
                            ].join("\n"),

                        embeds: [],

                        components: []
                    });

                    return;
                }

                // ==================================================
                // MY POSTS STOP MENU
                // ==================================================

                if (
                    customId ===
                    "my_posts_menu"
                ) {
                    if (
                        !interaction.guild
                    ) {
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
                            embeds: [],
                            components: []
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
                            embeds: [],
                            components: []
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
                            embeds: [],
                            components: []
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
                            embeds: [],
                            components: []
                        });

                        return;
                    }

                    /*
                     * إيقاف المنشور وحذف رسائل Webhook
                     */
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
                                "🗑️ تم إيقاف إعادة النشر وحذف رسائل المنشور التي أنشأها البوت."
                            ].join("\n"),

                        embeds: [],

                        components: []
                    });

                    return;
                }
            }
        } catch (error) {
            console.error(
                "interactionCreate error:"
            );

            console.error(error);

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

            if (!message.guild) {
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

            console.error(error);
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

        cleanupData();

        await removeExpiredRoles();

        // ==================================================
        // SLASH COMMANDS
        // ==================================================

        const commands = [
            new SlashCommandBuilder()
                .setName("auto")
                .setDescription(
                    "فتح لوحة Auto Exchange"
                ),

            new SlashCommandBuilder()
                .setName("setupauto")
                .setDescription(
                    "إعداد رومات Auto Exchange"
                )
        ].map(
            command =>
                command.toJSON()
        );

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
                "Slash commands registered."
            );
        } catch (error) {
            console.error(
                "Slash command registration error:"
            );

            console.error(error);
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
