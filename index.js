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
  Routes,
  ChannelType
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
  fs.writeFileSync(DATA_FILE, "{}");
}

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let data = loadData();

/*
  المستخدمون الذين اختاروا قناة وينتظر البوت منشورهم في الخاص
*/
const pendingDM = new Map();

/*
  التأكد من صلاحية العضو
*/
function isAllowed(member) {
  if (!member) return false;

  // Administrator
  if (
    config.allowAdministrators &&
    member.permissions.has(PermissionsBitField.Flags.Administrator)
  ) {
    return true;
  }

  // Double Booster
  if (config.allowBoosters && member.premiumSince) {
    return true;
  }

  // الرتب المحددة
  if (
    Array.isArray(config.allowedRoleIds) &&
    config.allowedRoleIds.some(roleId =>
      member.roles.cache.has(roleId)
    )
  ) {
    return true;
  }

  return false;
}

/*
  التأكد أن القناة محددة من الـOwner
*/
function isExchangeChannel(channelId) {
  return (
    Array.isArray(config.exchangeChannels) &&
    config.exchangeChannels.includes(channelId)
  );
}

/*
  Panel
*/
function createPanelEmbed() {
  return new EmbedBuilder()
    .setTitle("🔄 Auto Exchange")
    .setDescription(
      "مرحبًا بك في نظام التبادل التلقائي.\n\n" +
      "اضغط على *بدء التبادل* لاختيار روم التبادل وإرسال منشورك.\n\n" +
      "🚀 بدء التبادل\n" +
      "🛑 إيقاف التبادل\n" +
      "📊 حالتي\n\n" +
      ⏱️ يتم نشر المنشور كل **${config.postIntervalMinutes} دقائق**
    )
    .setFooter({
      text: "Auto Exchange System"
    });
}

function createPanelButtons() {
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

/*
  إنشاء قائمة الرومات المحددة من الـOwner
*/
function createExchangeMenu() {
  const channels = config.exchangeChannels
    .map(id => {
      const channel = client.channels.cache.get(id);

      if (!channel) return null;

      return {
        label: channel.name.slice(0, 100),
        value: channel.id,
        description: "روم مسموح للتبادل"
      };
    })
    .filter(Boolean)
    .slice(0, 25);

  if (!channels.length) return null;

  return new StringSelectMenuBuilder()
    .setCustomId("exchange_channel")
    .setPlaceholder("📢 اختر روم التبادل")
    .addOptions(channels);
}

/*
  تسجيل أوامر Slash
*/
async function registerCommands() {
  const commands = [
    {
      name: "auto-panel",
      description: "إرسال لوحة Auto Exchange"
    },
    {
      name: "auto-setup",
      description: "تحديد رومات التبادل - للـOwner فقط"
    }
  ];

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

    console.log("✅ Slash Commands registered");
  } catch (error) {
    console.error("❌ Command registration error:", error);
  }
}

/*
  تشغيل البوت
*/
client.once("ready", async () => {
  console.log(✅ Logged in as ${client.user.tag});

  await registerCommands();

  console.log("🚀 Auto Exchange is running");
});

/*
  التفاعلات
*/
client.on("interactionCreate", async interaction => {
  try {

    /*
      =========================
      Slash Commands
      =========================
    */

    if (interaction.isChatInputCommand()) {

      /*
        /auto-panel
      */

      if (interaction.commandName === "auto-panel") {

        if (
          interaction.user.id !== config.ownerId &&
          !interaction.member.permissions.has(
            PermissionsBitField.Flags.Administrator
          )
        ) {
          return interaction.reply({
            content: "❌ هذا الأمر للإدارة فقط.",
            ephemeral: true
          });
        }

        return interaction.reply({
          embeds: [createPanelEmbed()],
          components: [createPanelButtons()]
        });
      }

      /*
        /auto-setup
      */

      if (interaction.commandName === "auto-setup") {

        if (interaction.user.id !== config.ownerId) {
          return interaction.reply({
            content: "❌ هذا الأمر للـOwner فقط.",
            ephemeral: true
          });
        }

        const channels = interaction.guild.channels.cache
          .filter(
            channel =>
              channel.type === ChannelType.GuildText
          )
          .map(channel => ({
            label: channel.name.slice(0, 100),
            value: channel.id,
            description: "اضغط لإضافة/إزالة الروم"
          }))
          .slice(0, 25);

        if (!channels.length) {
          return interaction.reply({
            content: "❌ لا توجد رومات نصية.",
            ephemeral: true
          });
        }

        const menu = new StringSelectMenuBuilder()
          .setCustomId("owner_exchange_setup")
          .setPlaceholder("📢 اختر رومات التبادل")
          .setMinValues(1)
          .setMaxValues(Math.min(channels.length, 25))
          .addOptions(channels);

        return interaction.reply({
          content:
            "👑 *إعداد رومات التبادل*\n\n" +
            "اختر الرومات التي تريد السماح بالتبادل فيها.\n" +
            "⚠️ الرومات التي لا تختارها لن تظهر للأعضاء.",
          components: [
            new ActionRowBuilder().addComponents(menu)
          ],
          ephemeral: true
        });
      }
    }

    /*
      =========================
      Owner Setup Menu
      =========================
    */

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === "owner_exchange_setup"
    ) {

      if (interaction.user.id !== config.ownerId) {
        return interaction.reply({
          content: "❌ هذا للـOwner فقط.",
          ephemeral: true
        });
      }

      config.exchangeChannels = interaction.values;

      fs.writeFileSync(
        "./config.json",
        JSON.stringify(config, null, 2)
      );

      const list = interaction.values
        .map(id => <#${id}>)
        .join("\n");

      return interaction.update({
        content:
          "✅ *تم حفظ رومات التبادل*\n\n" +
          list +
          "\n\n🚫 أي روم آخر لن يظهر للأعضاء.",
        components: []
      });
    }

    /*
      =========================
      اختيار روم التبادل
      =========================
    */

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === "exchange_channel"
    ) {

      const channelId = interaction.values[0];

      if (!isExchangeChannel(channelId)) {
        return interaction.update({
          content: "❌ هذا الروم غير مسموح للتبادل.",
          components: []
        });
      }

      pendingDM.set(interaction.user.id, {
        channelId
      });

      try {

        await interaction.user.send(
          "📨 *Auto Exchange*\n\n" +
          "أرسل الآن المنشور الذي تريد نشره.\n\n" +
          "يمكنك إرسال:\n" +
          "📝 نص\n" +
          "🖼️ صورة\n" +
          "📝 + 🖼️ نص وصورة\n" +
          "📎 ملفات ومرفقات\n\n" +
          "وسيتم نشره تلقائيًا كل 10 دقائق."
        );

      } catch {

        pendingDM.delete(interaction.user.id);

        return interaction.update({
          content:
            "❌ لا أستطيع إرسال رسالة خاصة لك.\n" +
            "افتح استقبال الرسائل الخاصة من إعدادات Discord.",
          components: []
        });
      }

      return interaction.update({
        content:
          "✅ تم اختيار روم التبادل.\n\n" +
          "📩 افتح الخاص وأرسل المنشور للبوت.",
        components: []
      });
    }

    /*
      =========================
      Buttons
      =========================
    */

    if (!interaction.isButton()) return;

    const member = interaction.member;

    /*
      Start
    */

    if (interaction.customId === "auto_start") {

      if (!isAllowed(member)) {
        return interaction.reply({
          content:
            "❌ غير مسموح لك باستخدام Auto Exchange.\n\n" +
            "يجب أن تكون:\n" +
            "🚀 Double Booster\n" +
            "🎖️ معك رتبة مسموحة\n" +
            "👑 Administrator",
          ephemeral: true
        });
      }

      const menu = createExchangeMenu();

      if (!menu) {
        return interaction.reply({
          content:
            "❌ الـOwner لم يحدد أي رومات للتبادل حتى الآن.",
          ephemeral: true
        });
      }

      return interaction.reply({
        content: "📢 اختر روم التبادل:",
        components: [
          new ActionRowBuilder().addComponents(menu)
        ],
        ephemeral: true
      });
    }

    /*
      Stop
    */

    if (interaction.customId === "auto_stop") {

      if (!isAllowed(member)) {
        return interaction.reply({
          content: "❌ غير مسموح لك باستخدام النظام.",
          ephemeral: true
        });
      }

      const userId = interaction.user.id;

      if (!data[userId]?.active) {
        return interaction.reply({
          content: "🔴 لا يوجد لديك تبادل يعمل.",
          ephemeral: true
        });
      }

      data[userId].active = false;

      saveData();

      return interaction.reply({
        content: "🛑 تم إيقاف التبادل الخاص بك.",
        ephemeral: true
      });
    }

    /*
      Status
    */

    if (interaction.customId === "auto_status") {

      const userData = data[interaction.user.id];

      if (!userData?.active) {
        return interaction.reply({
          content: "🔴 ليس لديك تبادل يعمل حاليًا.",
          ephemeral: true
        });
      }

      return interaction.reply({
        content:
          "🟢 *التبادل يعمل*\n\n" +
          📢 الروم: <#${userData.channelId}>\n +
          ⏱️ كل ${config.postIntervalMinutes} دقائق,
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

/*
  =========================
  استقبال المنشور من DM
  =========================
*/

client.on("messageCreate", async message => {

  if (message.author.bot) return;

  if (!message.channel.isDMBased()) return;

  const setup = pendingDM.get(message.author.id);

  if (!setup) return;

  const channelId = setup.channelId;

  if (!isExchangeChannel(channelId)) {
    pendingDM.delete(message.author.id);

    return message.reply(
      "❌ هذا الروم لم يعد مسموحًا للتبادل."
    );
  }

  const text = message.content || "";

  const attachments = [...message.attachments.values()].map(
    attachment => attachment.url
  );

  if (!text && attachments.length === 0) {
    return message.reply(
      "❌ أرسل نصًا أو صورة أو ملفًا."
    );
  }

  data[message.author.id] = {
    active: true,
    channelId,
    content: text,
    attachments,
    startedAt: Date.now()
  };

  saveData();

  pendingDM.delete(message.author.id);

  await message.reply(
    "✅ *تم تفعيل التبادل!*\n\n" +
    📢 الروم: <#${channelId}>\n +
    "📝 تم حفظ المنشور\n" +
    "🖼️ المرفقات محفوظة\n" +
    ⏱️ سيتم النشر كل **${config.postIntervalMinutes} دقائق**\n\n +
    "🛑 لإيقافه استخدم زر إيقاف التبادل من الـPanel."
  );

  /*
    أول نشر مباشرة
  */
  await publishPost(message.author.id);
});

/*
  =========================
  نشر المنشور
  =========================
*/

async function publishPost(userId) {

  const userData = data[userId];

  if (!userData || !userData.active) return;

  if (!isExchangeChannel(userData.channelId)) {

    userData.active = false;

    saveData();

    return;
  }

  try {

    const channel = await client.channels.fetch(
      userData.channelId
    );

    if (!channel || !channel.isTextBased()) return;

    const files = userData.attachments || [];

    await channel.send({
      content: userData.content || undefined,
      files: files
    });

    console.log(
      📢 Published post for ${userId}
    );

  } catch (error) {

    console.error(
      ❌ Publish error for ${userId}:,
      error
    );
  }
}

/*
  =========================
  كل 10 دقائق
  =========================
*/

setInterval(async () => {

  for (const userId of Object.keys(data)) {

    if (!data[userId]?.active) continue;

    await publishPost(userId);
  }

}, config.postIntervalMinutes * 60 * 1000);

/*
  تشغيل البوت
*/

client.login(process.env.TOKEN);
