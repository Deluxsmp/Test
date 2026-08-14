const { 
    Client, GatewayIntentBits, Partials, REST, Routes, 
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, 
    ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, AttachmentBuilder, AuditLogEvent 
} = require('discord.js');
require('dotenv').config();
const fs = require('fs');

const DB_FILE = './database.json';
let db = { guilds: {} };

if (fs.existsSync(DB_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { }
}
function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getGuildConfig(guildId) {
    if (!db.guilds[guildId]) {
        db.guilds[guildId] = {
            whitelisted: [],
            modRoles: [],
            adminRoles: [],
            logChannel: null,
            welcomeChannel: null,
            welcomeMsg: "Welcome {user} to {server}!",
            welcomeImage: null,
            welcomeColor: "#00FF00",
            pollColor: "#0099ff",
            giveawayColor: "#FFD700",
            verifiedRole: null,
            ticketCategory: null,
            supportRole: null,
            antiSpam: { enabled: true, limit: 5, interval: 5000 },
            antiNuke: { enabled: true },
            autoModLink: { enabled: true, timeoutMinutes: 10 },
            triggers: {},
            badWords: ['badword1', 'badword2'],
            levels: {},
            queues: {}
        };
        saveDB();
    }
    return db.guilds[guildId];
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildModeration
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const spamTracker = new Map();
const nukeTracker = new Map();

client.once('ready', async () => {
    console.log(`Ultimate Professional AutoMod Bot logged in as ${client.user.tag}!`);

    const commands = [
        new SlashCommandBuilder().setName('ticket-setup').setDescription('Setup advanced select menu ticket panel')
            .addChannelOption(o => o.setName('category').setDescription('Ticket Category').addChannelTypes(ChannelType.GuildCategory).setRequired(true))
            .addRoleOption(o => o.setName('support-role').setDescription('Support Role').setRequired(true))
            .addStringOption(o => o.setName('title').setDescription('Panel Title').setRequired(true))
            .addStringOption(o => o.setName('description').setDescription('Panel Description').setRequired(true))
            .addStringOption(o => o.setName('options').setDescription('Menu Options with Emojis separated by comma').setRequired(true)),
        
        new SlashCommandBuilder().setName('ticket-add').setDescription('Add a user to the current ticket')
            .addUserOption(o => o.setName('user').setDescription('User to add').setRequired(true)),
        new SlashCommandBuilder().setName('ticket-remove').setDescription('Remove a user from the current ticket')
            .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(true)),

        new SlashCommandBuilder().setName('automod-setup').setDescription('Setup Anti-Link system and auto-timeout duration')
            .addBooleanOption(o => o.setName('enable-link-protection').setDescription('Enable or disable Anti-Link').setRequired(true))
            .addIntegerOption(o => o.setName('timeout-minutes').setDescription('Timeout duration in minutes').setRequired(true)),

        new SlashCommandBuilder().setName('welcome-setup').setDescription('Configure welcome system with embed color and image')
            .addChannelOption(o => o.setName('channel').setDescription('Welcome channel').setRequired(true))
            .addStringOption(o => o.setName('message').setDescription('Welcome message use {user} and {server}').setRequired(true))
            .addStringOption(o => o.setName('color').setDescription('Embed Color (Hex code e.g. #00FF00)').setRequired(false))
            .addStringOption(o => o.setName('image-url').setDescription('Welcome banner image URL').setRequired(false)),

        new SlashCommandBuilder().setName('verification-setup').setDescription('Setup verification system')
            .addRoleOption(o => o.setName('role').setDescription('Verified Role to give').setRequired(true)),

        new SlashCommandBuilder().setName('poll').setDescription('Create custom emoji poll with custom color')
            .addStringOption(o => o.setName('question').setDescription('Question').setRequired(true))
            .addStringOption(o => o.setName('options').setDescription('Options with emojis separated by comma').setRequired(true))
            .addStringOption(o => o.setName('color').setDescription('Embed Color (Hex code)').setRequired(false)),

        new SlashCommandBuilder().setName('giveaway-start').setDescription('Start a giveaway')
            .addStringOption(o => o.setName('prize').setDescription('Prize').setRequired(true))
            .addIntegerOption(o => o.setName('duration').setDescription('Duration in minutes').setRequired(true))
            .addStringOption(o => o.setName('color').setDescription('Embed Color (Hex code)').setRequired(false)),

        new SlashCommandBuilder().setName('ban').setDescription('Ban user')
            .addUserOption(o => o.setName('target').setDescription('User').setRequired(true)),
        
        new SlashCommandBuilder().setName('kick').setDescription('Kick user')
            .addUserOption(o => o.setName('target').setDescription('User').setRequired(true)),
        
        new SlashCommandBuilder().setName('timeout').setDescription('Timeout user')
            .addUserOption(o => o.setName('target').setDescription('User').setRequired(true))
            .addIntegerOption(o => o.setName('minutes').setDescription('Minutes').setRequired(true)),
        
        new SlashCommandBuilder().setName('antispam').setDescription('Toggle Anti-Spam protection')
            .addBooleanOption(o => o.setName('status').setDescription('True or False').setRequired(true)),
        new SlashCommandBuilder().setName('antinuke').setDescription('Toggle Anti-Nuke protection')
            .addBooleanOption(o => o.setName('status').setDescription('True or False').setRequired(true)),

        new SlashCommandBuilder().setName('trigger-add').setDescription('Add custom auto-responder trigger')
            .addStringOption(o => o.setName('keyword').setDescription('Trigger keyword').setRequired(true))
            .addStringOption(o => o.setName('response').setDescription('Bot response message').setRequired(true)),
        new SlashCommandBuilder().setName('trigger-remove').setDescription('Remove custom trigger')
            .addStringOption(o => o.setName('keyword').setDescription('Trigger keyword to remove').setRequired(true)),

        new SlashCommandBuilder().setName('rank').setDescription('Check your level and XP rank'),
        new SlashCommandBuilder().setName('avatar').setDescription('View user avatar')
            .addUserOption(o => o.setName('target').setDescription('User').setRequired(false)),
        new SlashCommandBuilder().setName('coinflip').setDescription('Play coinflip game'),
        new SlashCommandBuilder().setName('rps').setDescription('Play Rock Paper Scissors')
            .addStringOption(o => o.setName('choice').setDescription('Your choice').addChoices({name: 'Rock', value: 'rock'}, {name: 'Paper', value: 'paper'}, {name: 'Scissors', value: 'scissors'}).setRequired(true)),

        new SlashCommandBuilder().setName('whitelist').setDescription('Whitelist user or bot')
            .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)),
        
        new SlashCommandBuilder().setName('set-roles').setDescription('Set Admin or Mod roles')
            .addStringOption(o => o.setName('type').setDescription('Type').addChoices({name: 'Admin', value: 'admin'}, {name: 'Mod', value: 'mod'}).setRequired(true))
            .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)),

        new SlashCommandBuilder().setName('embed-builder').setDescription('Open custom embed builder modal'),
        new SlashCommandBuilder().setName('set-log-channel').setDescription('Set log channel')
            .addChannelOption(o => o.setName('channel').setDescription('Log channel').addChannelTypes(ChannelType.GuildText).setRequired(true)),
        
        new SlashCommandBuilder().setName('selfrole-setup').setDescription('Create a self-role reaction/button panel')
            .addRoleOption(o => o.setName('role').setDescription('Role to give').setRequired(true))
            .addStringOption(o => o.setName('button-name').setDescription('Button Label').setRequired(true)),

        new SlashCommandBuilder().setName('queue-create').setDescription('Create a gaming/player matchmaking queue')
            .addStringOption(o => o.setName('name').setDescription('Queue Name').setRequired(true)),
        new SlashCommandBuilder().setName('queue-join').setDescription('Join an active player queue')
            .addStringOption(o => o.setName('name').setDescription('Queue Name').setRequired(true)),
        new SlashCommandBuilder().setName('queue-leave').setDescription('Leave a player queue')
            .addStringOption(o => o.setName('name').setDescription('Queue Name').setRequired(true)),
        new SlashCommandBuilder().setName('queue-list').setDescription('View current players in queue')
            .addStringOption(o => o.setName('name').setDescription('Queue Name').setRequired(true)),

        new SlashCommandBuilder().setName('invite').setDescription('Get bot invitation link to add in your server'),

        new SlashCommandBuilder().setName('help').setDescription('List all professional features')
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Successfully registered all slash commands.');
    } catch (error) {
        console.error(error);
    }
});

function checkPermissions(interaction) {
    const config = getGuildConfig(interaction.guild.id);
    const userId = interaction.user.id;
    if (interaction.member.permissions.has(PermissionFlagsBits.Administrator) || interaction.guild.ownerId === userId) return true;
    if (config.whitelisted.includes(userId)) return true;
    return interaction.member.roles.cache.some(r => config.modRoles.includes(r.id) || config.adminRoles.includes(r.id));
}

async function sendLog(guild, embed) {
    const config = getGuildConfig(guild.id);
    if (!config.logChannel) return;
    const channel = guild.channels.cache.get(config.logChannel);
    if (channel) channel.send({ embeds: [embed] }).catch(() => {});
}

client.on('interactionCreate', async interaction => {
    if (!interaction.guild) return;
    const config = getGuildConfig(interaction.guild.id);

    try {
        if (interaction.isModalSubmit() && interaction.customId === 'embedBuilderModal') {
            await interaction.deferReply({ ephemeral: true });
            const title = interaction.fields.getTextInputValue('embedTitle');
            const description = interaction.fields.getTextInputValue('embedDesc');
            const color = interaction.fields.getTextInputValue('embedColor') || '#0099ff';
            const imageUrl = interaction.fields.getTextInputValue('embedImage');

            const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
            if (imageUrl) embed.setImage(imageUrl);

            await interaction.channel.send({ embeds: [embed] });
            return interaction.editReply({ content: 'Custom embed created successfully!' });
        }

        if (interaction.isButton() && interaction.customId.startsWith('selfrole_')) {
            const roleId = interaction.customId.split('_')[1];
            const role = interaction.guild.roles.cache.get(roleId);
            if (!role) return interaction.reply({ content: 'Role not found!', ephemeral: true });

            if (interaction.member.roles.cache.has(roleId)) {
                await interaction.member.roles.remove(role);
                return interaction.reply({ content: `Removed role **${role.name}**!`, ephemeral: true });
            } else {
                await interaction.member.roles.add(role);
                return interaction.reply({ content: `Added role **${role.name}**!`, ephemeral: true });
            }
        }

        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select_menu') {
            await interaction.deferReply({ ephemeral: true });
            const ticketType = interaction.values[0];
            const category = interaction.guild.channels.cache.get(config.ticketCategory);
            const supportRole = config.supportRole;

            const ticketChannel = await interaction.guild.channels.create({
                name: `${ticketType}-${interaction.user.username}`.toLowerCase().replace(/\s+/g, '-'),
                type: ChannelType.GuildText,
                parent: category ? category.id : null,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    ...(supportRole ? [{ id: supportRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : [])
                ]
            });

            const closeButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Close & Transcript').setStyle(ButtonStyle.Danger)
            );

            const supportRoleMention = supportRole ? `<@&${supportRole}>` : '';
            await ticketChannel.send({ 
                content: `Category: **${ticketType}**\nWelcome ${interaction.user} ${supportRoleMention}! Support staff will assist you.`, 
                components: [closeButton] 
            });

            return interaction.editReply({ content: `Ticket created: ${ticketChannel}` });
        }

        if (interaction.isButton()) {
            if (interaction.customId === 'close_ticket') {
                await interaction.reply({ content: 'Generating transcript and closing ticket in 5 seconds...', ephemeral: true });
                
                try {
                    const messages = await interaction.channel.messages.fetch({ limit: 100 });
                    let transcript = Array.from(messages.values())
                        .reverse()
                        .map(m => `[${new Date(m.createdTimestamp).toLocaleString()}] ${m.author.tag}: ${m.content}`)
                        .join('\n');
                    
                    fs.writeFileSync('./transcript.txt', transcript);
                    const attachment = new AttachmentBuilder('./transcript.txt', { name: 'transcript.txt' });
                    
                    await sendLog(interaction.guild, new EmbedBuilder()
                        .setTitle('📁 Ticket Closed Transcript')
                        .setDescription(`Ticket channel **${interaction.channel.name}** was closed.`)
                        .setColor('DarkRed')
                    );

                    const logChan = interaction.guild.channels.cache.get(config.logChannel);
                    if (logChan) await logChan.send({ files: [attachment] });
                } catch (err) { console.error(err); }

                setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
                return;
            }

            if (interaction.customId === 'verify_user') {
                if (!config.verifiedRole) return interaction.reply({ content: 'Verification role not configured.', ephemeral: true });
                const role = interaction.guild.roles.cache.get(config.verifiedRole);
                if (role) {
                    await interaction.member.roles.add(role).catch(() => {});
                    return interaction.reply({ content: 'Verified successfully!', ephemeral: true });
                }
            }
        }

        if (!interaction.isChatInputCommand()) return;

        const publicCommands = ['help', 'avatar', 'coinflip', 'rps', 'rank', 'ticket-add', 'ticket-remove', 'queue-join', 'queue-leave', 'queue-list', 'invite'];
        if (!publicCommands.includes(interaction.commandName) && !checkPermissions(interaction)) {
            return interaction.reply({ content: 'Access Denied: You lack permissions.', ephemeral: true });
        }

        const { commandName, options } = interaction;

        if (commandName === 'invite') {
            const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`;
            const embed = new EmbedBuilder()
                .setTitle('🤖 Invite Me to Your Server!')
                .setDescription(`Click the button below to add this bot to your own Discord server easily!`)
                .setColor('Blurple');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('🔗 Add Bot to Server').setStyle(ButtonStyle.Link).setURL(inviteUrl)
            );
            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }

        if (commandName === 'automod-setup') {
            config.autoModLink = {
                enabled: options.getBoolean('enable-link-protection'),
                timeoutMinutes: options.getInteger('timeout-minutes')
            };
            saveDB();
            return interaction.reply({ content: `✅ Anti-Link AutoMod configuration updated.`, ephemeral: true });
        }

        if (commandName === 'ticket-add') {
            if (!interaction.channel.name.includes('-')) {
                return interaction.reply({ content: 'This command can only be used inside a ticket channel!', ephemeral: true });
            }
            const targetUser = options.getUser('user');
            await interaction.channel.permissionOverwrites.edit(targetUser.id, { ViewChannel: true, SendMessages: true });
            return interaction.reply({ content: `Successfully added ${targetUser} to this ticket!` });
        }

        if (commandName === 'ticket-remove') {
            if (!interaction.channel.name.includes('-')) {
                return interaction.reply({ content: 'This command can only be used inside a ticket channel!', ephemeral: true });
            }
            const targetUser = options.getUser('user');
            await interaction.channel.permissionOverwrites.delete(targetUser.id);
            return interaction.reply({ content: `Successfully removed ${targetUser} from this ticket!` });
        }

        if (commandName === 'ticket-setup') {
            await interaction.deferReply({ ephemeral: true });
            config.ticketCategory = options.getChannel('category').id;
            config.supportRole = options.getRole('support-role').id;
            saveDB();

            const rawOptions = options.getString('options').split(',').map(o => o.trim()).filter(o => o.length > 0);
            const embed = new EmbedBuilder().setTitle(options.getString('title')).setDescription(options.getString('description')).setColor('#5865F2').setTimestamp();

            const menuOptions = [];
            let index = 1;
            for (const opt of rawOptions) {
                const match = opt.match(/^(\p{Emoji}+)\s*(.*)$/u);
                let labelText = match ? match[2] : opt;
                let emojiChar = match ? match[1] : null;
                
                let safeValue = labelText.toLowerCase().replace(/[^a-z0-9-_]/g, '').substring(0, 90);
                if (!safeValue) safeValue = `option_${index}`;

                let optionObj = {
                    label: labelText.substring(0, 100),
                    value: safeValue
                };
                if (emojiChar) optionObj.emoji = emojiChar;

                menuOptions.push(optionObj);
                index++;
            }

            const selectMenu = new StringSelectMenuBuilder().setCustomId('ticket_select_menu').setPlaceholder('Select ticket category...').addOptions(menuOptions.slice(0, 25));
            const row = new ActionRowBuilder().addComponents(selectMenu);

            await interaction.channel.send({ embeds: [embed], components: [row] });
            return interaction.editReply({ content: 'Ticket panel deployed with multiple categories in select menu!' });
        }

        if (commandName === 'rank') {
            const userId = interaction.user.id;
            const userLevelData = config.levels[userId] || { xp: 0, level: 1 };
            return interaction.reply({ content: `📊 Your Rank Stats:\nLevel: **${userLevelData.level}**\nXP: **${userLevelData.xp}**`, ephemeral: true });
        }

        if (commandName === 'welcome-setup') {
            config.welcomeChannel = options.getChannel('channel').id;
            config.welcomeMsg = options.getString('message');
            config.welcomeColor = options.getString('color') || '#00FF00';
            config.welcomeImage = options.getString('image-url');
            saveDB();
            return interaction.reply({ content: 'Welcome system updated successfully with embed format and color!', ephemeral: true });
        }

        if (commandName === 'verification-setup') {
            await interaction.deferReply({ ephemeral: true });
            config.verifiedRole = options.getRole('role').id;
            saveDB();
            const embed = new EmbedBuilder().setTitle('Verification').setDescription('Click below to verify and unlock channels.').setColor('Green');
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('verify_user').setLabel('Verify').setStyle(ButtonStyle.Success));
            await interaction.channel.send({ embeds: [embed], components: [row] });
            return interaction.editReply({ content: 'Verification panel deployed!' });
        }

        if (commandName === 'selfrole-setup') {
            await interaction.deferReply({ ephemeral: true });
            const role = options.getRole('role');
            const btnName = options.getString('button-name');

            const embed = new EmbedBuilder()
                .setTitle('✨ Self-Role Panel')
                .setDescription(`Click the button below to get or remove the **${role.name}** role!`)
                .setColor('Blurple');
            
            const button = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`selfrole_${role.id}`).setLabel(btnName).setStyle(ButtonStyle.Primary)
            );

            await interaction.channel.send({ embeds: [embed], components: [button] });
            return interaction.editReply({ content: 'Self-role panel created successfully!' });
        }

        if (commandName === 'queue-create') {
            const qName = options.getString('name').toLowerCase();
            if (!config.queues[qName]) {
                config.queues[qName] = [];
                saveDB();
                return interaction.reply({ content: `🎮 Queue **${qName}** created successfully!`, ephemeral: true });
            }
            return interaction.reply({ content: `Queue **${qName}** already exists!`, ephemeral: true });
        }

        if (commandName === 'queue-join') {
            const qName = options.getString('name').toLowerCase();
            if (!config.queues[qName]) config.queues[qName] = [];
            
            if (config.queues[qName].includes(interaction.user.id)) {
                return interaction.reply({ content: 'You are already in this queue!', ephemeral: true });
            }
            config.queues[qName].push(interaction.user.id);
            saveDB();
            return interaction.reply({ content: `✅ You have joined the **${qName}** queue! Total players: ${config.queues[qName].length}` });
        }

        if (commandName === 'queue-leave') {
            const qName = options.getString('name').toLowerCase();
            if (!config.queues[qName] || !config.queues[qName].includes(interaction.user.id)) {
                return interaction.reply({ content: 'You are not in this queue!', ephemeral: true });
            }
            config.queues[qName] = config.queues[qName].filter(id => id !== interaction.user.id);
            saveDB();
            return interaction.reply({ content: `❌ You have left the **${qName}** queue.` });
        }

        if (commandName === 'queue-list') {
            const qName = options.getString('name').toLowerCase();
            if (!config.queues[qName] || config.queues[qName].length === 0) {
                return interaction.reply({ content: `Queue **${qName}** is currently empty.`, ephemeral: true });
            }
            const playerList = config.queues[qName].map(id => `<@${id}>`).join('\n');
            const embed = new EmbedBuilder()
                .setTitle(`🎮 Queue Status: ${qName}`)
                .setDescription(`**Players in Queue (${config.queues[qName].length}):**\n${playerList}`)
                .setColor('Green');
            return interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'antispam') {
            config.antiSpam.enabled = options.getBoolean('status');
            saveDB();
            return interaction.reply({ content: `Anti-Spam status set to: **${config.antiSpam.enabled}**`, ephemeral: true });
        }

        if (commandName === 'antinuke') {
            config.antiNuke.enabled = options.getBoolean('status');
            saveDB();
            return interaction.reply({ content: `Anti-Nuke status set to: **${config.antiNuke.enabled}**`, ephemeral: true });
        }

        if (commandName === 'trigger-add') {
            config.triggers[options.getString('keyword').toLowerCase()] = options.getString('response');
            saveDB();
            return interaction.reply({ content: 'Trigger added successfully!', ephemeral: true });
        }

        if (commandName === 'trigger-remove') {
            delete config.triggers[options.getString('keyword').toLowerCase()];
            saveDB();
            return interaction.reply({ content: 'Trigger removed.', ephemeral: true });
        }

        if (commandName === 'avatar') {
            const target = options.getUser('target') || interaction.user;
            const embed = new EmbedBuilder().setTitle(`${target.tag}'s Avatar`).setImage(target.displayAvatarURL({ size: 1024, dynamic: true })).setColor('Blue');
            return interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'coinflip') {
            return interaction.reply({ content: `Coin Flip: **${Math.random() < 0.5 ? 'Heads' : 'Tails'}**` });
        }

        if (commandName === 'rps') {
            const userChoice = options.getString('choice');
            const botChoice = ['rock', 'paper', 'scissors'][Math.floor(Math.random() * 3)];
            let outcome = userChoice === botChoice ? "It's a tie!" : ((userChoice === 'rock' && botChoice === 'scissors') || (userChoice === 'paper' && botChoice === 'rock') || (userChoice === 'scissors' && botChoice === 'paper')) ? 'You win! 🎉' : 'Bot wins! 🤖';
            return interaction.reply({ content: `You: **${userChoice}** | Bot: **${botChoice}**\n**${outcome}**` });
        }

        if (commandName === 'poll') {
            await interaction.deferReply({ ephemeral: true });
            const question = options.getString('question');
            const optionList = options.getString('options').split(',').map(o => o.trim());
            const pColor = options.getString('color') || '#0099ff';
            let desc = `${question}\n\n`;
            let emojis = [];
            optionList.forEach(opt => {
                const m = opt.match(/^(\p{Emoji}+)\s*(.*)$/u);
                if (m) { emojis.push(m[1]); desc += `${m[1]} - ${m[2]}\n`; }
            });
            const embed = new EmbedBuilder().setTitle('📊 Poll').setDescription(desc).setColor(pColor);
            const msg = await interaction.channel.send({ embeds: [embed] });
            for (const e of emojis) { await msg.react(e).catch(() => {}); }
            return interaction.editReply({ content: 'Poll created!' });
        }

        if (commandName === 'giveaway-start') {
            await interaction.deferReply({ ephemeral: true });
            const prize = options.getString('prize');
            const gColor = options.getString('color') || '#FFD700';
            const embed = new EmbedBuilder().setTitle('🎉 GIVEAWAY 🎉').setDescription(`Prize: **${prize}**\nReact with 🎉 to enter!`).setColor(gColor);
            const gMsg = await interaction.channel.send({ embeds: [embed] });
            await gMsg.react('🎉');
            return interaction.editReply({ content: 'Giveaway started!' });
        }

        if (commandName === 'ban') {
            await interaction.guild.members.ban(options.getUser('target')).catch(() => {});
            return interaction.reply({ content: 'User banned.', ephemeral: true });
        }
        if (commandName === 'kick') {
            await interaction.guild.members.kick(options.getUser('target')).catch(() => {});
            return interaction.reply({ content: 'User kicked.', ephemeral: true });
        }
        if (commandName === 'timeout') {
            const member = await interaction.guild.members.fetch(options.getUser('target').id);
            await member.timeout(options.getInteger('minutes') * 60 * 1000).catch(() => {});
            return interaction.reply({ content: 'User timed out.', ephemeral: true });
        }

        if (commandName === 'whitelist') {
            const user = options.getUser('user');
            if (!config.whitelisted.includes(user.id)) {
                config.whitelisted.push(user.id);
                saveDB();
            }
            return interaction.reply({ content: `Successfully whitelisted ${user.tag}.`, ephemeral: true });
        }

        if (commandName === 'set-roles') {
            const type = options.getString('type');
            const role = options.getRole('role');
            if (type === 'admin') {
                if (!config.adminRoles.includes(role.id)) config.adminRoles.push(role.id);
            } else {
                if (!config.modRoles.includes(role.id)) config.modRoles.push(role.id);
            }
            saveDB();
            return interaction.reply({ content: 'Role updated successfully.', ephemeral: true });
        }

        if (commandName === 'embed-builder') {
            const modal = new ModalBuilder().setCustomId('embedBuilderModal').setTitle('Embed Builder');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('embedTitle').setLabel('Title').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('embedDesc').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('embedColor').setLabel('Color').setStyle(TextInputStyle.Short).setRequired(false)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('embedImage').setLabel('Image URL').setStyle(TextInputStyle.Short).setRequired(false))
            );
            return interaction.showModal(modal);
        }

        if (commandName === 'set-log-channel') {
            config.logChannel = options.getChannel('channel').id;
            saveDB();
            return interaction.reply({ content: 'Log channel updated.', ephemeral: true });
        }

        if (commandName === 'help') {
            const embed = new EmbedBuilder()
                .setTitle('🌟 Ultimate Bot Commands')
                .addFields(
                    { name: '🛡️ Moderation & Security', value: '`/ban`, `/kick`, `/timeout`, `/antispam`, `/antinuke`, `/automod-setup`, `/whitelist`, `/set-roles`, `/set-log-channel`' },
                    { name: '🎫 Tickets, Setup & Self-Roles', value: '`/ticket-setup`, `/ticket-add`, `/ticket-remove`, `/welcome-setup`, `/verification-setup`, `/selfrole-setup`' },
                    { name: '🎮 Gaming Queues & Invite', value: '`/queue-create`, `/queue-join`, `/queue-leave`, `/queue-list`, `/invite`' },
                    { name: '💬 Utility & Fun', value: '`/rank`, `/avatar`, `/coinflip`, `/rps`, `/poll`, `/giveaway-start`, `/trigger-add`, `/trigger-remove`, `/embed-builder`' }
                )
                .setColor('Blurple');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
    } catch (err) {
        console.error(err);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error/permission issue occurred while executing this command!', ephemeral: true }).catch(() => {});
        }
    }
});

client.on('guildMemberAdd', member => {
    const config = getGuildConfig(member.guild.id);
    if (!config.welcomeChannel) return;
    const channel = member.guild.channels.cache.get(config.welcomeChannel);
    if (channel) {
        let text = config.welcomeMsg.replace('{user}', `<@${member.id}>`).replace('{server}', member.guild.name);
        const embed = new EmbedBuilder()
            .setDescription(text)
            .setColor(config.welcomeColor || '#00FF00')
            .setTimestamp();
        
        if (config.welcomeImage) {
            embed.setImage(config.welcomeImage);
        }

        channel.send({ embeds: [embed] }).catch(() => {});
    }
});

client.on('channelDelete', async channel => {
    if (!channel.guild) return;
    const config = getGuildConfig(channel.guild.id);
    if (!config.antiNuke.enabled) return;

    try {
        const auditLogs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelDelete }).catch(() => {});
        if (!auditLogs) return;
        const logEntry = auditLogs.entries.first();
        if (!logEntry) return;

        const { executor, target } = logEntry;
        if (!executor || executor.id === client.user.id || executor.id === channel.guild.ownerId || config.whitelisted.includes(executor.id)) return;
        if (target && target.id !== channel.id) return;

        let userActions = nukeTracker.get(executor.id) || 0;
        userActions++;
        nukeTracker.set(executor.id, userActions);
        setTimeout(() => nukeTracker.set(executor.id, userActions - 1), 10000);

        if (userActions > 2) {
            const member = await channel.guild.members.fetch(executor.id).catch(() => {});
            if (member) {
                await member.ban({ reason: 'Anti-Nuke: Mass Channel Deletion' }).catch(() => {});
                sendLog(channel.guild, new EmbedBuilder()
                    .setTitle('🚨 Anti-Nuke Triggered!')
                    .setDescription(`**User:** ${executor.tag} was banned for mass channel deletion.`)
                    .setColor('DarkRed')
                );
            }
        }
    } catch (err) {
        console.error(err);
    }
});

client.on('messageCreate', async message => {
    if (!message.guild || message.author.bot) return;
    const config = getGuildConfig(message.guild.id);

    const isAuthorized = message.member?.permissions.has(PermissionFlagsBits.Administrator) || 
                         config.whitelisted.includes(message.author.id);

    if (config.antiSpam.enabled && !isAuthorized) {
        const userId = message.author.id;
        const now = Date.now();
        let userSpam = spamTracker.get(userId) || { count: 0, lastMessageTime: now };

        if (now - userSpam.lastMessageTime < config.antiSpam.interval) {
            userSpam.count++;
            if (userSpam.count >= config.antiSpam.limit) {
                await message.delete().catch(() => {});
                await message.member.timeout(5 * 60 * 1000, 'Anti-Spam: Sending messages too fast').catch(() => {});
                message.channel.send(`⚠️ ${message.author}, you are spamming and have been timed out for 5 minutes!`)
                    .then(msg => setTimeout(() => msg.delete().catch(() => {}), 4000));
                spamTracker.delete(userId);
                return;
            }
        } else {
            userSpam.count = 1;
        }
        userSpam.lastMessageTime = now;
        spamTracker.set(userId, userSpam);
    }

    if (config.autoModLink.enabled && !isAuthorized) {
        const linkRegex = /(https?:\/\/[^\s]+)|(discord\.gg\/[^\s]+)|(discord\.com\/invite\/[^\s]+)/gi;
        
        if (linkRegex.test(message.content)) {
            await message.delete().catch(() => {});
            
            const timeoutMs = config.autoModLink.timeoutMinutes * 60 * 1000;
            await message.member.timeout(timeoutMs, 'AutoMod: Posting Links Not Allowed').catch(() => {});

            message.channel.send(`⚠️ ${message.author}, links are not allowed here! You have been timed out for **${config.autoModLink.timeoutMinutes} minutes**.`)
                .then(msg => setTimeout(() => msg.delete().catch(() => {}), 4000));

            sendLog(message.guild, new EmbedBuilder()
                .setTitle('🛡️ AutoMod: Link Blocked & User Timed Out')
                .setDescription(`**User:** ${message.author.tag}\n**Channel:** ${message.channel}\n**Timeout Duration:** ${config.autoModLink.timeoutMinutes} Mins`)
                .setColor('Red')
            );
            return;
        }
    }

    const contentLower = message.content.toLowerCase();
    if (config.badWords.some(word => contentLower.includes(word))) {
        await message.delete().catch(() => {});
        message.channel.send(`${message.author}, watch your language! That word is filtered.`).then(msg => setTimeout(() => msg.delete().catch(()=>{}), 4000));
        return;
    }

    if (config.triggers) {
        for (const [keyword, response] of Object.entries(config.triggers)) {
            if (contentLower.includes(keyword)) {
                await message.channel.send(response).catch(() => {});
                break;
            }
        }
    }

    const userId = message.author.id;
    if (!config.levels[userId]) config.levels[userId] = { xp: 0, level: 1 };
    config.levels[userId].xp += 10;
    let requiredXp = config.levels[userId].level * 100;
    if (config.levels[userId].xp >= requiredXp) {
        config.levels[userId].level += 1;
        message.channel.send(`🎉 Congratulations ${message.author}, you leveled up to **Level ${config.levels[userId].level}**!`).catch(() => {});
    }
    saveDB();
});

client.login(process.env.TOKEN);
