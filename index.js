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
// IS ADMIN
// ==================================================

function isAdminMember(
  member
) {

  if (!member) {
    return false;
  }

  if (
    member.permissions.has(
      PermissionsBitField.Flags.Administrator
    )
  ) {
    return true;
  }

  return false;
}

// ==================================================
// IS BOT OWNER
// ==================================================

async function isBotOwner(
  userId
) {

  // config owner
  if (
    CONFIG_OWNER_ID &&
    userId === CONFIG_OWNER_ID
  ) {
    return true;
  }

  // Discord Application Owner
  try {

    const application =
      await client.application.fetch();

    if (
      application.owner &&
      application.owner.id === userId
    ) {
      return true;
    }

  } catch (error) {

    console.log(
      "Could not fetch application owner."
    );

  }

  return false;
}

// ==================================================
// CAN USE AUTO
// ==================================================

async function canUseAuto(
  member
) {

  if (!member) {
    return false;
  }

  // Owner
  if (
    await isBotOwner(member.id)
  ) {
    return true;
  }

  // Administrator
  if (
    config.allowAdministrators === true &&
    isAdminMember(member)
  ) {
    return true;
  }

  // Allowed roles
  if (
    ALLOWED_ROLES.some(
      roleId =>
        member.roles.cache.has(
          roleId
        )
    )
  ) {
    return true;
  }

  // Boosters
  if (
    config.allowBoosters === true
  ) {

    const boosts =
      Number(
        member.guild
          .premiumSubscriptionCount || 0
      );

    if (boosts >= 2) {
      return true;
    }

  }

  return false;
}

// ==================================================
// CAN CONTROL SETTINGS
// ==================================================

async function canControlSettings(
  member
) {

  if (!member) {
    return false;
  }

  if (
    await isBotOwner(member.id)
  ) {
    return true;
  }

  if (
    isAdminMember(member)
  ) {
    return true;
  }

  return false;
}

// ==================================================
// PANEL EMBED
// ==================================================

function createPanelEmbed() {

  return new EmbedBuilder()

    .setTitle(
      "🔄 Auto Exchange"
    )

    .setDescription(

      "استخدم الأزرار الموجودة بالأسفل.\n\n" +

      "🚀 **إنشاء منشور**\n" +
      "ابدأ تبادل تلقائي جديد.\n\n" +

      "🛑 **إيقاف المنشور**\n" +
      "إيقاف التبادل الخاص بك.\n\n" +

      "📊 **حالة التبادل**\n" +
      "عرض حالة التبادل الحالية.\n\n" +

      `⏱️ **مدة إعادة النشر:** ${postIntervalMinutes} دقيقة`

    )

    .setColor(0x5865F2);

}

// ==================================================
// NORMAL PANEL BUTTONS
// ==================================================

function createNormalButtons() {

  return new ActionRowBuilder()
    .addComponents(

      new ButtonBuilder()
        .setCustomId(
          "exchange_start"
        )
        .setLabel(
          "إنشاء منشور"
        )
        .setEmoji("📝")
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          "exchange_stop"
        )
        .setLabel(
          "إيقاف المنشور"
        )
        .setEmoji("🛑")
        .setStyle(
          ButtonStyle.Danger
        ),

      new ButtonBuilder()
        .setCustomId(
          "exchange_status"
        )
        .setLabel(
          "حالة التبادل"
        )
        .setEmoji("📊")
        .setStyle(
          ButtonStyle.Primary
        )

    );

}

// ==================================================
// ADMIN PANEL BUTTONS
// ==================================================

function createAdminButtons() {

  return new ActionRowBuilder()
    .addComponents(

      new ButtonBuilder()
        .setCustomId(
          "exchange_start"
        )
        .setLabel(
          "إنشاء منشور"
        )
        .setEmoji("📝")
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          "exchange_stop"
        )
        .setLabel(
          "إيقاف المنشور"
        )
        .setEmoji("🛑")
        .setStyle(
          ButtonStyle.Danger
        ),

      new ButtonBuilder()
        .setCustomId(
          "exchange_status"
        )
        .setLabel(
          "الحالة"
        )
        .setEmoji("📊")
        .setStyle(
          ButtonStyle.Primary
        )

    );

}

// ==================================================
// ADMIN TIME BUTTONS
// ==================================================

function createAdminTimeButtons() {

  return new ActionRowBuilder()
    .addComponents(

      new ButtonBuilder()
        .setCustomId(
          "time_decrease"
        )
        .setLabel(
          "تقليل المدة"
        )
        .setEmoji("➖")
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "time_increase"
        )
        .setLabel(
          "زيادة المدة"
        )
        .setEmoji("➕")
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "time_set"
        )
        .setLabel(
          "تحديد المدة"
        )
        .setEmoji("⏱️")
        .setStyle(
          ButtonStyle.Primary
        )

    );

}

// ==================================================
// FULL PANEL
// ==================================================

function createFullPanel() {

  return {

    embeds: [
      createPanelEmbed()
    ],

    components: [

      createNormalButtons(),

      createAdminTimeButtons()

    ]

  };

}

// ==================================================
// SLASH COMMANDS
// ==================================================

const commands = [

  {
    name: "auto",
    description:
      "فتح لوحة Auto Exchange"
  },

  {
    name: "auto-panel",
    description:
      "إرسال لوحة Auto Exchange"
  },

  {
    name: "auto-setup",
    description:
      "اختيار رومات التبادل"
  },

  {
    name: "auto-time",
    description:
      "تحديد مدة إعادة النشر"
  }

];

// ==================================================
// READY
// ==================================================

client.once(
  "ready",
  async () => {

    console.log(
      "================================"
    );

    console.log(
      `Logged in as ${client.user.tag}`
    );

    console.log(
      `Bot ID: ${client.user.id}`
    );

    console.log(
      `Current interval: ${postIntervalMinutes} minutes`
    );

    console.log(
      "================================"
    );

    try {

      const rest =
        new REST({
          version: "10"
        })
          .setToken(
            process.env.TOKEN
          );

      await rest.put(

        Routes.applicationCommands(
          client.user.id
        ),

        {
          body: commands
        }

      );

      console.log(
        "Slash commands registered."
      );

    } catch (error) {

      console.error(
        "Command registration error:",
        error
      );

    }

    console.log(
      "Auto Exchange is ONLINE."
    );

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

          const allowed =
            await canUseAuto(
              interaction.member
            );

          if (!allowed) {

            return interaction.reply({

              content:
                "❌ ليس لديك صلاحية استخدام Auto Exchange.",

              ephemeral: true

            });

          }

          return interaction.reply({

            ...createFullPanel(),

            ephemeral: true

          });

        }

        // ==================================================
        // /auto-panel
        // ==================================================

        if (
          interaction.commandName ===
          "auto-panel"
        ) {

          const allowed =
            await canUseAuto(
              interaction.member
            );

          if (!allowed) {

            return interaction.reply({

              content:
                "❌ ليس لديك صلاحية.",

              ephemeral: true

            });

          }

          await interaction.channel.send(
            createFullPanel()
          );

          return interaction.reply({

            content:
              "✅ تم إرسال لوحة Auto Exchange.",

            ephemeral: true

          });

        }

        // ==================================================
        // /auto-setup
        // ==================================================

        if (
          interaction.commandName ===
          "auto-setup"
        ) {

          const allowed =
            await canControlSettings(
              interaction.member
            );

          if (!allowed) {

            return interaction.reply({

              content:
                "❌ هذا الأمر للأدمن والـOwner فقط.",

              ephemeral: true

            });

          }

          const channels =
            interaction.guild.channels.cache

              .filter(
                channel =>
                  channel.type ===
                  ChannelType.GuildText
              )

              .sort(
                (a, b) =>
                  a.position -
                  b.position
              );

          if (
            channels.size === 0
          ) {

            return interaction.reply({

              content:
                "❌ لا توجد رومات نصية.",

              ephemeral: true

            });

          }

          const options =
            channels

              .map(
                channel => ({

                  label:
                    channel.name
                      .slice(0, 100),

                  value:
                    channel.id,

                  description:
                    `اختيار #${channel.name}`
                      .slice(0, 100)

                })
              )

              .slice(0, 25);

          const menu =
            new StringSelectMenuBuilder()

              .setCustomId(
                "owner_exchange_channels"
              )

              .setPlaceholder(
                "اختر رومات التبادل"
              )

              .setMinValues(1)

              .setMaxValues(
                options.length
              )

              .addOptions(
                options
              );

          const row =
            new ActionRowBuilder()
              .addComponents(
                menu
              );

          const settings =
            getGuildSettings(
              interaction.guild.id
            );

          let current =
            "لا توجد رومات محفوظة.";

          if (
            settings.exchangeChannels
              .length > 0
          ) {

            current =
              settings.exchangeChannels
                .map(
                  id =>
                    `<#${id}>`
                )
                .join("\n");

          }

          const embed =
            new EmbedBuilder()

              .setTitle(
                "⚙️ Auto Exchange Setup"
              )

              .setDescription(

                "اختار الرومات من القائمة فقط.\n" +
                "مفيش أي كتابة مطلوبة.\n\n" +

                "الرومات الحالية:\n" +
                current

              )

              .setColor(
                0x5865F2
              );

          return interaction.reply({

            embeds: [
              embed
            ],

            components: [
              row
            ],

            ephemeral: true

          });

        }

        // ==================================================
        // /auto-time
        // ==================================================

        if (
          interaction.commandName ===
          "auto-time"
        ) {

          const allowed =
            await canControlSettings(
              interaction.member
            );

          if (!allowed) {

            return interaction.reply({

              content:
                "❌ الأدمن والـOwner فقط يمكنهم تغيير المدة.",

              ephemeral: true

            });

          }

          const minutes =
            interaction.options.getInteger(
              "minutes"
            );

          // الأمر لن يحتوي option تلقائياً،
          // لذلك نفتح Modal بدلاً منه.
          const modal =
            new ModalBuilder()

              .setCustomId(
                "set_time_modal"
              )

              .setTitle(
                "تحديد مدة إعادة النشر"
              );

          const input =
            new TextInputBuilder()

              .setCustomId(
                "time_input"
              )

              .setLabel(
                "اكتب المدة بالدقائق"
              )

              .setPlaceholder(
                "مثال: 5"
              )

              .setStyle(
                TextInputStyle.Short
              )

              .setRequired(true)

              .setMinLength(1)

              .setMaxLength(5);

          const row =
            new ActionRowBuilder()
              .addComponents(
                input
              );

          modal.addComponents(
            row
          );

          return interaction.showModal(
            modal
          );

        }

        return;

      }

      // ==================================================
      // CHANNEL SELECT
      // ==================================================

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId ===
          "owner_exchange_channels"
      ) {

        const allowed =
          await canControlSettings(
            interaction.member
          );

        if (!allowed) {

          return interaction.reply({

            content:
              "❌ لا يمكنك تعديل إعدادات الرومات.",

            ephemeral: true

          });

        }

        const settings =
          getGuildSettings(
            interaction.guild.id
          );

        settings.exchangeChannels =
          [...interaction.values];

        saveData();

        const text =
          interaction.values
            .map(
              id =>
                `<#${id}>`
            )
            .join("\n");

        return interaction.update({

          embeds: [

            new EmbedBuilder()

              .setTitle(
                "✅ تم حفظ الرومات"
              )

              .setDescription(
                "الرومات التي تم اختيارها:\n\n" +
                text
              )

              .setColor(
                0x57F287
              )

          ],

          components: []

        });

      }

      // ==================================================
      // START EXCHANGE
      // ==================================================

      if (
        interaction.isButton() &&
        interaction.customId ===
          "exchange_start"
      ) {

        const allowed =
          await canUseAuto(
            interaction.member
          );

        if (!allowed) {

          return interaction.reply({

            content:
              "❌ ليس لديك صلاحية استخدام Auto Exchange.",

            ephemeral: true

          });

        }

        const settings =
          getGuildSettings(
            interaction.guild.id
          );

        if (
          settings.exchangeChannels
            .length === 0
        ) {

          return interaction.reply({

            content:
              "❌ لم يتم تحديد رومات التبادل بعد.\nاستخدم `/auto-setup` أولاً.",

            ephemeral: true

          });

        }

        const validChannels =
          settings.exchangeChannels

            .map(
              id =>
                interaction.guild
                  .channels.cache.get(id)
            )

            .filter(
              channel =>
                channel &&
                channel.type ===
                  ChannelType.GuildText
            );

        if (
          validChannels.length === 0
        ) {

          return interaction.reply({

            content:
              "❌ الرومات المحددة غير موجودة.",

            ephemeral: true

          });

        }

        const options =
          validChannels
            .slice(0, 25)
            .map(
              channel => ({

                label:
                  channel.name
                    .slice(0, 100),

                value:
                  channel.id,

                description:
                  `النشر في #${channel.name}`
                    .slice(0, 100)

              })
            );

        const menu =
          new StringSelectMenuBuilder()

            .setCustomId(
              "member_exchange_channel"
            )

            .setPlaceholder(
              "📂 اختر مكان المنشور"
            )

            .setMinValues(1)

            .setMaxValues(1)

            .addOptions(
              options
            );

        const row =
          new ActionRowBuilder()
            .addComponents(
              menu
            );

        return interaction.reply({

          content:
            "📝 **إنشاء منشور**\n\n" +
            "اختار مكان المنشور من القائمة:",

          components: [
            row
          ],

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

        const allowed =
          await canUseAuto(
            interaction.member
          );

        if (!allowed) {

          return interaction.update({

            content:
              "❌ ليس لديك صلاحية.",

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
          !settings.exchangeChannels
            .includes(channelId)
        ) {

          return interaction.update({

            content:
              "❌ هذه الروم غير مسموح بها.",

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

        userData.waitingSince =
          Date.now();

        userData.active =
          false;

        userData.content =
          "";

        userData.attachments =
          [];

        userData.lastPostedAt =
          0;

        saveData();

        // ==================================================
        // SEND DM
        // ==================================================

        try {

          await interaction.user.send(

            "📝 **إنشاء منشور جديد**\n\n" +

            "تم اختيار مكان المنشور بنجاح.\n\n" +

            "📩 أرسل الآن المنشور هنا في الخاص.\n\n" +

            "يمكنك إرسال:\n" +

            "• نص\n" +
            "• صورة\n" +
            "• فيديو\n" +
            "• ملف\n" +
            "• نص + صورة\n\n" +

            "وسيتم نشره تلقائياً."

          );

        } catch (error) {

          resetUserExchange(
            interaction.guild.id,
            interaction.user.id
          );

          return interaction.update({

            content:
              "❌ لا أستطيع إرسال رسالة خاصة لك.\n" +
              "افتح الـDMs وحاول مرة أخرى.",

            components: []

          });

        }

        return interaction.update({

          content:
            "✅ تم اختيار المكان.\n\n" +
            "📩 راجع الخاص وأرسل المنشور هناك.",

          components: []

        });

      }

      // ==================================================
      // STOP
      // ==================================================

      if (
        interaction.isButton() &&
        interaction.customId ===
          "exchange_stop"
      ) {

        const allowed =
          await canUseAuto(
            interaction.member
          );

        if (!allowed) {

          return interaction.reply({

            content:
              "❌ ليس لديك صلاحية.",

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
              "ℹ️ لا يوجد منشور نشط لديك.",

            ephemeral: true

          });

        }

        resetUserExchange(
          interaction.guild.id,
          interaction.user.id
        );

        return interaction.reply({

          content:
            "🛑 تم إيقاف التبادل الخاص بك.",

          ephemeral: true

        });

      }

      // ==================================================
      // STATUS
      // ==================================================

      if (
        interaction.isButton() &&
        interaction.customId ===
          "exchange_status"
      ) {

        const allowed =
          await canUseAuto(
            interaction.member
          );

        if (!allowed) {

          return interaction.reply({

            content:
              "❌ ليس لديك صلاحية.",

            ephemeral: true

          });

        }

        const userData =
          getUserData(
            interaction.guild.id,
            interaction.user.id
          );

        if (
          userData.active
        ) {

          const channel =
            interaction.guild
              .channels.cache.get(
                userData.channelId
              );

          return interaction.reply({

            embeds: [

              new EmbedBuilder()

                .setTitle(
                  "📊 حالة التبادل"
                )

                .setDescription(

                  "الحالة: 🟢 **نشط**\n\n" +

                  `الروم: ${
                    channel
                      ? `<#${channel.id}>`
                      : "غير موجودة"
                  }\n\n` +

                  `⏱️ المدة: ${postIntervalMinutes} دقيقة`

                )

                .setColor(
                  0x57F287
                )

            ],

            ephemeral: true

          });

        }

        if (
          userData.waitingForPost
        ) {

          return interaction.reply({

            embeds: [

              new EmbedBuilder()

                .setTitle(
                  "📊 حالة التبادل"
                )

                .setDescription(
                  "الحالة: 🟡 **في انتظار المنشور**\n\n" +
                  "راجع الخاص وأرسل المنشور."
                )

                .setColor(
                  0xFEE75C
                )

            ],

            ephemeral: true

          });

        }

        return interaction.reply({

          embeds: [

            new EmbedBuilder()

              .setTitle(
                "📊 حالة التبادل"
              )

              .setDescription(
                "الحالة: 🔴 **غير نشط**"
              )

              .setColor(
                0xED4245
              )

          ],

          ephemeral: true

        });

      }

      // ==================================================
      // DECREASE TIME
      // ==================================================

      if (
        interaction.isButton() &&
        interaction.customId ===
          "time_decrease"
      ) {

        const allowed =
          await canControlSettings(
            interaction.member
          );

        if (!allowed) {

          return interaction.reply({

            content:
              "❌ الأدمن والـOwner فقط.",

            ephemeral: true

          });

        }

        if (
          postIntervalMinutes <= 1
        ) {

          return interaction.reply({

            content:
              "⚠️ أقل مدة مسموحة هي دقيقة واحدة.",

            ephemeral: true

          });

        }

        postIntervalMinutes--;

        saveInterval();

        return interaction.reply({

          content:
            `➖ تم تقليل المدة إلى **${postIntervalMinutes} دقيقة**.`,

          ephemeral: true

        });

      }

      // ==================================================
      // INCREASE TIME
      // ==================================================

      if (
        interaction.isButton() &&
        interaction.customId ===
          "time_increase"
      ) {

        const allowed =
          await canControlSettings(
            interaction.member
          );

        if (!allowed) {

          return interaction.reply({

            content:
              "❌ الأدمن والـOwner فقط.",

            ephemeral: true

          });

        }

        postIntervalMinutes++;

        saveInterval();

        return interaction.reply({

          content:
            `➕ تم زيادة المدة إلى **${postIntervalMinutes} دقيقة**.`,

          ephemeral: true

        });

      }

      // ==================================================
      // SET TIME BUTTON
      // ==================================================

      if (
        interaction.isButton() &&
        interaction.customId ===
          "time_set"
      ) {

        const allowed =
          await canControlSettings(
            interaction.member
          );

        if (!allowed) {

          return interaction.reply({

            content:
              "❌ الأدمن والـOwner فقط.",

            ephemeral: true

          });

        }

        const modal =
          new ModalBuilder()

            .setCustomId(
              "set_time_modal"
            )

            .setTitle(
              "⏱️ تحديد مدة إعادة النشر"
            );

        const input =
          new TextInputBuilder()

            .setCustomId(
              "time_input"
            )

            .setLabel(
              "المدة بالدقائق"
            )

            .setPlaceholder(
              "مثال: 5"
            )

            .setStyle(
              TextInputStyle.Short
            )

            .setRequired(true)

            .setMinLength(1)

            .setMaxLength(5);

        const row =
          new ActionRowBuilder()
            .addComponents(
              input
            );

        modal.addComponents(
          row
        );

        return interaction.showModal(
          modal
        );

      }

      // ==================================================
      // MODAL
      // ==================================================

      if (
        interaction.isModalSubmit() &&
        interaction.customId ===
          "set_time_modal"
      ) {

        const allowed =
          await canControlSettings(
            interaction.member
          );

        if (!allowed) {

          return interaction.reply({

            content:
              "❌ الأدمن والـOwner فقط.",

            ephemeral: true

          });

        }

        const value =
          interaction.fields
            .getTextInputValue(
              "time_input"
            );

        const minutes =
          Number(value);

        if (
          !Number.isInteger(
            minutes
          ) ||
          minutes < 1 ||
          minutes > 10080
        ) {

          return interaction.reply({

            content:
              "❌ اكتب رقم صحيح من 1 إلى 10080 دقيقة.",

            ephemeral: true

          });

        }

        postIntervalMinutes =
          minutes;

        saveInterval();

        return interaction.reply({

          content:
            `✅ تم تغيير مدة إعادة النشر إلى **${postIntervalMinutes} دقيقة**.`,

          ephemeral: true

        });

      }

    } catch (error) {

      console.error(
        "Interaction Error:",
        error
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
// SAVE INTERVAL
// ==================================================

function saveInterval() {

  config.postIntervalMinutes =
    postIntervalMinutes;

  try {

    fs.writeFileSync(

      path.join(
        __dirname,
        "config.json"
      ),

      JSON.stringify(
        config,
        null,
        2
      ),

      "utf8"

    );

  } catch (error) {

    console.error(
      "Could not save config:",
      error
    );

  }

}

// ==================================================
// DM RECEIVER
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
        message.channel.type !==
        ChannelType.DM
      ) {
        return;
      }

      if (
        !data.users
      ) {
        return;
      }

      // ==================================================
      // FIND WAITING USER
      // ==================================================

      const entries =
        Object.entries(
          data.users
        )

          .filter(
            ([, user]) =>
              user.userId ===
                message.author.id &&
              user.waitingForPost ===
                true
          )

          .sort(
            ([, a], [, b]) =>
              Number(
                b.waitingSince || 0
              ) -
              Number(
                a.waitingSince || 0
              )
          );

      if (
        entries.length === 0
      ) {
        return;
      }

      const [
        key,
        userData
      ] = entries[0];

      if (
        !userData.channelId
      ) {

        return message.reply(
          "❌ لم يتم تحديد مكان المنشور."
        );

      }

      // ==================================================
      // FIND CHANNEL
      // ==================================================

      let targetChannel =
        null;

      for (
        const guild of
          client.guilds.cache.values()
      ) {

        const channel =
          guild.channels.cache.get(
            userData.channelId
          );

        if (channel) {

          targetChannel =
            channel;

          break;

        }

      }

      if (
        !targetChannel
      ) {

        return message.reply(
          "❌ الروم لم تعد موجودة."
        );

      }

      if (
        targetChannel.type !==
        ChannelType.GuildText
      ) {

        return message.reply(
          "❌ الروم ليست روم نصية."
        );

      }

      // ==================================================
      // CONTENT
      // ==================================================

      const attachments =
        [
          ...message.attachments.values()
        ].map(
          attachment =>
            attachment.url
        );

      if (
        !message.content &&
        attachments.length === 0
      ) {

        return message.reply(
          "❌ أرسل نصاً أو صورة أو ملفاً."
        );

      }

      // ==================================================
      // SAVE
      // ==================================================

      userData.content =
        message.content || "";

      userData.attachments =
        attachments;

      userData.waitingForPost =
        false;

      userData.waitingSince =
        0;

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

          "❌ حصل خطأ أثناء نشر المنشور.\n" +
          "تأكد أن البوت لديه صلاحية Send Messages و Attach Files."

        );

      }

      await message.reply(

        "✅ **تم إنشاء المنشور بنجاح!**\n\n" +

        `⏱️ سيتم إعادة نشره كل **${postIntervalMinutes} دقيقة**.\n\n` +

        "🛑 لإيقافه اضغط **إيقاف المنشور** من الـPanel."

      );

    } catch (error) {

      console.error(
        "DM Error:",
        error
      );

      try {

        await message.reply(
          "❌ حدث خطأ أثناء معالجة المنشور."
        );

      } catch {}

    }

  }
);

// ==================================================
// PUBLISH POST
// ==================================================

async function publishPost(
  userKey
) {

  if (
    !data.users[userKey]
  ) {
    return false;
  }

  const userData =
    data.users[userKey];

  if (
    !userData.active
  ) {
    return false;
  }

  if (
    !userData.channelId
  ) {
    return false;
  }

  if (
    publishingUsers.has(
      userKey
    )
  ) {
    return false;
  }

  publishingUsers.add(
    userKey
  );

  try {

    let channel =
      null;

    for (
      const guild of
        client.guilds.cache.values()
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

    const payload = {};

    if (
      userData.content &&
      userData.content.trim()
    ) {

      payload.content =
        userData.content;

    }

    if (
      Array.isArray(
        userData.attachments
      ) &&
      userData.attachments.length
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

    await channel.send(
      payload
    );

    userData.lastPostedAt =
      Date.now();

    saveData();

    console.log(
      `Post published for ${userData.userId}`
    );

    return true;

  } catch (error) {

    console.error(
      "Publish Error:",
      error
    );

    return false;

  } finally {

    publishingUsers.delete(
      userKey
    );

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

      const interval =
        getIntervalMs();

      for (
        const [
          userKey,
          userData
        ] of Object.entries(
          data.users
        )
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
          elapsed >= interval
        ) {

          await publishPost(
            userKey
          );

        }

      }

    } catch (error) {

      console.error(
        "Auto Post Error:",
        error
      );

    }

  },
  30 * 1000
);

// ==================================================
// ERROR HANDLERS
// ==================================================

process.on(
  "unhandledRejection",
  error => {

    console.error(
      "Unhandled Rejection:",
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
// TOKEN
// ==================================================

if (
  !process.env.TOKEN
) {

  console.error(
    "❌ TOKEN is missing from Railway Variables."
  );

  process.exit(1);

}

// ==================================================
// LOGIN
// ==================================================

client.login(
  process.env.TOKEN
)
.then(() => {

  console.log(
    "Login request sent."
  );

})
.catch(error => {

  console.error(
    "❌ Login failed:",
    error
  );

});
