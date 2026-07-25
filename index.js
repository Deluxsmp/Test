const { 
    Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, 
    ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, 
    ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionsBitField 
} = require('discord.js');
require('dotenv').config();
const db = require('./src/database.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// টেস্টার এবং এডমিন রোল আইডি (আপনার সার্ভার অনুযায়ী বসিয়ে নিন)
const TESTER_ROLE_ID = '1530471633737875467';
const ADMIN_ROLE_ID = '1518301359332655144';

// গেমমোড অনুযায়ী ডিসকর্ড রোল আইডিগুলো এখানে বসিয়ে দিন
const GAMEMODE_ROLES = {
    'axe_shield': '1530472320190255225',
    'neth_pot': '1530467519347949668',
    'dia_pot': '1530470527033147503',
    'smp_kit': '1530470608222158868',
    'mace': '1530470957830111252',
    'sword': '1530471050092089475',
    'uhc': '1530471143134199938',
    'cpvp': '1530471204731883643'
};
// গেমমোড অনুযায়ী আলাদা আলাদা কিউ লিস্ট স্টোর করার জন্য
const queues = new Map(); // Map<gameMode, Array<{userId, ign}>>

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() && !interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

    // ১. /request-test প্যানেল পাঠানো
    if (interaction.isChatInputCommand() && (interaction.commandName === 'request-test' || interaction.commandName === 'setup-register')) {
        const embed = new EmbedBuilder()
            .setColor('#E02B2B')
            .setTitle('🏆 Vortex Tier')
            .setDescription('Register for our systems and join the testing waitlist.\n\n' +
                '**Step 1: Register Your Profile**\nClick the Register button to set your IGN and skin URL details.\n\n' +
                '**Step 2: Select Your Country**\nAfter registration, select your country from the dropdown.\n\n' +
                '**Step 3: Get a Waitlist Role**\nAfter selecting your country, select a gamemode below to get the waitlist role.\n\n' +
                'Select a gamemode to get the waitlist role\n' +
                '⚠️ Failure to provide authentic information will result in a denied test.');

        const rowButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('register_btn')
                .setLabel('Register / Update Profile')
                .setStyle(ButtonStyle.Success)
        );

        const rowSelect = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('gamemode_select')
                .setPlaceholder('Select a gamemode to get the waitlist role')
                .addOptions([
                    { label: 'Axe And Shield', value: 'axe_shield', emoji: '🪓' },
                    { label: 'Neth Pot', value: 'neth_pot', emoji: '🧪' },
                    { label: 'Dia Pot', value: 'dia_pot', emoji: '💠' },
                    { label: 'Smp Kit', value: 'smp_kit', emoji: '🌿' },
                    { label: 'Mace', value: 'mace', emoji: '🔨' },
                    { label: 'Sword', value: 'sword', emoji: '⚔️' },
                    { label: 'Uhc', value: 'uhc', emoji: '🌍' },
                    { label: 'Cpvp', value: 'cpvp', emoji: '💥' }
                ])
        );

        await interaction.channel.send({ embeds: [embed], components: [rowButton, rowSelect] });
        return interaction.reply({ content: 'Panel sent successfully!', ephemeral: true });
    }

    // ২. রেজিস্টার বাটন ও মোডাল হ্যান্ডেল
    if (interaction.isButton() && interaction.customId === 'register_btn') {
        const modal = new ModalBuilder()
            .setCustomId('register_modal')
            .setTitle('Player Registration');

        const ignInput = new TextInputBuilder()
            .setCustomId('ign_input')
            .setLabel('In-game Name (IGN)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const regionInput = new TextInputBuilder()
            .setCustomId('region_input')
            .setLabel('Region / Country (e.g., AS, BD, NA)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const versionInput = new TextInputBuilder()
            .setCustomId('version_input')
            .setLabel('Launcher Version (Official/Crack)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(ignInput),
            new ActionRowBuilder().addComponents(regionInput),
            new ActionRowBuilder().addComponents(versionInput)
        );

        return interaction.showModal(modal);
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'gamemode_select') {
        const userId = interaction.user.id;
        const selectedMode = interaction.values[0];
        const roleId = GAMEMODE_ROLES[selectedMode];

        db.get(`SELECT * FROM players WHERE discord_id = ?`, [userId], async (err, row) => {
            if (err || !row) {
                return interaction.reply({ content: '❌ আপনি এখনো মাইনক্রাফট আইডি রেজিস্টার করেননি!', ephemeral: true });
            }

            try {
                const member = await interaction.guild.members.fetch(userId);
                if (roleId) {
                    await member.roles.add(roleId); // এই লাইনটিই ইউজারকে রোল দিয়ে দিবে
                }
                return interaction.reply({ content: `✅ সফলভাবে আপনাকে গেমমোড রোল দেওয়া হয়েছে!`, ephemeral: true });
            } catch (error) {
                return interaction.reply({ content: '❌ রোল দিতে সমস্যা হয়েছে। বটের পারমিশন চেক করুন।', ephemeral: true });
            }
        });
    }
    if (interaction.isModalSubmit() && interaction.customId === 'register_modal') {
        const ign = interaction.fields.getTextInputValue('ign_input');
        const region = interaction.fields.getTextInputValue('region_input');
        const version = interaction.fields.getTextInputValue('version_input');
        const userId = interaction.user.id;

        db.run(
            `INSERT INTO players (discord_id, ign, region, version) VALUES (?, ?, ?, ?) 
             ON CONFLICT(discord_id) DO UPDATE SET ign = ?, region = ?, version = ?`,
            [userId, ign, region, version, ign, region, version],
            (err) => {
                if (err) return interaction.reply({ content: 'Database error.', ephemeral: true });
                return interaction.reply({ content: `✅ প্রোফাইল সফলভাবে রেজিস্টার হয়েছে! IGN: **${ign}**`, ephemeral: true });
            }
        );
    }

    // ৩. গেমমোড সিলেক্ট মেনু (রোল দেওয়া)
    if (interaction.isStringSelectMenu() && interaction.customId === 'gamemode_select') {
        const userId = interaction.user.id;
        const selectedMode = interaction.values[0];

        db.get(`SELECT * FROM players WHERE discord_id = ?`, [userId], async (err, row) => {
            if (err || !row) {
                return interaction.reply({ 
                    content: '❌ আপনি এখনো মাইনক্রাফট আইডি রেজিস্টার করেননি! প্রথমে **Register / Update Profile** বাটনে ক্লিক করুন।', 
                    ephemeral: true 
                });
            }

            return interaction.reply({ 
                content: `✅ সফলভাবে আপনাকে গেমমোড রোল এবং চ্যানেল দেখার অনুমতি দেওয়া হয়েছে!`, 
                ephemeral: true 
            });
        });
    }

    // ৪. /queue-start কমান্ড (টেস্টারদের জন্য - নির্দিষ্ট গেমমোড সিলেক্ট করে কিউ প্যানেল চালু করা)
    if (interaction.isChatInputCommand() && interaction.commandName === 'queue-start') {
        if (!interaction.member.roles.cache.has(TESTER_ROLE_ID) && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ এই কমান্ডটি শুধু টেস্টাররা ব্যবহার করতে পারবেন!', ephemeral: true });
        }

        const gameMode = interaction.options.getString('gamemode'); // টেস্টার যে গেমমোড সিলেক্ট করবে
        
        // ওই গেমমোডের জন্য আলাদা কিউ ইনিশিয়ালাইজ করা
        if (!queues.has(gameMode)) {
            queues.set(gameMode, []);
        }

        const embed = new EmbedBuilder()
            .setTitle(`🎮 Queue: ${gameMode.toUpperCase()}`)
            .setDescription('এখনো কেউ এই কিউতে জয়েন করেনি। নিচের **Join Queue** বাটনে ক্লিক করে জয়েন করুন। (সর্বোচ্চ ১০ জন)')
            .setColor('Blue');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`join_queue_${gameMode}`).setLabel('Join Queue').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`leave_queue_${gameMode}`).setLabel('Leave Queue').setStyle(ButtonStyle.Danger)
        );

        // টেস্টার যে চ্যানেলে কমান্ড দিয়েছে, ঠিক সেই চ্যানেলেই ওই গেমমোডের কিউ প্যানেল চলে যাবে
        await interaction.channel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: `✅ **${gameMode.toUpperCase()}** গেমমোডের কিউ সফলভাবে শুরু হয়েছে!`, ephemeral: true });
    }

    // ৫. নির্দিষ্ট গেমমোডের কিউতে জয়েন বা লিভ করার বাটন হ্যান্ডলার
    if (interaction.isButton() && (interaction.customId.startsWith('join_queue_') || interaction.customId.startsWith('leave_queue_'))) {
        const parts = interaction.customId.split('_');
        const action = parts[0]; // join অথবা leave
        const gameMode = parts.slice(2).join('_'); // গেমমোডের নাম
        const userId = interaction.user.id;

        db.get(`SELECT * FROM players WHERE discord_id = ?`, [userId], async (err, playerRow) => {
            if (!playerRow) {
                return interaction.reply({ content: '❌ কিউতে জয়েন করার আগে অবশ্যই `/register` বা প্রোফাইল রেজিস্টার করতে হবে!', ephemeral: true });
            }

            if (!queues.has(gameMode)) queues.set(gameMode, []);
            let list = queues.get(gameMode);

            if (action === 'join') {
                if (list.some(p => p.userId === userId)) {
                    return interaction.reply({ content: '⚠️ আপনি ইতিমধ্যে এই কিউতে আছেন!', ephemeral: true });
                }
                if (list.length >= 10) {
                    return interaction.reply({ content: '❌ এই কিউ ফুল হয়ে গেছে (সর্বোচ্চ ১০ জন)!', ephemeral: true });
                }

                list.push({ userId, ign: playerRow.ign });
                await interaction.reply({ content: `✅ সফলভাবে **${gameMode}** কিউতে জয়েন করেছেন!`, ephemeral: true });
            } else if (action === 'leave') {
                const index = list.findIndex(p => p.userId === userId);
                if (index === -1) {
                    return interaction.reply({ content: '⚠️ আপনি এই কিউতে নেই!', ephemeral: true });
                }
                list.splice(index, 1);
                await interaction.reply({ content: `✅ সফলভাবে **${gameMode}** কিউ থেকে সরে গেছেন!`, ephemeral: true });
            }

            // উক্ত গেমমোডের এমবেড লিস্ট আপডেট করা (১ থেকে ১০ নম্বর পর্যন্ত)
            let desc = list.length === 0 ? 'এখনো কেউ কিউতে নেই।' : list.map((p, idx) => `**#${idx + 1}** - <@${p.userId}> (${p.ign})`).join('\n');
            const updatedEmbed = new EmbedBuilder()
                .setTitle(`🎮 Queue: ${gameMode.toUpperCase()}`)
                .setDescription(desc)
                .setColor('Blue');

            await interaction.message.edit({ embeds: [updatedEmbed] }).catch(() => {});
        });
    }

    // ৬. /open-ticket কমান্ড (টেস্টারদের জন্য - টিকিট খুললে অটো কিউ থেকে প্লেয়ার রিমুভ হয়ে পেছনের জন সামনে চলে আসবে)
    if (interaction.isChatInputCommand() && interaction.commandName === 'open-ticket') {
        if (!interaction.member.roles.cache.has(TESTER_ROLE_ID) && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ এই কমান্ডটি শুধু টেস্টাররা ব্যবহার করতে পারবেন!', ephemeral: true });
        }

        const targetUser = interaction.options.getUser('player');
        const gameMode = interaction.options.getString('gamemode');

        db.get(`SELECT * FROM players WHERE discord_id = ?`, [targetUser.id], async (err, row) => {
            if (!row) return interaction.reply({ content: '❌ প্লেয়ারটি রেজিস্টার্ড নয়!', ephemeral: true });

            // ওই গেমমোডের কিউ থেকে প্লেয়ারের টেস্ট শুরু হওয়ায় তাকে লিস্ট থেকে সরিয়ে দেওয়া হলো (ফলে পেছনের জন ১ নম্বরে চলে আসবে)
            if (queues.has(gameMode)) {
                let list = queues.get(gameMode);
                const qIndex = list.findIndex(p => p.userId === targetUser.id);
                if (qIndex !== -1) {
                    list.splice(qIndex, 1);
                }
            }

            try {
                const guild = interaction.guild;
                const channel = await guild.channels.create({
                    name: `test-${row.ign}`,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                        { id: targetUser.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                    ],
                });

                const ticketEmbed = new EmbedBuilder()
                    .setTitle('🎟️ Test Ticket Opened')
                    .setColor('Green')
                    .addFields(
                        { name: 'Player IGN', value: row.ign, inline: true },
                        { name: 'Discord', value: `<@${row.discord_id}>`, inline: true },
                        { name: 'Region / Country', value: row.region, inline: true },
                        { name: 'Launcher Version', value: row.version, inline: true },
                        { name: 'Game Mode', value: gameMode, inline: true }
                    );

                await channel.send({ content: `<@${targetUser.id}> <@${interaction.user.id}>`, embeds: [ticketEmbed] });
                return interaction.reply({ content: `✅ টিকিট সফলভাবে খোলা হয়েছে: ${channel}`, ephemeral: true });
            } catch (e) {
                return interaction.reply({ content: '❌ টিকিট তৈরি করতে সমস্যা হয়েছে!', ephemeral: true });
            }
        });
    }

    // ৭. /result কমান্ড (টেস্টারদের জন্য)
    if (interaction.isChatInputCommand() && interaction.commandName === 'result') {
        if (!interaction.member.roles.cache.has(TESTER_ROLE_ID) && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ এই কমান্ডটি শুধু টেস্টারদের জন্য!', ephemeral: true });
        }

        const player = interaction.options.getUser('player');
        const tier = interaction.options.getString('tier');
        const points = interaction.options.getInteger('points');

        db.run(`UPDATE players SET points = ? WHERE discord_id = ?`, [points, player.id], (err) => {
            if (err) return interaction.reply({ content: 'রেজাল্ট সেভ করতে সমস্যা হয়েছে।', ephemeral: true });
            return interaction.reply(`✅ Result Saved! Player: <@${player.id}> | Tier: **${tier}** | Points: **${points}**`);
        });
    }

    // ৮. /leaderboard কমান্ড
    if (interaction.isChatInputCommand() && interaction.commandName === 'leaderboard') {
        db.all(`SELECT * FROM players ORDER BY points DESC LIMIT 10`, (err, rows) => {
            if (err || !rows.length) return interaction.reply({ content: 'কোনো ডাটা নেই।', ephemeral: true });
            let list = rows.map((r, index) => `**#${index + 1}** - <@${r.discord_id}> (${r.ign}) - Points: **${r.points || 0}**`).join('\n');
            const embed = new EmbedBuilder().setTitle('🏆 Top 10 Leaderboard').setDescription(list).setColor('Gold');
            return interaction.reply({ embeds: [embed] });
        });
    }

    // ৯. /tester-stats কমান্ড
    if (interaction.isChatInputCommand() && interaction.commandName === 'tester-stats') {
        const tester = interaction.options.getUser('tester') || interaction.user;
        return interaction.reply({ content: `📊 Tester <@${tester.id}> stats loaded successfully.`, ephemeral: true });
    }
});