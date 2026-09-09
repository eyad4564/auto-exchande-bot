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

let data = {};

if (fs.existsSync(DATA_FILE)) {
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (error) {
    console.log("data.json is invalid. Creating new data.");
    data = {};
  }
}

function saveData() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(data, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("Failed to save data:", error);
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
// CONSTANTS
// ==================================================

const OWNER_ID = config.ownerId;

const ALLOWED_ROLES = Array.isArray(config.allowedRoleIds)
  ? config.allowedRoleIds
  : [];

const INTERVAL_MS =
  Number(config.postIntervalMinutes || 10) *
  60 *
  1000;

// لمنع نشر نفس المنشور مرتين في نفس اللحظة
const publishingUsers = new Set();

// ==================================================
// USER KEY
// ==================================================

function getUserKey(guildId, userId) {
  return `${guildId}_${userId}`;
}

// ==================================================
// GET GUILD SETTINGS
// ==================================================

function getGuildSettings(guildId) {
  if (!data.guilds) {
    data.guilds = {};
  }

  if (!data.guilds[guildId]) {
    data.guilds[guildId] = {
      exchangeChannels: []
    };
  }

  return data.guilds[guildId];
}

// ==================================================
// GET USER DATA
// ==================================================

function getUserData(guildId, userId) {
  const key = getUserKey(guildId, userId);

  if (!data.users) {
    data.users = {};
  }

  if (!data.users[key]) {
    data.users[key] = {
      guildId,
      userId,
      channelId: null,
      content: "",
      attachments: [],
      active: false,
      waitingForPost: false,
      lastPostedAt: 0
    };
  }

  return data.users[key];
}

// ==================================================
// RESET USER EXCHANGE
// ==================================================

function resetUserExchange(guildId, userId) {
  const key = getUserKey(guildId, userId);

  if (!data.users) {
    data.users = {};
  }

  if (!data.users[key]) {
    return;
  }

  data.users[key].active = false;
  data.users[key].waitingForPost = false;
  data.users[key].channelId = null;
  data.users[key].content = "";
  data.users[key].attachments = [];
  data.users[key].lastPostedAt = 0;

  saveData();
}

// ==================================================
// PERMISSION CHECK
// ==================================================

function isAllowed(member) {
  if (!member) {
    return false;
  }

  // Owner
  if (member.id === OWNER_ID) {
    return true;
  }

  // Administrator
  if (
    config.allowAdministrators === true &&
    member.permissions.has(
      PermissionsBitField.Flags.Administrator
    )
  ) {
    return true;
  }

  // Allowed roles
  if (
    ALLOWED_ROLES.some(roleId =>
      member.roles.cache.has(roleId)
    )
  ) {
    return true;
  }

  // Booster
  if (config.allowBoosters === true) {
    const boostCount =
      Number(member.guild.premiumSubscriptionCount || 0);

    if (boostCount >= 2) {
      return true;
    }
  }

  return false;
}

// ==================================================
// PANEL EMBED
// ==================================================

function createPanelEmbed() {
  return new EmbedBuilder()
    .setTitle("Auto Exchange")
    .setDescription(
      "اختر العملية التي تريدها من الأزرار بالأسفل.\n\n" +

      "**🚀 بدء التبادل**\n" +
      "ابدأ عملية نشر منشورك تلقائيا.\n\n" +

      "**🛑 إيقاف التبادل**\n" +
      "إيقاف النشر التلقائي.\n\n" +

      "**📊 حالة التبادل**\n" +
      "عرض حالة التبادل الحالية.\n\n" +

      `يتم النشر كل ${config.postIntervalMinutes} دقائق.`
    )
    .setColor(0x5865f2);
}

// ==================================================
// PANEL BUTTONS
// ==================================================

function createPanelButtons() {
  return new ActionRowBuilder().addComponents(

    new ButtonBuilder()
      .setCustomId("exchange_start")
      .setLabel("بدء التبادل")
      .setEmoji("🚀")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("exchange_stop")
      .setLabel("إيقاف التبادل")
      .setEmoji("🛑")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId("exchange_status")
      .setLabel("حالة التبادل")
      .setEmoji("📊")
      .setStyle(ButtonStyle.Primary)

  );
}

// ==================================================
// SLASH COMMANDS
// ==================================================

const commands = [

  {
    name: "auto-panel",
    description: "Send the Auto Exchange panel"
  },

  {
    name: "auto-setup",
    description: "Choose the exchange channels"
  }

];

// ==================================================
// READY
// ==================================================

client.once("ready", async () => {

  console.log("--------------------------------");
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Bot ID: ${client.user.id}`);
  console.log("--------------------------------");

  if (!process.env.TOKEN) {
    console.error(
      "TOKEN is missing from Railway Variables."
    );

    return;
  }

  const rest = new REST({
    version: "10"
  }).setToken(process.env.TOKEN);

  try {

    await rest.put(
      Routes.applicationCommands(client.user.id),
      {
        body: commands
      }
    );

    console.log("Slash commands registered.");

  } catch (error) {

    console.error(
      "Slash command registration failed:",
      error
    );

  }

  console.log("Auto Exchange Bot is Online.");

});

// ==================================================
// INTERACTIONS
// ==================================================

client.on("interactionCreate", async interaction => {

  try {

    // ==================================================
    // SLASH COMMANDS
    // ==================================================

    if (interaction.isChatInputCommand()) {

      // ==================================================
      // AUTO PANEL
      // ==================================================

      if (interaction.commandName === "auto-panel") {

        const isAdmin =
          interaction.member.permissions.has(
            PermissionsBitField.Flags.Administrator
          );

        if (
          interaction.user.id !== OWNER_ID &&
          !isAdmin
        ) {

          return interaction.reply({
            content:
              "ليس لديك صلاحية استخدام هذا الأمر.",
            ephemeral: true
          });

        }

        if (!interaction.channel) {
          return interaction.reply({
            content: "لا يمكن إرسال الـ Panel هنا.",
            ephemeral: true
          });
        }

        await interaction.channel.send({
          embeds: [
            createPanelEmbed()
          ],
          components: [
            createPanelButtons()
          ]
        });

        return interaction.reply({
          content:
            "تم إرسال Panel بنجاح.",
          ephemeral: true
        });
      }

      // ==================================================
      // AUTO SETUP
      // ==================================================

      if (interaction.commandName === "auto-setup") {

        if (interaction.user.id !== OWNER_ID) {

          return interaction.reply({
            content:
              "هذا الأمر للـ Owner فقط.",
            ephemeral: true
          });

        }

        const channels =
          interaction.guild.channels.cache
            .filter(channel =>
              channel.type === ChannelType.GuildText
            )
            .sort(
              (a, b) =>
                a.position - b.position
            );

        if (channels.size === 0) {

          return interaction.reply({
            content:
              "لا توجد قنوات نصية.",
            ephemeral: true
          });

        }

        const options = channels
          .map(channel => ({
            label: channel.name.slice(0, 100),
            value: channel.id,
            description:
              "السماح بالنشر في هذه القناة"
          }))
          .slice(0, 25);

        const menu =
          new StringSelectMenuBuilder()
            .setCustomId(
              "owner_exchange_channels"
            )
            .setPlaceholder(
              "اختر قنوات التبادل"
            )
            .setMinValues(1)
            .setMaxValues(
              options.length
            )
            .addOptions(options);

        const row =
          new ActionRowBuilder()
            .addComponents(menu);

        const settings =
          getGuildSettings(
            interaction.guild.id
          );

        let currentText =
          "لا توجد قنوات محفوظة حاليا.";

        if (
          settings.exchangeChannels.length > 0
        ) {

          currentText =
            settings.exchangeChannels
              .map(id =>
                `<#${id}>`
              )
              .join("\n");

        }

        const embed =
          new EmbedBuilder()
            .setTitle(
              "Auto Exchange Setup"
            )
            .setDescription(
              "اختر القنوات التي تريد السماح للأعضاء باستخدامها.\n\n" +
              "القنوات التي لا تختارها لن تظهر للأعضاء.\n\n" +
              "**القنوات الحالية:**\n" +
              currentText
            )
            .setColor(0xfee75c);

        return interaction.reply({
          embeds: [embed],
          components: [row],
          ephemeral: true
        });

      }

    }

    // ==================================================
    // OWNER CHANNEL SELECT
    // ==================================================

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId ===
        "owner_exchange_channels"
    ) {

      if (
        interaction.user.id !== OWNER_ID
      ) {

        return interaction.reply({
          content:
            "Owner فقط.",
          ephemeral: true
        });

      }

      const settings =
        getGuildSettings(
          interaction.guild.id
        );

      settings.exchangeChannels =
        interaction.values;

      saveData();

      const channelsText =
        interaction.values
          .map(id =>
            `<#${id}>`
          )
          .join("\n");

      return interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle(
              "تم حفظ قنوات التبادل"
            )
            .setDescription(
              "القنوات المسموح بها:\n\n" +
              channelsText
            )
            .setColor(0x57f287)
        ],
        components: []
      });

    }

    // ==================================================
    // START BUTTON
    // ==================================================

    if (
      interaction.isButton() &&
      interaction.customId ===
        "exchange_start"
    ) {

      if (
        !isAllowed(
          interaction.member
        )
      ) {

        return interaction.reply({
          content:
            "ليس لديك صلاحية استخدام Auto Exchange.",
          ephemeral: true
        });

      }

      const settings =
        getGuildSettings(
          interaction.guild.id
        );

      if (
        settings.exchangeChannels.length === 0
      ) {

        return interaction.reply({
          content:
            "Owner لم يحدد قنوات التبادل بعد.",
          ephemeral: true
        });

      }

      const validChannels =
        settings.exchangeChannels
          .map(id =>
            interaction.guild.channels.cache.get(id)
          )
          .filter(channel =>
            channel &&
            channel.type === ChannelType.GuildText
          );

      if (
        validChannels.length === 0
      ) {

        return interaction.reply({
          content:
            "لا توجد قنوات تبادل متاحة حاليا.",
          ephemeral: true
        });

      }

      const options =
        validChannels
          .slice(0, 25)
          .map(channel => ({
            label:
              channel.name.slice(0, 100),

            value:
              channel.id,

            description:
              `النشر في #${channel.name}`.slice(0, 100)
          }));

      const menu =
        new StringSelectMenuBuilder()
          .setCustomId(
            "member_exchange_channel"
          )
          .setPlaceholder(
            "اختر قناة التبادل"
          )
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(options);

      const row =
        new ActionRowBuilder()
          .addComponents(menu);

      return interaction.reply({
        content:
          "اختر قناة التبادل التي تريد النشر فيها:",
        components: [row],
        ephemeral: true
      });

    }

    // ==================================================
    // MEMBER CHANNEL SELECT
    // ==================================================

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId ===
        "member_exchange_channel"
    ) {

      if (
        !isAllowed(
          interaction.member
        )
      ) {

        return interaction.update({
          content:
            "ليس لديك صلاحية.",
          components: []
        });

      }

      const settings =
        getGuildSettings(
          interaction.guild.id
        );

      const channelId =
        interaction.values[0];

      if (
        !settings.exchangeChannels.includes(
          channelId
        )
      ) {

        return interaction.update({
          content:
            "هذه القناة غير مسموح بها.",
          components: []
        });

      }

      const userData =
        getUserData(
          interaction.guild.id,
          interaction.user.id
        );

      userData.channelId =
        channelId;

      userData.waitingForPost =
        true;

      userData.active =
        false;

      userData.content =
        "";

      userData.attachments =
        [];

      userData.lastPostedAt =
        0;

      saveData();

      try {

        await interaction.user.send(
          "تم اختيار قناة التبادل بنجاح.\n\n" +
          "أرسل الآن منشورك هنا.\n\n" +
          "يمكنك إرسال:\n" +
          "• نص فقط\n" +
          "• صورة فقط\n" +
          "• نص + صورة\n" +
          "• ملف أو مرفق\n\n" +
          "سيتم نشر المنشور تلقائيا."
        );

      } catch (error) {

        userData.waitingForPost =
          false;

        saveData();

        return interaction.update({
          content:
            "لا أستطيع إرسال رسالة خاصة لك.\n" +
            "افتح Direct Messages من إعدادات Discord.",
          components: []
        });

      }

      return interaction.update({
        content:
          "تم اختيار القناة.\n" +
          "أرسلت لك رسالة في الخاص.\n\n" +
          "أرسل المنشور هناك.",
        components: []
      });

    }

    // ==================================================
    // STOP BUTTON
    // ==================================================

    if (
      interaction.isButton() &&
      interaction.customId ===
        "exchange_stop"
    ) {

      if (
        !isAllowed(
          interaction.member
        )
      ) {

        return interaction.reply({
          content:
            "ليس لديك صلاحية استخدام Auto Exchange.",
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
            "لا يوجد تبادل نشط حاليا.",
          ephemeral: true
        });

      }

      resetUserExchange(
        interaction.guild.id,
        interaction.user.id
      );

      return interaction.reply({
        content:
          "تم إيقاف التبادل وحذف البيانات الحالية.",
        ephemeral: true
      });

    }

    // ==================================================
    // STATUS BUTTON
    // ==================================================

    if (
      interaction.isButton() &&
      interaction.customId ===
        "exchange_status"
    ) {

      if (
        !isAllowed(
          interaction.member
        )
      ) {

        return interaction.reply({
          content:
            "ليس لديك صلاحية استخدام Auto Exchange.",
          ephemeral: true
        });

      }

      const userData =
        getUserData(
          interaction.guild.id,
          interaction.user.id
        );

      // Active
      if (userData.active) {

        const channel =
          interaction.guild.channels.cache.get(
            userData.channelId
          );

        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                "حالة التبادل"
              )
              .setDescription(
                "الحالة: 🟢 نشط\n\n" +
                `القناة: ${
                  channel
                    ? `<#${channel.id}>`
                    : "غير موجودة"
                }\n` +
                `النشر كل ${config.postIntervalMinutes} دقائق`
              )
              .setColor(0x57f287)
          ],
          ephemeral: true
        });

      }

      // Waiting
      if (
        userData.waitingForPost
      ) {

        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                "حالة التبادل"
              )
              .setDescription(
                "الحالة: 🟡 في انتظار المنشور\n\n" +
                "راجع الخاص وأرسل المنشور."
              )
              .setColor(0xfee75c)
          ],
          ephemeral: true
        });

      }

      // Inactive
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(
              "حالة التبادل"
            )
            .setDescription(
              "الحالة: 🔴 غير نشط\n\n" +
              "اضغط بدء التبادل للبدء."
            )
            .setColor(0xed4245)
        ],
        ephemeral: true
      });

    }

  } catch (error) {

    console.error(
      "Interaction error:",
      error
    );

    try {

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {

        await interaction.reply({
          content:
            "حدث خطأ غير متوقع.",
          ephemeral: true
        });

      }

    } catch {}

  }

});

// ==================================================
// DM POST RECEIVER
// ==================================================

client.on(
  "messageCreate",
  async message => {

    try {

      // تجاهل البوتات
      if (message.author.bot) {
        return;
      }

      // نريد الخاص فقط
      if (
        message.channel.type !==
        ChannelType.DM
      ) {
        return;
      }

      if (!data.users) {
        return;
      }

      // ==================================================
      // FIND WAITING USER
      // ==================================================

      const userEntries =
        Object.entries(data.users)
          .filter(
            ([, userData]) =>
              userData.userId ===
                message.author.id &&
              userData.waitingForPost === true
          );

      if (
        userEntries.length === 0
      ) {
        return;
      }

      // نستخدم أحدث عملية
      const [key, userData] =
        userEntries[userEntries.length - 1];

      if (!userData.channelId) {
        return message.reply(
          "لم يتم تحديد قناة للتبادل."
        );
      }

      // ==================================================
      // FIND TARGET CHANNEL
      // ==================================================

      let targetChannel = null;
      let targetGuild = null;

      for (
        const guild of client.guilds.cache.values()
      ) {

        const channel =
          guild.channels.cache.get(
            userData.channelId
          );

        if (channel) {

          targetChannel =
            channel;

          targetGuild =
            guild;

          break;
        }

      }

      if (
        !targetChannel ||
        !targetGuild
      ) {

        return message.reply(
          "قناة التبادل لم تعد موجودة."
        );

      }

      if (
        targetChannel.type !==
        ChannelType.GuildText
      ) {

        return message.reply(
          "القناة المحددة ليست قناة نصية."
        );

      }

      // ==================================================
      // ATTACHMENTS
      // ==================================================

      const attachments =
        [...message.attachments.values()]
          .map(
            attachment => attachment.url
          );

      if (
        !message.content &&
        attachments.length === 0
      ) {

        return message.reply(
          "أرسل نصا أو صورة أو ملفا."
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

      userData.active =
        true;

      userData.lastPostedAt =
        0;

      saveData();

      // ==================================================
      // FIRST POST
      // ==================================================

      const success =
        await publishPost(
          key
        );

      if (!success) {

        userData.active =
          false;

        saveData();

        return message.reply(
          "حدث خطأ أثناء نشر المنشور."
        );

      }

      await message.reply(
        "تم استلام المنشور ونشره الآن.\n\n" +
        `سيتم إعادة نشره كل ${config.postIntervalMinutes} دقائق.\n\n` +
        "لإيقاف التبادل استخدم زر إيقاف التبادل من الـ Panel."
      );

    } catch (error) {

      console.error(
        "DM error:",
        error
      );

      try {

        await message.reply(
          "حدث خطأ أثناء معالجة المنشور."
        );

      } catch {}

    }

  }
);

// ==================================================
// PUBLISH POST
// ==================================================

async function publishPost(userKey) {

  if (
    !data.users ||
    !data.users[userKey]
  ) {
    return false;
  }

  const userData =
    data.users[userKey];

  if (!userData.active) {
    return false;
  }

  if (!userData.channelId) {
    return false;
  }

  // منع التكرار
  if (publishingUsers.has(userKey)) {
    return false;
  }

  publishingUsers.add(userKey);

  try {

    // ==================================================
    // FIND CHANNEL
    // ==================================================

    let channel = null;

    for (
      const guild of client.guilds.cache.values()
    ) {

      const found =
        guild.channels.cache.get(
          userData.channelId
        );

      if (found) {

        channel =
          found;

        break;
      }

    }

    if (!channel) {
      return false;
    }

    if (
      channel.type !==
      ChannelType.GuildText
    ) {
      return false;
    }

    // ==================================================
    // CREATE PAYLOAD
    // ==================================================

    const payload = {};

    if (
      userData.content &&
      userData.content.trim().length > 0
    ) {

      payload.content =
        userData.content;

    }

    if (
      Array.isArray(
        userData.attachments
      ) &&
      userData.attachments.length > 0
    ) {

      payload.files =
        userData.attachments;

    }

    if (
      !payload.content &&
      !payload.files
    ) {

      return false;

    }

    // ==================================================
    // SEND
    // ==================================================

    await channel.send(
      payload
    );

    userData.lastPostedAt =
      Date.now();

    saveData();

    console.log(
      `Post published for user ${userData.userId}`
    );

    return true;

  } catch (error) {

    console.error(
      "Publish error:",
      error
    );

    return false;

  } finally {

    publishingUsers.delete(userKey);

  }

}

// ==================================================
// AUTO POST CHECKER
// ==================================================

setInterval(
  async () => {

    try {

      if (!data.users) {
        return;
      }

      const now =
        Date.now();

      for (
        const [userKey, userData]
        of Object.entries(data.users)
      ) {

        if (
          !userData.active
        ) {
          continue;
        }

        if (
          !userData.lastPostedAt
        ) {
          continue;
        }

        const elapsed =
          now -
          userData.lastPostedAt;

        if (
          elapsed >=
          INTERVAL_MS
        ) {

          await publishPost(
            userKey
          );

        }

      }

    } catch (error) {

      console.error(
        "Auto post checker error:",
        error
      );

    }

  },
  30 * 1000
);

// ==================================================
// PROCESS ERROR HANDLERS
// ==================================================

process.on(
  "unhandledRejection",
  error => {
    console.error(
      "Unhandled Promise Rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  error => {
    console.error(
      "Uncaught Exception:",
      error
    );
  }
);

// ==================================================
// LOGIN
// ==================================================

if (
  !process.env.TOKEN
) {

  console.error(
    "TOKEN is missing from Railway Variables."
  );

  process.exit(1);

}

client.login(
  process.env.TOKEN
);
