const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  PermissionsBitField,
  REST,
  Routes
} = require("discord.js");

const fs = require("fs");
const config = require("./config.json");

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

const DATA_FILE = "./data.json";

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
}

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let data = loadData();
const pendingDM = new Map();

function isAllowed(member) {
  if (!member) return false;
  if (config.allowAdministrators && member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return true;
  }
  if (config.allowBoosters && member.premiumSince) {
    return true;
  }
  return config.allowedRoleIds.some(roleId => member.roles.cache.has(roleId));
}

function panelEmbed() {
  return new EmbedBuilder()
    .setTitle("🔄 Auto Exchange")
    .setDescription(
      "اختر العملية التي تريدها من الأزرار بالأسفل.\n\n" +
      "🚀 **بدء التبادل**\n" +
      "🛑 **إيقاف التبادل**\n" +
      "📊 **حالة التبادل**\n\n" +
      `⏱️ النشر يتم كل **${config.postIntervalMinutes} دقائق**`
    )
    .setFooter({ text: "Auto Exchange System" });
}

function panelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("auto_start")
      .setLabel("بدء التبادل")
      .setEmoji("🚀")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("auto_stop")
      .setLabel("إيقاف التبادل")
      .setEmoji("🛑")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId("auto_status")
      .setLabel("حالتي")
      .setEmoji("📊")
      .setStyle(ButtonStyle.Secondary)
  );
}

// تشغيل البوت ورفع أمر السلاش تلقائياً
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  
  const commands = [
    {
      name: "auto-panel",
      description: "إرسال لوحة التحكم في التبادل التلقائي"
    }
  ];

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN || config.token);

  try {
    console.log("⏳ جاري تسجيل أوامر السلاش (Slash Commands)...");
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log("✅ تم تسجيل الأوامر بنجاح!");
  } catch (error) {
    console.error("❌ فشل تسجيل الأوامر:", error);
  }
  
  console.log("🚀 Auto Exchange is running");
});

client.on("interactionCreate", async interaction => {
  try {
    // 1. التعامل مع أوامر السلاش
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "auto-panel") {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          return interaction.reply({
            content: "❌ الأمر ده للإدارة فقط.",
            ephemeral: true
          });
        }

        return await interaction.reply({
          embeds: [panelEmbed()],
          components: [panelButtons()]
        });
      }
    }

    // 2. التعامل مع القائمة المنسدلة (تم نقلها هنا قبل شرط الأزرار)
    if (interaction.isStringSelectMenu() && interaction.customId === "exchange_channel") {
      const channelId = interaction.values[0];

      pendingDM.set(interaction.user.id, { channelId });

      try {
        await interaction.user.send(
          "📨 **Auto Exchange**\n\n" +
          "أرسل الآن **المنشور** الذي تريد نشره.\n" +
          "سيتم استخدام آخر منشور ترسله في التبادل."
        );
      } catch {
        return interaction.update({
          content:
            "❌ لا أستطيع إرسال DM لك.\n" +
            "افتح الخاص من إعدادات Discord ثم حاول مرة أخرى.",
          components: []
        });
      }

      return interaction.update({
        content:
          "✅ تم اختيار قناة التبادل.\n" +
          "📩 أرسلت لك رسالة في الخاص، أرسل فيها المنشور.",
        components: []
      });
    }

    // 3. التعامل مع الأزرار فقط بعد هذه النقطة
    if (!interaction.isButton()) return;

    const member = interaction.member;

    if (interaction.customId === "auto_start" || interaction.customId === "auto_stop") {
      if (!isAllowed(member)) {
        return interaction.reply({
          content:
            "❌ غير مسموح لك باستخدام نظام Auto Exchange.\n" +
            "يجب أن تكون Booster أو معك الرتبة المطلوبة أو تكون إداري.",
          ephemeral: true
        });
      }
    }

    if (interaction.customId === "auto_start") {
      const channels = interaction.guild.channels.cache
        .filter(c => c.isTextBased() && c.type === 0)
        .map(c => ({
          label: c.name.slice(0, 100),
          value: c.id
        }))
        .slice(0, 25);

      if (!channels.length) {
        return interaction.reply({
          content: "❌ لا توجد قنوات متاحة.",
          ephemeral: true
        });
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId("exchange_channel")
        .setPlaceholder("📢 اختر قناة التبادل")
        .addOptions(channels);

      return interaction.reply({
        content: "📢 اختر قناة التبادل:",
        components: [
          new ActionRowBuilder().addComponents(menu)
        ],
        ephemeral: true
      });
    }

    if (interaction.customId === "auto_stop") {
      const userId = interaction.user.id;

      if (!data[userId]) {
        return interaction.reply({
          content: "ℹ️ ليس لديك تبادل يعمل حاليًا.",
          ephemeral: true
        });
      }

      data[userId].active = false;
      saveData(data);

      return interaction.reply({
        content: "🛑 تم إيقاف التبادل الخاص بك.",
        ephemeral: true
      });
    }

    if (interaction.customId === "auto_status") {
      const userId = interaction.user.id;
      const userData = data[userId];

      if (!userData || !userData.active) {
        return interaction.reply({
          content: "🔴 لا يوجد لديك تبادل يعمل حاليًا.",
          ephemeral: true
        });
      }

      return interaction.reply({
        content:
          `🟢 التبادل يعمل\n` +
          `📢 القناة: <#${userData.channelId}>\n` +
          `⏱️ كل ${config.postIntervalMinutes} دقائق`,
        ephemeral: true
      });
    }
  } catch (error) {
    console.error(error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ حدث خطأ غير متوقع.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

client.on("messageCreate", async message => {
  if (message.author.bot) return;
  if (!message.channel.isDMBased()) return;

  const setup = pendingDM.get(message.author.id);
  if (!setup) return;

  const channelId = setup.channelId;
  const text = message.content || "";

  if (!text && message.attachments.size === 0) {
    return message.reply("❌ أرسل منشورًا صالحًا.");
  }

  data[message.author.id] = {
    active: true,
    channelId,
    content: text,
    attachments: [...message.attachments.values()].map(a => a.url),
    startedAt: Date.now()
  };

  saveData(data);
  pendingDM.delete(message.author.id);

  await message.reply(
    "✅ **تم تفعيل Auto Exchange!**\n\n" +
    `📢 القناة: <#${channelId}>\n` +
    `⏱️ النشر: كل **${config.postIntervalMinutes} دقائق**\n\n` +
    "🛑 يمكنك إيقافه من لوحة التبادل."
  );

  await publishPost(message.author.id);
});

async function publishPost(userId) {
  const userData = data[userId];
  if (!userData || !userData.active) return;

  try {
    const channel = await client.channels.fetch(userData.channelId);
    if (!channel || !channel.isTextBased()) return;

    let content = userData.content || "";

    if (userData.attachments?.length) {
      content += (content ? "\n" : "") + userData.attachments.join("\n");
    }

    if (!content) return;

    await channel.send({ content });
    console.log(`📢 Published post for ${userId} in ${channel.id}`);
  } catch (error) {
    console.error("Publish error:", error);
  }
}

setInterval(async () => {
  for (const userId of Object.keys(data)) {
    const userData = data[userId];
    if (!userData?.active) continue;

    await publishPost(userId);
  }
}, config.postIntervalMinutes * 60 * 1000);

client.login(process.env.TOKEN || config.token);
