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

const configPath = path.join(__dirname, "config.json");
const dataPath = path.join(__dirname, "data.json");

const config = require(configPath);

let data = {};

if (fs.existsSync(dataPath)) {
  try {
    data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  } catch {
    data = {};
  }
}

function saveData() {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

// =========================
// الإعدادات
// =========================

const OWNER_ID = config.ownerId;

function isAllowed(member) {
  if (!member) return false;

  if (member.id === OWNER_ID) return true;

  if (
    config.allowAdministrators &&
    member.permissions.has(PermissionsBitField.Flags.Administrator)
  ) {
    return true;
  }

  if (
    config.allowBoosters &&
    member.premiumSince
  ) {
    return true;
  }

  if (
    config.allowedRoleIds &&
    config.allowedRoleIds.some(roleId =>
      member.roles.cache.has(roleId)
    )
  ) {
    return true;
  }

  return false;
}

// =========================
// Panel
// =========================

function panelEmbed() {
  return new EmbedBuilder()
    .setTitle("🚀 Auto Exchange")
    .setDescription(
      "اختر العملية التي تريدها من الأزرار بالأسفل.\n\n" +
      "🚀 *بدء التبادل*\n" +
      "🛑 *إيقاف التبادل*\n" +
      "📊 *حالة التبادل*\n\n" +
      ⏱️ يتم نشر المنشور كل **${config.postIntervalMinutes} دقائق**
    )
    .setColor(0x5865f2);
}

function panelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("exchange_start")
      .setLabel("🚀 بدء التبادل")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("exchange_stop")
      .setLabel("🛑 إيقاف التبادل")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId("exchange_status")
      .setLabel("📊 حالة التبادل")
      .setStyle(ButtonStyle.Primary)
  );
}

// =========================
// أوامر Slash
// =========================

const commands = [
  {
    name: "auto-panel",
    description: "إرسال لوحة Auto Exchange"
  },
  {
    name: "auto-setup",
    description: "اختيار قنوات التبادل"
  }
];

// =========================
// Ready
// =========================

client.once("ready", async () => {
  console.log(✅ Logged in as ${client.user.tag});

  const rest = new REST({ version: "10" }).setToken(
    process.env.TOKEN
  );

  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      {
        body: commands
      }
    );

    console.log("✅ Slash commands registered");
  } catch (error) {
    console.error("❌ Command registration error:", error);
  }

  console.log("🤖 Auto Exchange Bot is Online");
});

// =========================
// Interaction
// =========================

client.on("interactionCreate", async interaction => {
  try {

    // =========================
    // Slash Commands
    // =========================

    if (interaction.isChatInputCommand()) {

      // -------------------------
      // /auto-panel
      // -------------------------

      if (interaction.commandName === "auto-panel") {

        if (
          interaction.user.id !== OWNER_ID &&
          !interaction.member.permissions.has(
            PermissionsBitField.Flags.Administrator
          )
        ) {
          return interaction.reply({
            content: "❌ ليس لديك صلاحية لاستخدام هذا الأمر.",
            ephemeral: true
          });
        }

        await interaction.channel.send({
          embeds: [panelEmbed()],
          components: [panelButtons()]
        });

        return interaction.reply({
          content: "✅ تم إرسال Panel.",
          ephemeral: true
        });
      }

      // -------------------------
      // /auto-setup
      // -------------------------

      if (interaction.commandName === "auto-setup") {

        if (interaction.user.id !== OWNER_ID) {
          return interaction.reply({
            content: "❌ هذا الأمر للـ Owner فقط.",
            ephemeral: true
          });
        }

        const channels = interaction.guild.channels.cache
          .filter(
            channel =>
              channel.type === ChannelType.GuildText
          )
          .sort((a, b) => a.position - b.position);

        if (channels.size === 0) {
          return interaction.reply({
            content: "❌ لا توجد قنوات نصية.",
            ephemeral: true
          });
        }

        const options = channels
          .map(channel => ({
            label: channel.name.slice(0, 100),
            value: channel.id,
            description: استخدام #${channel.name} للتبادل
          }))
          .slice(0, 25);

        const menu = new StringSelectMenuBuilder()
          .setCustomId("owner_exchange_channels")
          .setPlaceholder("اختر قنوات التبادل")
          .setMinValues(1)
          .setMaxValues(options.length)
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(menu);

        const embed = new EmbedBuilder()
          .setTitle("⚙️ إعداد Auto Exchange")
          .setDescription(
            "اختار القنوات التي تريد السماح للأعضاء باستخدامها في التبادل.\n\n" +
            "⚠️ القنوات التي لا تختارها لن تظهر للأعضاء نهائياً."
          )
          .setColor(0xfee75c);

        return interaction.reply({
          embeds: [embed],
          components: [row],
          ephemeral: true
        });
      }
    }

    // =========================
    // Owner Channel Setup
    // =========================

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === "owner_exchange_channels"
    ) {

      if (interaction.user.id !== OWNER_ID) {
        return interaction.reply({
          content: "❌ Owner فقط.",
          ephemeral: true
        });
      }

      config.exchangeChannels = interaction.values;

      fs.writeFileSync(
        configPath,
        JSON.stringify(config, null, 2)
      );

      const channelNames = interaction.values
        .map(id => {
          const channel =
            interaction.guild.channels.cache.get(id);

          return channel
            ? • <#${channel.id}>
            : null;
        })
        .filter(Boolean)
        .join("\n");

      return interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅ تم حفظ القنوات")
            .setDescription(
              القنوات المسموح بها حالياً:\n\n${channelNames}
            )
            .setColor(0x57f287)
        ],
        components: []
      });
    }

    // =========================
    // Start Exchange
    // =========================

    if (
      interaction.isButton() &&
      interaction.customId === "exchange_start"
    ) {

      const member = interaction.member;

      if (!isAllowed(member)) {
        return interaction.reply({
          content:
            "❌ ليس لديك صلاحية استخدام Auto Exchange.\n\n" +
            "يجب أن تكون لديك رتبة مسموحة أو تكون Booster أو Administrator.",
          ephemeral: true
        });
      }

      if (
        !config.exchangeChannels ||
        config.exchangeChannels.length === 0
      ) {
        return interaction.reply({
          content:
            "❌ Owner لم يحدد أي قنوات للتبادل حتى الآن.",
          ephemeral: true
        });
      }

      const validChannels = config.exchangeChannels
        .map(id =>
          interaction.guild.channels.cache.get(id)
        )
        .filter(
          channel =>
            channel &&
            channel.type === ChannelType.GuildText
        );

      if (validChannels.length === 0) {
        return interaction.reply({
          content:
            "❌ لا توجد قنوات تبادل متاحة حالياً.",
          ephemeral: true
        });
      }

      const options = validChannels
        .slice(0, 25)
        .map(channel => ({
          label: channel.name.slice(0, 100),
          value: channel.id,
          description: النشر في #${channel.name}
        }));

      const menu = new StringSelectMenuBuilder()
        .setCustomId("member_exchange_channel")
        .setPlaceholder("اختر قناة التبادل")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(menu);

      return interaction.reply({
        content: "📢 اختر القناة التي تريد النشر فيها:",
        components: [row],
        ephemeral: true
      });
    }

    // =========================
    // Select Exchange Channel
    // =========================

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === "member_exchange_channel"
    ) {

      const member = interaction.member;

      if (!isAllowed(member)) {
        return interaction.update({
          content: "❌ ليس لديك صلاحية.",
          components: []
        });
      }

      const channelId = interaction.values[0];

      if (
        !config.exchangeChannels.includes(channelId)
      ) {
        return interaction.update({
          content:
            "❌ هذه القناة غير مسموح بها من Owner.",
          components: []
        });
      }

      if (!data[interaction.user.id]) {
        data[interaction.user.id] = {};
      }

      data[interaction.user.id].channelId = channelId;
      data[interaction.user.id].waitingForPost = true;
      data[interaction.user.id].active = false;

      saveData();

      try {
        await interaction.user.send(
          "📩 *أرسل الآن منشور التبادل هنا.*\n\n" +
          "يمكنك إرسال:\n" +
          "• نص فقط\n" +
          "• صورة فقط\n" +
          "• نص + صورة\n" +
          "• ملفات / مرفقات\n\n" +
          "وسيتم نشره تلقائياً في القناة التي اخترتها."
        );
      } catch {
        return interaction.update({
          content:
            "❌ لا أستطيع إرسال DM لك.\n" +
            "افتح الرسائل الخاصة من إعدادات الخصوصية في السيرفر.",
          components: []
        });
      }

      return interaction.update({
        content:
          "✅ تم اختيار القناة.\n" +
          "📩 أرسلت لك رسالة في الخاص، أرسل المنشور هناك.",
        components: []
      });
    }

    // =========================
    // Stop Exchange
    // =========================

    if (
      interaction.isButton() &&
      interaction.customId === "exchange_stop"
    ) {

      const userId = interaction.user.id;

      if (!data[userId] || !data[userId].active) {
        return interaction.reply({
          content: "ℹ️ لا يوجد تبادل نشط حالياً.",
          ephemeral: true
        });
      }

      data[userId].active = false;
      data[userId].waitingForPost = false;

      saveData();

      return interaction.reply({
        content: "🛑 تم إيقاف التبادل بنجاح.",
        ephemeral: true
      });
    }

    // =========================
    // Status
    // =========================

    if (
      interaction.isButton() &&
      interaction.customId === "exchange_status"
    ) {

      const userId = interaction.user.id;
      const userData = data[userId];

      if (!userData || !userData.active) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("📊 حالة التبادل")
              .setDescription(
                "🔴 *غير نشط*\n\n" +
                "اضغط 🚀 بدء التبادل لبدء النشر."
              )
              .setColor(0xed4245)
          ],
          ephemeral: true
        });
      }

      const channel =
        interaction.guild.channels.cache.get(
          userData.channelId
        );

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("📊 حالة التبادل")
            .setDescription(
              "🟢 *نشط*\n\n" +
              📢 القناة: ${channel ? `<#${channel.id}> : "غير موجودة"}\n` +
              ⏱️ النشر كل ${config.postIntervalMinutes} دقائق
            )
            .setColor(0x57f287)
        ],
        ephemeral: true
      });
    }

  } catch (error) {
    console.error("Interaction Error:", error);

    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: "❌ حدث خطأ غير متوقع.",
          ephemeral: true
        });
      } catch {}
    }
  }
});

// =========================
// استقبال منشور الـ DM
// =========================

client.on("messageCreate", async message => {

  try {

    if (message.author.bot) return;

    // لازم تكون الرسالة DM
    if (message.channel.type !== ChannelType.DM) {
      return;
    }

    const userId = message.author.id;
    const userData = data[userId];

    if (!userData) return;

    if (!userData.waitingForPost) return;

    if (!userData.channelId) return;

    // =========================
    // التأكد من وجود القناة
    // =========================

    let targetChannel = null;

    for (const guild of client.guilds.cache.values()) {

      const channel =
        guild.channels.cache.get(userData.channelId);

      if (channel) {
        targetChannel = channel;
        break;
      }
    }

    if (!targetChannel) {
      return message.reply(
        "❌ قناة التبادل لم تعد موجودة."
      );
    }

    // =========================
    // تجهيز المرفقات
    // =========================

    const attachments =
      message.attachments.map(
        attachment => attachment.url
      );

    // =========================
    // لازم يكون فيه محتوى
    // أو مرفق
    // =========================

    if (
      !message.content &&
      attachments.length === 0
    ) {
      return message.reply(
        "❌ أرسل نصاً أو صورة أو ملفاً."
      );
    }

    // =========================
    // حفظ المنشور
    // =========================

    userData.content = message.content || "";
    userData.attachments = attachments;

    userData.waitingForPost = false;
    userData.active = true;

    userData.lastPostedAt = 0;

    saveData();

    // =========================
    // النشر الأول
    // =========================

    await publishPost(userId);

    await message.reply(
      "✅ تم استلام المنشور ونشره الآن.\n\n" +
      ⏱️ سيتم إعادة نشره كل ${config.postIntervalMinutes} دقائق.\n +
      "🛑 لإيقافه استخدم زر إيقاف التبادل من الـ Panel."
    );

  } catch (error) {

    console.error("DM Error:", error);

    try {
      await message.reply(
        "❌ حدث خطأ أثناء معالجة المنشور."
      );
    } catch {}
  }
});

// =========================
// نشر المنشور
// =========================

async function publishPost(userId) {

  const userData = data[userId];

  if (!userData) return;
  if (!userData.active) return;

  const channelId = userData.channelId;

  let channel = null;

  for (const guild of client.guilds.cache.values()) {

    const found =
      guild.channels.cache.get(channelId);

    if (found) {
      channel = found;
      break;
    }
  }

  if (!channel) return;

  if (channel.type !== ChannelType.GuildText) {
    return;
  }

  const payload = {};

  if (userData.content) {
    payload.content = userData.content;
  }

  if (
    userData.attachments &&
    userData.attachments.length > 0
  ) {
    payload.files = userData.attachments;
  }

  try {

    await channel.send(payload);

    userData.lastPostedAt = Date.now();

    saveData();

    console.log(
      📢 Post published for ${userId} in #${channel.name}
    );

  } catch (error) {

    console.error(
      ❌ Publish error for ${userId}:,
      error
    );
  }
}

// =========================
// Auto Post كل 10 دقائق
// =========================

setInterval(
  async () => {

    try {

      const now = Date.now();

      const interval =
        config.postIntervalMinutes *
        60 *
        1000;

      for (const userId of Object.keys(data)) {

        const userData = data[userId];

        if (!userData) continue;

        if (!userData.active) continue;

        if (!userData.content && !userData.attachments?.length) {
          continue;
        }

        if (!userData.lastPostedAt) {
          continue;
        }

        const elapsed =
          now - userData.lastPostedAt;

        if (elapsed >= interval) {

          await publishPost(userId);
        }
      }

    } catch (error) {

      console.error(
        "❌ Auto Post Interval Error:",
        error
      );
    }

  },
  60 * 1000
);

// =========================
// Login
// =========================

if (!process.env.TOKEN) {
  console.error(
    "❌ TOKEN غير موجود في Railway Variables."
  );
  process.exit(1);
}

client.login(process.env.TOKEN);
