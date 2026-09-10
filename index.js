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

// ============================================================
// CONFIG
// ============================================================

const configPath = path.join(__dirname, "config.json");
const dataPath = path.join(__dirname, "data.json");

let config = {
    token: "",
    ownerId: "",
    postIntervalMinutes: 10
};

let data = {
    guilds: {},
    posts: {}
};

// ============================================================
// LOAD CONFIG
// ============================================================

if (fs.existsSync(configPath)) {
    try {
        config = {
            ...config,
            ...JSON.parse(fs.readFileSync(configPath, "utf8"))
        };
    } catch (error) {
        console.error("❌ خطأ في config.json:", error);
    }
}

if (fs.existsSync(dataPath)) {
    try {
        data = {
            ...data,
            ...JSON.parse(fs.readFileSync(dataPath, "utf8"))
        };
    } catch (error) {
        console.error("❌ خطأ في data.json:", error);
    }
}

// ============================================================
// TOKEN
// ============================================================

const TOKEN =
    process.env.DISCORD_TOKEN ||
    config.token ||
    process.env.TOKEN;

if (!TOKEN) {
    console.error("❌ لم يتم العثور على Bot Token.");
    process.exit(1);
}

// ============================================================
// OWNER
// ============================================================

const OWNER_ID =
    process.env.OWNER_ID ||
    config.ownerId;

// ============================================================
// ALLOWED EXCHANGE CHANNELS
// ============================================================

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

// ============================================================
// POST LIMIT ROLES
// ============================================================

const ROLE_POST_LIMITS = {
    "1547161680209772544": 1,
    "1547161717841068083": 2,
    "1547161721737711616": 2
};

// ============================================================
// TIME OPTIONS
// ============================================================

const TIME_OPTIONS = [
    {
        value: "1",
        label: "كل دقيقة",
        description: "إرسال المنشور كل دقيقة"
    },
    {
        value: "5",
        label: "كل 5 دقائق",
        description: "إرسال المنشور كل 5 دقائق"
    },
    {
        value: "10",
        label: "كل 10 دقائق",
        description: "إرسال المنشور كل 10 دقائق"
    },
    {
        value: "15",
        label: "كل 15 دقيقة",
        description: "إرسال المنشور كل 15 دقيقة"
    },
    {
        value: "30",
        label: "كل 30 دقيقة",
        description: "إرسال المنشور كل 30 دقيقة"
    },
    {
        value: "60",
        label: "كل ساعة",
        description: "إرسال المنشور كل ساعة"
    },
    {
        value: "120",
        label: "كل ساعتين",
        description: "إرسال المنشور كل ساعتين"
    },
    {
        value: "360",
        label: "كل 6 ساعات",
        description: "إرسال المنشور كل 6 ساعات"
    },
    {
        value: "720",
        label: "كل 12 ساعة",
        description: "إرسال المنشور كل 12 ساعة"
    },
    {
        value: "1440",
        label: "كل 24 ساعة",
        description: "إرسال المنشور كل 24 ساعة"
    }
];

// ============================================================
// CLIENT
// ============================================================

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

// ============================================================
// SAVE DATA
// ============================================================

function saveData() {
    try {
        fs.writeFileSync(
            dataPath,
            JSON.stringify(data, null, 4),
            "utf8"
        );
    } catch (error) {
        console.error("❌ فشل حفظ data.json:", error);
    }
}

// ============================================================
// SAVE CONFIG
// ============================================================

function saveConfig() {
    try {
        fs.writeFileSync(
            configPath,
            JSON.stringify(config, null, 4),
            "utf8"
        );
    } catch (error) {
        console.error("❌ فشل حفظ config.json:", error);
    }
}

// ============================================================
// IDS
// ============================================================

function createPostId(guildId, userId) {
    return `${guildId}_${userId}_${Date.now()}_${Math.floor(
        Math.random() * 999999
    )}`;
}

// ============================================================
// GUILD DATA
// ============================================================

function getGuildData(guildId) {
    if (!data.guilds[guildId]) {
        data.guilds[guildId] = {
            exchangeChannels: []
        };

        saveData();
    }

    return data.guilds[guildId];
}

// ============================================================
// USER POSTS
// ============================================================

function getUserPosts(guildId, userId) {
    const key = `${guildId}:${userId}`;

    if (!Array.isArray(data.posts[key])) {
        data.posts[key] = [];
        saveData();
    }

    return data.posts[key];
}

// ============================================================
// USER ROLE LIMIT
// ============================================================

function getUserPostLimit(member) {

    if (!member) {
        return 0;
    }

    if (
        OWNER_ID &&
        member.id === OWNER_ID
    ) {
        return 999;
    }

    if (
        member.permissions.has(
            PermissionsBitField.Flags.Administrator
        )
    ) {
        return 999;
    }

    let highestLimit = 0;

    for (const [roleId, limit] of Object.entries(
        ROLE_POST_LIMITS
    )) {
        if (member.roles.cache.has(roleId)) {
            highestLimit = Math.max(
                highestLimit,
                limit
            );
        }
    }

    return highestLimit;
}

// ============================================================
// ACTIVE POSTS COUNT
// ============================================================

function getActivePostsCount(guildId, userId) {

    const posts = getUserPosts(
        guildId,
        userId
    );

    return posts.filter(
        post => post.active === true
    ).length;
}

// ============================================================
// WEBHOOK
// ============================================================

async function getExchangeWebhook(channel) {

    if (!channel) {
        return null;
    }

    if (
        channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildAnnouncement
    ) {
        return null;
    }

    try {

        const webhooks =
            await channel.fetchWebhooks();

        let webhook =
            webhooks.find(
                hook =>
                    hook.name === "Auto Exchange" &&
                    hook.owner &&
                    hook.owner.id === client.user.id
            );

        if (webhook) {
            return webhook;
        }

        webhook =
            await channel.createWebhook({
                name: "Auto Exchange",
                reason: "Auto Exchange System"
            });

        return webhook;

    } catch (error) {

        console.error(
            "❌ Webhook Error:",
            error
        );

        return null;
    }
}

// ============================================================
// FORMAT USER NAME
// ============================================================

function getUserDisplayName(user) {

    return (
        user.globalName ||
        user.displayName ||
        user.username
    );
}

// ============================================================
// PUBLISH POST
// ============================================================

async function publishPost(
    post
) {

    try {

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
            await guild.channels
                .fetch(post.channelId)
                .catch(() => null);

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

        if (
            !post.content &&
            (!post.attachments ||
                post.attachments.length === 0)
        ) {
            return {
                success: false,
                reason: "EMPTY"
            };
        }

        let content =
            post.content || "";

        // ====================================================
        // CONTACT MESSAGE
        // ====================================================

        content +=
            `\n\nتواصل مع <@${post.userId}> للعمل المنشور`;

        const files =
            Array.isArray(post.attachments)
                ? post.attachments.map(
                    attachment => ({
                        attachment:
                            attachment.url,
                        name:
                            attachment.name ||
                            "attachment"
                    })
                )
                : [];

        await webhook.send({

            username:
                getUserDisplayName(user),

            avatarURL:
                user.displayAvatarURL({
                    extension: "png",
                    size: 1024
                }),

            content,

            files,

            allowedMentions: {
                users: [
                    post.userId
                ]
            }
        });

        post.lastPostedAt =
            Date.now();

        post.lastError =
            null;

        saveData();

        return {
            success: true
        };

    } catch (error) {

        console.error(
            "❌ Publish Error:",
            error
        );

        post.lastError =
            error.message;

        saveData();

        return {
            success: false,
            reason: "SEND_ERROR",
            error
        };
    }
}

// ============================================================
// CREATE MAIN PANEL
// ============================================================

function createMainPanel() {

    const embed =
        new EmbedBuilder()
            .setTitle(
                "Auto Exchange"
            )
            .setDescription(
                [
                    "اختر العملية التي تريد تنفيذها من القائمة بالأسفل.",
                    "",
                    "📢 **بدء منشور**",
                    "إضافة منشور جديد للتبادل.",
                    "",
                    "🛑 **إيقاف منشور**",
                    "إيقاف أحد منشوراتك.",
                    "",
                    "📊 **منشوراتي**",
                    "عرض المنشورات الحالية.",
                    "",
                    "⏱️ **تحديد المدة**",
                    "تغيير مدة إعادة إرسال المنشورات."
                ].join("\n")
            )
            .setColor(0x5865F2);

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "auto_main_menu"
            )
            .setPlaceholder(
                "اختر من القائمة..."
            )
            .addOptions(

                new StringSelectMenuOptionBuilder()
                    .setLabel(
                        "بدء منشور"
                    )
                    .setDescription(
                        "إضافة منشور جديد"
                    )
                    .setEmoji("📢")
                    .setValue(
                        "start"
                    ),

                new StringSelectMenuOptionBuilder()
                    .setLabel(
                        "إيقاف منشور"
                    )
                    .setDescription(
                        "إيقاف أحد المنشورات"
                    )
                    .setEmoji("🛑")
                    .setValue(
                        "stop"
                    ),

                new StringSelectMenuOptionBuilder()
                    .setLabel(
                        "منشوراتي"
                    )
                    .setDescription(
                        "عرض منشوراتك الحالية"
                    )
                    .setEmoji("📊")
                    .setValue(
                        "posts"
                    ),

                new StringSelectMenuOptionBuilder()
                    .setLabel(
                        "تحديد المدة"
                    )
                    .setDescription(
                        "تغيير مدة إعادة الإرسال"
                    )
                    .setEmoji("⏱️")
                    .setValue(
                        "time"
                    )
            );

    return {
        embeds: [
            embed
        ],
        components: [
            new ActionRowBuilder()
                .addComponents(menu)
        ]
    };
}

// ============================================================
// TIME MENU
// ============================================================

function createTimeMenu() {

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "time_select"
            )
            .setPlaceholder(
                "اختر مدة إعادة الإرسال..."
            )
            .addOptions(
                TIME_OPTIONS.map(
                    option =>
                        new StringSelectMenuOptionBuilder()
                            .setLabel(
                                option.label
                            )
                            .setDescription(
                                option.description
                            )
                            .setValue(
                                option.value
                            )
                )
            );

    return new ActionRowBuilder()
        .addComponents(menu);
}

// ============================================================
// EXCHANGE CHANNEL MENU
// ============================================================

function createExchangeChannelMenu(
    guildId
) {

    const guildData =
        getGuildData(guildId);

    const channels =
        guildData.exchangeChannels
            .filter(
                id =>
                    OWNER_EXCHANGE_CHANNEL_IDS
                        .includes(id)
            );

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "exchange_select_channel"
            )
            .setPlaceholder(
                "اختر روم التبادل..."
            );

    if (channels.length === 0) {

        menu.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(
                    "لا توجد رومات متاحة"
                )
                .setDescription(
                    "المالك لم يحدد رومات التبادل بعد"
                )
                .setValue(
                    "none"
                )
        );

    } else {

        menu.addOptions(
            channels
                .slice(0, 25)
                .map(
                    channelId =>
                        new StringSelectMenuOptionBuilder()
                            .setLabel(
                                `روم التبادل`
                            )
                            .setDescription(
                                `اختيار <#${channelId}>`
                            )
                            .setValue(
                                channelId
                            )
                )
        );
    }

    return new ActionRowBuilder()
        .addComponents(menu);
}

// ============================================================
// OWNER CHANNEL SETUP MENU
// ============================================================

function createOwnerChannelSetupMenu() {

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "auto_setup_channels"
            )
            .setPlaceholder(
                "حدد رومات التبادل..."
            )
            .setMinValues(1)
            .setMaxValues(
                Math.min(
                    OWNER_EXCHANGE_CHANNEL_IDS.length,
                    10
                )
            )
            .addOptions(

                OWNER_EXCHANGE_CHANNEL_IDS.map(
                    (channelId, index) =>

                        new StringSelectMenuOptionBuilder()
                            .setLabel(
                                `روم التبادل ${index + 1}`
                            )
                            .setDescription(
                                `#${channelId}`
                            )
                            .setValue(
                                channelId
                            )
                )
            );

    return new ActionRowBuilder()
        .addComponents(menu);
}

// ============================================================
// USER POSTS MENU
// ============================================================

function createUserPostsMenu(
    guildId,
    userId
) {

    const posts =
        getUserPosts(
            guildId,
            userId
        );

    const activePosts =
        posts.filter(
            post =>
                post.active === true
        );

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "stop_post_select"
            )
            .setPlaceholder(
                "اختر منشورًا لإيقافه..."
            );

    if (activePosts.length === 0) {

        menu.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(
                    "لا توجد منشورات"
                )
                .setDescription(
                    "ليس لديك منشورات تعمل حاليًا"
                )
                .setValue(
                    "none"
                )
        );

    } else {

        menu.addOptions(
            activePosts
                .slice(0, 25)
                .map(
                    (post, index) =>

                        new StringSelectMenuOptionBuilder()
                            .setLabel(
                                `منشور ${index + 1}`
                            )
                            .setDescription(
                                `الروم: ${post.channelId}`
                            )
                            .setValue(
                                post.id
                            )
                )
        );
    }

    return new ActionRowBuilder()
        .addComponents(menu);
}

// ============================================================
// POST SLOT MENU
// ============================================================

function createPostSlotMenu(
    guildId,
    userId
) {

    const posts =
        getUserPosts(
            guildId,
            userId
        );

    const activeCount =
        posts.filter(
            post =>
                post.active === true
        ).length;

    const limit =
        getUserPostLimit(
            client.guilds.cache
                .get(guildId)
                ?.members.cache
                .get(userId)
        );

    const remaining =
        limit === 999
            ? 5
            : Math.max(
                0,
                limit - activeCount
            );

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "post_slot_select"
            )
            .setPlaceholder(
                "اختر رقم المنشور..."
            );

    const options = [];

    for (
        let i = 1;
        i <= remaining;
        i++
    ) {

        options.push(
            new StringSelectMenuOptionBuilder()
                .setLabel(
                    `منشور رقم ${activeCount + i}`
                )
                .setDescription(
                    "إنشاء منشور مستقل"
                )
                .setValue(
                    String(activeCount + i)
                )
        );
    }

    if (options.length === 0) {

        options.push(
            new StringSelectMenuOptionBuilder()
                .setLabel(
                    "لا يوجد مكان لمنشور جديد"
                )
                .setDescription(
                    "وصلت للحد المسموح لك"
                )
                .setValue(
                    "none"
                )
        );
    }

    menu.addOptions(
        options.slice(0, 25)
    );

    return new ActionRowBuilder()
        .addComponents(menu);
}

// ============================================================
// SEND PANEL
// ============================================================

async function sendPanel(
    message
) {

    try {

        await message.channel.send(
            createMainPanel()
        );

    } catch (error) {

        console.error(
            "❌ Panel Error:",
            error
        );
    }
}

// ============================================================
// READY
// ============================================================

client.once(
    "ready",
    async () => {

        console.log(
            `✅ Logged in as ${client.user.tag}`
        );

        // ====================================================
        // RED DND STATUS
        // ====================================================

        client.user.setPresence({
            status: "dnd",

            activities: [
                {
                    name: "Auto Exchange",
                    type: ActivityType.Watching
                }
            ]
        });

        console.log(
            "🔴 Bot status: Do Not Disturb"
        );

        // ====================================================
        // AUTO LOOP
        // ====================================================

        setInterval(
            async () => {

                await runAutoExchange();

            },
            30 * 1000
        );

        console.log(
            "🔄 Auto Exchange loop started."
        );
    }
);

// ============================================================
// AUTO EXCHANGE LOOP
// ============================================================

async function runAutoExchange() {

    const now =
        Date.now();

    const interval =
        Number(
            config.postIntervalMinutes || 10
        ) *
        60 *
        1000;

    for (
        const key of Object.keys(
            data.posts
        )
    ) {

        const posts =
            data.posts[key];

        if (!Array.isArray(posts)) {
            continue;
        }

        for (
            const post of posts
        ) {

            if (!post.active) {
                continue;
            }

            if (!post.content &&
                (!post.attachments ||
                    post.attachments.length === 0)
            ) {
                continue;
            }

            if (
                !post.lastPostedAt ||
                now - post.lastPostedAt >= interval
            ) {

                await publishPost(
                    post
                );
            }
        }
    }
}

// ============================================================
// MESSAGE CREATE
// ============================================================

client.on(
    "messageCreate",
    async message => {

        try {

            if (message.author.bot) {
                return;
            }

            // =================================================
            // DM
            // =================================================

            if (
                message.channel.type ===
                ChannelType.DM
            ) {

                await handleDMPost(
                    message
                );

                return;
            }

            // =================================================
            // COMMANDS
            // =================================================

            if (
                !message.content.startsWith("!")
            ) {
                return;
            }

            const args =
                message.content
                    .slice(1)
                    .trim()
                    .split(/\s+/);

            const command =
                args.shift()
                    ?.toLowerCase();

            // =================================================
            // !auto
            // =================================================

            if (
                command === "auto"
            ) {

                await sendPanel(
                    message
                );

                return;
            }

            // =================================================
            // !setupauto
            // =================================================

            if (
                command === "setupauto"
            ) {

                if (
                    !OWNER_ID ||
                    message.author.id !== OWNER_ID
                ) {

                    return message.reply(
                        "❌ هذا الأمر للـ Owner فقط."
                    );
                }

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "إعداد رومات Auto Exchange"
                        )
                        .setDescription(
                            [
                                "اختر الرومات التي تريد استخدامها للتبادل.",
                                "",
                                "يمكن اختيار أكثر من روم.",
                                "الرومات المتاحة هي الرومات المحددة مسبقًا فقط."
                            ].join("\n")
                        )
                        .setColor(
                            0x5865F2
                        );

                return message.channel.send({
                    embeds: [
                        embed
                    ],
                    components: [
                        createOwnerChannelSetupMenu()
                    ]
                });
            }

        } catch (error) {

            console.error(
                "❌ messageCreate Error:",
                error
            );
        }
    }
);

// ============================================================
// HANDLE DM POST
// ============================================================

async function handleDMPost(
    message
) {

    const userId =
        message.author.id;

    // ========================================================
    // FIND WAITING POST
    // ========================================================

    let targetPost = null;

    let targetKey = null;

    for (
        const key of Object.keys(
            data.posts
        )
    ) {

        if (
            !key.endsWith(
                `:${userId}`
            )
        ) {
            continue;
        }

        const posts =
            data.posts[key];

        if (!Array.isArray(posts)) {
            continue;
        }

        const waiting =
            posts.find(
                post =>
                    post.waitingForPost === true
            );

        if (waiting) {

            targetPost =
                waiting;

            targetKey =
                key;

            break;
        }
    }

    if (!targetPost) {
        return;
    }

    // ========================================================
    // SAVE CONTENT
    // ========================================================

    targetPost.content =
        message.content || "";

    targetPost.attachments =
        Array.from(
            message.attachments.values()
        ).map(
            attachment => ({
                url:
                    attachment.url,
                name:
                    attachment.name ||
                    "attachment"
            })
        );

    targetPost.waitingForPost =
        false;

    targetPost.waitingSince =
        null;

    targetPost.active =
        true;

    targetPost.lastPostedAt =
        null;

    targetPost.lastError =
        null;

    saveData();

    // ========================================================
    // PUBLISH FIRST POST
    // ========================================================

    const result =
        await publishPost(
            targetPost
        );

    if (!result.success) {

        targetPost.active =
            false;

        saveData();

        return message.reply(
            [
                "❌ حصل خطأ أثناء نشر المنشور.",
                "",
                `السبب: ${getPublishError(
                    result.reason
                )}`
            ].join("\n")
        );
    }

    // ========================================================
    // SUCCESS
    // ========================================================

    return message.reply(
        [
            "✅ تم تشغيل المنشور بنجاح.",
            "",
            `📍 الروم: <#${targetPost.channelId}>`,
            `⏱️ إعادة الإرسال كل: **${config.postIntervalMinutes} دقيقة**`,
            "",
            "🔄 سيتم إعادة نشر نفس المنشور تلقائيًا."
        ].join("\n")
    );
}

// ============================================================
// PUBLISH ERROR
// ============================================================

function getPublishError(
    reason
) {

    switch (reason) {

        case "CHANNEL_NOT_FOUND":
            return "روم التبادل غير موجود.";

        case "INVALID_CHANNEL":
            return "الروم المحدد ليس روم نصي.";

        case "WEBHOOK_FAILED":
            return "البوت لا يستطيع إنشاء Webhook. تأكد من إعطائه Manage Webhooks.";

        case "EMPTY":
            return "المنشور فارغ.";

        case "USER_NOT_FOUND":
            return "لم أستطع العثور على صاحب المنشور.";

        case "GUILD_NOT_FOUND":
            return "السيرفر غير موجود.";

        default:
            return "خطأ غير معروف.";
    }
}

// ============================================================
// INTERACTION CREATE
// ============================================================

client.on(
    "interactionCreate",
    async interaction => {

        try {

            if (
                !interaction.isStringSelectMenu()
            ) {
                return;
            }

            // =================================================
            // MAIN MENU
            // =================================================

            if (
                interaction.customId ===
                "auto_main_menu"
            ) {

                const choice =
                    interaction.values[0];

                // =============================================
                // START
                // =============================================

                if (
                    choice === "start"
                ) {

                    const member =
                        interaction.member;

                    const limit =
                        getUserPostLimit(
                            member
                        );

                    if (limit === 0) {

                        return interaction.reply({
                            content:
                                "❌ رتبتك غير مسموح لها باستخدام Auto Exchange.",
                            ephemeral: true
                        });
                    }

                    const activeCount =
                        getActivePostsCount(
                            interaction.guild.id,
                            interaction.user.id
                        );

                    if (
                        limit !== 999 &&
                        activeCount >= limit
                    ) {

                        return interaction.reply({
                            content:
                                `❌ رتبتك تسمح لك بحد أقصى **${limit} منشور**.`,
                            ephemeral: true
                        });
                    }

                    return interaction.reply({
                        content:
                            "اختر رقم المنشور الذي تريد إنشاؤه:",
                        components: [
                            createPostSlotMenu(
                                interaction.guild.id,
                                interaction.user.id
                            )
                        ],
                        ephemeral: true
                    });
                }

                // =============================================
                // STOP
                // =============================================

                if (
                    choice === "stop"
                ) {

                    const posts =
                        getUserPosts(
                            interaction.guild.id,
                            interaction.user.id
                        );

                    const active =
                        posts.filter(
                            post =>
                                post.active
                        );

                    if (
                        active.length === 0
                    ) {

                        return interaction.reply({
                            content:
                                "❌ ليس لديك أي منشور يعمل حاليًا.",
                            ephemeral: true
                        });
                    }

                    return interaction.reply({
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
                }

                // =============================================
                // POSTS
                // =============================================

                if (
                    choice === "posts"
                ) {

                    const posts =
                        getUserPosts(
                            interaction.guild.id,
                            interaction.user.id
                        );

                    const active =
                        posts.filter(
                            post =>
                                post.active
                        );

                    if (
                        active.length === 0
                    ) {

                        return interaction.reply({
                            content:
                                "📊 ليس لديك منشورات تعمل حاليًا.",
                            ephemeral: true
                        });
                    }

                    const text =
                        active
                            .map(
                                (post, index) =>
                                    [
                                        `**منشور ${index + 1}**`,
                                        `📍 <#${post.channelId}>`,
                                        `⏱️ كل ${config.postIntervalMinutes} دقيقة`,
                                        `🔄 ${post.lastPostedAt ? "يعمل" : "بانتظار الإرسال"}`
                                    ].join("\n")
                            )
                            .join("\n\n");

                    return interaction.reply({
                        content:
                            `📊 **منشوراتك الحالية:**\n\n${text}`,
                        ephemeral: true
                    });
                }

                // =============================================
                // TIME
                // =============================================

                if (
                    choice === "time"
                ) {

                    if (
                        !OWNER_ID ||
                        interaction.user.id !== OWNER_ID
                    ) {

                        return interaction.reply({
                            content:
                                "❌ تحديد المدة متاح للـ Owner فقط.",
                            ephemeral: true
                        });
                    }

                    return interaction.reply({
                        content:
                            `⏱️ المدة الحالية: **${config.postIntervalMinutes} دقيقة**\n\nاختر المدة الجديدة:`,
                        components: [
                            createTimeMenu()
                        ],
                        ephemeral: true
                    });
                }
            }

            // =================================================
            // TIME SELECT
            // =================================================

            if (
                interaction.customId ===
                "time_select"
            ) {

                if (
                    !OWNER_ID ||
                    interaction.user.id !== OWNER_ID
                ) {

                    return interaction.reply({
                        content:
                            "❌ هذا الخيار للـ Owner فقط.",
                        ephemeral: true
                    });
                }

                const minutes =
                    Number(
                        interaction.values[0]
                    );

                if (
                    !Number.isFinite(
                        minutes
                    ) ||
                    minutes <= 0
                ) {

                    return interaction.reply({
                        content:
                            "❌ مدة غير صحيحة.",
                        ephemeral: true
                    });
                }

                config.postIntervalMinutes =
                    minutes;

                saveConfig();

                return interaction.update({
                    content:
                        `✅ تم تغيير مدة إعادة الإرسال إلى **${minutes} دقيقة**.`,
                    components: []
                });
            }

            // =================================================
            // OWNER SETUP
            // =================================================

            if (
                interaction.customId ===
                "auto_setup_channels"
            ) {

                if (
                    !OWNER_ID ||
                    interaction.user.id !== OWNER_ID
                ) {

                    return interaction.reply({
                        content:
                            "❌ هذا الخيار للـ Owner فقط.",
                        ephemeral: true
                    });
                }

                const selected =
                    interaction.values.filter(
                        id =>
                            OWNER_EXCHANGE_CHANNEL_IDS
                                .includes(id)
                    );

                const guildData =
                    getGuildData(
                        interaction.guild.id
                    );

                guildData.exchangeChannels =
                    selected;

                saveData();

                return interaction.update({
                    content:
                        [
                            "✅ تم حفظ رومات التبادل.",
                            "",
                            selected
                                .map(
                                    id =>
                                        `• <#${id}>`
                                )
                                .join("\n")
                        ].join("\n"),
                    components: []
                });
            }

            // =================================================
            // POST SLOT
            // =================================================

            if (
                interaction.customId ===
                "post_slot_select"
            ) {

                const slot =
                    interaction.values[0];

                if (
                    slot === "none"
                ) {

                    return interaction.update({
                        content:
                            "❌ لا يوجد مكان لمنشور جديد.",
                        components: []
                    });
                }

                const guildData =
                    getGuildData(
                        interaction.guild.id
                    );

                if (
                    guildData.exchangeChannels
                        .length === 0
                ) {

                    return interaction.update({
                        content:
                            "❌ لم يتم تحديد رومات التبادل من الـ Owner.",
                        components: []
                    });
                }

                // =============================================
                // CREATE EMPTY POST
                // =============================================

                const postId =
                    createPostId(
                        interaction.guild.id,
                        interaction.user.id
                    );

                const key =
                    `${interaction.guild.id}:${interaction.user.id}`;

                if (
                    !Array.isArray(
                        data.posts[key]
                    )
                ) {
                    data.posts[key] = [];
                }

                data.posts[key].push({
                    id: postId,

                    guildId:
                        interaction.guild.id,

                    userId:
                        interaction.user.id,

                    channelId:
                        null,

                    content:
                        "",

                    attachments:
                        [],

                    active:
                        false,

                    waitingForChannel:
                        true,

                    waitingForPost:
                        false,

                    waitingSince:
                        null,

                    createdAt:
                        Date.now(),

                    lastPostedAt:
                        null,

                    lastError:
                        null
                });

                saveData();

                // =============================================
                // CHANNEL SELECTION
                // =============================================

                return interaction.update({
                    content:
                        "اختر روم التبادل للمنشور:",
                    components: [
                        createExchangeChannelMenu(
                            interaction.guild.id
                        )
                    ]
                });
            }

            // =================================================
            // CHANNEL SELECT
            // =================================================

            if (
                interaction.customId ===
                "exchange_select_channel"
            ) {

                const channelId =
                    interaction.values[0];

                if (
                    channelId === "none"
                ) {

                    return interaction.update({
                        content:
                            "❌ لا توجد رومات متاحة.",
                        components: []
                    });
                }

                if (
                    !OWNER_EXCHANGE_CHANNEL_IDS
                        .includes(channelId)
                ) {

                    return interaction.update({
                        content:
                            "❌ هذا الروم غير مسموح به.",
                        components: []
                    });
                }

                const key =
                    `${interaction.guild.id}:${interaction.user.id}`;

                const posts =
                    getUserPosts(
                        interaction.guild.id,
                        interaction.user.id
                    );

                const post =
                    [...posts]
                        .reverse()
                        .find(
                            p =>
                                p.waitingForChannel === true
                        );

                if (!post) {

                    return interaction.update({
                        content:
                            "❌ لم يتم العثور على المنشور.",
                        components: []
                    });
                }

                post.channelId =
                    channelId;

                post.waitingForChannel =
                    false;

                post.waitingForPost =
                    true;

                post.waitingSince =
                    Date.now();

                saveData();

                // =============================================
                // DM USER
                // =============================================

                try {

                    await interaction.user.send(
                        [
                            "📢 **أرسل المنشور الآن**",
                            "",
                            `📍 الروم: <#${channelId}>`,
                            `🆔 رقم المنشور: ${post.id}`,
                            "",
                            "أرسل النص والصور/الملفات في رسالة واحدة.",
                            "",
                            "سيتم نشر الرسالة باسم وصورة حسابك."
                        ].join("\n")
                    );

                } catch (error) {

                    post.waitingForPost =
                        false;

                    post.waitingForChannel =
                        false;

                    posts.splice(
                        posts.indexOf(post),
                        1
                    );

                    saveData();

                    return interaction.update({
                        content:
                            "❌ لا أستطيع إرسال DM لك. افتح الرسائل الخاصة من السيرفر وحاول مرة أخرى.",
                        components: []
                    });
                }

                return interaction.update({
                    content:
                        [
                            "✅ تم تحديد الروم.",
                            "",
                            `📍 <#${channelId}>`,
                            "",
                            "📩 أرسلت لك رسالة في الخاص.",
                            "أرسل المنشور هناك."
                        ].join("\n"),
                    components: []
                });
            }

            // =================================================
            // STOP POST
            // =================================================

            if (
                interaction.customId ===
                "stop_post_select"
            ) {

                const postId =
                    interaction.values[0];

                if (
                    postId === "none"
                ) {

                    return interaction.update({
                        content:
                            "❌ لا توجد منشورات.",
                        components: []
                    });
                }

                const posts =
                    getUserPosts(
                        interaction.guild.id,
                        interaction.user.id
                    );

                const post =
                    posts.find(
                        p =>
                            p.id === postId
                    );

                if (!post) {

                    return interaction.update({
                        content:
                            "❌ المنشور غير موجود.",
                        components: []
                    });
                }

                post.active =
                    false;

                post.waitingForPost =
                    false;

                post.waitingForChannel =
                    false;

                post.stoppedAt =
                    Date.now();

                saveData();

                return interaction.update({
                    content:
                        [
                            "🛑 تم إيقاف المنشور.",
                            "",
                            `📍 <#${post.channelId}>`
                        ].join("\n"),
                    components: []
                });
            }

        } catch (error) {

            console.error(
                "❌ interactionCreate Error:",
                error
            );

            if (
                !interaction.replied &&
                !interaction.deferred
            ) {

                await interaction.reply({
                    content:
                        "❌ حدث خطأ غير متوقع.",
                    ephemeral: true
                }).catch(() => {});
            }
        }
    }
);

// ============================================================
// ERROR HANDLING
// ============================================================

client.on(
    "error",
    error => {

        console.error(
            "❌ Discord Client Error:",
            error
        );
    }
);

client.on(
    "warn",
    warning => {

        console.warn(
            "⚠️ Discord Warning:",
            warning
        );
    }
);

process.on(
    "unhandledRejection",
    error => {

        console.error(
            "❌ Unhandled Rejection:",
            error
        );
    }
);

process.on(
    "uncaughtException",
    error => {

        console.error(
            "❌ Uncaught Exception:",
            error
        );
    }
);

// ============================================================
// LOGIN
// ============================================================

client.login(
    TOKEN
).catch(
    error => {

        console.error(
            "❌ Failed to login:",
            error
        );

        process.exit(1);
    }
);
