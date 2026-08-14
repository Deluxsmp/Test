const { 
    Client, 
    GatewayIntentBits, 
    PermissionsBitField, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType,
    REST,
    Routes,
    SlashCommandBuilder
} = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration
    ]
});

const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const VERIFIED_BOT_ROLE_ID = process.env.VERIFIED_BOT_ROLE_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;
const OPEN_TICKET_CATEGORY_ID = process.env.OPEN_TICKET_CATEGORY_ID;
const CLOSED_TICKET_CATEGORY_ID = process.env.CLOSED_TICKET_CATEGORY_ID;

const nukeTracker = new Map();

const commands = [
    new SlashCommandBuilder()
        .setName('ticketsetup')
        .setDescription('সাপোর্ট টিকিট প্যানেল তৈরি করুন (Staff Only)'),
    new SlashCommandBuilder()
        .setName('verifybot')
        .setDescription('নির্দিষ্ট কোনো বটকে ভেরিফাইড রোল দিন (Staff Only)')
        .addUserOption(option => 
            option.setName('bot').setDescription('বটটিকে মেনশন করুন').setRequired(true)),
    new SlashCommandBuilder()
        .setName('verifyallbots')
        .setDescription('সার্ভারের সব আন-ভেরিফাইড বটকে এক সাথে ভেরিফাইড রোল দিন (Staff Only)')
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`Zenfunmc বট সফলভাবে রান হয়েছে: ${client.user.tag}!`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
    } catch (error) {
        console.error(error);
    }
});

function isStaff(member) {
    if (!member) return false;
    return member.permissions.has(PermissionsBitField.Flags.Administrator) || member.roles.cache.has(STAFF_ROLE_ID);
}

// নতুন বট জয়েন করলে লগ চ্যানেলে পাঠানোর ইভেন্ট
client.on('guildMemberAdd', async member => {
    if (!member.user.bot) return;

    const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel) {
        const embed = new EmbedBuilder()
            .setTitle('🤖 নতুন বট সার্ভারে জয়েন করেছে!')
            .setDescription(`**বট:** ${member} (${member.user.tag})\n**আইডি:** ${member.id}\n\nস্টাফরা চাইলে একে `/verifybot` কমান্ড দিয়ে ভেরিফাইড রোল দিতে পারেন।`)
            .setColor(0xFFA500)
            .setTimestamp();

        await logChannel.send({ embeds: [embed] });
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options, member, guild } = interaction;

        if (commandName === 'ticketsetup') {
            if (!isStaff(member)) return interaction.reply({ content: '❌ এই কমান্ডটি ব্যবহার করার জন্য আপনার স্টাফ রোল নেই!', ephemeral: true });

            const embed = new EmbedBuilder()
                .setTitle('🎫 ZENFUN MC • Support Center')
                .setDescription(
                    `Welcome to the Official ZENFUN MC Support Panel!\n\n` +
                    `Need help? You've come to the right place. Our support team is here to assist you as quickly as possible.\n\n` +
                    `📌 **Please open a ticket only for:**\n` +
                    `• 💰 Store Purchases & Rank Support\n` +
                    `• 🛒 Payment Issues & Missing Purchases\n` +
                    `• 🐞 Bug Reports\n` +
                    `• ⚠️ Player Reports\n` +
                    `• 🚫 Ban Appeals\n` +
                    `• 🤝 Partnership Requests\n` +
                    `• 💼 Staff Applications (if open)\n` +
                    `• ❓ General Questions & Server Support\n\n` +
                    `⚡ **Before Opening a Ticket**\n` +
                    `• Explain your issue clearly.\n` +
                    `• Include screenshots or videos if possible.\n` +
                    `• Provide your Minecraft username.\n` +
                    `• Be respectful to our staff.\n` +
                    `• Do not create multiple tickets for the same issue.\n` +
                    `• Do not ping staff repeatedly.\n\n` +
                    `📜 **Ticket Rules**\n` +
                    `• One issue per ticket.\n` +
                    `• False reports may result in punishment.\n` +
                    `• Abusive language, spam, or trolling is not tolerated.\n` +
                    `• Keep all conversations in English or Bangla.\n` +
                    `• Follow all Discord and server rules.\n\n` +
                    `⏰ **Support Hours**\n` +
                    `Our team responds as soon as possible. Response times may vary depending on staff availability.\n\n` +
                    `🎮 Thank you for choosing ZENFUN MC!\n\n` +
                    `Click the button below to create a support ticket.\n` +
                    `Our staff will assist you shortly.\n\n` +
                    `💜 Fast • Professional • Friendly Support\n` +
                    `-# ZENFUNMC • OFFICIAL • Flantic`
                )
                .setColor(0x00FF00);

            const row = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('ticket_category_select')
                        .setPlaceholder('Select ticket category...')
                        .addOptions([
                            { label: 'Buy Support', value: 'buy_support', emoji: '🛒' },
                            { label: 'General Support', value: 'general_support', emoji: '🛡️' },
                            { label: 'Bug Report', value: 'bug_report', emoji: '🐞' },
                            { label: 'Rank Support', value: 'rank_support', emoji: '💎' },
                            { label: 'Payment', value: 'payment', emoji: '💳' },
                            { label: 'Appeal', value: 'appeal', emoji: '📢' },
                            { label: 'Reward Claim', value: 'reward_claim', emoji: '🎁' },
                            { label: 'Partnership', value: 'partnership', emoji: '🤝' },
                            { label: 'Event Support', value: 'event_support', emoji: '🎉' },
                            { label: 'Other', value: 'other', emoji: '❓' }
                        ])
                );

            await interaction.channel.send({ embeds: [embed], components: [row] });
            await interaction.reply({ content: '✅ টিকিট প্যানেল সফলভাবে তৈরি করা হয়েছে!', ephemeral: true });
        }

        if (commandName === 'verifybot') {
            if (!isStaff(member)) return interaction.reply({ content: '❌ এই কমান্ডটি ব্যবহার করার জন্য আপনার স্টাফ রোল নেই!', ephemeral: true });
            
            const targetBot = options.getMember('bot');
            if (!targetBot || !targetBot.user.bot) {
                return interaction.reply({ content: '❌ দয়া করে একটি ভ্যালিড বটকে মেনশন করুন!', ephemeral: true });
            }

            if (!VERIFIED_BOT_ROLE_ID) {
                return interaction.reply({ content: '❌ কনফিগারেশনে `VERIFIED_BOT_ROLE_ID` সেট করা নেই!', ephemeral: true });
            }

            await targetBot.roles.add(VERIFIED_BOT_ROLE_ID).catch(() => {});
            return interaction.reply({ content: `✅ সফলভাবে **${targetBot.user.tag}** বটটিকে ভেরিফাইড রোল দেওয়া হয়েছে!`, ephemeral: true });
        }

        if (commandName === 'verifyallbots') {
            if (!isStaff(member)) return interaction.reply({ content: '❌ এই কমান্ডটি ব্যবহার করার জন্য আপনার স্টাফ রোল নেই!', ephemeral: true });
            if (!VERIFIED_BOT_ROLE_ID) {
                return interaction.reply({ content: '❌ কনফিগারেশনে `VERIFIED_BOT_ROLE_ID` সেট করা নেই!', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            const members = await guild.members.fetch();
            const bots = members.filter(m => m.user.bot && !m.roles.cache.has(VERIFIED_BOT_ROLE_ID));

            if (bots.size === 0) {
                return interaction.editReply({ content: '⚠️ সার্ভারে এমন কোনো বট পাওয়া যায়নি যার কাছে এই রোলটি নেই।' });
            }

            let count = 0;
            for (const bot of bots.values()) {
                await bot.roles.add(VERIFIED_BOT_ROLE_ID).catch(() => {});
                count++;
            }

            return interaction.editReply({ content: `✅ সফলভাবে মোট **${count}টি** বটের কাছে ভেরিফাইড রোল পৌঁছে দেওয়া হয়েছে!` });
        }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_category_select') {
        const guild = interaction.guild;
        const selectedValue = interaction.values[0];

        const categoryNameMap = {
            'buy_support': 'buy-support',
            'general_support': 'general-support',
            'bug_report': 'bug-report',
            'rank_support': 'rank-support',
            'payment': 'payment',
            'appeal': 'appeal',
            'reward_claim': 'reward-claim',
            'partnership': 'partnership',
            'event_support': 'event-support',
            'other': 'other'
        };

        const channelName = `${categoryNameMap[selectedValue] || 'ticket'}-${interaction.user.username}`;

        const channel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: OPEN_TICKET_CATEGORY_ID || null,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                { id: STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
            ],
        });

        const embed = new EmbedBuilder()
            .setTitle(`সাপোর্ট টিকিট: ${selectedValue.replace('_', ' ').toUpperCase()}`)
            .setDescription(`ব্যবহারকারী: <@${interaction.user.id}>\nআপনার সমস্যা বিস্তারিত এখানে বলুন। স্টাফরা শীঘ্রই সাহায্য করবে।`)
            .setColor(0x0099FF);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger)
            );

        await channel.send({ content: `<@${interaction.user.id}> <@&${STAFF_ROLE_ID}>`, embeds: [embed], components: [row] });
        await interaction.reply({ content: `আপনার টিকিট তৈরি হয়েছে: ${channel}`, ephemeral: true });

        const staffRole = guild.roles.cache.get(STAFF_ROLE_ID);
        if (staffRole) {
            staffRole.members.forEach(staff => {
                if (!staff.user.bot) {
                    staff.send(`🔔 **Zenfunmc:** <@${interaction.user.id}> একটি নতুন টিকিট খুলেছেন (${channel.name})।`).catch(() => {});
                }
            });
        }
    }

    if (interaction.isButton()) {
        const channel = interaction.channel;
        const guild = interaction.guild;
        const member = interaction.member;

        if (interaction.customId === 'claim_ticket') {
            if (!isStaff(member)) {
                return interaction.reply({ content: '❌ এটি শুধুমাত্র স্টাফরা ব্যবহার করতে পারবেন!', ephemeral: true });
            }

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('Unclaim').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger)
                );

            await interaction.update({ content: `✅ এই টিকিটটি ক্লেম করেছেন: <@${member.id}>`, components: [row] });
        }

        if (interaction.customId === 'unclaim_ticket') {
            if (!isStaff(member)) {
                return interaction.reply({ content: '❌ এটি শুধুমাত্র স্টাফরা ব্যবহার করতে পারবেন!', ephemeral: true });
            }

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger)
                );

            await interaction.update({ content: `🔄 টিকিটটি আনক্লেম করা হয়েছে।`, components: [row] });
        }

        if (interaction.customId === 'close_ticket') {
            if (!isStaff(member)) {
                return interaction.reply({ content: '❌ টিকিট বন্ধ করার অনুমতি শুধু স্টাফদের রয়েছে!', ephemeral: true });
            }

            await interaction.deferUpdate();

            await channel.permissionOverwrites.set([
                { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
            ]);

            if (CLOSED_TICKET_CATEGORY_ID) {
                await channel.setParent(CLOSED_TICKET_CATEGORY_ID).catch(() => {});
            }

            const embed = new EmbedBuilder()
                .setTitle('🔒 টিকিট বন্ধ করা হয়েছে')
                .setDescription('এই টিকিটটি ক্লোজ করা হয়েছে। পুনরায় খুলতে চাইলে নিচের রিওপেন বাটনে ক্লিক করুন।')
                .setColor(0xFF0000);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('reopen_ticket').setLabel('Reopen').setStyle(ButtonStyle.Primary)
                );

            await channel.send({ embeds: [embed], components: [row] });
            try {
                await interaction.message.delete();
            } catch (err) {}
        }

        if (interaction.customId === 'reopen_ticket') {
            if (!isStaff(member)) {
                return interaction.reply({ content: '❌ রিওপেন করার অনুমতি শুধু স্টাফদের রয়েছে!', ephemeral: true });
            }

            await interaction.deferUpdate();

            if (OPEN_TICKET_CATEGORY_ID) {
                await channel.setParent(OPEN_TICKET_CATEGORY_ID).catch(() => {});
            }

            const embed = new EmbedBuilder()
                .setTitle('🔓 টিকিট রিওপেন করা হয়েছে')
                .setDescription('টিকিটটি পুনরায় চালু করা হয়েছে।')
                .setColor(0x00FF00);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger)
                );

            await channel.send({ embeds: [embed], components: [row] });
            try {
                await interaction.message.delete();
            } catch (err) {}
        }
    }
});

client.on('messageCreate', async message => {
    if (!message.guild || !message.author.bot) return;

    const botMember = await message.guild.members.fetch(message.author.id).catch(() => null);
    if (botMember && !botMember.roles.cache.has(VERIFIED_BOT_ROLE_ID)) {
        await message.delete().catch(() => {});
    }
});

async function handleAntiNuke(guild, executor, actionType) {
    if (!executor || executor.id === client.user.id) return;
    if (executor.id === guild.ownerId) return;

    const member = await guild.members.fetch(executor.id).catch(() => null);
    if (!member) return;

    const now = Date.now();
    if (!nukeTracker.has(executor.id)) {
        nukeTracker.set(executor.id, []);
    }

    const timestamps = nukeTracker.get(executor.id);
    timestamps.push(now);

    const recentActions = timestamps.filter(time => now - time < 5000);
    nukeTracker.set(executor.id, recentActions);

    if (recentActions.length >= 2) {
        await member.kick(`Zenfunmc Anti-Nuke: Unauthorized mass ${actionType}.`).catch(() => {});
        
        const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
        if (logChannel) {
            const embed = new EmbedBuilder()
                .setTitle('🚨 Zenfunmc Anti-Nuke Alert!')
                .setDescription(`**ইউজার:** ${executor.tag} (${executor.id})\n**অ্যাকশন:** একসাথে একাধিক ${actionType} ডিলিট করার চেষ্টা করায় সার্ভার প্রটেকশনের স্বার্থে তাকে কিক করা হয়েছে।`)
                .setColor(0xFF0000)
                .setTimestamp();
            logChannel.send({ embeds: [embed] });
        }
    }
}

client.on('channelDelete', async channel => {
    const guild = channel.guild;
    const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: 12 });
    const logEntry = auditLogs.entries.first();
    if (logEntry) await handleAntiNuke(guild, logEntry.executor, 'চ্যানেল');
});

client.on('roleDelete', async role => {
    const guild = role.guild;
    const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: 30 });
    const logEntry = auditLogs.entries.first();
    if (logEntry) await handleAntiNuke(guild, logEntry.executor, 'রোল');
});

client.login(process.env.DISCORD_TOKEN);
