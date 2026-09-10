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
// CREATE FILES IF NOT EXIST
// ==================================================

if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(
        CONFIG_FILE,
        JSON.stringify(DEFAULT_CONFIG, null, 4),
        "utf8"
    );
}

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(DEFAULT_DATA, null, 4),
        "utf8"
    );
}

// ==================================================
// LOAD CONFIG
// ==================================================

let config;

try {
    config = JSON.parse(
        fs.readFileSync(CONFIG_FILE, "utf8")
    );
} catch (error) {
    console.log(
        "❌ Failed to read config.json:",
        error.message
    );

    config = {
        ...DEFAULT_CONFIG
    };
}

// ==================================================
// LOAD DATA
// ==================================================

let data;

try {
    data = JSON.parse(
        fs.readFileSync(DATA_FILE, "utf8")
    );
} catch (error) {
    console.log(
        "❌ Failed to read data.json:",
        error.message
    );

    data = {
        ...DEFAULT_DATA
    };
}

// ==================================================
// DATA SAFETY
// ==================================================

if (!data || typeof data !== "object") {
    data = {
        ...DEFAULT_DATA
    };
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
// ENVIRONMENT
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
// AUTO EXCHANGE CHANNELS
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
        value: "1m"
    },
    {
        label: "5 دقائق",
        value: "5m"
    },
    {
        label: "10 دقائق",
        value: "10m"
    },
    {
        label: "15 دقيقة",
        value: "15m"
    },
    {
        label: "30 دقيقة",
        value: "30m"
    },
    {
        label: "1 ساعة",
        value: "1h"
    },
    {
        label: "2 ساعة",
        value: "2h"
    },
    {
        label: "6 ساعات",
        value: "6h"
    },
    {
        label: "12 ساعة",
        value: "12h"
    },
    {
        label: "24 ساعة",
        value: "24h"
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
            JSON.stringify(data, null, 4),
            "utf8"
        );
    } catch (error) {
        console.log(
            "❌ Failed to save data.json:",
            error.message
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
            JSON.stringify(config, null, 4),
            "utf8"
        );
    } catch (error) {
        console.log(
            "❌ Failed to save config.json:",
            error.message
        );
    }
}

// ==================================================
// SLASH COMMAND REGISTRATION
// ==================================================

async function registerSlashCommands() {
    if (!TOKEN) {
        console.log(
            "❌ Cannot register Slash Commands: token missing."
        );

        return;
    }

    if (!client.user) {
        console.log(
            "❌ Cannot register Slash Commands: client user missing."
        );

        return;
    }

    const commands = [
        new SlashCommandBuilder()
            .setName("auto")
            .setDescription(
                "فتح لوحة Auto Exchange"
            )
            .toJSON(),

        new SlashCommandBuilder()
            .setName("setupauto")
            .setDescription(
                "إعداد رومات Auto Exchange"
            )
            .toJSON()
    ];

    try {
        const rest = new REST({
            version: "10"
        }).setToken(TOKEN);

        await rest.put(
            Routes.applicationCommands(
                client.user.id
            ),
            {
                body: commands
            }
        );

        console.log(
            "✅ Slash Commands registered successfully."
        );

        console.log("   /auto");
        console.log("   /setupauto");

    } catch (error) {
        console.log(
            "❌ Failed to register Slash Commands:",
            error.message
        );
    }
}

// ==================================================
// ROLE DURATION PARSER
// ==================================================

function parseRoleDuration(input) {
    if (!input) {
        return null;
    }

    const match = String(input)
        .trim()
        .toLowerCase()
        .match(
            /^(\d+)(m|h|d|w|y)$/
        );

    if (!match) {
        return null;
    }

    const amount = Number(
        match[1]
    );

    const unit = match[2];

    if (
        !Number.isFinite(amount) ||
        amount <= 0
    ) {
        return null;
    }

    let milliseconds = 0;

    switch (unit) {
        case "m":
            milliseconds =
                amount *
                60 *
                1000;
            break;

        case "h":
            milliseconds =
                amount *
                60 *
                60 *
                1000;
            break;

        case "d":
            milliseconds =
                amount *
                24 *
                60 *
                60 *
                1000;
            break;

        case "w":
            milliseconds =
                amount *
                7 *
                24 *
                60 *
                60 *
                1000;
            break;

        case "y":
            milliseconds =
                amount *
                365 *
                24 *
                60 *
                60 *
                1000;
            break;

        default:
            return null;
    }

    return {
        amount,
        unit,
        milliseconds,
        expiresAt:
            Date.now() +
            milliseconds
    };
}

// ==================================================
// TEMPORARY ROLE
// ==================================================

async function addTemporaryRole(
    guild,
    member,
    role,
    duration
) {
    if (
        !guild ||
        !member ||
        !role ||
        !duration
    ) {
        return {
            success: false,
            message:
                "❌ بيانات غير صحيحة."
        };
    }

    if (!role.editable) {
        return {
            success: false,
            message:
                "❌ البوت لا يستطيع إعطاء هذه الرتبة لأن رتبة البوت أقل منها."
        };
    }

    if (
        member.roles.cache.has(
            role.id
        )
    ) {
        return {
            success: false,
            message:
                "❌ العضو يمتلك هذه الرتبة بالفعل."
        };
    }

    try {
        await member.roles.add(
            role,
            "Temporary role"
        );

        if (
            !data.temporaryRoles[
                guild.id
            ]
        ) {
            data.temporaryRoles[
                guild.id
            ] = {};
        }

        if (
            !data.temporaryRoles[
                guild.id
            ][member.id]
        ) {
            data.temporaryRoles[
                guild.id
            ][member.id] = {};
        }

        data.temporaryRoles[
            guild.id
        ][member.id][role.id] = {
            expiresAt:
                duration.expiresAt
        };

        saveData();

        return {
            success: true
        };

    } catch (error) {
        console.log(
            "❌ Failed to add temporary role:",
            error.message
        );

        return {
            success: false,
            message:
                "❌ حدث خطأ أثناء إعطاء الرتبة."
        };
    }
}

// ==================================================
// REMOVE EXPIRED ROLES
// ==================================================

async function removeExpiredRoles() {
    const now = Date.now();

    for (
        const guildId of Object.keys(
            data.temporaryRoles
        )
    ) {
        const guild =
            client.guilds.cache.get(
                guildId
            );

        if (!guild) {
            continue;
        }

        const membersData =
            data.temporaryRoles[
                guildId
            ];

        if (
            !membersData ||
            typeof membersData !==
                "object"
        ) {
            delete data.temporaryRoles[
                guildId
            ];

            continue;
        }

        for (
            const memberId of Object.keys(
                membersData
            )
        ) {
            const rolesData =
                membersData[
                    memberId
                ];

            if (
                !rolesData ||
                typeof rolesData !==
                    "object"
            ) {
                delete membersData[
                    memberId
                ];

                continue;
            }

            const member =
                await guild.members
                    .fetch(memberId)
                    .catch(
                        () => null
                    );

            if (!member) {
                continue;
            }

            for (
                const roleId of Object.keys(
                    rolesData
                )
            ) {
                const roleData =
                    rolesData[
                        roleId
                    ];

                if (
                    !roleData ||
                    !roleData.expiresAt
                ) {
                    delete rolesData[
                        roleId
                    ];

                    continue;
                }

                if (
                    now >=
                    Number(
                        roleData.expiresAt
                    )
                ) {
                    const role =
                        guild.roles.cache.get(
                            roleId
                        );

                    if (
                        role &&
                        member.roles.cache.has(
                            roleId
                        )
                    ) {
                        await member.roles
                            .remove(
                                role,
                                "Temporary role expired"
                            )
                            .catch(
                                () => {}
                            );
                    }

                    delete rolesData[
                        roleId
                    ];
                }
            }

            if (
                Object.keys(
                    rolesData
                ).length === 0
            ) {
                delete membersData[
                    memberId
                ];
            }
        }

        if (
            Object.keys(
                membersData
            ).length === 0
        ) {
            delete data.temporaryRoles[
                guildId
            ];
        }
    }

    saveData();
}

// ==================================================
// POST ID
// ==================================================

function createPostId() {
    return (
        Date.now().toString(36) +
        Math.random()
            .toString(36)
            .substring(2, 8)
    );
}

// ==================================================
// GUILD DATA
// ==================================================

function getGuildData(guildId) {
    if (!data.guilds[guildId]) {
        data.guilds[guildId] = {
            exchangeChannels: [],
            postIntervalMinutes:
                Number(
                    config.postIntervalMinutes
                ) || 10
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

    const interval =
        Number(
            data.guilds[guildId]
                .postIntervalMinutes
        );

    if (
        !Number.isFinite(interval) ||
        interval <= 0
    ) {
        data.guilds[guildId]
            .postIntervalMinutes =
            Number(
                config.postIntervalMinutes
            ) || 10;
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
    return Object.values(
        data.posts
    ).filter(
        post =>
            post &&
            post.guildId ===
                guildId &&
            post.userId ===
                userId
    );
}

// ==================================================
// USER POST LIMIT
// ==================================================

function getUserPostLimit(
    member
) {
    if (!member) {
        return 0;
    }

    let limit = 0;

    for (
        const [
            roleId,
            roleLimit
        ] of Object.entries(
            ROLE_POST_LIMITS
        )
    ) {
        if (
            member.roles.cache.has(
                roleId
            )
        ) {
            limit = Math.max(
                limit,
                Number(roleLimit) || 0
            );
        }
    }

    return limit;
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
    ).filter(
        post =>
            post.status ===
            "active"
    ).length;
}

// ==================================================
// GET GUILD MEMBER
// ==================================================

async function getGuildMember(
    guild,
    userId
) {
    if (!guild || !userId) {
        return null;
    }

    return guild.members
        .fetch(userId)
        .catch(() => null);
}

// ==================================================
// GET EXCHANGE WEBHOOK
// ==================================================

async function getExchangeWebhook(
    channel
) {
    if (!channel) {
        return null;
    }

    if (
        channel.type !==
        ChannelType.GuildText
    ) {
        return null;
    }

    try {
        const webhooks =
            await channel.fetchWebhooks();

        let webhook =
            webhooks.find(
                wh =>
                    wh.name ===
                        "Auto Exchange" &&
                    wh.owner?.id ===
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
        console.log(
            "❌ Failed to get/create webhook:",
            error.message
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
            guild,
            userId
        );

    if (member) {
        return (
            member.displayName ||
            member.user.username
        );
    }

    const user =
        await client.users
            .fetch(userId)
            .catch(
                () => null
            );

    if (!user) {
        return "Unknown User";
    }

    return user.username;
}

// ==================================================
// PUBLISH POST
// ==================================================

async function publishPost(
    post
) {
    if (!post) {
        return {
            success: false,
            error:
                "POST_NOT_FOUND"
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

    const guildData =
        getGuildData(
            guild.id
        );

    if (
        guildData.exchangeChannels.length >
            0 &&
        !guildData.exchangeChannels.includes(
            channel.id
        )
    ) {
        return {
            success: false,
            error:
                "CHANNEL_NOT_ENABLED"
        };
    }

    const webhook =
        await getExchangeWebhook(
            channel
        );

    if (!webhook) {
        return {
            success: false,
            error:
                "WEBHOOK_FAILED"
        };
    }

    const displayName =
        await getUserDisplayName(
            guild,
            post.userId
        );

    const content =
        String(
            post.content || ""
        ).trim();

    const finalContent =
        content
            ? content +
              "\n\nتواصل مع <@" +
              post.userId +
              "> للعمل المنشور"
            : "تواصل مع <@" +
              post.userId +
              "> للعمل المنشور";

    try {
        const files =
            Array.isArray(
                post.attachments
            )
                ? post.attachments
                      .filter(
                          attachment =>
                              attachment &&
                              attachment.url
                      )
                      .map(
                          attachment => ({
                              attachment:
                                  attachment.url,
                              name:
                                  attachment.name ||
                                  "file"
                          })
                      )
                : [];

        const payload = {
            content:
                finalContent,
            username:
                displayName
        };

        if (
            post.avatarURL
        ) {
            payload.avatarURL =
                post.avatarURL;
        }

        if (
            files.length > 0
        ) {
            payload.files =
                files;
        }

        await webhook.send(
            payload
        );

        post.lastPublishedAt =
            Date.now();

        post.status =
            "active";

        post.publishCount =
            Number(
                post.publishCount || 0
            ) + 1;

        saveData();

        return {
            success: true
        };

    } catch (error) {
        console.log(
            "❌ Failed to publish post:",
            error.message
        );

        return {
            success: false,
            error:
                error.message
        };
    }
}

// ==================================================
// PUBLISH ERROR MESSAGE
// ==================================================

function getPublishError(
    error
) {
    switch (error) {
        case "POST_NOT_FOUND":
            return "❌ المنشور غير موجود.";

        case "GUILD_NOT_FOUND":
            return "❌ السيرفر غير موجود.";

        case "CHANNEL_NOT_FOUND":
            return "❌ الروم غير موجودة.";

        case "INVALID_CHANNEL":
            return "❌ الروم المحددة غير صالحة.";

        case "CHANNEL_NOT_ENABLED":
            return "❌ هذه الروم لم تعد مفعلة في إعدادات Auto Exchange.";

        case "WEBHOOK_FAILED":
            return (
                "❌ البوت لم يستطع إنشاء Webhook. تأكد أن لديه Manage Webhooks."
            );

        default:
            return (
                "❌ حدث خطأ أثناء نشر المنشور."
            );
    }
}

// ==================================================
// MAIN PANEL
// ==================================================

function createMainPanel(
    guildId,
    userId
) {
    const guildData =
        getGuildData(
            guildId
        );

    const member =
        client.guilds.cache
            .get(guildId)
            ?.members.cache.get(
                userId
            );

    const owner =
        userId === OWNER_ID;

    const embed =
        new EmbedBuilder()
            .setTitle(
                "🔄 Auto Exchange"
            )
            .setDescription(
                "اختر العملية التي تريد تنفيذها من القائمة بالأسفل."
            )
            .addFields(
                {
                    name:
                        "⏱️ مدة إعادة النشر",
                    value:
                        String(
                            guildData.postIntervalMinutes
                        ) +
                        " دقيقة",
                    inline: true
                },
                {
                    name:
                        "📢 منشوراتك النشطة",
                    value:
                        String(
                            member
                                ? getActivePostsCount(
                                      guildId,
                                      userId
                                  )
                                : 0
                        ),
                    inline: true
                }
            );

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
            ),

        new StringSelectMenuOptionBuilder()
            .setLabel(
                "إيقاف منشور"
            )
            .setDescription(
                "إيقاف أحد منشوراتك"
            )
            .setValue(
                "stop_post"
            ),

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
    ];

    if (owner) {
        options.push(
            new StringSelectMenuOptionBuilder()
                .setLabel(
                    "المدة"
                )
                .setDescription(
                    "تغيير مدة إعادة النشر"
                )
                .setValue(
                    "change_interval"
                )
        );
    }

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "auto_main_menu"
            )
            .setPlaceholder(
                "اختر من هنا..."
            )
            .addOptions(
                options
            );

    const row =
        new ActionRowBuilder()
            .addComponents(
                menu
            );

    return {
        embeds: [embed],
        components: [row]
    };
}

// ==================================================
// TIME MENU
// ==================================================

function createTimeMenu() {
    const options =
        TIME_OPTIONS.map(
            option =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(
                        option.label
                    )
                    .setValue(
                        option.value
                    )
        );

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "auto_time_menu"
            )
            .setPlaceholder(
                "اختر مدة إعادة النشر..."
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
// GET ACTIVE EXCHANGE CHANNELS
// ==================================================

function getActiveExchangeChannels(
    guild
) {
    if (!guild) {
        return [];
    }

    const guildData =
        getGuildData(
            guild.id
        );

    const configured =
        Array.isArray(
            guildData.exchangeChannels
        )
            ? guildData.exchangeChannels
            : [];

    // إذا المالك لم يحدد رومات بعد
    // نستخدم الرومات المسموحة كخيارات
    const ids =
        configured.length > 0
            ? configured
            : ALLOWED_EXCHANGE_CHANNELS;

    return ids
        .map(
            channelId =>
                guild.channels.cache.get(
                    channelId
                )
        )
        .filter(
            channel =>
                channel &&
                channel.type ===
                    ChannelType.GuildText
        );
}

// ==================================================
// EXCHANGE CHANNEL MENU
// ==================================================

function createExchangeChannelMenu(
    guild,
    postId
) {
    const channels =
        getActiveExchangeChannels(
            guild
        );

    const options =
        channels
            .slice(0, 25)
            .map(
                channel =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(
                            channel.name.substring(
                                0,
                                100
                            )
                        )
                        .setDescription(
                            "اختيار هذه الروم للنشر"
                        )
                        .setValue(
                            channel.id
                        )
            );

    if (
        options.length === 0
    ) {
        return null;
    }

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "exchange_select_channel:" +
                    postId
            )
            .setPlaceholder(
                "اختر روم النشر..."
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
// OWNER CHANNEL SETUP MENU
// ==================================================

function createOwnerChannelSetupMenu(
    guild
) {
    const options = [];

    for (
        const channelId of
        ALLOWED_EXCHANGE_CHANNELS
    ) {
        const channel =
            guild.channels.cache.get(
                channelId
            );

        if (!channel) {
            continue;
        }

        if (
            channel.type !==
            ChannelType.GuildText
        ) {
            continue;
        }

        options.push(
            new StringSelectMenuOptionBuilder()
                .setLabel(
                    channel.name.substring(
                        0,
                        100
                    )
                )
                .setDescription(
                    "تفعيل هذه الروم"
                )
                .setValue(
                    channel.id
                )
        );
    }

    if (
        options.length === 0
    ) {
        return null;
    }

    const guildData =
        getGuildData(
            guild.id
        );

    const selected =
        guildData.exchangeChannels
            .slice(0, 25);

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "owner_exchange_channels"
            )
            .setPlaceholder(
                "اختر رومات Auto Exchange..."
            )
            .setMinValues(0)
            .setMaxValues(
                Math.min(
                    options.length,
                    25
                )
            )
            .addOptions(
                options.map(
                    option => {
                        const built =
                            option;

                        return built;
                    }
                )
            );

    // Discord.js لا يسمح لنا بتعديل
    // default بسهولة بعد البناء بنفس الشكل،
    // لذلك نبني الخيارات من جديد.
    const finalOptions =
        [];

    for (
        const channelId of
        ALLOWED_EXCHANGE_CHANNELS
    ) {
        const channel =
            guild.channels.cache.get(
                channelId
            );

        if (
            !channel ||
            channel.type !==
                ChannelType.GuildText
        ) {
            continue;
        }

        const option =
            new StringSelectMenuOptionBuilder()
                .setLabel(
                    channel.name.substring(
                        0,
                        100
                    )
                )
                .setDescription(
                    "تفعيل أو إلغاء هذه الروم"
                )
                .setValue(
                    channel.id
                );

        if (
            selected.includes(
                channel.id
            )
        ) {
            option.setDefault(
                true
            );
        }

        finalOptions.push(
            option
        );
    }

    menu.setOptions(
        finalOptions.slice(
            0,
            25
        )
    );

    return new ActionRowBuilder()
        .addComponents(
            menu
        );
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
        ).filter(
            post =>
                post.status ===
                "active"
        );

    if (
        posts.length === 0
    ) {
        return null;
    }

    const options =
        posts
            .slice(0, 25)
            .map(
                post =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(
                            "منشور " +
                                post.id.substring(
                                    0,
                                    8
                                )
                        )
                        .setDescription(
                            (
                                post.channelName ||
                                "منشور Auto Exchange"
                            ).substring(
                                0,
                                100
                            )
                        )
                        .setValue(
                            post.id
                        )
            );

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "stop_post_menu"
            )
            .setPlaceholder(
                "اختر المنشور لإيقافه..."
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
// POST SLOT MENU
// ==================================================

function createPostSlotMenu(
    activeCount,
    limit,
    guildId,
    userId
) {
    const activePosts =
        getUserPosts(
            guildId,
            userId
        ).filter(
            post =>
                post.status ===
                "active"
        );

    const usedSlots =
        new Set(
            activePosts
                .map(
                    post =>
                        Number(
                            post.slot
                        )
                )
                .filter(
                    slot =>
                        Number.isFinite(
                            slot
                        )
                )
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
                    "منشور " +
                        i
                )
                .setDescription(
                    used
                        ? "مستخدم بالفعل"
                        : "متاح للنشر"
                )
                .setValue(
                    String(i)
                )
                .setDefault(
                    false
                )
        );
    }

    return new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(
                    "post_slot_menu"
                )
                .setPlaceholder(
                    "اختر رقم المنشور..."
                )
                .addOptions(
                    options
                )
        );
}

// ==================================================
// SEND MAIN PANEL
// ==================================================

async function sendPanel(
    interaction
) {
    const guild =
        interaction.guild;

    if (!guild) {
        return interaction.reply({
            content:
                "❌ هذا الأمر يعمل داخل السيرفر فقط.",
            ephemeral: true
        });
    }

    const panel =
        createMainPanel(
            guild.id,
            interaction.user.id
        );

    return interaction.reply({
        ...panel,
        ephemeral: true
    });
}

// ==================================================
// PENDING POST
// ==================================================

function getPendingPostForUser(
    guildId,
    userId
) {
    const posts =
        Object.values(
            data.posts
        )
            .filter(
                post =>
                    post &&
                    post.guildId ===
                        guildId &&
                    post.userId ===
                        userId &&
                    post.status ===
                        "waiting"
            )
            .sort(
                (a, b) =>
                    Number(
                        b.createdAt || 0
                    ) -
                    Number(
                        a.createdAt || 0
                    )
            );

    return (
        posts[0] ||
        null
    );
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
        return;
    }

    if (
        message.channel.type !==
        ChannelType.DM
    ) {
        return;
    }

    const pendingPosts =
        Object.values(
            data.posts
        )
            .filter(
                post =>
                    post &&
                    post.userId ===
                        message.author.id &&
                    post.status ===
                        "waiting"
            )
            .sort(
                (a, b) =>
                    Number(
                        b.createdAt || 0
                    ) -
                    Number(
                        a.createdAt || 0
                    )
            );

    const post =
        pendingPosts[0];

    if (!post) {
        return;
    }

    const guild =
        client.guilds.cache.get(
            post.guildId
        );

    if (!guild) {
        post.status =
            "inactive";

        saveData();

        await message
            .reply(
                "❌ السيرفر لم يعد متاحًا."
            )
            .catch(() => {});

        return;
    }

    const member =
        await getGuildMember(
            guild,
            message.author.id
        );

    if (!member) {
        post.status =
            "inactive";

        saveData();

        await message
            .reply(
                "❌ لم أستطع العثور عليك داخل السيرفر."
            )
            .catch(() => {});

        return;
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
                    "file"
            })
        );

    if (
        !content &&
        attachments.length === 0
    ) {
        await message
            .reply(
                "❌ أرسل نصًا أو صورة أو ملفًا على الأقل."
            )
            .catch(() => {});

        return;
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

    const channelMenu =
        createExchangeChannelMenu(
            guild,
            post.id
        );

    if (!channelMenu) {
        post.status =
            "inactive";

        saveData();

        await message
            .reply(
                "❌ لا توجد رومات Auto Exchange متاحة حاليًا."
            )
            .catch(() => {});

        return;
    }

    await message
        .reply({
            content:
                "✅ تم استلام منشورك.\n\nاختر الآن روم النشر:",
            components: [
                channelMenu
            ]
        })
        .catch(() => {});
}

// ==================================================
// POST INTERVAL
// ==================================================

function getPostInterval(
    guildId
) {
    const guildData =
        getGuildData(
            guildId
        );

    const minutes =
        Number(
            guildData.postIntervalMinutes
        );

    if (
        !Number.isFinite(
            minutes
        ) ||
        minutes <= 0
    ) {
        return (
            10 *
            60 *
            1000
        );
    }

    return (
        minutes *
        60 *
        1000
    );
}

// ==================================================
// AUTO EXCHANGE LOOP
// ==================================================

let autoLoopRunning =
    false;

async function runAutoExchange() {
    if (
        autoLoopRunning
    ) {
        return;
    }

    autoLoopRunning =
        true;

    try {
        const now =
            Date.now();

        for (
            const post of Object.values(
                data.posts
            )
        ) {
            if (!post) {
                continue;
            }

            if (
                post.status !==
                "active"
            ) {
                continue;
            }

            if (
                !post.channelId
            ) {
                continue;
            }

            if (
                !post.lastPublishedAt
            ) {
                continue;
            }

            const interval =
                getPostInterval(
                    post.guildId
                );

            if (
                now -
                    Number(
                        post.lastPublishedAt
                    ) <
                interval
            ) {
                continue;
            }

            await publishPost(
                post
            );
        }

    } catch (error) {
        console.log(
            "❌ Auto Exchange loop error:",
            error.message
        );

    } finally {
        autoLoopRunning =
            false;
    }
}

// ==================================================
// CLEANUP WAITING POSTS
// ==================================================

function cleanupWaitingPosts() {
    const now =
        Date.now();

    let changed =
        false;

    for (
        const post of Object.values(
            data.posts
        )
    ) {
        if (!post) {
            continue;
        }

        if (
            post.status !==
            "waiting"
        ) {
            continue;
        }

        const createdAt =
            Number(
                post.createdAt || 0
            );

        if (!createdAt) {
            continue;
        }

        if (
            now -
                createdAt >
            15 *
                60 *
                1000
        ) {
            post.status =
                "inactive";

            changed =
                true;
        }
    }

    if (changed) {
        saveData();
    }
}

// ==================================================
// CLEANUP INVALID POSTS
// ==================================================

function cleanupInvalidPosts() {
    let changed =
        false;

    for (
        const postId of Object.keys(
            data.posts
        )
    ) {
        const post =
            data.posts[
                postId
            ];

        if (!post) {
            delete data.posts[
                postId
            ];

            changed =
                true;

            continue;
        }

        if (
            !post.id
        ) {
            post.id =
                postId;

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
                    post.publishCount || 0
                );

            changed =
                true;
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
            "🔴 Bot status: Do Not Disturb"
        );

        cleanupInvalidPosts();

        await registerSlashCommands();

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

                } catch (error) {
                    console.log(
                        "❌ Background task error:",
                        error.message
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
            if (
                message.author.bot
            ) {
                return;
            }

            // ==================================================
            // DIRECT MESSAGE POST
            // ==================================================

            if (
                message.channel.type ===
                ChannelType.DM
            ) {
                await handleDMPost(
                    message
                );

                return;
            }

            // ==================================================
            // NORMAL MESSAGE
            // ==================================================

            const content =
                String(
                    message.content || ""
                ).trim();

            if (!content) {
                return;
            }

            // ==================================================
            // +رول COMMAND
            // ==================================================

            const args =
                content.split(
                    /\s+/
                );

            if (
                args[0] !==
                "+رول"
            ) {
                return;
            }

            if (!message.guild) {
                return;
            }

            const member =
                message.member;

            if (!member) {
                return;
            }

            const isOwner =
                message.author.id ===
                OWNER_ID;

            const isAdmin =
                member.permissions.has(
                    PermissionsBitField.Flags
                        .Administrator
                );

            if (
                !isOwner &&
                !isAdmin
            ) {
                await message.reply(
                    "❌ ليس لديك صلاحية استخدام هذا الأمر."
                );

                return;
            }

            if (
                args.length < 4
            ) {
                await message.reply(
                    "❌ الصيغة غير صحيحة.\n\n" +
                    "استخدم:\n" +
                    "`+رول @العضو @الرتبة 1m`\n\n" +
                    "أمثلة:\n" +
                    "`+رول @محمد @VIP 1m`\n" +
                    "`+رول @محمد @VIP 1h`\n" +
                    "`+رول @محمد @VIP 1d`\n" +
                    "`+رول @محمد @VIP 1w`\n" +
                    "`+رول @محمد @VIP 1y`"
                );

                return;
            }

            const targetMember =
                message.mentions.members.first();

            const targetRole =
                message.mentions.roles.first();

            const durationText =
                args[
                    args.length - 1
                ];

            if (
                !targetMember
            ) {
                await message.reply(
                    "❌ منشن العضو بشكل صحيح."
                );

                return;
            }

            if (
                !targetRole
            ) {
                await message.reply(
                    "❌ منشن الرتبة بشكل صحيح."
                );

                return;
            }

            const duration =
                parseRoleDuration(
                    durationText
                );

            if (!duration) {
                await message.reply(
                    "❌ المدة غير صحيحة.\n\n" +
                    "استخدم:\n" +
                    "`1m` = دقيقة\n" +
                    "`1h` = ساعة\n" +
                    "`1d` = يوم\n" +
                    "`1w` = أسبوع\n" +
                    "`1y` = سنة"
                );

                return;
            }

            if (
                targetRole.id ===
                message.guild.id
            ) {
                await message.reply(
                    "❌ لا يمكن استخدام رتبة @everyone."
                );

                return;
            }

            if (
                targetRole.managed
            ) {
                await message.reply(
                    "❌ لا يمكن إعطاء رتبة مرتبطة ببوت أو خدمة خارجية."
                );

                return;
            }

            if (
                !targetRole.editable
            ) {
                await message.reply(
                    "❌ البوت لا يستطيع إعطاء هذه الرتبة لأن رتبة البوت أقل منها."
                );

                return;
            }

            // ==================================================
            // NON OWNER ADMIN ROLE CHECK
            // ==================================================

            if (!isOwner) {
                const highestRole =
                    member.roles.highest;

                if (
                    targetRole.position >=
                    highestRole.position
                ) {
                    await message.reply(
                        "❌ لا يمكنك إعطاء رتبة مساوية أو أعلى من أعلى رتبة لديك."
                    );

                    return;
                }
            }

            // ==================================================
            // TARGET BOT / OWNER SAFETY
            // ==================================================

            if (
                targetMember.id ===
                client.user.id
            ) {
                await message.reply(
                    "❌ لا يمكن إعطاء رتبة للبوت."
                );

                return;
            }

            // ==================================================
            // ADD TEMPORARY ROLE
            // ==================================================

            const result =
                await addTemporaryRole(
                    message.guild,
                    targetMember,
                    targetRole,
                    duration
                );

            if (
                !result.success
            ) {
                await message.reply(
                    result.message ||
                    "❌ تعذر إعطاء الرتبة."
                );

                return;
            }

            await message.reply(
                "✅ تم إعطاء " +
                    targetMember +
                    " رتبة " +
                    targetRole +
                    " لمدة " +
                    String(
                        duration.amount
                    ) +
                    duration.unit +
                    "."
            );

        } catch (error) {
            console.log(
                "❌ messageCreate error:",
                error
            );
        }
    }
);

// ==================================================
// INTERACTION CREATE
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
                    await sendPanel(
                        interaction
                    );

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
                        interaction.user.id !==
                        OWNER_ID
                    ) {
                        await interaction.reply({
                            content:
                                "❌ هذا الأمر للمالك فقط.",
                            ephemeral: true
                        });

                        return;
                    }

                    const guild =
                        interaction.guild;

                    if (!guild) {
                        await interaction.reply({
                            content:
                                "❌ استخدم الأمر داخل السيرفر.",
                            ephemeral: true
                        });

                        return;
                    }

                    const menu =
                        createOwnerChannelSetupMenu(
                            guild
                        );

                    if (!menu) {
                        await interaction.reply({
                            content:
                                "❌ لم أجد أي روم من الرومات المحددة.",
                            ephemeral: true
                        });

                        return;
                    }

                    await interaction.reply({
                        content:
                            "⚙️ اختر الرومات المسموح استخدامها في Auto Exchange:\n\n" +
                            "يمكنك تحديد أكثر من روم.",
                        components: [
                            menu
                        ],
                        ephemeral: true
                    });

                    return;
                }

                return;
            }

            // ==================================================
            // ONLY SELECT MENUS
            // ==================================================

            if (
                !interaction.isStringSelectMenu()
            ) {
                return;
            }

            const guild =
                interaction.guild;

            if (!guild) {
                await interaction.reply({
                    content:
                        "❌ يجب استخدام هذا داخل السيرفر.",
                    ephemeral: true
                });

                return;
            }

            // ==================================================
            // MAIN AUTO MENU
            // ==================================================

            if (
                interaction.customId ===
                "auto_main_menu"
            ) {
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
                        await getGuildMember(
                            guild,
                            interaction.user.id
                        );

                    if (!member) {
                        await interaction.reply({
                            content:
                                "❌ لم أستطع العثور عليك.",
                            ephemeral: true
                        });

                        return;
                    }

                    const limit =
                        getUserPostLimit(
                            member
                        );

                    if (
                        limit <= 0
                    ) {
                        await interaction.reply({
                            content:
                                "❌ لا تملك رتبة تسمح لك بنشر منشورات Auto Exchange.",
                            ephemeral: true
                        });

                        return;
                    }

                    const activeCount =
                        getActivePostsCount(
                            guild.id,
                            interaction.user.id
                        );

                    if (
                        activeCount >=
                        limit
                    ) {
                        await interaction.reply({
                            content:
                                "❌ وصلت للحد الأقصى من المنشورات المسموحة لك: " +
                                limit,
                            ephemeral: true
                        });

                        return;
                    }

                    const row =
                        createPostSlotMenu(
                            activeCount,
                            limit,
                            guild.id,
                            interaction.user.id
                        );

                    await interaction.reply({
                        content:
                            "📢 اختر رقم المنشور الذي تريد استخدامه:",
                        components: [
                            row
                        ],
                        ephemeral: true
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
                        createUserPostsMenu(
                            guild.id,
                            interaction.user.id
                        );

                    if (!row) {
                        await interaction.reply({
                            content:
                                "❌ ليس لديك أي منشورات نشطة.",
                            ephemeral: true
                        });

                        return;
                    }

                    await interaction.reply({
                        content:
                            "🛑 اختر المنشور الذي تريد إيقافه:",
                        components: [
                            row
                        ],
                        ephemeral: true
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
                        getUserPosts(
                            guild.id,
                            interaction.user.id
                        );

                    if (
                        posts.length ===
                        0
                    ) {
                        await interaction.reply({
                            content:
                                "📭 لا توجد منشورات لك حاليًا.",
                            ephemeral: true
                        });

                        return;
                    }

                    const embed =
                        new EmbedBuilder()
                            .setTitle(
                                "📋 منشوراتك"
                            );

                    for (
                        const post of posts.slice(
                            0,
                            10
                        )
                    ) {
                        embed.addFields({
                            name:
                                "منشور " +
                                String(
                                    post.id ||
                                    ""
                                ).substring(
                                    0,
                                    8
                                ),

                            value:
                                "الحالة: `" +
                                String(
                                    post.status
                                ) +
                                "`\n" +
                                "الروم: " +
                                (
                                    post.channelId
                                        ? "<#" +
                                          post.channelId +
                                          ">"
                                        : "غير محددة"
                                ) +
                                "\n" +
                                "مرات النشر: `" +
                                String(
                                    post.publishCount ||
                                    0
                                ) +
                                "`",

                            inline:
                                false
                        });
                    }

                    await interaction.reply({
                        embeds: [
                            embed
                        ],
                        ephemeral:
                            true
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
                        interaction.user.id !==
                        OWNER_ID
                    ) {
                        await interaction.reply({
                            content:
                                "❌ المدة للمالك فقط.",
                            ephemeral: true
                        });

                        return;
                    }

                    await interaction.reply({
                        content:
                            "⏱️ اختر مدة إعادة النشر:",
                        components: [
                            createTimeMenu()
                        ],
                        ephemeral: true
                    });

                    return;
                }

                return;
            }

            // ==================================================
            // POST SLOT
            // ==================================================

            if (
                interaction.customId ===
                "post_slot_menu"
            ) {
                const slot =
                    Number(
                        interaction.values[0]
                    );

                if (
                    !Number.isInteger(
                        slot
                    )
                ) {
                    await interaction.reply({
                        content:
                            "❌ رقم المنشور غير صالح.",
                        ephemeral: true
                    });

                    return;
                }

                const member =
                    await getGuildMember(
                        guild,
                        interaction.user.id
                    );

                if (!member) {
                    await interaction.reply({
                        content:
                            "❌ لم أستطع العثور عليك.",
                        ephemeral: true
                    });

                    return;
                }

                const limit =
                    getUserPostLimit(
                        member
                    );

                if (
                    slot < 1 ||
                    slot > limit
                ) {
                    await interaction.reply({
                        content:
                            "❌ رقم المنشور غير صالح.",
                        ephemeral: true
                    });

                    return;
                }

                const activePosts =
                    getUserPosts(
                        guild.id,
                        interaction.user.id
                    ).filter(
                        post =>
                            post.status ===
                            "active"
                    );

                const slotUsed =
                    activePosts.some(
                        post =>
                            Number(
                                post.slot
                            ) === slot
                    );

                if (
                    slotUsed
                ) {
                    await interaction.reply({
                        content:
                            "❌ هذا المنشور مستخدم بالفعل.",
                        ephemeral: true
                    });

                    return;
                }

                // منع وجود منشور waiting
                // آخر لنفس المستخدم
                const waitingPost =
                    getPendingPostForUser(
                        guild.id,
                        interaction.user.id
                    );

                if (
                    waitingPost
                ) {
                    await interaction.reply({
                        content:
                            "❌ لديك منشور آخر ينتظر منك الإرسال في الخاص. أرسل محتواه أولًا.",
                        ephemeral: true
                    });

                    return;
                }

                const postId =
                    createPostId();

                data.posts[
                    postId
                ] = {
                    id:
                        postId,

                    guildId:
                        guild.id,

                    userId:
                        interaction.user.id,

                    slot:
                        slot,

                    status:
                        "waiting",

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
                            size:
                                256
                        }),

                    channelId:
                        null,

                    channelName:
                        null,

                    lastPublishedAt:
                        null,

                    publishCount:
                        0
                };

                saveData();

                try {
                    await interaction.user.send(
                        "📨 تم إنشاء منشور رقم " +
                            slot +
                            ".\n\n" +
                            "أرسل الآن محتوى المنشور في هذه الرسالة الخاصة.\n" +
                            "يمكنك إرسال نص + صور + ملفات في رسالة واحدة."
                    );

                    await interaction.reply({
                        content:
                            "✅ أرسلت لك رسالة في الخاص. أرسل محتوى المنشور هناك.",
                        ephemeral:
                            true
                    });

                } catch (error) {
                    data.posts[
                        postId
                    ].status =
                        "inactive";

                    saveData();

                    await interaction.reply({
                        content:
                            "❌ لا أستطيع إرسال رسالة خاصة لك. افتح الـ DM مع البوت وحاول مرة أخرى.",
                        ephemeral:
                            true
                    });
                }

                return;
            }

            // ==================================================
            // SELECT EXCHANGE CHANNEL
            // ==================================================

            if (
                interaction.customId.startsWith(
                    "exchange_select_channel:"
                )
            ) {
                const postId =
                    interaction.customId.split(
                        ":"
                    )[1];

                const post =
                    data.posts[
                        postId
                    ];

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
                    post.status !==
                    "draft"
                ) {
                    await interaction.reply({
                        content:
                            "❌ هذا المنشور غير جاهز للنشر.",
                        ephemeral: true
                    });

                    return;
                }

                const channelId =
                    interaction.values[0];

                if (
                    !ALLOWED_EXCHANGE_CHANNELS.includes(
                        channelId
                    )
                ) {
                    await interaction.reply({
                        content:
                            "❌ هذه الروم غير مسموحة.",
                        ephemeral: true
                    });

                    return;
                }

                const channel =
                    guild.channels.cache.get(
                        channelId
                    );

                if (!channel) {
                    await interaction.reply({
                        content:
                            "❌ الروم غير موجودة.",
                        ephemeral: true
                    });

                    return;
                }

                if (
                    channel.type !==
                    ChannelType.GuildText
                ) {
                    await interaction.reply({
                        content:
                            "❌ هذه القناة ليست روم نصية.",
                        ephemeral: true
                    });

                    return;
                }

                const guildData =
                    getGuildData(
                        guild.id
                    );

                if (
                    guildData.exchangeChannels.length >
                        0 &&
                    !guildData.exchangeChannels.includes(
                        channelId
                    )
                ) {
                    await interaction.reply({
                        content:
                            "❌ هذه الروم لم يتم تفعيلها من إعدادات Auto Exchange.",
                        ephemeral: true
                    });

                    return;
                }

                post.channelId =
                    channelId;

                post.channelName =
                    channel.name;

                post.updatedAt =
                    Date.now();

                const result =
                    await publishPost(
                        post
                    );

                if (
                    !result.success
                ) {
                    post.status =
                        "inactive";

                    saveData();

                    await interaction.update({
                        content:
                            getPublishError(
                                result.error
                            ),
                        components: []
                    });

                    return;
                }

                await interaction.update({
                    content:
                        "✅ تم نشر المنشور بنجاح في <#" +
                        channelId +
                        ">.\n\n" +
                        "🔄 سيتم إعادة نشره تلقائيًا كل " +
                        String(
                            getGuildData(
                                guild.id
                            ).postIntervalMinutes
                        ) +
                        " دقيقة.",
                    components: []
                });

                return;
            }

            // ==================================================
            // STOP POST
            // ==================================================

            if (
                interaction.customId ===
                "stop_post_menu"
            ) {
                const postId =
                    interaction.values[0];

                const post =
                    data.posts[
                        postId
                    ];

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
                    post.status !==
                    "active"
                ) {
                    await interaction.reply({
                        content:
                            "❌ هذا المنشور متوقف بالفعل.",
                        ephemeral: true
                    });

                    return;
                }

                post.status =
                    "inactive";

                post.updatedAt =
                    Date.now();

                saveData();

                await interaction.update({
                    content:
                        "🛑 تم إيقاف المنشور بنجاح.",
                    components: []
                });

                return;
            }

            // ==================================================
            // TIME MENU
            // ==================================================

            if (
                interaction.customId ===
                "auto_time_menu"
            ) {
                if (
                    interaction.user.id !==
                    OWNER_ID
                ) {
                    await interaction.reply({
                        content:
                            "❌ المدة للمالك فقط.",
                        ephemeral: true
                    });

                    return;
                }

                const selected =
                    interaction.values[0];

                const match =
                    selected.match(
                        /^(\d+)(m|h)$/
                    );

                if (!match) {
                    await interaction.reply({
                        content:
                            "❌ مدة غير صالحة.",
                        ephemeral: true
                    });

                    return;
                }

                const amount =
                    Number(
                        match[1]
                    );

                const unit =
                    match[2];

                let minutes =
                    amount;

                if (
                    unit ===
                    "h"
                ) {
                    minutes =
                        amount *
                        60;
                }

                if (
                    minutes <= 0 ||
                    !Number.isFinite(
                        minutes
                    )
                ) {
                    await interaction.reply({
                        content:
                            "❌ مدة غير صالحة.",
                        ephemeral: true
                    });

                    return;
                }

                const guildData =
                    getGuildData(
                        guild.id
                    );

                guildData.postIntervalMinutes =
                    minutes;

                config.postIntervalMinutes =
                    minutes;

                saveData();

                saveConfig();

                await interaction.update({
                    content:
                        "✅ تم تغيير مدة إعادة النشر إلى " +
                        String(
                            minutes
                        ) +
                        " دقيقة.",
                    components: []
                });

                return;
            }

            // ==================================================
            // OWNER EXCHANGE CHANNEL SETUP
            // ==================================================

            if (
                interaction.customId ===
                "owner_exchange_channels"
            ) {
                if (
                    interaction.user.id !==
                    OWNER_ID
                ) {
                    await interaction.reply({
                        content:
                            "❌ هذا الإعداد للمالك فقط.",
                        ephemeral: true
                    });

                    return;
                }

                const guildData =
                    getGuildData(
                        guild.id
                    );

                guildData.exchangeChannels =
                    interaction.values.filter(
                        channelId =>
                            ALLOWED_EXCHANGE_CHANNELS.includes(
                                channelId
                            )
                    );

                saveData();

                if (
                    guildData.exchangeChannels.length ===
                    0
                ) {
                    await interaction.update({
                        content:
                            "⚠️ لم يتم اختيار أي روم. سيتم إيقاف استخدام Auto Exchange حتى يتم تحديد الرومات من /setupauto.",
                        components: []
                    });

                    return;
                }

                const channelsText =
                    guildData.exchangeChannels
                        .map(
                            id =>
                                "<#" +
                                id +
                                ">"
                        )
                        .join(
                            "\n"
                        );

                await interaction.update({
                    content:
                        "✅ تم حفظ رومات Auto Exchange:\n\n" +
                        channelsText,
                    components: []
                });

                return;
            }

        } catch (error) {
            console.log(
                "❌ Interaction error:",
                error
            );

            try {
                if (
                    interaction.replied ||
                    interaction.deferred
                ) {
                    await interaction
                        .followUp({
                            content:
                                "❌ حدث خطأ غير متوقع.",
                            ephemeral:
                                true
                        })
                        .catch(
                            () => {}
                        );
                } else {
                    await interaction
                        .reply({
                            content:
                                "❌ حدث خطأ غير متوقع.",
                            ephemeral:
                                true
                        })
                        .catch(
                            () => {}
                        );
                }
            } catch {}
        }
    }
);

// ==================================================
// ERROR HANDLERS
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
        "❌ DISCORD_TOKEN / token is missing."
    );

    console.log(
        "ضع التوكن داخل config.json أو Environment Variables."
    );

    process.exit(1);
}

console.log(
    "🔄 Connecting to Discord..."
);

client.login(TOKEN);
