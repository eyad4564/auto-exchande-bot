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

const CONFIG_FILE = path.join(__dirname, "config.json");
const DATA_FILE = path.join(__dirname, "data.json");

let config = {};

try {
  config = require(CONFIG_FILE);
} catch (error) {
  console.error("❌ config.json غير موجود أو غير صحيح.");
  process.exit(1);
}

// ==================================================
// TOKEN
// ==================================================

const TOKEN =
  process.env.TOKEN ||
  config.token ||
  "";

if (!TOKEN) {
  console.error(
    "❌ TOKEN غير موجود.\n" +
    "ضع TOKEN في Railway Variables باسم TOKEN."
  );

  process.exit(1);
}

// ==================================================
// DATA
// ==================================================

let data = {
  guilds: {},
  users: {}
};

if (fs.existsSync(DATA_FILE)) {
  try {
    const loaded =
      JSON.parse(
        fs.readFileSync(
          DATA_FILE,
          "utf8"
        )
      );

    if (loaded && typeof loaded === "object") {
      data = loaded;
    }
  } catch (error) {
    console.log(
      "⚠️ data.json تالف، سيتم إنشاء بيانات جديدة."
    );
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
      JSON.stringify(
        data,
        null,
        2
      ),
      "utf8"
    );
  } catch (error) {
    console.error(
      "❌ فشل حفظ data.json:",
      error
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
      JSON.stringify(
        config,
        null,
        2
      ),
      "utf8"
    );
  } catch (error) {
    console.error(
      "❌ فشل حفظ config.json:",
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

const OWNER_ID =
  String(
    config.ownerId || ""
  ).trim();

const ALLOWED_ROLES =
  Array.isArray(
    config.allowedRoleIds
  )
    ? config.allowedRoleIds.map(String)
    : [];

let postIntervalMinutes =
  Number(
    config.postIntervalMinutes || 10
  );

if (
  !Number.isFinite(
    postIntervalMinutes
  ) ||
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
// USER KEY
// ==================================================

function getUserKey(
  guildId,
  userId
) {
  return `${guildId}_${userId}`;
}

// ==================================================
// GUILD DATA
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
      guildId: String(guildId),
      userId: String(userId),

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

  data.users[key] = {
    guildId: String(guildId),
    userId: String(userId),

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
// ADMIN
// ==================================================

function isAdminMember(
  member
) {
  if (!member) {
    return false;
  }

  return member.permissions.has(
    PermissionsBitField.Flags.Administrator
  );
}

// ==================================================
// BOT OWNER
// ==================================================

async function isBotOwner(
  userId
) {
  userId = String(userId);

  if (
    OWNER_ID &&
    userId === OWNER_ID
  ) {
    return true;
  }

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
      "⚠️ لم أستطع التحقق من Owner الخاص بالتطبيق."
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

  if (
    await isBotOwner(
      member.id
    )
  ) {
    return true;
  }

  if (
    config.allowAdministrators === true &&
    isAdminMember(member)
  ) {
    return true;
  }

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
    await isBotOwner(
      member.id
    )
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
// FIND CHANNEL
// ==================================================

function findGuildChannel(
  channelId
) {
  for (
    const guild of
      client.guilds.cache.values()
  ) {
    const channel =
      guild.channels.cache.get(
        String(channelId)
      );

    if (channel) {
      return channel;
    }
  }

  return null;
}

// ==================================================
// ATTACHMENTS
// ==================================================

function getAttachmentUrls(
  message
) {
  return [
    ...message.attachments.values()
  ].map(
    attachment =>
      attachment.url
  );
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

      "📝 **إنشاء منشور**\n" +
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
// NORMAL BUTTONS
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
// TIME MODAL
// ==================================================

function createTimeModal() {
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

  return modal;
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
// REGISTER COMMANDS
// ==================================================

async function registerCommands() {
  try {
    const rest =
      new REST({
        version: "10"
      }).setToken(
        TOKEN
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
// START EXCHANGE
// ==================================================

async function startExchange(
  interaction
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
    settings.exchangeChannels.length === 0
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
          interaction.guild.channels.cache.get(
            id
          )
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
            channel.name.slice(
              0,
              100
            ),

          value:
            channel.id,

          description:
            `النشر في #${channel.name}`.slice(
              0,
              100
            )
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

async function handleMemberChannelSelect(
  interaction
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
    !settings.exchangeChannels.includes(
      channelId
    )
  ) {
    return interaction.update({
      content:
        "❌ هذه الروم غير مسموح بها.",
      components: []
    });
  }

  const user =
    getUserData(
      interaction.guild.id,
      interaction.user.id
    );

  user.channelId =
    channelId;

  user.waitingForPost =
    true;

  user.waitingSince =
    Date.now();

  user.active =
    false;

  user.content =
    "";

  user.attachments =
    [];

  user.lastPostedAt =
    0;

  saveData();

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
      "✅ تم اختيار مكان المنشور.\n\n" +
      "📩 راجع الخاص وأرسل المنشور هناك.",
    components: []
  });
}

// ==================================================
// PUBLISH POST
// ==================================================

const publishingUsers =
  new Set();

async function publishPost(
  userKey
) {
  const user =
    data.users[userKey];

  if (!user) {
    return false;
  }

  if (!user.active) {
    return false;
  }

  if (!user.channelId) {
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
    const channel =
      findGuildChannel(
        user.channelId
      );

    if (!channel) {
      console.log(
        `⚠️ Channel ${user.channelId} not found.`
      );

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
      user.content &&
      user.content.trim()
    ) {
      payload.content =
        user.content;
    }

    if (
      Array.isArray(
        user.attachments
      ) &&
      user.attachments.length > 0
    ) {
      payload.files =
        user.attachments;
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

    user.lastPostedAt =
      Date.now();

    saveData();

    console.log(
      `✅ Published post for ${user.userId}`
    );

    return true;

  } catch (error) {
    console.error(
      "❌ Publish Error:",
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

      const entries =
        Object.entries(
          data.users
        )
          .filter(
            ([, user]) =>
              String(
                user.userId
              ) ===
                String(
                  message.author.id
                ) &&
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
        return message.reply(
          "ℹ️ ليس لديك منشور قيد الإنشاء حالياً."
        );
      }

      const [
        key,
        user
      ] = entries[0];

      if (!user.channelId) {
        return message.reply(
          "❌ لم يتم تحديد مكان المنشور."
        );
      }

      const targetChannel =
        findGuildChannel(
          user.channelId
        );

      if (!targetChannel) {
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

      const attachments =
        getAttachmentUrls(
          message
        );

      const content =
        String(
          message.content || ""
        ).trim();

      if (
        !content &&
        attachments.length === 0
      ) {
        return message.reply(
          "❌ أرسل نصاً أو صورة أو فيديو أو ملفاً."
        );
      }

      user.content =
        content;

      user.attachments =
        attachments;

      user.waitingForPost =
        false;

      user.waitingSince =
        0;

      user.active =
        true;

      user.lastPostedAt =
        0;

      saveData();

      const success =
        await publishPost(
          key
        );

      if (!success) {
        user.active =
          false;

        saveData();

        return message.reply(
          "❌ حصل خطأ أثناء نشر المنشور.\n" +
          "تأكد أن البوت لديه صلاحيات Send Messages و Attach Files."
        );
      }

      return message.reply(
        "✅ **تم إنشاء المنشور بنجاح!**\n\n" +

        `⏱️ سيتم إعادة نشره كل **${postIntervalMinutes} دقيقة**.\n\n` +

        "🛑 لإيقافه استخدم زر **إيقاف المنشور** من الـPanel."
      );

    } catch (error) {
      console.error(
        "❌ DM Error:",
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
// SERVER MESSAGE LISTENER
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
        return;
      }

      const guild =
        message.guild;

      const channel =
        message.channel;

      const settings =
        getGuildSettings(
          guild.id
        );

      if (
        !settings.exchangeChannels.includes(
          channel.id
        )
      ) {
        return;
      }

      /*
       * هذا الجزء يسمح أيضاً بأن يرسل
       * المستخدم المنشور مباشرة داخل
       * روم التبادل.
       */

      const content =
        String(
          message.content || ""
        ).trim();

      const attachments =
        getAttachmentUrls(
          message
        );

      if (
        !content &&
        attachments.length === 0
      ) {
        return;
      }

      const user =
        getUserData(
          guild.id,
          message.author.id
        );

      user.channelId =
        channel.id;

      user.content =
        content;

      user.attachments =
        attachments;

      user.active =
        true;

      user.waitingForPost =
        false;

      user.waitingSince =
        0;

      user.lastPostedAt =
        0;

      saveData();

      /*
       * لا نعيد نشر الرسالة فوراً
       * لأن الرسالة الأصلية موجودة بالفعل.
       *
       * يبدأ التايمر من الآن.
       */

    } catch (error) {
      console.error(
        "❌ Server message error:",
        error
      );
    }
  }
);

// ==================================================
// AUTO POST LOOP
// ==================================================

async function runAutoPostLoop() {
  try {
    const now =
      Date.now();

    const interval =
      getIntervalMs();

    for (
      const [
        userKey,
        user
      ] of Object.entries(
        data.users
      )
    ) {
      if (!user.active) {
        continue;
      }

      if (!user.lastPostedAt) {
        continue;
      }

      if (
        publishingUsers.has(
          userKey
        )
      ) {
        continue;
      }

      const elapsed =
        now -
        Number(
          user.lastPostedAt
        );

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
      "❌ Auto Post Loop Error:",
      error
    );
  }
}

// ==================================================
// PANEL BUTTONS
// ==================================================

client.on(
  "interactionCreate",
  async interaction => {
    try {

      // ==================================================
      // SLASH COMMAND
      // ==================================================

      if (
        interaction.isChatInputCommand()
      ) {

        // ================================================
        // /auto
        // ================================================

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

        // ================================================
        // /auto-panel
        // ================================================

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

          if (
            !interaction.channel
          ) {
            return interaction.reply({
              content:
                "❌ لا يمكن إرسال اللوحة هنا.",
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

        // ================================================
        // /auto-setup
        // ================================================

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
                    channel.name.slice(
                      0,
                      100
                    ),

                  value:
                    channel.id,

                  description:
                    `اختيار #${channel.name}`.slice(
                      0,
                      100
                    )
                })
              )
              .slice(
                0,
                25
              );

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
            settings.exchangeChannels.length >
            0
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
                "اختار الرومات من القائمة فقط.\n\n" +

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

        // ================================================
        // /auto-time
        // ================================================

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

          return interaction.showModal(
            createTimeModal()
          );
        }

        return;
      }

      // ==================================================
      // OWNER CHANNEL SELECT
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
      // MEMBER CHANNEL SELECT
      // ==================================================

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId ===
          "member_exchange_channel"
      ) {
        return handleMemberChannelSelect(
          interaction
        );
      }

      // ==================================================
      // BUTTONS
      // ==================================================

      if (
        interaction.isButton()
      ) {

        // ================================================
        // START
        // ================================================

        if (
          interaction.customId ===
          "exchange_start"
        ) {
          return startExchange(
            interaction
          );
        }

        // ================================================
        // STOP
        // ================================================

        if (
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

          const user =
            getUserData(
              interaction.guild.id,
              interaction.user.id
            );

          if (
            !user.active &&
            !user.waitingForPost
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

        // ================================================
        // STATUS
        // ================================================

        if (
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

          const user =
            getUserData(
              interaction.guild.id,
              interaction.user.id
            );

          if (
            user.waitingForPost
          ) {
            return interaction.reply({
              embeds: [
                new EmbedBuilder()
                  .setTitle(
                    "📊 حالة التبادل"
                  )
                  .setDescription(
                    "الحالة: 🟡 **في انتظار المنشور**\n\n" +
                    "📩 راجع الخاص وأرسل المنشور."
                  )
                  .setColor(
                    0xFEE75C
                  )
              ],
              ephemeral: true
            });
          }

          if (
            user.active
          ) {
            const channel =
              interaction.guild.channels.cache.get(
                user.channelId
              );

            const nextPost =
              user.lastPostedAt
                ? Math.max(
                    0,
                    user.lastPostedAt +
                    getIntervalMs() -
                    Date.now()
                  )
                : 0;

            return interaction.reply({
              embeds: [
                new EmbedBuilder()
                  .setTitle(
                    "📊 حالة التبادل"
                  )
                  .setDescription(
                    "الحالة: 🟢 **نشط**\n\n" +

                    `📁 الروم: ${
                      channel
                        ? `<#${channel.id}>`
                        : "غير موجودة"
                    }\n\n` +

                    `⏱️ مدة إعادة النشر: **${postIntervalMinutes} دقيقة**\n` +

                    `⏳ النشر القادم: **${formatDuration(nextPost)}**`
                  )
                  .setColor(
                    0x57F287
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

        // ================================================
        // DECREASE TIME
        // ================================================

        if (
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

          config.postIntervalMinutes =
            postIntervalMinutes;

          saveConfig();

          return interaction.reply({
            content:
              `➖ تم تقليل المدة إلى **${postIntervalMinutes} دقيقة**.`,
            ephemeral: true
          });
        }

        // ================================================
        // INCREASE TIME
        // ================================================

        if (
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

          config.postIntervalMinutes =
            postIntervalMinutes;

          saveConfig();

          return interaction.reply({
            content:
              `➕ تم زيادة المدة إلى **${postIntervalMinutes} دقيقة**.`,
            ephemeral: true
          });
        }

        // ================================================
        // SET TIME
        // ================================================

        if (
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

          return interaction.showModal(
            createTimeModal()
          );
        }
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
          interaction.fields.getTextInputValue(
            "time_input"
          );

        const minutes =
          Number(
            String(value).trim()
          );

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

        config.postIntervalMinutes =
          minutes;

        saveConfig();

        return interaction.reply({
          content:
            `✅ تم تغيير مدة إعادة النشر إلى **${minutes} دقيقة**.`,
          ephemeral: true
        });
      }

    } catch (error) {
      console.error(
        "❌ Interaction Error:",
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
// FORMAT DURATION
// ==================================================

function formatDuration(
  ms
) {
  if (
    !ms ||
    ms <= 0
  ) {
    return "جاهز الآن";
  }

  const totalSeconds =
    Math.ceil(
      ms / 1000
    );

  const days =
    Math.floor(
      totalSeconds / 86400
    );

  const hours =
    Math.floor(
      (totalSeconds % 86400) /
      3600
    );

  const minutes =
    Math.floor(
      (totalSeconds % 3600) /
      60
    );

  const seconds =
    totalSeconds % 60;

  const parts = [];

  if (days > 0) {
    parts.push(
      `${days} يوم`
    );
  }

  if (hours > 0) {
    parts.push(
      `${hours} ساعة`
    );
  }

  if (minutes > 0) {
    parts.push(
      `${minutes} دقيقة`
    );
  }

  if (
    seconds > 0 &&
    parts.length < 2
  ) {
    parts.push(
      `${seconds} ثانية`
    );
  }

  return parts.join(" و ");
}

// ==================================================
// READY
// ==================================================

client.once(
  "ready",
  async () => {
    console.log(
      "======================================"
    );

    console.log(
      `✅ Logged in as ${client.user.tag}`
    );

    console.log(
      `🆔 Bot ID: ${client.user.id}`
    );

    console.log(
      `⏱️ Exchange interval: ${postIntervalMinutes} minutes`
    );

    console.log(
      `🏠 Servers: ${client.guilds.cache.size}`
    );

    console.log(
      "======================================"
    );

    await registerCommands();

    console.log(
      "🚀 Auto Exchange is ONLINE."
    );

    // أول فحص
    await runAutoPostLoop();
  }
);

// ==================================================
// AUTO LOOP
// ==================================================

setInterval(
  async () => {
    await runAutoPostLoop();
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

// ==================================================
// LOGIN
// ==================================================

client.login(
  TOKEN
)
.then(() => {
  console.log(
    "🔑 Login request sent."
  );
})
.catch(error => {
  console.error(
    "❌ Login failed:",
    error
  );
});
