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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
  REST,
  Routes
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ==================================================
// CONFIG
// ==================================================

const config = require("./config.json");

const DATA_FILE = path.join(__dirname, "data.json");

// ==================================================
// LOAD DATA
// ==================================================

let data = {};

if (fs.existsSync(DATA_FILE)) {
  try {
    data = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );
  } catch (error) {
    console.log(
      "data.json is invalid. Creating new data."
    );

    data = {};
  }
}

if (!data.guilds) {
  data.guilds = {};
}

if (!data.users) {
  data.users = {};
}

// ==================================================
// TEMP ROLES DATA
// ==================================================

if (!Array.isArray(data.tempRoles)) {
  data.tempRoles = [];
}

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
  } catch (error) {
    console.error(
      "Failed to save data:",
      error
    );
  }
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
    Partials.Channel
  ]
});

// ==================================================
// SETTINGS
// ==================================================

const CONFIG_OWNER_ID =
  String(config.ownerId || "").trim();

const ALLOWED_ROLES =
  Array.isArray(config.allowedRoleIds)
    ? config.allowedRoleIds.map(String)
    : [];

let postIntervalMinutes =
  Number(config.postIntervalMinutes || 10);

if (
  !Number.isFinite(postIntervalMinutes) ||
  postIntervalMinutes < 1
) {
  postIntervalMinutes = 10;
}

// ==================================================
// OWNER EXCHANGE CHANNELS
// ==================================================

const OWNER_EXCHANGE_CHANNEL_IDS = [
  "1547162510879101028",
  "1547162615917056092",
  "1547162338195406909",
  "1547162391672922132",
  "1547162207626727434",
  "1547162211821035611",
  "1547162535164379146",
  "1547162619054653491"
];

// ==================================================
// INTERVAL
// ==================================================

function getIntervalMs() {
  return (
    postIntervalMinutes *
    60 *
    1000
  );
}

// ==================================================
// PUBLISHING LOCK
// ==================================================

const publishingUsers = new Set();

// ==================================================
// USER KEY
// ==================================================

function getUserKey(
  guildId,
  userId
) {
  return `${guildId}_${userId}`;
}

// ==================================================
// GUILD SETTINGS
// ==================================================

function getGuildSettings(
  guildId
) {

  if (!data.guilds[guildId]) {

    data.guilds[guildId] = {
      exchangeChannels: []
    };
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
// USER DATA
// ==================================================

function getUserData(
  guildId,
  userId
) {

  const key =
    getUserKey(
      guildId,
      userId
    );

  if (!data.users[key]) {

    data.users[key] = {

      guildId,
      userId,

      channelId: null,

      content: "",

      attachments: [],

      active: false,

      waitingForPost: false,

      waitingSince: 0,

      lastPostedAt: 0
    };
  }

  const user =
    data.users[key];

  if (
    !Array.isArray(
      user.attachments
    )
  ) {

    user.attachments = [];
  }

  if (
    typeof user.content !==
    "string"
  ) {

    user.content = "";
  }

  if (
    typeof user.active !==
    "boolean"
  ) {

    user.active = false;
  }

  if (
    typeof user.waitingForPost !==
    "boolean"
  ) {

    user.waitingForPost = false;
  }

  if (
    typeof user.waitingSince !==
    "number"
  ) {

    user.waitingSince = 0;
  }

  if (
    typeof user.lastPostedAt !==
    "number"
  ) {

    user.lastPostedAt = 0;
  }

  return user;
}

// ==================================================
// RESET USER
// ==================================================

function resetUserExchange(
  guildId,
  userId
) {

  const key =
    getUserKey(
      guildId,
      userId
    );

  if (!data.users[key]) {
    return;
  }

  data.users[key] = {

    guildId,
    userId,

    channelId: null,

    content: "",

    attachments: [],

    active: false,

    waitingForPost: false,

    waitingSince: 0,

    lastPostedAt: 0
  };

  saveData();
}

// ==================================================
// PERMISSION HELPERS
// ==================================================

function isBotOwner(
  userId
) {

  return (
    String(userId) ===
    CONFIG_OWNER_ID
  );
}

function hasAllowedRole(
  member
) {

  if (!member) {
    return false;
  }

  return member.roles.cache.some(
    role =>
      ALLOWED_ROLES.includes(
        String(role.id)
      )
  );
}

function canControlSettings(
  member
) {

  if (!member) {
    return false;
  }

  if (
    isBotOwner(member.id)
  ) {
    return true;
  }

  if (
    member.permissions.has(
      PermissionsBitField.Flags.Administrator
    )
  ) {
    return true;
  }

  return hasAllowedRole(member);
}

// ==================================================
// DURATION PARSER
// ==================================================

function parseDuration(input) {

  if (!input) {
    return null;
  }

  const value =
    String(input)
      .trim()
      .toLowerCase();

  const match =
    value.match(
      /^(\d+(?:\.\d+)?)(s|m|h|d|w)$/
    );

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
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000
  };

  return amount * multipliers[unit];
}

// ==================================================
// FORMAT DURATION
// ==================================================

function formatDuration(ms) {

  if (
    !Number.isFinite(ms) ||
    ms <= 0
  ) {
    return "0s";
  }

  let remaining = ms;

  const weeks =
    Math.floor(
      remaining /
      (7 * 24 * 60 * 60 * 1000)
    );

  remaining -=
    weeks *
    (7 * 24 * 60 * 60 * 1000);

  const days =
    Math.floor(
      remaining /
      (24 * 60 * 60 * 1000)
    );

  remaining -=
    days *
    (24 * 60 * 60 * 1000);

  const hours =
    Math.floor(
      remaining /
      (60 * 60 * 1000)
    );

  remaining -=
    hours *
    (60 * 60 * 1000);

  const minutes =
    Math.floor(
      remaining /
      (60 * 1000)
    );

  remaining -=
    minutes *
    (60 * 1000);

  const seconds =
    Math.floor(
      remaining /
      1000
    );

  const parts = [];

  if (weeks > 0) {
    parts.push(`${weeks}w`);
  }

  if (days > 0) {
    parts.push(`${days}d`);
  }

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }

  if (
    seconds > 0 &&
    parts.length < 2
  ) {
    parts.push(`${seconds}s`);
  }

  return parts.join(" ") || "0s";
}

// ==================================================
// REMOVE EXPIRED TEMP ROLES
// ==================================================

async function removeExpiredRoles() {

  if (
    !Array.isArray(data.tempRoles) ||
    data.tempRoles.length === 0
  ) {
    return;
  }

  const now =
    Date.now();

  let changed = false;

  for (
    const record of [...data.tempRoles]
  ) {

    if (
      !record ||
      !record.expiresAt
    ) {
      continue;
    }

    if (
      Number(record.expiresAt) > now
    ) {
      continue;
    }

    try {

      const guild =
        client.guilds.cache.get(
          String(record.guildId)
        );

      if (!guild) {
        continue;
      }

      const member =
        await guild.members
          .fetch(
            String(record.userId)
          )
          .catch(() => null);

      if (!member) {
        continue;
      }

      const role =
        guild.roles.cache.get(
          String(record.roleId)
        );

      if (
        role &&
        member.roles.cache.has(role.id)
      ) {

        await member.roles.remove(
          role,
          "انتهاء مدة الرتبة المؤقتة"
        );
      }

    } catch (error) {

      console.error(
        "Failed to remove expired role:",
        error
      );
    }

    data.tempRoles =
      data.tempRoles.filter(
        item =>
          !(
            String(item.guildId) ===
              String(record.guildId) &&

            String(item.userId) ===
              String(record.userId) &&

            String(item.roleId) ===
              String(record.roleId) &&

            Number(item.expiresAt) ===
              Number(record.expiresAt)
          )
      );

    changed = true;
  }

  if (changed) {
    saveData();
  }
}

// فحص الرتب المؤقتة كل 15 ثانية
setInterval(
  removeExpiredRoles,
  15 * 1000
);

// ==================================================
// PUBLISH EMBED
// ==================================================

function buildExchangeEmbed(
  user,
  content
) {

  const embed =
    new EmbedBuilder()
      .setDescription(
        content || "بدون نص"
      )
      .setColor(0x2b2d31)
      .setFooter({
        text:
          `Auto Exchange • ${user.username}`
      })
      .setTimestamp();

  return embed;
}

// ==================================================
// ATTACHMENTS
// ==================================================

function getAttachmentUrls(
  message
) {

  return message.attachments
    .map(
      attachment =>
        attachment.url
    );
}

// ==================================================
// CREATE PUBLISH MESSAGE
// ==================================================

async function publishUserPost(
  guild,
  userId
) {

  const user =
    getUserData(
      guild.id,
      userId
    );

  if (
    !user.channelId
  ) {
    return false;
  }

  if (
    !user.content &&
    (!user.attachments ||
      user.attachments.length === 0)
  ) {
    return false;
  }

  const channel =
    guild.channels.cache.get(
      user.channelId
    );

  if (
    !channel ||
    channel.type !==
      ChannelType.GuildText
  ) {
    return false;
  }

  try {

    const embed =
      buildExchangeEmbed(
        await client.users.fetch(
          userId
        ),
        user.content
      );

    const files =
      Array.isArray(
        user.attachments
      )
        ? user.attachments
        : [];

    await channel.send({
      embeds: [embed],
      files
    });

    user.lastPostedAt =
      Date.now();

    saveData();

    return true;

  } catch (error) {

    console.error(
      "Failed to publish post:",
      error
    );

    return false;
  }
}
// ==================================================
// PART 2 — EXCHANGE SYSTEM
// ==================================================

// ==================================================
// CHECK USER CAN PUBLISH
// ==================================================

function canPublishUser(
  guildId,
  userId
) {

  const user =
    getUserData(
      guildId,
      userId
    );

  if (!user.active) {
    return false;
  }

  if (!user.channelId) {
    return false;
  }

  if (
    !user.content &&
    (!user.attachments ||
      user.attachments.length === 0)
  ) {
    return false;
  }

  return true;
}

// ==================================================
// GET NEXT POST TIME
// ==================================================

function getNextPostTime(
  guildId,
  userId
) {

  const user =
    getUserData(
      guildId,
      userId
    );

  if (!user.lastPostedAt) {
    return Date.now();
  }

  return (
    user.lastPostedAt +
    getIntervalMs()
  );
}

// ==================================================
// AUTO PUBLISH USER
// ==================================================

async function tryAutoPublish(
  guild,
  userId
) {

  const user =
    getUserData(
      guild.id,
      userId
    );

  if (!user.active) {
    return false;
  }

  if (!user.waitingForPost) {
    return false;
  }

  if (
    !canPublishUser(
      guild.id,
      userId
    )
  ) {
    return false;
  }

  const nextTime =
    getNextPostTime(
      guild.id,
      userId
    );

  if (
    Date.now() <
    nextTime
  ) {
    return false;
  }

  if (
    publishingUsers.has(userId)
  ) {
    return false;
  }

  publishingUsers.add(userId);

  try {

    const published =
      await publishUserPost(
        guild,
        userId
      );

    if (published) {

      user.waitingForPost =
        false;

      user.waitingSince = 0;

      saveData();

      return true;
    }

  } catch (error) {

    console.error(
      "Auto publish error:",
      error
    );

  } finally {

    publishingUsers.delete(
      userId
    );
  }

  return false;
}

// ==================================================
// AUTO PUBLISH LOOP
// ==================================================

async function runAutoPublishLoop() {

  for (
    const guild of client.guilds.cache.values()
  ) {

    const guildUsers =
      Object.values(data.users)
        .filter(
          user =>
            String(user.guildId) ===
            String(guild.id)
        );

    for (
      const user of guildUsers
    ) {

      if (
        !user.active ||
        !user.waitingForPost
      ) {
        continue;
      }

      try {

        await tryAutoPublish(
          guild,
          user.userId
        );

      } catch (error) {

        console.error(
          "Auto publish loop error:",
          error
        );
      }
    }
  }
}

// فحص النشر التلقائي كل 10 ثواني
setInterval(
  runAutoPublishLoop,
  10 * 1000
);

// ==================================================
// REGISTER EXCHANGE CHANNEL
// ==================================================

function addExchangeChannel(
  guildId,
  channelId
) {

  const settings =
    getGuildSettings(
      guildId
    );

  if (
    !settings.exchangeChannels.includes(
      String(channelId)
    )
  ) {

    settings.exchangeChannels.push(
      String(channelId)
    );

    saveData();
  }
}

// ==================================================
// REMOVE EXCHANGE CHANNEL
// ==================================================

function removeExchangeChannel(
  guildId,
  channelId
) {

  const settings =
    getGuildSettings(
      guildId
    );

  settings.exchangeChannels =
    settings.exchangeChannels.filter(
      id =>
        String(id) !==
        String(channelId)
    );

  saveData();
}

// ==================================================
// CHECK EXCHANGE CHANNEL
// ==================================================

function isExchangeChannel(
  guildId,
  channelId
) {

  // القنوات الثابتة الخاصة بالمالك
  if (
    OWNER_EXCHANGE_CHANNEL_IDS.includes(
      String(channelId)
    )
  ) {
    return true;
  }

  const settings =
    getGuildSettings(
      guildId
    );

  return settings.exchangeChannels.includes(
    String(channelId)
  );
}

// ==================================================
// CREATE USER EXCHANGE DATA
// ==================================================

function activateUserExchange(
  guildId,
  userId,
  channelId
) {

  const user =
    getUserData(
      guildId,
      userId
    );

  user.channelId =
    String(channelId);

  user.active = true;

  user.waitingForPost = false;

  user.waitingSince = 0;

  saveData();

  return user;
}

// ==================================================
// DEACTIVATE USER EXCHANGE
// ==================================================

function deactivateUserExchange(
  guildId,
  userId
) {

  const user =
    getUserData(
      guildId,
      userId
    );

  user.active = false;

  user.waitingForPost = false;

  user.waitingSince = 0;

  saveData();

  return user;
}

// ==================================================
// SET USER POST CONTENT
// ==================================================

function setUserContent(
  guildId,
  userId,
  content
) {

  const user =
    getUserData(
      guildId,
      userId
    );

  user.content =
    String(content || "").trim();

  saveData();

  return user;
}

// ==================================================
// SET USER ATTACHMENTS
// ==================================================

function setUserAttachments(
  guildId,
  userId,
  attachments
) {

  const user =
    getUserData(
      guildId,
      userId
    );

  user.attachments =
    Array.isArray(attachments)
      ? attachments
      : [];

  saveData();

  return user;
}

// ==================================================
// ADD ATTACHMENTS
// ==================================================

function addUserAttachments(
  guildId,
  userId,
  attachments
) {

  const user =
    getUserData(
      guildId,
      userId
    );

  if (
    !Array.isArray(
      user.attachments
    )
  ) {
    user.attachments = [];
  }

  if (
    Array.isArray(attachments)
  ) {

    user.attachments.push(
      ...attachments
    );
  }

  saveData();

  return user;
}

// ==================================================
// MARK USER WAITING
// ==================================================

function markUserWaiting(
  guildId,
  userId
) {

  const user =
    getUserData(
      guildId,
      userId
    );

  user.waitingForPost =
    true;

  user.waitingSince =
    Date.now();

  saveData();

  return user;
}

// ==================================================
// CLEAR USER POST
// ==================================================

function clearUserPost(
  guildId,
  userId
) {

  const user =
    getUserData(
      guildId,
      userId
    );

  user.content = "";

  user.attachments = [];

  user.waitingForPost = false;

  user.waitingSince = 0;

  saveData();

  return user;
}

// ==================================================
// GET USER POST STATUS
// ==================================================

function getUserPostStatus(
  guildId,
  userId
) {

  const user =
    getUserData(
      guildId,
      userId
    );

  const nextTime =
    getNextPostTime(
      guildId,
      userId
    );

  const remaining =
    Math.max(
      0,
      nextTime - Date.now()
    );

  return {

    active:
      user.active,

    waitingForPost:
      user.waitingForPost,

    channelId:
      user.channelId,

    hasContent:
      Boolean(
        user.content
      ),

    attachments:
      user.attachments.length,

    lastPostedAt:
      user.lastPostedAt,

    nextPostAt:
      nextTime,

    remainingMs:
      remaining
  };
}

// ==================================================
// FORMAT USER STATUS
// ==================================================

function buildUserStatusText(
  guildId,
  userId
) {

  const status =
    getUserPostStatus(
      guildId,
      userId
    );

  if (!status.active) {

    return (
      "❌ نظام التبادل غير مفعل."
    );
  }

  if (!status.channelId) {

    return (
      "❌ لم يتم تحديد قناة التبادل."
    );
  }

  if (
    !status.hasContent &&
    status.attachments === 0
  ) {

    return (
      "⚠️ لم تقم بإضافة محتوى للنشر."
    );
  }

  if (
    status.waitingForPost
  ) {

    if (
      status.remainingMs > 0
    ) {

      return (
        `⏳ في الانتظار للنشر.\n` +
        `النشر القادم بعد: ${formatDuration(
          status.remainingMs
        )}`
      );
    }

    return (
      "🟢 جاهز للنشر الآن."
    );
  }

  return (
    "📝 المحتوى جاهز."
  );
}

// ==================================================
// OWNER CHANNELS SETUP
// ==================================================

function setupOwnerExchangeChannels() {

  for (
    const guild of client.guilds.cache.values()
  ) {

    for (
      const channelId of OWNER_EXCHANGE_CHANNEL_IDS
    ) {

      const channel =
        guild.channels.cache.get(
          String(channelId)
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

      addExchangeChannel(
        guild.id,
        channel.id
      );
    }
  }
}

// ==================================================
// MESSAGE COLLECTION
// ==================================================

client.on(
  "messageCreate",
  async message => {

    if (
      message.author.bot
    ) {
      return;
    }

    if (
      !message.guild
    ) {
      return;
    }

    const guild =
      message.guild;

    const channel =
      message.channel;

    // ==============================================
    // ONLY EXCHANGE CHANNELS
    // ==============================================

    if (
      !isExchangeChannel(
        guild.id,
        channel.id
      )
    ) {
      return;
    }

    // ==============================================
    // USER DATA
    // ==============================================

    const user =
      getUserData(
        guild.id,
        message.author.id
      );

    // ==============================================
    // SAVE MESSAGE CONTENT
    // ==============================================

    const content =
      String(
        message.content || ""
      ).trim();

    const attachments =
      getAttachmentUrls(
        message
      );

    // ==============================================
    // SAVE CONTENT
    // ==============================================

    if (content) {

      user.content =
        content;
    }

    // ==============================================
    // SAVE ATTACHMENTS
    // ==============================================

    if (
      attachments.length > 0
    ) {

      user.attachments =
        attachments;
    }

    // ==============================================
    // ACTIVATE USER
    // ==============================================

    user.active = true;

    user.channelId =
      channel.id;

    // ==============================================
    // WAIT FOR POST
    // ==============================================

    user.waitingForPost =
      true;

    user.waitingSince =
      Date.now();

    saveData();

    // ==============================================
    // TRY IMMEDIATE PUBLISH
    // ==============================================

    try {

      await tryAutoPublish(
        guild,
        message.author.id
      );

    } catch (error) {

      console.error(
        "Immediate publish error:",
        error
      );
    }
  }
);

// ==================================================
// READY
// ==================================================

client.once(
  "ready",
  async () => {

    console.log(
      `Logged in as ${client.user.tag}`
    );

    console.log(
      `Exchange interval: ${postIntervalMinutes} minutes`
    );

    setupOwnerExchangeChannels();

    await removeExpiredRoles();

    await runAutoPublishLoop();
  }
);

// ==================================================
// LOGIN
// ==================================================

client.login(
  config.token
);
