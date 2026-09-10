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
    ActivityType
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ==================================================
// FILES
// ==================================================

const CONFIG_FILE = path.join(__dirname, "config.json");
const DATA_FILE = path.join(__dirname, "data.json");

// ==================================================
// CONFIG
// ==================================================

let config = {
    token: "",
    ownerId: "",
    postIntervalMinutes: 10
};

if (fs.existsSync(CONFIG_FILE)) {
    try {
        const fileConfig = JSON.parse(
            fs.readFileSync(CONFIG_FILE, "utf8")
        );

        config = {
            ...config,
            ...fileConfig
        };
    } catch (err) {
        console.log(
            "❌ Error reading config.json:",
            err.message
        );
    }
}

// ==================================================
// DATA
// ==================================================

let data = {
    guilds: {},
    posts: {},
    temporaryRoles: {}
};

if (fs.existsSync(DATA_FILE)) {
    try {
        const fileData = JSON.parse(
            fs.readFileSync(DATA_FILE, "utf8")
        );

        data = {
            ...data,
            ...fileData
        };
    } catch (err) {
        console.log(
            "❌ Error reading data.json:",
            err.message
        );
    }
}

if (!data.guilds) {
    data.guilds = {};
}

if (!data.posts) {
    data.posts = {};
}

if (!data.temporaryRoles) {
    data.temporaryRoles = {};
}

// ==================================================
// TOKEN / OWNER
// ==================================================

const TOKEN =
    process.env.DISCORD_TOKEN ||
    config.token ||
    process.env.TOKEN;

const OWNER_ID =
    process.env.OWNER_ID ||
    config.ownerId;

// ==================================================
// ALLOWED EXCHANGE CHANNELS
// ==================================================

const OWNER_EXCHANGE_CHANNEL_IDS = [
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

// ==================================================
// ROLE POST LIMITS
// ==================================================

const ROLE_POST_LIMITS = {
    "1547161680209772544": 1,
    "1547161717841068083": 2,
    "1547161721737711616": 2
};

// ==================================================
// TIME OPTIONS
// ==================================================

const TIME_OPTIONS = [
    {
        label: "1 دقيقة",
        value: "1"
    },
    {
        label: "5 دقائق",
        value: "5"
    },
    {
        label: "10 دقائق",
        value: "10"
    },
    {
        label: "15 دقيقة",
        value: "15"
    },
    {
        label: "30 دقيقة",
        value: "30"
    },
    {
        label: "1 ساعة",
        value: "60"
    },
    {
        label: "2 ساعة",
        value: "120"
    },
    {
        label: "6 ساعات",
        value: "360"
    },
    {
        label: "12 ساعة",
        value: "720"
    },
    {
        label: "24 ساعة",
        value: "1440"
    }
];

// ==================================================
// CLIENT
// ==================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],

    partials: [
        Partials.Channel,
        Partials.Message
    ]
});

// ==================================================
// SAVE DATA
// ==================================================

function saveData() {
    try {
        fs.writeFileSync(
            DATA_FILE,
            JSON.stringify(data, null, 2),
            "utf8"
        );
    } catch (err) {
        console.log(
            "❌ Failed to save data:",
            err.message
        );
    }
}

// ==================================================
// SAVE CONFIG
// ==================================================

function saveConfig() {
    try {
        fs.writeFileSync(
            CONFIG_FILE,
            JSON.stringify(config, null, 2),
            "utf8"
        );
    } catch (err) {
        console.log(
            "❌ Failed to save config:",
            err.message
        );
    }
}

// ==================================================
// ROLE DURATION
// ==================================================

function parseRoleDuration(input) {
    if (!input) {
        return null;
    }

    const value = String(input)
        .toLowerCase()
        .trim();

    const match = value.match(
        /^(\d+)(m|h|d|w|y)$/
    );

    if (!match) {
        return null;
    }

    const amount = Number(match[1]);
    const unit = match[2];

    if (
        !Number.isFinite(amount) ||
        amount <= 0
    ) {
        return null;
    }

    const SECOND = 1000;
    const MINUTE = 60 * SECOND;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;
    const WEEK = 7 * DAY;
    const YEAR = 365 * DAY;

    let milliseconds = 0;

    if (unit === "m") {
        milliseconds = amount * MINUTE;
    } else if (unit === "h") {
        milliseconds = amount * HOUR;
    } else if (unit === "d") {
        milliseconds = amount * DAY;
    } else if (unit === "w") {
        milliseconds = amount * WEEK;
    } else if (unit === "y") {
        milliseconds = amount * YEAR;
    } else {
        return null;
    }

    return {
        milliseconds: milliseconds,
        text: String(amount) + unit
    };
}

// ==================================================
// ADD TEMPORARY ROLE
// ==================================================

async function addTemporaryRole(
    guild,
    member,
    role,
    durationText,
    executor
) {
    if (
        !guild ||
        !member ||
        !role
    ) {
        return {
            success: false,
            message: "❌ البيانات غير صحيحة."
        };
    }

    if (role.id === guild.id) {
        return {
            success: false,
            message:
                "❌ لا يمكن إعطاء رتبة @everyone."
        };
    }

    if (role.managed) {
        return {
            success: false,
            message:
                "❌ لا يمكن إعطاء رتبة مرتبطة ببوت أو تكامل."
        };
    }

    if (!role.editable) {
        return {
            success: false,
            message:
                "❌ البوت لا يستطيع إعطاء هذه الرتبة.\n" +
                "تأكد أن رتبة البوت أعلى من الرتبة المطلوبة."
        };
    }

    const duration = parseRoleDuration(
        durationText
    );

    if (!duration) {
        return {
            success: false,
            message:
                "❌ مدة غير صحيحة.\n\n" +
                "الاستخدام الصحيح:\n" +
                "`+رول @العضو @الرتبة 1m`\n" +
                "`+رول @العضو @الرتبة 1h`\n" +
                "`+رول @العضو @الرتبة 1d`\n" +
                "`+رول @العضو @الرتبة 1w`\n" +
                "`+رول @العضو @الرتبة 1y`"
        };
    }

    try {
        await member.roles.add(
            role,
            "Temporary role"
        );

        const key =
            guild.id +
            ":" +
            member.id +
            ":" +
            role.id;

        const expiresAt =
            Date.now() +
            duration.milliseconds;

        data.temporaryRoles[key] = {
            guildId: guild.id,
            userId: member.id,
            roleId: role.id,
            expiresAt: expiresAt
        };

        saveData();

        return {
            success: true,
            expiresAt: expiresAt,
            duration: duration
        };
    } catch (err) {
        console.log(
            "❌ Temporary role error:",
            err
        );

        return {
            success: false,
            message:
                "❌ لم أستطع إعطاء الرتبة.\n" +
                "تأكد من صلاحيات البوت وترتيب الرتب."
        };
    }
}

// ==================================================
// REMOVE EXPIRED ROLES
// ==================================================

async function removeExpiredRoles() {
    const now = Date.now();
    let changed = false;

    for (
        const [key, tempRole]
        of Object.entries(data.temporaryRoles)
    ) {
        if (
            !tempRole ||
            !tempRole.expiresAt
        ) {
            delete data.temporaryRoles[key];
            changed = true;
            continue;
        }

        if (
            now <
            Number(tempRole.expiresAt)
        ) {
            continue;
        }

        try {
            const guild =
                client.guilds.cache.get(
                    tempRole.guildId
                );

            if (!guild) {
                delete data.temporaryRoles[key];
                changed = true;
                continue;
            }

            const member =
                await guild.members
                    .fetch(tempRole.userId)
                    .catch(() => null);

            if (!member) {
                delete data.temporaryRoles[key];
                changed = true;
                continue;
            }

            const role =
                guild.roles.cache.get(
                    tempRole.roleId
                );

            if (
                role &&
                member.roles.cache.has(role.id)
            ) {
                if (role.editable) {
                    await member.roles.remove(
                        role,
                        "Temporary role expired"
                    );
                }
            }

            delete data.temporaryRoles[key];
            changed = true;

            console.log(
                "⏰ Removed expired role " +
                tempRole.roleId +
                " from " +
                member.user.tag
            );
        } catch (err) {
            console.log(
                "❌ Error removing temporary role:",
                err.message
            );
        }
    }

    if (changed) {
        saveData();
    }
}

// ==================================================
// POST ID
// ==================================================

function createPostId(
    guildId,
    userId
) {
    return (
        guildId +
        "_" +
        userId +
        "_" +
        Date.now() +
        "_" +
        Math.floor(
            Math.random() * 100000
        )
    );
}

// ==================================================
// GUILD DATA
// ==================================================

function getGuildData(guildId) {
    if (!data.guilds[guildId]) {
        data.guilds[guildId] = {
            exchangeChannels: []
        };

        saveData();
    }

    if (
        !Array.isArray(
            data.guilds[guildId]
                .exchangeChannels
        )
    ) {
        data.guilds[guildId]
            .exchangeChannels = [];
    }

    return data.guilds[guildId];
}

// ==================================================
// USER POSTS
// ==================================================

function getUserPosts(
    guildId,
    userId
) {
    return Object.values(data.posts)
        .filter(post =>
            post &&
            post.guildId === guildId &&
            post.userId === userId
        );
}

// ==================================================
// USER POST LIMIT
// ==================================================

function getUserPostLimit(member) {
    if (!member) {
        return 0;
    }

    if (
        member.id === OWNER_ID ||
        member.permissions.has(
            PermissionsBitField.Flags.Administrator
        )
    ) {
        return 999;
    }

    let highestLimit = 0;

    for (
        const [roleId, limit]
        of Object.entries(
            ROLE_POST_LIMITS
        )
    ) {
        if (
            member.roles.cache.has(roleId)
        ) {
            highestLimit = Math.max(
                highestLimit,
                limit
            );
        }
    }

    return highestLimit;
}

// ==================================================
// ACTIVE POSTS COUNT
// ==================================================

function getActivePostsCount(
    guildId,
    userId
) {
    return getUserPosts(
        guildId,
        userId
    ).filter(post =>
        post &&
        post.active === true
    ).length;
}

// ==================================================
// GET MEMBER
// ==================================================

async function getGuildMember(
    guildId,
    userId
) {
    const guild =
        client.guilds.cache.get(
            guildId
        );

    if (!guild) {
        return null;
    }

    const cached =
        guild.members.cache.get(
            userId
        );

    if (cached) {
        return cached;
    }

    return guild.members
        .fetch(userId)
        .catch(() => null);
}

// ==================================================
// GET WEBHOOK
// ==================================================

async function getExchangeWebhook(
    channel
) {
    if (!channel) {
        return null;
    }

    try {
        const webhooks =
            await channel.fetchWebhooks();

        let webhook =
            webhooks.find(
                hook =>
                    hook.name ===
                    "Auto Exchange"
            );

        if (webhook) {
            return webhook;
        }

        const me =
            channel.guild.members.me;

        if (!me) {
            return null;
        }

        const permissions =
            channel.permissionsFor(me);

        if (
            !permissions ||
            !permissions.has(
                PermissionsBitField.Flags.ManageWebhooks
            )
        ) {
            return null;
        }

        webhook =
            await channel.createWebhook({
                name: "Auto Exchange"
            });

        return webhook;
    } catch (err) {
        console.log(
            "❌ Webhook error:",
            err.message
        );

        return null;
    }
}

// ==================================================
// USER DISPLAY NAME
// ==================================================

async function getUserDisplayName(
    guild,
    userId
) {
    const member =
        await getGuildMember(
            guild.id,
            userId
        );

    if (member) {
        return member.displayName;
    }

    const user =
        await client.users
            .fetch(userId)
            .catch(() => null);

    if (user) {
        return user.username;
    }

    return "User";
}

// ==================================================
// PUBLISH POST
// ==================================================

async function publishPost(post) {
    if (
        !post ||
        !post.guildId
    ) {
        return {
            success: false,
            reason: "INVALID_POST"
        };
    }

    const guild =
        client.guilds.cache.get(
            post.guildId
        );

    if (!guild) {
        return {
            success: false,
            reason: "GUILD_NOT_FOUND"
        };
    }

    const channel =
        guild.channels.cache.get(
            post.channelId
        );

    if (!channel) {
        return {
            success: false,
            reason: "CHANNEL_NOT_FOUND"
        };
    }

    if (
        channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildAnnouncement
    ) {
        return {
            success: false,
            reason: "INVALID_CHANNEL"
        };
    }

    if (
        !OWNER_EXCHANGE_CHANNEL_IDS.includes(
            channel.id
        )
    ) {
        return {
            success: false,
            reason: "CHANNEL_NOT_ALLOWED"
        };
    }

    const webhook =
        await getExchangeWebhook(
            channel
        );

    if (!webhook) {
        return {
            success: false,
            reason: "WEBHOOK_FAILED"
        };
    }

    const content =
        typeof post.content === "string"
            ? post.content.trim()
            : "";

    const attachments =
        Array.isArray(post.attachments)
            ? post.attachments
            : [];

    if (
        !content &&
        attachments.length === 0
    ) {
        return {
            success: false,
            reason: "EMPTY_POST"
        };
    }

    const user =
        await client.users
            .fetch(post.userId)
            .catch(() => null);

    if (!user) {
        return {
            success: false,
            reason: "USER_NOT_FOUND"
        };
    }

    const displayName =
        await getUserDisplayName(
            guild,
            post.userId
        );

    let finalContent = content;

    finalContent +=
        "\n\nتواصل مع <@" +
        post.userId +
        "> للعمل المنشور";

    const files =
        attachments
            .map(att => ({
                attachment: att.url,
                name: att.name || "file"
            }))
            .slice(0, 10);

    try {
        await webhook.send({
            content: finalContent,
            username: displayName,
            avatarURL:
                user.displayAvatarURL({
                    extension: "png",
                    size: 256
                }),
            files: files
        });

        post.lastPostedAt =
            Date.now();

        saveData();

        return {
            success: true
        };
    } catch (err) {
        console.log(
            "❌ Publish error:",
            err.message
        );

        return {
            success: false,
            reason: "PUBLISH_FAILED"
        };
    }
}

// ==================================================
// PUBLISH ERRORS
// ==================================================

function getPublishError(reason) {
    const errors = {
        INVALID_POST:
            "❌ المنشور غير صحيح.",

        GUILD_NOT_FOUND:
            "❌ السيرفر غير موجود.",

        CHANNEL_NOT_FOUND:
            "❌ روم النشر غير موجود.",

        INVALID_CHANNEL:
            "❌ الروم المختارة ليست روم نصية.",

        CHANNEL_NOT_ALLOWED:
            "❌ هذه الروم غير مسموح بها للنشر.",

        WEBHOOK_FAILED:
            "❌ لم أستطع إنشاء Webhook. تأكد أن البوت لديه Manage Webhooks.",

        EMPTY_POST:
            "❌ المنشور فارغ.",

        USER_NOT_FOUND:
            "❌ لم أستطع العثور على صاحب المنشور.",

        PUBLISH_FAILED:
            "❌ حدث خطأ أثناء نشر المنشور."
    };

    return (
        errors[reason] ||
        "❌ حدث خطأ غير معروف."
    );
}

// ==================================================
// MAIN PANEL
// ==================================================

function createMainPanel(
    isOwner = false
) {
    const embed =
        new EmbedBuilder()
            .setTitle("Auto Exchange")
            .setDescription(
                "اختر العملية التي تريد تنفيذها من القائمة بالأسفل."
            )
            .setFooter({
                text: "Auto Exchange System"
            });

    const options = [
        new StringSelectMenuOptionBuilder()
            .setLabel("بدء نشر")
            .setDescription(
                "إنشاء منشور جديد"
            )
            .setValue("start"),

        new StringSelectMenuOptionBuilder()
            .setLabel("إيقاف منشور")
            .setDescription(
                "إيقاف أحد منشوراتك"
            )
            .setValue("stop"),

        new StringSelectMenuOptionBuilder()
            .setLabel("منشوراتي")
            .setDescription(
                "عرض منشوراتك الحالية"
            )
            .setValue("posts")
    ];

    if (isOwner) {
        options.push(
            new StringSelectMenuOptionBuilder()
                .setLabel("المدة")
                .setDescription(
                    "تغيير مدة إعادة النشر"
                )
                .setValue("time")
        );
    }

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "auto_main_menu"
            )
            .setPlaceholder(
                "اختر من القائمة"
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
// TIME MENU
// ==================================================

function createTimeMenu() {
    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "time_select"
            )
            .setPlaceholder(
                "اختر مدة إعادة النشر"
            )
            .addOptions(
                TIME_OPTIONS.map(
                    option =>
                        new StringSelectMenuOptionBuilder()
                            .setLabel(
                                option.label
                            )
                            .setValue(
                                option.value
                            )
                )
            );

    return new ActionRowBuilder()
        .addComponents(menu);
}

// ==================================================
// EXCHANGE CHANNEL MENU
// ==================================================

function createExchangeChannelMenu(
    guildId,
    postId
) {
    const guildData =
        getGuildData(guildId);

    const channels =
        guildData.exchangeChannels
            .filter(id =>
                OWNER_EXCHANGE_CHANNEL_IDS.includes(
                    id
                )
            );

    const options = [];

    for (const id of channels) {
        const channel =
            client.channels.cache.get(
                id
            );

        if (
            channel &&
            channel.guild &&
            channel.guild.id === guildId
        ) {
            options.push(
                new StringSelectMenuOptionBuilder()
                    .setLabel(
                        channel.name.slice(
                            0,
                            100
                        )
                    )
                    .setDescription(
                        (
                            "النشر في #" +
                            channel.name
                        ).slice(0, 100)
                    )
                    .setValue(channel.id)
            );
        }
    }

    if (options.length === 0) {
        options.push(
            new StringSelectMenuOptionBuilder()
                .setLabel(
                    "لا توجد رومات مضافة"
                )
                .setDescription(
                    "المالك يحتاج لاستخدام !setupauto"
                )
                .setValue("none")
        );
    }

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "exchange_select_channel:" +
                postId
            )
            .setPlaceholder(
                "اختر روم النشر"
            )
            .addOptions(
                options.slice(0, 25)
            );

    return new ActionRowBuilder()
        .addComponents(menu);
}

// ==================================================
// OWNER CHANNEL SETUP
// ==================================================

function createOwnerChannelSetupMenu() {
    const options = [];

    for (
        const id
        of OWNER_EXCHANGE_CHANNEL_IDS
    ) {
        const channel =
            client.channels.cache.get(
                id
            );

        options.push(
            new StringSelectMenuOptionBuilder()
                .setLabel(
                    channel
                        ? (
                            "#" +
                            channel.name
                        ).slice(0, 100)
                        : (
                            "Channel " +
                            id
                        )
                )
                .setDescription(
                    id
                )
                .setValue(id)
        );
    }

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "auto_setup_channels"
            )
            .setPlaceholder(
                "اختر رومات Auto Exchange"
            )
            .setMinValues(1)
            .setMaxValues(
                Math.min(
                    options.length,
                    10
                )
            )
            .addOptions(options);

    return new ActionRowBuilder()
        .addComponents(menu);
}

// ==================================================
// USER POSTS MENU
// ==================================================

function createUserPostsMenu(
    guildId,
    userId
) {
    const posts =
        getUserPosts(
            guildId,
            userId
        ).filter(post =>
            post &&
            post.active === true
        );

    const options =
        posts
            .slice(0, 25)
            .map(
                (post, index) =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(
                            "منشور " +
                            (index + 1)
                        )
                        .setDescription(
                            (
                                "روم: " +
                                post.channelId
                            ).slice(0, 100)
                        )
                        .setValue(
                            post.id
                        )
            );

    if (options.length === 0) {
        options.push(
            new StringSelectMenuOptionBuilder()
                .setLabel(
                    "لا توجد منشورات"
                )
                .setDescription(
                    "ليس لديك منشورات نشطة"
                )
                .setValue("none")
        );
    }

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "stop_post_select"
            )
            .setPlaceholder(
                "اختر المنشور"
            )
            .addOptions(options);

    return new ActionRowBuilder()
        .addComponents(menu);
}

// ==================================================
// POST SLOT MENU
// ==================================================

function createPostSlotMenu(
    member
) {
    const limit =
        getUserPostLimit(member);

    const active =
        getActivePostsCount(
            member.guild.id,
            member.id
        );

    const remaining =
        Math.max(
            0,
            limit - active
        );

    const maxOptions =
        Math.min(
            remaining,
            5
        );

    const options = [];

    for (
        let i = 1;
        i <= maxOptions;
        i++
    ) {
        options.push(
            new StringSelectMenuOptionBuilder()
                .setLabel(
                    "منشور " + i
                )
                .setDescription(
                    "اختيار مساحة للمنشور"
                )
                .setValue(
                    String(i)
                )
        );
    }

    if (options.length === 0) {
        options.push(
            new StringSelectMenuOptionBuilder()
                .setLabel(
                    "لا توجد مساحات"
                )
                .setDescription(
                    "وصلت للحد المسموح"
                )
                .setValue("none")
        );
    }

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "post_slot_select"
            )
            .setPlaceholder(
                "اختر رقم المنشور"
            )
            .addOptions(options);

    return new ActionRowBuilder()
        .addComponents(menu);
}

// ==================================================
// SEND PANEL
// ==================================================

async function sendPanel(message) {
    const isOwner =
        message.author.id ===
        OWNER_ID;

    await message.channel.send(
        createMainPanel(isOwner)
    );
}

// ==================================================
// HANDLE DM POST
// ==================================================

async function handleDMPost(
    message
) {
    const waitingPost =
        Object.values(data.posts)
            .find(post =>
                post &&
                post.userId ===
                    message.author.id &&
                post.waitingForPost === true
            );

    if (!waitingPost) {
        return;
    }

    const content =
        typeof message.content === "string"
            ? message.content.trim()
            : "";

    const attachments =
        [...message.attachments.values()]
            .map(att => ({
                url: att.url,
                name:
                    att.name ||
                    "file"
            }));

    if (
        !content &&
        attachments.length === 0
    ) {
        await message.reply(
            "❌ أرسل نص أو صورة أو ملف في الرسالة."
        );

        return;
    }

    waitingPost.content =
        content;

    waitingPost.attachments =
        attachments;

    waitingPost.waitingForPost =
        false;

    waitingPost.active =
        true;

    if (
        !waitingPost.intervalMinutes
    ) {
        waitingPost.intervalMinutes =
            Number(
                config.postIntervalMinutes ||
                10
            );
    }

    saveData();

    const result =
        await publishPost(
            waitingPost
        );

    if (!result.success) {
        waitingPost.active = false;
        saveData();

        await message.reply(
            getPublishError(
                result.reason
            )
        );

        return;
    }

    await message.reply(
        "✅ تم نشر منشورك بنجاح."
    );
}

// ==================================================
// AUTO EXCHANGE LOOP
// ==================================================

function getPostInterval(
    post
) {
    return (
        Number(
            post.intervalMinutes
        ) ||
        Number(
            config.postIntervalMinutes
        ) ||
        10
    );
}

async function runAutoExchange() {
    const now = Date.now();

    for (
        const post
        of Object.values(data.posts)
    ) {
        if (!post) {
            continue;
        }

        if (!post.active) {
            continue;
        }

        if (
            post.waitingForPost
        ) {
            continue;
        }

        if (!post.channelId) {
            continue;
        }

        if (
            !post.content &&
            !post.attachments?.length
        ) {
            continue;
        }

        const intervalMinutes =
            getPostInterval(post);

        const interval =
            intervalMinutes *
            60 *
            1000;

        const lastPostedAt =
            Number(
                post.lastPostedAt || 0
            );

        if (
            now - lastPostedAt <
            interval
        ) {
            continue;
        }

        await publishPost(post);
    }
}

// ==================================================
// CLEANUP WAITING POSTS
// ==================================================

function cleanupWaitingPosts() {
    const now = Date.now();
    let changed = false;

    for (
        const [id, post]
        of Object.entries(data.posts)
    ) {
        if (
            post &&
            post.waitingForPost &&
            post.createdAt &&
            now - post.createdAt >
                15 * 60 * 1000
        ) {
            delete data.posts[id];
            changed = true;
        }
    }

    if (changed) {
        saveData();
    }
}

// ==================================================
// READY
// ==================================================

client.once(
    "clientReady",
    async () => {
        console.log(
            "===================================="
        );

        console.log(
            "✅ Logged in as " +
            client.user.tag
        );

        client.user.setPresence({
            status: "dnd",
            activities: [
                {
                    name: "Auto Exchange",
                    type:
                        ActivityType.Watching
                }
            ]
        });

        console.log(
            "🔴 Bot status: Do Not Disturb"
        );

        console.log(
            "🔄 Auto Exchange loop started."
        );

        console.log(
            "===================================="
        );

        setInterval(
            async () => {
                try {
                    cleanupWaitingPosts();

                    await runAutoExchange();

                    await removeExpiredRoles();
                } catch (err) {
                    console.log(
                        "❌ Loop error:",
                        err.message
                    );
                }
            },
            30 * 1000
        );
    }
);

// ==================================================
// MESSAGE CREATE
// ==================================================

client.on(
    "messageCreate",
    async message => {
        try {
            if (message.author.bot) {
                return;
            }

            // ==========================================
            // DM
            // ==========================================

            if (!message.guild) {
                await handleDMPost(
                    message
                );

                return;
            }

            const messageContent =
                message.content.trim();

            // ==========================================
            // +رول
            // ==========================================

            if (
                messageContent.startsWith(
                    "+رول"
                )
            ) {
                const args =
                    messageContent.split(
                        /\s+/
                    );

                if (args.length < 4) {
                    await message.reply(
                        "❌ الاستخدام الصحيح:\n\n" +
                        "`+رول @العضو @الرتبة 1m`\n" +
                        "`+رول @العضو @الرتبة 1h`\n" +
                        "`+رول @العضو @الرتبة 1d`\n" +
                        "`+رول @العضو @الرتبة 1w`\n" +
                        "`+رول @العضو @الرتبة 1y`"
                    );

                    return;
                }

                const isOwner =
                    message.author.id ===
                    OWNER_ID;

                const isAdmin =
                    message.member.permissions.has(
                        PermissionsBitField.Flags.Administrator
                    );

                if (
                    !isOwner &&
                    !isAdmin
                ) {
                    await message.reply(
                        "❌ هذا الأمر للإدارة فقط."
                    );

                    return;
                }

                const target =
                    message.mentions.members.first();

                if (!target) {
                    await message.reply(
                        "❌ منشن العضو أولاً.\n\n" +
                        "`+رول @العضو @الرتبة 1h`"
                    );

                    return;
                }

                const role =
                    message.mentions.roles.first();

                if (!role) {
                    await message.reply(
                        "❌ منشن الرتبة أيضًا.\n\n" +
                        "`+رول @العضو @الرتبة 1h`"
                    );

                    return;
                }

                const durationText =
                    args[args.length - 1];

                const duration =
                    parseRoleDuration(
                        durationText
                    );

                if (!duration) {
                    await message.reply(
                        "❌ المدة غير صحيحة.\n\n" +
                        "المتاح:\n" +
                        "`1m` = دقيقة\n" +
                        "`1h` = ساعة\n" +
                        "`1d` = يوم\n" +
                        "`1w` = أسبوع\n" +
                        "`1y` = سنة"
                    );

                    return;
                }

                const botMember =
                    message.guild.members.me;

                if (!botMember) {
                    await message.reply(
                        "❌ لم أستطع تحديد رتبة البوت."
                    );

                    return;
                }

                if (
                    role.position >=
                    botMember.roles.highest.position
                ) {
                    await message.reply(
                        "❌ لا أستطيع إعطاء هذه الرتبة لأن رتبة البوت ليست أعلى منها."
                    );

                    return;
                }

                if (
                    !isOwner &&
                    role.position >=
                    message.member.roles.highest.position
                ) {
                    await message.reply(
                        "❌ لا يمكنك إعطاء رتبة مساوية أو أعلى من رتبتك."
                    );

                    return;
                }

                if (
                    target.roles.cache.has(
                        role.id
                    )
                ) {
                    await message.reply(
                        "⚠️ العضو لديه هذه الرتبة بالفعل."
                    );

                    return;
                }

                const result =
                    await addTemporaryRole(
                        message.guild,
                        target,
                        role,
                        durationText,
                        message.author
                    );

                if (!result.success) {
                    await message.reply(
                        result.message
                    );

                    return;
                }

                const expiresTimestamp =
                    Math.floor(
                        result.expiresAt /
                        1000
                    );

                await message.reply(
                    "✅ تم إعطاء " +
                    role +
                    " للعضو " +
                    target +
                    " لمدة **" +
                    duration.text +
                    "**.\n" +
                    "⏰ تنتهي: <t:" +
                    expiresTimestamp +
                    ":R>"
                );

                return;
            }

            // ==========================================
            // !AUTO
            // ==========================================

            if (
                messageContent.toLowerCase() ===
                "!auto"
            ) {
                await sendPanel(
                    message
                );

                return;
            }

            // ==========================================
            // !SETUPAUTO
            // ==========================================

            if (
                messageContent.toLowerCase() ===
                "!setupauto"
            ) {
                if (
                    message.author.id !==
                    OWNER_ID
                ) {
                    await message.reply(
                        "❌ هذا الأمر للمالك فقط."
                    );

                    return;
                }

                await message.reply({
                    content:
                        "اختر رومات Auto Exchange المسموح بها:",
                    components: [
                        createOwnerChannelSetupMenu()
                    ]
                });

                return;
            }
        } catch (err) {
            console.log(
                "❌ messageCreate error:",
                err
            );
        }
    }
);

// ==================================================
// INTERACTIONS
// ==================================================

client.on(
    "interactionCreate",
    async interaction => {
        try {
            if (
                !interaction.isStringSelectMenu()
            ) {
                return;
            }

            // ==========================================
            // MAIN MENU
            // ==========================================

            if (
                interaction.customId ===
                "auto_main_menu"
            ) {
                const value =
                    interaction.values[0];

                if (!interaction.guild) {
                    await interaction.reply({
                        content:
                            "❌ هذا الأمر يعمل داخل السيرفر فقط.",
                        ephemeral: true
                    });

                    return;
                }

                const member =
                    await getGuildMember(
                        interaction.guild.id,
                        interaction.user.id
                    );

                if (!member) {
                    await interaction.reply({
                        content:
                            "❌ لم أستطع العثور على عضويتك.",
                        ephemeral: true
                    });

                    return;
                }

                // ======================================
                // START
                // ======================================

                if (value === "start") {
                    const limit =
                        getUserPostLimit(
                            member
                        );

                    const active =
                        getActivePostsCount(
                            interaction.guild.id,
                            interaction.user.id
                        );

                    if (limit <= 0) {
                        await interaction.reply({
                            content:
                                "❌ لا تملك رتبة تسمح لك باستخدام Auto Exchange.",
                            ephemeral: true
                        });

                        return;
                    }

                    if (active >= limit) {
                        await interaction.reply({
                            content:
                                "❌ وصلت للحد المسموح: **" +
                                limit +
                                " منشور**.",
                            ephemeral: true
                        });

                        return;
                    }

                    await interaction.reply({
                        content:
                            "اختر رقم المنشور:",
                        components: [
                            createPostSlotMenu(
                                member
                            )
                        ],
                        ephemeral: true
                    });

                    return;
                }

                // ======================================
                // STOP
                // ======================================

                if (value === "stop") {
                    await interaction.reply({
                        content:
                            "اختر المنشور الذي تريد إيقافه:",
                        components: [
                            createUserPostsMenu(
                                interaction.guild.id,
                                interaction.user.id
                            )
                        ],
                        ephemeral: true
                    });

                    return;
                }

                // ======================================
                // POSTS
                // ======================================

                if (value === "posts") {
                    const posts =
                        getUserPosts(
                            interaction.guild.id,
                            interaction.user.id
                        ).filter(post =>
                            post &&
                            post.active === true
                        );

                    if (posts.length === 0) {
                        await interaction.reply({
                            content:
                                "📭 ليس لديك منشورات نشطة.",
                            ephemeral: true
                        });

                        return;
                    }

                    const lines =
                        posts.map(
                            (post, index) =>
                                "**" +
                                (index + 1) +
                                ".** <#" +
                                post.channelId +
                                ">"
                        );

                    await interaction.reply({
                        content:
                            "📋 منشوراتك النشطة:\n\n" +
                            lines.join("\n"),
                        ephemeral: true
                    });

                    return;
                }

                // ======================================
                // TIME
                // ======================================

                if (value === "time") {
                    if (
                        interaction.user.id !==
                        OWNER_ID
                    ) {
                        await interaction.reply({
                            content:
                                "❌ المالك فقط يستطيع تغيير المدة.",
                            ephemeral: true
                        });

                        return;
                    }

                    await interaction.reply({
                        content:
                            "اختر مدة إعادة النشر:",
                        components: [
                            createTimeMenu()
                        ],
                        ephemeral: true
                    });

                    return;
                }
            }

            // ==========================================
            // TIME SELECT
            // ==========================================

            if (
                interaction.customId ===
                "time_select"
            ) {
                if (
                    interaction.user.id !==
                    OWNER_ID
                ) {
                    await interaction.reply({
                        content:
                            "❌ المالك فقط يستطيع تغيير المدة.",
                        ephemeral: true
                    });

                    return;
                }

                const minutes =
                    Number(
                        interaction.values[0]
                    );

                if (
                    !Number.isFinite(minutes) ||
                    minutes <= 0
                ) {
                    await interaction.reply({
                        content:
                            "❌ المدة غير صحيحة.",
                        ephemeral: true
                    });

                    return;
                }

                config.postIntervalMinutes =
                    minutes;

                for (
                    const post
                    of Object.values(
                        data.posts
                    )
                ) {
                    if (
                        post &&
                        post.active
                    ) {
                        post.intervalMinutes =
                            minutes;
                    }
                }

                saveConfig();
                saveData();

                await interaction.update({
                    content:
                        "✅ تم تغيير مدة إعادة النشر إلى **" +
                        minutes +
                        " دقيقة**.",
                    components: []
                });

                return;
            }

            // ==========================================
            // OWNER CHANNEL SETUP
            // ==========================================

            if (
                interaction.customId ===
                "auto_setup_channels"
            ) {
                if (
                    interaction.user.id !==
                    OWNER_ID
                ) {
                    await interaction.reply({
                        content:
                            "❌ المالك فقط يستطيع إعداد الرومات.",
                        ephemeral: true
                    });

                    return;
                }

                const selected =
                    interaction.values.filter(
                        id =>
                            OWNER_EXCHANGE_CHANNEL_IDS.includes(
                                id
                            )
                    );

                const guildData =
                    getGuildData(
                        interaction.guild.id
                    );

                guildData.exchangeChannels =
                    selected;

                saveData();

                await interaction.update({
                    content:
                        "✅ تم حفظ **" +
                        selected.length +
                        "** روم لـ Auto Exchange.",
                    components: []
                });

                return;
            }

            // ==========================================
            // POST SLOT
            // ==========================================

            if (
                interaction.customId ===
                "post_slot_select"
            ) {
                const selectedSlot =
                    interaction.values[0];

                if (
                    selectedSlot ===
                    "none"
                ) {
                    await interaction.reply({
                        content:
                            "❌ لا توجد مساحة متاحة.",
                        ephemeral: true
                    });

                    return;
                }

                const member =
                    await getGuildMember(
                        interaction.guild.id,
                        interaction.user.id
                    );

                if (!member) {
                    await interaction.reply({
                        content:
                            "❌ لم أستطع العثور على عضويتك.",
                        ephemeral: true
                    });

                    return;
                }

                const limit =
                    getUserPostLimit(
                        member
                    );

                const active =
                    getActivePostsCount(
                        interaction.guild.id,
                        interaction.user.id
                    );

                if (active >= limit) {
                    await interaction.reply({
                        content:
                            "❌ وصلت للحد المسموح.",
                        ephemeral: true
                    });

                    return;
                }

                const guildData =
                    getGuildData(
                        interaction.guild.id
                    );

                const allowedChannels =
                    guildData.exchangeChannels
                        .filter(id =>
                            OWNER_EXCHANGE_CHANNEL_IDS.includes(
                                id
                            )
                        );

                if (
                    allowedChannels.length === 0
                ) {
                    await interaction.reply({
                        content:
                            "❌ لا توجد رومات Auto Exchange.\nاستخدم `!setupauto` أولاً.",
                        ephemeral: true
                    });

                    return;
                }

                const postId =
                    createPostId(
                        interaction.guild.id,
                        interaction.user.id
                    );

                data.posts[postId] = {
                    id: postId,

                    guildId:
                        interaction.guild.id,

                    userId:
                        interaction.user.id,

                    slot:
                        Number(selectedSlot),

                    channelId:
                        null,

                    content:
                        "",

                    attachments:
                        [],

                    active:
                        false,

                    waitingForPost:
                        false,

                    createdAt:
                        Date.now(),

                    lastPostedAt:
                        0,

                    intervalMinutes:
                        Number(
                            config.postIntervalMinutes ||
                            10
                        )
                };

                saveData();

                await interaction.update({
                    content:
                        "اختر روم النشر:",
                    components: [
                        createExchangeChannelMenu(
                            interaction.guild.id,
                            postId
                        )
                    ]
                });

                return;
            }

            // ==========================================
            // EXCHANGE CHANNEL
            // ==========================================

            if (
                interaction.customId.startsWith(
                    "exchange_select_channel:"
                )
            ) {
                const postId =
                    interaction.customId.split(
                        ":"
                    )[1];

                const channelId =
                    interaction.values[0];

                if (
                    channelId ===
                    "none"
                ) {
                    await interaction.reply({
                        content:
                            "❌ لا توجد روم متاحة.",
                        ephemeral: true
                    });

                    return;
                }

                if (
                    !OWNER_EXCHANGE_CHANNEL_IDS.includes(
                        channelId
                    )
                ) {
                    await interaction.reply({
                        content:
                            "❌ هذه الروم غير مسموح بها.",
                        ephemeral: true
                    });

                    return;
                }

                const post =
                    data.posts[postId];

                if (!post) {
                    await interaction.reply({
                        content:
                            "❌ المنشور غير موجود.",
                        ephemeral: true
                    });

                    return;
                }

                if (
                    post.userId !==
                    interaction.user.id
                ) {
                    await interaction.reply({
                        content:
                            "❌ هذا المنشور ليس لك.",
                        ephemeral: true
                    });

                    return;
                }

                if (
                    post.active ||
                    post.waitingForPost
                ) {
                    await interaction.reply({
                        content:
                            "❌ هذا المنشور قيد الاستخدام بالفعل.",
                        ephemeral: true
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
                    await interaction.reply({
                        content:
                            "❌ هذه الروم لم يحددها المالك ضمن رومات Auto Exchange.",
                        ephemeral: true
                    });

                    return;
                }

                const channel =
                    interaction.guild.channels.cache.get(
                        channelId
                    );

                if (!channel) {
                    await interaction.reply({
                        content:
                            "❌ الروم غير موجودة في هذا السيرفر.",
                        ephemeral: true
                    });

                    return;
                }

                if (
                    channel.type !==
                        ChannelType.GuildText &&
                    channel.type !==
                        ChannelType.GuildAnnouncement
                ) {
                    await interaction.reply({
                        content:
                            "❌ هذه ليست روم نصية.",
                        ephemeral: true
                    });

                    return;
                }

                post.channelId =
                    channelId;

                post.waitingForPost =
                    true;

                saveData();

                try {
                    await interaction.user.send(
                        "📨 أرسل الآن المنشور الذي تريد نشره.\n\n" +
                        "يمكنك إرسال **النص والصور والملفات في رسالة واحدة**."
                    );
                } catch (err) {
                    post.waitingForPost =
                        false;

                    post.channelId =
                        null;

                    saveData();

                    await interaction.reply({
                        content:
                            "❌ لا أستطيع إرسال رسالة خاصة لك. افتح الـDM مع البوت ثم حاول مرة أخرى.",
                        ephemeral: true
                    });

                    return;
                }

                await interaction.update({
                    content:
                        "📩 تم إرسال التعليمات لك في الخاص. أرسل المنشور هناك.",
                    components: []
                });

                return;
            }

            // ==========================================
            // STOP POST
            // ==========================================

            if (
                interaction.customId ===
                "stop_post_select"
            ) {
                const postId =
                    interaction.values[0];

                if (
                    postId ===
                    "none"
                ) {
                    await interaction.reply({
                        content:
                            "❌ لا يوجد منشور لإيقافه.",
                        ephemeral: true
                    });

                    return;
                }

                const post =
                    data.posts[postId];

                if (!post) {
                    await interaction.reply({
                        content:
                            "❌ المنشور غير موجود.",
                        ephemeral: true
                    });

                    return;
                }

                if (
                    post.userId !==
                    interaction.user.id
                ) {
                    await interaction.reply({
                        content:
                            "❌ هذا المنشور ليس لك.",
                        ephemeral: true
                    });

                    return;
                }

                post.active =
                    false;

                post.waitingForPost =
                    false;

                saveData();

                await interaction.update({
                    content:
                        "✅ تم إيقاف المنشور بنجاح.",
                    components: []
                });

                return;
            }
        } catch (err) {
            console.log(
                "❌ interactionCreate error:",
                err
            );

            try {
                if (
                    !interaction.replied &&
                    !interaction.deferred
                ) {
                    await interaction.reply({
                        content:
                            "❌ حدث خطأ غير متوقع.",
                        ephemeral: true
                    });
                }
            } catch {}
        }
    }
);

// ==================================================
// CLIENT ERROR
// ==================================================

client.on(
    "error",
    error => {
        console.log(
            "❌ Discord Client Error:",
            error
        );
    }
);

// ==================================================
// CLIENT WARNING
// ==================================================

client.on(
    "warn",
    warning => {
        console.log(
            "⚠️ Discord Warning:",
            warning
        );
    }
);

// ==================================================
// UNHANDLED REJECTION
// ==================================================

process.on(
    "unhandledRejection",
    error => {
        console.log(
            "❌ Unhandled Rejection:",
            error
        );
    }
);

// ==================================================
// UNCAUGHT EXCEPTION
// ==================================================

process.on(
    "uncaughtException",
    error => {
        console.log(
            "❌ Uncaught Exception:",
            error
        );
    }
);

// ==================================================
// LOGIN
// ==================================================

if (!TOKEN) {
    console.log(
        "❌ DISCORD TOKEN IS MISSING!"
    );

    console.log(
        "ضع التوكن في config.json أو متغير DISCORD_TOKEN."
    );

    process.exit(1);
}

client.login(TOKEN)
    .then(() => {
        console.log(
            "🔄 Connecting to Discord..."
        );
    })
    .catch(err => {
        console.log(
            "❌ Login failed:",
            err.message
        );
    });
