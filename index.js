
// Fake web server so Render free Web Service stays alive
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('FlareCloud bot online');
}).listen(PORT, '0.0.0.0', () => console.log('Fake web on port', PORT));

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  Events,
  REST,
  Routes
} = require('discord.js');
const fs = require('fs-extra');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences // required for status tracking
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.User]
});

// ==== EMOJI RESOLVER (by name, works with custom/animated server emojis) ====
function resolveEmoji(guild, name, fallback = '') {
  if (!name) return fallback || '';
  // If already a full emoji markup, extract the name part
  const m = String(name).match(/^<a?:([A-Za-z0-9_]+):\d+>$/);
  const emojiName = m ? m[1] : String(name);

  if (guild && guild.emojis && guild.emojis.cache) {
    // Exact name match first
    let emoji = guild.emojis.cache.find(e => e.name === emojiName);
    // Case-insensitive fallback
    if (!emoji) {
      const lower = emojiName.toLowerCase();
      emoji = guild.emojis.cache.find(e => e.name.toLowerCase() === lower);
    }
    if (emoji) {
      return emoji.animated
        ? `<a:${emoji.name}:${emoji.id}>`
        : `<:${emoji.name}:${emoji.id}>`;
    }
  }
  // Fallback to config.emojis key
  if (config.emojis && config.emojis[emojiName]) {
    const val = config.emojis[emojiName];
    // If config value is markup, try resolving that name from guild too
    const m2 = String(val).match(/^<a?:([A-Za-z0-9_]+):\d+>$/);
    if (m2 && guild && guild.emojis && guild.emojis.cache) {
      const emoji2 = guild.emojis.cache.find(e => e.name === m2[1] || e.name.toLowerCase() === m2[1].toLowerCase());
      if (emoji2) {
        return emoji2.animated ? `<a:${emoji2.name}:${emoji2.id}>` : `<:${emoji2.name}:${emoji2.id}>`;
      }
    }
    // Don't return broken YOUR_ID placeholders
    if (val && !String(val).includes('YOUR_ID')) return val;
  }
  return fallback || '';
}

client.resolveEmoji = resolveEmoji;
// Shorthand: client.e(guild, 'Wrong')
client.e = (guild, name, fallback = '') => resolveEmoji(guild, name, fallback);



// ==== CONFIG ====
const configData = require('./config.json');
const config = {
  genChannelId: '1555427957210619964',
  boosterChannelId: '1556279226129448971',
  vipChannelId: '1556279704875565206',
  vouchChannelId: '1556279907838074970',
  logsChannelId: '1556280089715413012',
  genBansChannelId: '1556280037060124682',
  restockChannelId: '1556280198045900820',
  emojis: configData.emojis,

  statusText: ".gg/S9cffQjq9 : Official FlareCloud",
  statusRoleId: "1555427829800239175",
  premiumRoleId: "1556280665140363274",
  freemiumRoleId: "1555427829800239175",

  services: {
    "minecraft": {
      stockFile: "stock/Minecraft.txt",
      emoji: "ice_cube",
      display: "Minecraft Java"
    },
    "steam": {
      stockFile: "stock/Steam.txt",
      emoji: "ice_cube",
      display: "Steam"
    },
    "crunchyroll": {
      stockFile: "stock/Crunchyroll.txt",
      emoji: "ice_cube",
      display: "Crunchyroll"
     },
    "mc_bedrock": {
      stockFile: "stock/Mc_Bedrock.txt",
      emoji: "globe",
      display: "Minecraft Bedrock"
    },
    "xbox": {
      stockFile: "stock/Xbox.txt",
      emoji: "gold",
      display: "Xbox"
    },
    "donut": {
      stockFile: "booststock/Donut.txt",
      emoji: "booster",
      display: "donut"
    },
    "cape": {
      stockFile: "stock/Cape.txt",
      emoji: "booster",
      display: "Cape"
    },
    "unbanned": {
      stockFile: "booststock/Unbanned.txt",
      emoji: "booster",
      display: "Unbanned"
    },
    "mcfa": {
      stockFile: "paidstock/Mcfa.txt",
      emoji: "paid",
      display: "MCFA Premium"
    }
  }
};

client.config = config;

// ==== STOCK SYSTEM ====
const STOCK_PATHS = {
  "Freemium Vault": {
    "Mc_Bedrock": "freestock/Mc_Bedrock.txt",
    "Xbox": "freestock/Xbox.txt",
    "Minecraft": "freestock/Minecraft.txt",
    "Steam": "freestock/Steam.txt"
  },
  "Booster Vault": {
    "Ranked": "booststock/Ranked.txt",
    "Cape": "booststock/Cape.txt",
    "Unbanned": "booststock/Unbanned.txt"
  },
  "Premium Vault": {
    "Mcfa": "premiumstock/Mcfa.txt"
  }
};

// ==== COMMAND LOADER ====
const commands = new Map();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

let vouchSystem = null;
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  if (file === 'vouch.js') {
    vouchSystem = command;
  } else if (command.name) {
    commands.set(command.name, command);
  }
}

// ==== LOG COMMAND USAGE ====
async function logCommandUsage(message, commandName, args) {
  const logsChannel = message.guild?.channels.cache.get(config.logsChannelId);
  if (!logsChannel) return;

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📝 Command Executed')
    .addFields(
      { name: 'Command', value: `\`$${commandName}\``, inline: true },
      { name: 'User', value: `${message.author.tag}`, inline: true },
      { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
      { name: 'Arguments', value: args.length > 0 ? `\`${args.join(' ')}\`` : 'None', inline: false }
    )
    .setTimestamp();

  await logsChannel.send({ embeds: [embed] }).catch(() => {});
}

// ==== MESSAGE HANDLER ====
client.on('messageCreate', async (message) => {
  if (vouchSystem) await vouchSystem.handleMessage(message, client);
  if (message.author.bot || !message.content.startsWith('$')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();
  const command = commands.get(commandName);

  if (command) {
    try {
      await command.execute(message, args, client);
      await logCommandUsage(message, commandName, args);
    } catch (error) {
      console.error(error);
      message.reply('❌ There was an error executing that command!');
    }
  }
});

// ==== AUTO STATUS ROLE SYSTEM ====
client.on('presenceUpdate', async (oldPresence, newPresence) => {
  if (!newPresence || !newPresence.member) return;
  const member = newPresence.member;
  if (member.user.bot) return;

  const customStatus = newPresence.activities?.find(a => a.type === 4);
  const hasTargetStatus =
    customStatus && customStatus.state && customStatus.state.includes(config.statusText);

  const role = member.guild.roles.cache.get(config.statusRoleId);
  const logChannel = member.guild.channels.cache.get(config.logsChannelId);

  if (!role) return;

  try {
    if (hasTargetStatus && !member.roles.cache.has(role.id)) {
      await member.roles.add(role);
      console.log(`✅ Added role to ${member.user.tag}`);
      logChannel?.send(`✅ **${member.user.tag}** set correct status → role added`);
    } else if (!hasTargetStatus && member.roles.cache.has(role.id)) {
      await member.roles.remove(role);
      console.log(`❌ Removed role from ${member.user.tag}`);
      logChannel?.send(`❌ **${member.user.tag}** removed/changed status → role removed`);
    }
  } catch (err) {
    console.error(`⚠️ Role update failed for ${member.user.tag}:`, err.message);
  }
});

client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);

  // === BOT WATCHING STATUS ===
  client.user.setActivity('.gg/dSm3FHqNJ', {
    type: 3 // WATCHING
  });

  if (vouchSystem && vouchSystem.slashCommands) {
    try {
      const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
      await rest.put(Routes.applicationCommands(client.user.id), {
        body: vouchSystem.slashCommands
      });
      console.log('✅ [Vouch] Slash commands registered');
    } catch (err) {
      console.error('❌ [Vouch] Slash registration failed:', err);
    }
  }

  const cstatus = require('./commands/status.js');
  if (cstatus.startAutoCheck) {
    cstatus.startAutoCheck(client);
    console.log('🟢 Auto status checker started!');
  }
});


const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error('Missing DISCORD_TOKEN env');
  process.exit(1);
}
client.login(TOKEN);

