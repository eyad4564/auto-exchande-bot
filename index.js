const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
  REST,
  Routes,
  ActivityType
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ==================================================
// PATHS
// ==================================================

const CONFIG_PATH = path.join(__dirname, "config.json");
const DATA_PATH = path.join(__dirname, "data.json");

// ==================================================
// OWNER ALLOWED CHANNELS
// الـ Owner فقط هو الذي يستطيع اختيارهم
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
// DEFAULT CONFIG
// ==================================================

const DEFAULT_CONFIG = {
  token: "",
  ownerId: "",

  // الرتب المسموح لها باستخدام Auto Exchange
  allowedRoleIds: [],

  // السماح لمن معه Administrator
  allowAdministrators: true,

  // السماح للـ Boosters
  allowBoosters: false,

  // مدة إعادة إرسال المنشور بالدقائق
  postIntervalMinutes: 10
};

// ==================================================
// DEFAULT DATA
// ==================================================

const DEFAULT_DATA = {
  guilds: {},
  users: {}
};

// ==================================================
// LOAD JSON
// ==================================================

function loadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(
        filePath,
        JSON.stringify(fallback, null, 2),
        "utf8"
      );

      return JSON.parse(JSON.stringify(fallback));
    }

    const raw = fs.readFileSync(filePath, "utf8");

    if (!raw.trim()) {
      return JSON.parse(JSON.stringify(fallback));
    }

    return JSON.parse(raw);
  } catch (error) {
    console.error(`❌ Failed loading ${filePath}:`, error);

    try {
      fs.writeFileSync(
        filePath,
        JSON.stringify(fallback, null, 2),
        "utf8"
      );
    } catch {}

    return JSON.parse(JSON.stringify(fallback));
  }
}

let config = loadJson(CONFIG_PATH, DEFAULT_CONFIG);
let data = loadJson(DATA_PATH, DEFAULT_DATA);

// ==================================================
// NORMALIZE CONFIG
// ==================================================

if (!config || typeof config !== "object") {
  config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

config = {
  ...DEFAULT_CONFIG,
  ...config
};

if (!Array.isArray(config.allowedRoleIds)) {
  config.allowedRoleIds = [];
}

config.postIntervalMinutes = Number(config.postIntervalMinutes);

if (
  !Number.isFinite(config.postIntervalMinutes) ||
  config.postIntervalMinutes < 1
) {
  config.postIntervalMinutes = 10;
}

config.postIntervalMinutes = Math.floor(
  config.postIntervalMinutes
);

// ==================================================
// NORMALIZE DATA
// ==================================================

if (!data || typeof data !== "object") {
  data = JSON.parse(JSON.stringify(DEFAULT_DATA));
}

if (!data.guilds || typeof data.guilds !== "object") {
  data.guilds = {};
}

if (!data.users || typeof data.users !== "object") {
  data.users = {};
}

// ==================================================
// SAVE
// ==================================================

function saveData() {
  try {
    fs.writeFileSync(
      DATA_PATH,
      JSON.stringify(data, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("❌ Error saving data:", error);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(
      CONFIG_PATH,
      JSON.stringify(config, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("❌ Error saving config:", error);
  }
}

// ==================================================
// TOKEN
// ==================================================

const TOKEN = process.env.TOKEN || config.token;

if (!TOKEN) {
  console.error(
    "❌ TOKEN غير موجود.\nضع التوكن في config.json أو متغير البيئة TOKEN."
  );

  process.exit(1);
}

// ==================================================
// CLIENT
// ==================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
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
// VARIABLES
// ==================================================

const publishingUsers = new Set();

let applicationOwnerIds = new Set();

let loopStarted = false;
let commandsRegistered = false;

// ==================================================
// USER DATA KEY
// ==================================================

function getUserKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

// ==================================================
// GUILD DATA
// ==================================================

function getGuildData(guildId) {
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = {
      exchangeChannels: []
    };
  }

  if (!Array.isArray(data.guilds[guildId].exchangeChannels)) {
    data.guilds[guildId].exchangeChannels = [];
  }

  return data.guilds[guildId];
}

// ==================================================
// USER DATA
// ==================================================

function getUserData(guildId, userId) {
  const key = getUserKey(guildId, userId);

  if (!data.users[key]) {
    data.users[key] = {
      guildId,
      userId,

      channelId: null,

      content: "",

      attachments: [],

      active: false,

      waitingForPost: false,

      waitingSince: null,

      lastPostedAt: null,

      lastError: null
    };
  }

  const user = data.users[key];

  if (!Array.isArray(user.attachments)) {
    user.attachments = [];
  }

  return user;
}

// ==================================================
// CHECK OWNER
// ==================================================

async function refreshApplicationOwner() {
  try {
    if (!client.application) {
      return;
    }

    const application = await client.application.fetch();

    applicationOwnerIds.clear();

    if (application.owner?.id) {
      applicationOwnerIds.add(application.owner.id);
    }

    // لو البوت مملوك لـ Team
    if (application.owner?.members) {
      for (const [id] of application.owner.members) {
        applicationOwnerIds.add(id);
      }
    }
  } catch (error) {
    console.error(
      "⚠️ Could not fetch application owner:",
      error.message
    );
  }
}

async function isBotOwner(userId) {
  if (config.ownerId && userId === config.ownerId) {
    return true;
  }

  if (applicationOwnerIds.has(userId)) {
    return true;
  }

  await refreshApplicationOwner();

  return applicationOwnerIds.has(userId);
}

// ==================================================
// ADMIN CHECK
// ==================================================

function isAdminMember(member) {
  if (!member) {
    return false;
  }

  return member.permissions.has(
    PermissionsBitField.Flags.Administrator
  );
}

// ==================================================
// BOOSTER CHECK
// ==================================================

function isBooster(member) {
  if (!member) {
    return false;
  }

  return Boolean(member.premiumSince);
}

// ==================================================
// ROLE CHECK
// ==================================================

function hasAllowedRole(member) {
  if (!member) {
    return false;
  }

  if (!Array.isArray(config.allowedRoleIds)) {
    return false;
  }

  return config.allowedRoleIds.some((roleId) =>
    member.roles.cache.has(roleId)
  );
}

// ==================================================
// CAN USE AUTO
// ==================================================

async function canUseAuto(interaction) {
  const userId = interaction.user.id;

  if (await isBotOwner(userId)) {
    return true;
  }

  if (!interaction.guild || !interaction.member) {
    return false;
  }

  const member = interaction.member;

  if (
    config.allowAdministrators &&
    isAdminMember(member)
  ) {
    return true;
  }

  if (hasAllowedRole(member)) {
    return true;
  }

  if (
    config.allowBoosters &&
    isBooster(member)
  ) {
    return true;
  }

  return false;
}

// ==================================================
// SETTINGS CONTROL
// ==================================================

async function canControlSettings(interaction) {
  if (await isBotOwner(interaction.user.id)) {
    return true;
  }

  if (!interaction.guild || !interaction.member) {
    return false;
  }

  return isAdminMember(interaction.member);
}

// ==================================================
// FORMAT DURATION
// ==================================================

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "0 ثانية";
  }

  let seconds = Math.floor(ms / 1000);

  const days = Math.floor(seconds / 86400);
  seconds %= 86400;

  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;

  const minutes = Math.floor(seconds / 60);
  seconds %= 60;

  const result = [];

  if (days > 0) {
    result.push(`${days} يوم`);
  }

  if (hours > 0) {
    result.push(`${hours} ساعة`);
  }

  if (minutes > 0) {
    result.push(`${minutes} دقيقة`);
  }

  if (seconds > 0 && result.length < 2) {
    result.push(`${seconds} ثانية`);
  }

  return result.length
    ? result.join(" و ")
    : "أقل من ثانية";
}

// ==================================================
// INTERVAL
// ==================================================

function getIntervalMs() {
  let minutes = Number(config.postIntervalMinutes);

  if (!Number.isFinite(minutes) || minutes < 1) {
    minutes = 10;
  }

  return Math.floor(minutes) * 60 * 1000;
}

// ==================================================
// GET CHANNEL
// ==================================================

async function getGuildChannel(guildId, channelId) {
  try {
    const guild = client.guilds.cache.get(guildId);

    if (!guild) {
      return null;
    }

    let channel = guild.channels.cache.get(channelId);

    if (!channel) {
      channel = await guild.channels.fetch(channelId).catch(() => null);
    }

    if (!channel) {
      return null;
    }

    if (channel.guildId !== guildId) {
      return null;
    }

    return channel;
  } catch {
    return null;
  }
}

// ==================================================
// CHECK CHANNEL
// ==================================================

function isValidExchangeChannel(channel) {
  if (!channel) {
    return false;
  }

  if (channel.type !== ChannelType.GuildText) {
    return false;
  }

  return OWNER_EXCHANGE_CHANNEL_IDS.includes(
    channel.id
  );
}

// ==================================================
// BOT CHANNEL PERMISSIONS
// ==================================================

function botCanSend(channel) {
  if (!channel?.guild) {
    return false;
  }

  const me = channel.guild.members.me;

  if (!me) {
    return false;
  }

  const permissions = channel.permissionsFor(me);

  if (!permissions) {
    return false;
  }

  return permissions.has(
    PermissionsBitField.Flags.ViewChannel
  ) &&
  permissions.has(
    PermissionsBitField.Flags.SendMessages
  );
}

// ==================================================
// ATTACHMENTS
// ==================================================

function getAttachmentData(message) {
  if (!message.attachments?.size) {
    return [];
  }

  return [...message.attachments.values()].map(
    (attachment) => ({
      url: attachment.url,
      name: attachment.name || "file"
    })
  );
}

// ==================================================
// MAIN PANEL
// ==================================================

function createMainPanel() {
  const embed = new EmbedBuilder()
    .setTitle("🔄 Auto Exchange")
    .setDescription(
      [
        "استخدم الأزرار الموجودة بالأسفل للتحكم في Auto Exchange.",
        "",
        `⏱️ مدة إعادة الإرسال: **${config.postIntervalMinutes} دقيقة**`,
        "",
        "🟢 Start — تشغيل التبادل",
        "🔴 Stop — إيقاف التبادل",
        "📊 Status — عرض الحالة",
        "⚙️ Time — تغيير الوقت"
      ].join("\n")
    )
    .setFooter({
      text: "Auto Exchange System"
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("exchange_start")
      .setLabel("Start")
      .setEmoji("🟢")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("exchange_stop")
      .setLabel("Stop")
      .setEmoji("🔴")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId("exchange_status")
      .setLabel("Status")
      .setEmoji("📊")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("time_set")
      .setLabel("Time")
      .setEmoji("⚙️")
      .setStyle(ButtonStyle.Primary)
  );

  return {
    embeds: [embed],
    components: [row]
  };
}

// ==================================================
// OWNER CHANNEL MENU
// ==================================================

async function createOwnerChannelMenu(guild) {
  const options = [];

  for (const channelId of OWNER_EXCHANGE_CHANNEL_IDS) {
    const channel = await getGuildChannel(
      guild.id,
      channelId
    );

    if (!channel) {
      continue;
    }

    if (!isValidExchangeChannel(channel)) {
      continue;
    }

    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(
          channel.name.slice(0, 100)
        )
        .setDescription(
          `Channel ID: ${channel.id}`
        )
        .setValue(channel.id)
    );
  }

  if (!options.length) {
    return null;
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId("auto_setup_channels")
    .setPlaceholder("اختار رومات التبادل")
    .setMinValues(1)
    .setMaxValues(
      Math.min(options.length, 10)
    )
    .addOptions(options);

  return new ActionRowBuilder().addComponents(menu);
}

// ==================================================
// EXCHANGE CHANNEL MENU FOR USER
// ==================================================

async function createExchangeChannelMenu(guild) {
  const guildData = getGuildData(guild.id);

  const validChannels = [];

  for (const channelId of guildData.exchangeChannels) {
    if (
      !OWNER_EXCHANGE_CHANNEL_IDS.includes(
        channelId
      )
    ) {
      continue;
    }

    const channel = await getGuildChannel(
      guild.id,
      channelId
    );

    if (!channel) {
      continue;
    }

    if (!isValidExchangeChannel(channel)) {
      continue;
    }

    validChannels.push(channel);
  }

  // تنظيف الرومات المحذوفة
  guildData.exchangeChannels =
    validChannels.map((channel) => channel.id);

  saveData();

  if (!validChannels.length) {
    return null;
  }

  const options = validChannels.map(
    (channel) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(
          channel.name.slice(0, 100)
        )
        .setDescription(
          `ID: ${channel.id}`
        )
        .setValue(channel.id)
  );

  const menu = new StringSelectMenuBuilder()
    .setCustomId("exchange_select_channel")
    .setPlaceholder("اختار روم التبادل")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  return new ActionRowBuilder().addComponents(menu);
}

// ==================================================
// PUBLISH POST
// ==================================================

async function publishPost(guildId, userId) {
  const key = getUserKey(guildId, userId);
  const userData = data.users[key];

  if (!userData) {
    return {
      success: false,
      reason: "NOT_FOUND"
    };
  }

  if (!userData.active) {
    return {
      success: false,
      reason: "INACTIVE"
    };
  }

  if (!userData.channelId) {
    return {
      success: false,
      reason: "NO_CHANNEL"
    };
  }

  if (publishingUsers.has(key)) {
    return {
      success: false,
      reason: "ALREADY_PUBLISHING"
    };
  }

  const channel = await getGuildChannel(
    guildId,
    userData.channelId
  );

  if (!channel) {
    userData.lastError =
      "روم التبادل غير موجود.";

    saveData();

    return {
      success: false,
      reason: "CHANNEL_NOT_FOUND"
    };
  }

  if (!botCanSend(channel)) {
    userData.lastError =
      "البوت ليس لديه صلاحية إرسال الرسائل في الروم.";

    saveData();

    return {
      success: false,
      reason: "NO_PERMISSION"
    };
  }

  if (
    !userData.content &&
    (!userData.attachments ||
      userData.attachments.length === 0)
  ) {
    return {
      success: false,
      reason: "EMPTY"
    };
  }

  publishingUsers.add(key);

  try {
    const payload = {};

    if (userData.content) {
      payload.content = userData.content;
    }

    if (
      Array.isArray(userData.attachments) &&
      userData.attachments.length
    ) {
      payload.files = userData.attachments.map(
        (file) => ({
          attachment: file.url,
          name: file.name || "file"
        })
      );
    }

    await channel.send(payload);

    userData.lastPostedAt = Date.now();
    userData.lastError = null;

    saveData();

    return {
      success: true
    };
  } catch (error) {
    console.error(
      `❌ Publish error for ${key}:`,
      error
    );

    userData.lastError =
      error?.message ||
      "حدث خطأ أثناء إرسال المنشور.";

    saveData();

    return {
      success: false,
      reason: "SEND_ERROR",
      error
    };
  } finally {
    publishingUsers.delete(key);
  }
}

// ==================================================
// STOP USER EXCHANGE
// ==================================================

function stopUserExchange(guildId, userId) {
  const key = getUserKey(guildId, userId);

  const userData = data.users[key];

  if (!userData) {
    return false;
  }

  userData.active = false;
  userData.waitingForPost = false;
  userData.waitingSince = null;
  userData.lastPostedAt = null;
  userData.lastError = null;

  saveData();

  return true;
}

// ==================================================
// AUTO LOOP
// ==================================================

async function autoRepostLoop() {
  const now = Date.now();
  const interval = getIntervalMs();

  for (const [key, userData] of Object.entries(
    data.users
  )) {
    try {
      if (!userData) {
        continue;
      }

      if (!userData.active) {
        continue;
      }

      if (!userData.guildId || !userData.userId) {
        continue;
      }

      if (!userData.channelId) {
        continue;
      }

      if (!userData.lastPostedAt) {
        continue;
      }

      if (publishingUsers.has(key)) {
        continue;
      }

      const elapsed =
        now - Number(userData.lastPostedAt);

      if (elapsed < interval) {
        continue;
      }

      await publishPost(
        userData.guildId,
        userData.userId
      );
    } catch (error) {
      console.error(
        "❌ Auto loop error:",
        error
      );
    }
  }
}

// ==================================================
// CLEANUP WAITING SESSIONS
// ==================================================

function cleanupWaitingSessions() {
  const now = Date.now();

  // 15 دقيقة
  const timeout = 15 * 60 * 1000;

  let changed = false;

  for (const userData of Object.values(
    data.users
  )) {
    if (
      !userData ||
      !userData.waitingForPost ||
      !userData.waitingSince
    ) {
      continue;
    }

    if (
      now - Number(userData.waitingSince) >
      timeout
    ) {
      userData.waitingForPost = false;
      userData.waitingSince = null;

      changed = true;
    }
  }

  if (changed) {
    saveData();
  }
}

// ==================================================
// REGISTER COMMANDS
// ==================================================

async function registerCommands() {
  if (commandsRegistered) {
    return;
  }

  try {
    const commands = [
      {
        name: "auto",
        description:
          "فتح لوحة Auto Exchange"
      },

      {
        name: "auto-panel",
        description:
          "إرسال لوحة Auto Exchange في الروم"
      },

      {
        name: "auto-setup",
        description:
          "إعداد رومات Auto Exchange للـ Owner"
      },

      {
        name: "auto-time",
        description:
          "تغيير مدة Auto Exchange"
      }
    ];

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

    commandsRegistered = true;

    console.log(
      "✅ Slash commands registered."
    );
  } catch (error) {
    console.error(
      "❌ Command registration error:",
      error
    );
  }
}

// ==================================================
// READY
// ==================================================

client.once("ready", async () => {
  console.log("====================================");
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`🤖 Guilds: ${client.guilds.cache.size}`);
  console.log("====================================");

  // ==================================================
  // الحالة الحمراء 🔴
  // ==================================================

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

  await refreshApplicationOwner();

  await registerCommands();

  // ==================================================
  // START LOOP ONCE
  // ==================================================

  if (!loopStarted) {
    loopStarted = true;

    setInterval(
      async () => {
        await autoRepostLoop();
      },
      30 * 1000
    );

    setInterval(
      () => {
        cleanupWaitingSessions();
      },
      30 * 1000
    );
  }
});

// ==================================================
// INTERACTIONS
// ==================================================

client.on(
  "interactionCreate",
  async (interaction) => {
    try {
      // ==================================================
      // SLASH COMMANDS
      // ==================================================

      if (interaction.isChatInputCommand()) {
        // ----------------------------------------------
        // /auto
        // ----------------------------------------------

        if (
          interaction.commandName === "auto"
        ) {
          const allowed =
            await canUseAuto(interaction);

          if (!allowed) {
            return interaction.reply({
              content:
                "❌ ليس لديك صلاحية استخدام Auto Exchange.",
              ephemeral: true
            });
          }

          if (!interaction.guild) {
            return interaction.reply({
              content:
                "❌ هذا الأمر يعمل داخل السيرفر فقط.",
              ephemeral: true
            });
          }

          return interaction.reply({
            ...createMainPanel(),
            ephemeral: true
          });
        }

        // ----------------------------------------------
        // /auto-panel
        // ----------------------------------------------

        if (
          interaction.commandName ===
          "auto-panel"
        ) {
          const allowed =
            await canUseAuto(interaction);

          if (!allowed) {
            return interaction.reply({
              content:
                "❌ ليس لديك صلاحية استخدام Auto Exchange.",
              ephemeral: true
            });
          }

          if (!interaction.guild) {
            return interaction.reply({
              content:
                "❌ هذا الأمر يعمل داخل السيرفر فقط.",
              ephemeral: true
            });
          }

          await interaction.channel.send(
            createMainPanel()
          );

          return interaction.reply({
            content:
              "✅ تم إرسال لوحة Auto Exchange.",
            ephemeral: true
          });
        }

        // ----------------------------------------------
        // /auto-setup
        // ----------------------------------------------

        if (
          interaction.commandName ===
          "auto-setup"
        ) {
          if (!interaction.guild) {
            return interaction.reply({
              content:
                "❌ هذا الأمر يعمل داخل السيرفر فقط.",
              ephemeral: true
            });
          }

          const owner =
            await isBotOwner(
              interaction.user.id
            );

          if (!owner) {
            return interaction.reply({
              content:
                "❌ هذا الإعداد للـ Owner فقط.",
              ephemeral: true
            });
          }

          const row =
            await createOwnerChannelMenu(
              interaction.guild
            );

          if (!row) {
            return interaction.reply({
              content:
                "❌ لم أجد أي روم من الرومات المسموح بها داخل هذا السيرفر.",
              ephemeral: true
            });
          }

          const embed =
            new EmbedBuilder()
              .setTitle(
                "⚙️ Auto Exchange Setup"
              )
              .setDescription(
                [
                  "الـ Owner فقط يستطيع تحديد رومات التبادل.",
                  "",
                  "اختر الرومات التي تريد السماح باستخدام Auto Exchange فيها.",
                  "",
                  `عدد الرومات المسموحة: **${OWNER_EXCHANGE_CHANNEL_IDS.length}**`
                ].join("\n")
              );

          return interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true
          });
        }

        // ----------------------------------------------
        // /auto-time
        // ----------------------------------------------

        if (
          interaction.commandName ===
          "auto-time"
        ) {
          const allowed =
            await canControlSettings(
              interaction
            );

          if (!allowed) {
            return interaction.reply({
              content:
                "❌ ليس لديك صلاحية تغيير الوقت.",
              ephemeral: true
            });
          }

          const modal =
            new ModalBuilder()
              .setCustomId(
                "auto_time_modal"
              )
              .setTitle(
                "Auto Exchange Time"
              );

          const input =
            new TextInputBuilder()
              .setCustomId(
                "auto_time_input"
              )
              .setLabel(
                "المدة بالدقائق"
              )
              .setPlaceholder(
                "مثال: 10"
              )
              .setStyle(
                TextInputStyle.Short
              )
              .setRequired(true)
              .setValue(
                String(
                  config.postIntervalMinutes
                )
              );

          modal.addComponents(
            new ActionRowBuilder().addComponents(
              input
            )
          );

          return interaction.showModal(
            modal
          );
        }
      }

      // ==================================================
      // BUTTONS
      // ==================================================

      if (interaction.isButton()) {
        const customId =
          interaction.customId;

        // ----------------------------------------------
        // START
        // ----------------------------------------------

        if (
          customId ===
          "exchange_start"
        ) {
          const allowed =
            await canUseAuto(interaction);

          if (!allowed) {
            return interaction.reply({
              content:
                "❌ ليس لديك صلاحية.",
              ephemeral: true
            });
          }

          if (!interaction.guild) {
            return interaction.reply({
              content:
                "❌ يجب استخدام هذا داخل السيرفر.",
              ephemeral: true
            });
          }

          const row =
            await createExchangeChannelMenu(
              interaction.guild
            );

          if (!row) {
            return interaction.reply({
              content:
                "❌ الـ Owner لم يحدد أي روم تبادل حتى الآن.",
              ephemeral: true
            });
          }

          return interaction.reply({
            content:
              "📌 اختار روم التبادل الذي تريد استخدامه:",
            components: [row],
            ephemeral: true
          });
        }

        // ----------------------------------------------
        // STOP
        // ----------------------------------------------

        if (
          customId ===
          "exchange_stop"
        ) {
          const allowed =
            await canUseAuto(interaction);

          if (!allowed) {
            return interaction.reply({
              content:
                "❌ ليس لديك صلاحية.",
              ephemeral: true
            });
          }

          if (!interaction.guild) {
            return interaction.reply({
              content:
                "❌ يجب استخدام هذا داخل السيرفر.",
              ephemeral: true
            });
          }

          const userData =
            getUserData(
              interaction.guild.id,
              interaction.user.id
            );

          if (!userData.active) {
            return interaction.reply({
              content:
                "ℹ️ Auto Exchange غير مفعل عندك.",
              ephemeral: true
            });
          }

          stopUserExchange(
            interaction.guild.id,
            interaction.user.id
          );

          return interaction.reply({
            content:
              "🔴 تم إيقاف Auto Exchange بنجاح.",
            ephemeral: true
          });
        }

        // ----------------------------------------------
        // STATUS
        // ----------------------------------------------

        if (
          customId ===
          "exchange_status"
        ) {
          const allowed =
            await canUseAuto(interaction);

          if (!allowed) {
            return interaction.reply({
              content:
                "❌ ليس لديك صلاحية.",
              ephemeral: true
            });
          }

          if (!interaction.guild) {
            return interaction.reply({
              content:
                "❌ يجب استخدام هذا داخل السيرفر.",
              ephemeral: true
            });
          }

          const userData =
            getUserData(
              interaction.guild.id,
              interaction.user.id
            );

          if (
            !userData.active &&
            !userData.waitingForPost
          ) {
            return interaction.reply({
              content:
                "🔴 Auto Exchange غير مفعل.",
              ephemeral: true
            });
          }

          let remaining =
            "في انتظار المنشور الأول";

          if (userData.lastPostedAt) {
            const nextPost =
              Number(
                userData.lastPostedAt
              ) + getIntervalMs();

            remaining = formatDuration(
              nextPost - Date.now()
            );
          }

          const channelText =
            userData.channelId
              ? `<#${userData.channelId}>`
              : "غير محدد";

          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setTitle(
                  "📊 Auto Exchange Status"
                )
                .addFields(
                  {
                    name: "الحالة",
                    value: userData.active
                      ? "🟢 يعمل"
                      : "🟡 في انتظار المنشور",
                    inline: true
                  },
                  {
                    name: "الروم",
                    value: channelText,
                    inline: true
                  },
                  {
                    name: "الوقت المتبقي",
                    value: remaining,
                    inline: true
                  }
                )
            ],
            ephemeral: true
          });
        }

        // ----------------------------------------------
        // TIME SET
        // ----------------------------------------------

        if (
          customId === "time_set"
        ) {
          const allowed =
            await canControlSettings(
              interaction
            );

          if (!allowed) {
            return interaction.reply({
              content:
                "❌ فقط الـ Owner أو Administrator يستطيع تغيير الوقت.",
              ephemeral: true
            });
          }

          const modal =
            new ModalBuilder()
              .setCustomId(
                "auto_time_modal"
              )
              .setTitle(
                "Auto Exchange Time"
              );

          const input =
            new TextInputBuilder()
              .setCustomId(
                "auto_time_input"
              )
              .setLabel(
                "المدة بالدقائق"
              )
              .setPlaceholder(
                "مثال: 10"
              )
              .setStyle(
                TextInputStyle.Short
              )
              .setRequired(true)
              .setValue(
                String(
                  config.postIntervalMinutes
                )
              );

          modal.addComponents(
            new ActionRowBuilder().addComponents(
              input
            )
          );

          return interaction.showModal(
            modal
          );
        }
      }

      // ==================================================
      // SELECT MENUS
      // ==================================================

      if (
        interaction.isStringSelectMenu()
      ) {
        // ----------------------------------------------
        // OWNER SETUP
        // ----------------------------------------------

        if (
          interaction.customId ===
          "auto_setup_channels"
        ) {
          const owner =
            await isBotOwner(
              interaction.user.id
            );

          if (!owner) {
            return interaction.reply({
              content:
                "❌ هذا الإعداد للـ Owner فقط.",
              ephemeral: true
            });
          }

          if (!interaction.guild) {
            return interaction.reply({
              content:
                "❌ يجب استخدامه داخل السيرفر.",
              ephemeral: true
            });
          }

          const selected =
            interaction.values.filter(
              (id) =>
                OWNER_EXCHANGE_CHANNEL_IDS.includes(
                  id
                )
            );

          if (!selected.length) {
            return interaction.reply({
              content:
                "❌ الاختيارات غير صحيحة.",
              ephemeral: true
            });
          }

          const guildData =
            getGuildData(
              interaction.guild.id
            );

          guildData.exchangeChannels =
            [...new Set(selected)];

          saveData();

          const channelList =
            guildData.exchangeChannels
              .map(
                (id) =>
                  `<#${id}>`
              )
              .join("\n");

          return interaction.update({
            content:
              `✅ تم حفظ رومات Auto Exchange.\n\n${channelList}`,
            embeds: [],
            components: []
          });
        }

        // ----------------------------------------------
        // USER SELECT CHANNEL
        // ----------------------------------------------

        if (
          interaction.customId ===
          "exchange_select_channel"
        ) {
          const allowed =
            await canUseAuto(interaction);

          if (!allowed) {
            return interaction.reply({
              content:
                "❌ ليس لديك صلاحية.",
              ephemeral: true
            });
          }

          if (!interaction.guild) {
            return interaction.reply({
              content:
                "❌ يجب استخدامه داخل السيرفر.",
              ephemeral: true
            });
          }

          const channelId =
            interaction.values[0];

          const guildData =
            getGuildData(
              interaction.guild.id
            );

          // لازم يكون الروم مختار من الـ Owner
          if (
            !guildData.exchangeChannels.includes(
              channelId
            )
          ) {
            return interaction.reply({
              content:
                "❌ هذا الروم غير مسموح به.",
              ephemeral: true
            });
          }

          // لازم يكون من الـ10 المحددين
          if (
            !OWNER_EXCHANGE_CHANNEL_IDS.includes(
              channelId
            )
          ) {
            return interaction.reply({
              content:
                "❌ هذا الروم غير موجود ضمن قائمة الرومات المسموحة.",
              ephemeral: true
            });
          }

          const channel =
            await getGuildChannel(
              interaction.guild.id,
              channelId
            );

          if (!channel) {
            return interaction.reply({
              content:
                "❌ الروم غير موجود.",
              ephemeral: true
            });
          }

          if (!botCanSend(channel)) {
            return interaction.reply({
              content:
                "❌ البوت لا يستطيع إرسال الرسائل في هذا الروم.",
              ephemeral: true
            });
          }

          const userData =
            getUserData(
              interaction.guild.id,
              interaction.user.id
            );

          // حفظ الاختيار
          userData.channelId =
            channelId;

          userData.content = "";
          userData.attachments = [];

          userData.active = false;

          userData.waitingForPost = true;
          userData.waitingSince =
            Date.now();

          userData.lastPostedAt = null;
          userData.lastError = null;

          saveData();

          try {
            await interaction.user.send({
              embeds: [
                new EmbedBuilder()
                  .setTitle(
                    "📨 Auto Exchange"
                  )
                  .setDescription(
                    [
                      `تم اختيار الروم: <#${channelId}>`,
                      "",
                      "الآن أرسل لي المنشور الذي تريد إعادة إرساله.",
                      "",
                      "يمكنك إرسال:",
                      "• نص",
                      "• صورة",
                      "• فيديو",
                      "• ملف",
                      "• أو نص + مرفقات",
                      "",
                      "⏱️ لديك 15 دقيقة لإرسال المنشور."
                    ].join("\n")
                  )
              ]
            });
          } catch {
            userData.waitingForPost =
              false;

            userData.waitingSince = null;

            saveData();

            return interaction.update({
              content:
                "❌ لا أستطيع إرسال DM لك. افتح الرسائل الخاصة من السيرفر ثم حاول مرة أخرى.",
              components: []
            });
          }

          return interaction.update({
            content:
              "✅ تم اختيار الروم.\n\n📩 أرسلت لك رسالة في الخاص. أرسل المنشور هناك.",
            components: []
          });
        }
      }

      // ==================================================
      // MODALS
      // ==================================================

      if (
        interaction.isModalSubmit()
      ) {
        if (
          interaction.customId !==
          "auto_time_modal"
        ) {
          return;
        }

        const allowed =
          await canControlSettings(
            interaction
          );

        if (!allowed) {
          return interaction.reply({
            content:
              "❌ ليس لديك صلاحية تغيير الوقت.",
            ephemeral: true
          });
        }

        const raw =
          interaction.fields.getTextInputValue(
            "auto_time_input"
          );

        const minutes =
          Number(raw);

        if (
          !Number.isFinite(minutes) ||
          !Number.isInteger(minutes) ||
          minutes < 1 ||
          minutes > 10080
        ) {
          return interaction.reply({
            content:
              "❌ أدخل رقم صحيح من 1 إلى 10080 دقيقة.",
            ephemeral: true
          });
        }

        config.postIntervalMinutes =
          minutes;

        saveConfig();

        return interaction.reply({
          content:
            `✅ تم تغيير وقت Auto Exchange إلى **${minutes} دقيقة**.`,
          ephemeral: true
        });
      }
    } catch (error) {
      console.error(
        "❌ Interaction error:",
        error
      );

      try {
        if (
          interaction.replied ||
          interaction.deferred
        ) {
          await interaction.followUp({
            content:
              "❌ حدث خطأ غير متوقع.",
            ephemeral: true
          });
        } else {
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
// DIRECT MESSAGES
// ==================================================

client.on(
  "messageCreate",
  async (message) => {
    try {
      // لازم يكون DM
      if (message.guild) {
        return;
      }

      // تجاهل البوتات
      if (message.author.bot) {
        return;
      }

      const userId =
        message.author.id;

      // ==================================================
      // FIND WAITING SESSION
      // ==================================================

      const entries =
        Object.entries(data.users);

      const waiting =
        entries.find(
          ([, userData]) =>
            userData &&
            userData.userId === userId &&
            userData.waitingForPost === true
        );

      if (!waiting) {
        return;
      }

      const [key, userData] =
        waiting;

      if (!userData.guildId) {
        return;
      }

      if (!userData.channelId) {
        return;
      }

      // ==================================================
      // CHECK EMPTY
      // ==================================================

      const hasText =
        Boolean(
          message.content &&
          message.content.trim()
        );

      const attachments =
        getAttachmentData(message);

      if (
        !hasText &&
        attachments.length === 0
      ) {
        return message.reply(
          "❌ أرسل نص أو صورة أو فيديو أو ملف."
        );
      }

      // ==================================================
      // SAVE POST
      // ==================================================

      userData.content =
        message.content || "";

      userData.attachments =
        attachments;

      userData.waitingForPost =
        false;

      userData.waitingSince = null;

      userData.active = true;

      userData.lastPostedAt = null;

      userData.lastError = null;

      saveData();

      // ==================================================
      // PUBLISH FIRST POST
      // ==================================================

      const result =
        await publishPost(
          userData.guildId,
          userId
        );

      if (!result.success) {
        userData.active = false;

        saveData();

        let errorMessage =
          "❌ حدث خطأ أثناء إرسال المنشور.";

        if (
          result.reason ===
          "CHANNEL_NOT_FOUND"
        ) {
          errorMessage =
            "❌ روم التبادل لم يعد موجودًا.";
        }

        if (
          result.reason ===
          "NO_PERMISSION"
        ) {
          errorMessage =
            "❌ البوت لا يمتلك صلاحية الكتابة في روم التبادل.";
        }

        if (
          result.reason ===
          "EMPTY"
        ) {
          errorMessage =
            "❌ المنشور فارغ.";
        }

        return message.reply(
          errorMessage
        );
      }

      return message.reply(
        [
          "✅ تم تشغيل Auto Exchange بنجاح.",
          "",
          `📍 الروم: <#${userData.channelId}>`,
          `⏱️ إعادة الإرسال كل: **${config.postIntervalMinutes} دقيقة**`,
          "",
          "🔄 سيقوم البوت بإعادة إرسال نفس المنشور تلقائيًا."
        ].join("\n")
      );
    } catch (error) {
      console.error(
        "❌ DM message error:",
        error
      );
    }
  }
);

// ==================================================
// GUILD MESSAGE HANDLER
// ==================================================
//
// مهم:
// لن نقوم بتشغيل Auto Exchange تلقائيًا بمجرد
// أن العضو يكتب في الروم.
// التشغيل يكون من:
// Start -> اختيار الروم -> DM -> إرسال المنشور
//
// هذا يمنع تشغيل النظام بالغلط.
// ==================================================

// ==================================================
// ERROR HANDLING
// ==================================================

client.on(
  "error",
  (error) => {
    console.error(
      "❌ Discord client error:",
      error
    );
  }
);

client.on(
  "warn",
  (warning) => {
    console.warn(
      "⚠️ Discord warning:",
      warning
    );
  }
);

process.on(
  "unhandledRejection",
  (error) => {
    console.error(
      "❌ Unhandled Promise Rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  (error) => {
    console.error(
      "❌ Uncaught Exception:",
      error
    );
  }
);

// ==================================================
// LOGIN
// ==================================================

client
  .login(TOKEN)
  .catch((error) => {
    console.error(
      "❌ Failed to login:",
      error
    );

    process.exit(1);
  });
