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

// টেস্টার এবং এডমিন রোল আইডি
const TESTER_ROLE_ID = '1530471633737875467';
const ADMIN_ROLE_ID = '1518301359332655144';
const RESULT_CHANNEL_ID = '1522942202874167549';

// গেমমোড অনুযায়ী ডিসকর্ড রোল আইডিগুলো
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
    console.log(`Logged in as ${client.user.tag}! বট সফলভাবে ডট (.) কমান্ড মোডে চালু হয়েছে।`);
});

// ১. মেসেজ কমান্ড হ্যান্ডলার (ডট দিয়ে শুরু হওয়া কমান্ডগুলো কাজ করবে)
client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith('.')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    // ১. .request-test অথবা .setup-register প্যানেল পাঠানো
    if (commandName === 'request-test' || commandName === 'setup-register') {
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

        await message.channel.send({ embeds: [embed], components: [rowButton, rowSelect] });
        return message.reply({ content: 'Panel sent successfully!' });
    }

    // ২. .queue-start <gamemode> কমান্ড (টেস্টারদের জন্য)
    if (commandName === 'queue-start') {
        if (!message.member.roles.cache.has(TESTER_ROLE_ID) && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply({ content: '❌ এই কমান্ডটি শুধু টেস্টাররা ব্যবহার করতে পারবেন!' });
        }

        const gameMode = args[0]?.toLowerCase();
        if (!gameMode || !GAMEMODE_ROLES[gameMode]) {
            return message.reply({ content: '❌ সঠিক গেমমোড দিন! উদাহরণ: `.queue-start uhc` `.queue-start cpvp` `.queue-start axe_shield` `.queue-start neth_pot` `.queue-start dia_pot` `.queue-start smp_kit` `.queue-start mace` `.queue-start sword`' });
        }

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

        await message.channel.send({ embeds: [embed], components: [row] });
        return message.reply({ content: `✅ **${gameMode.toUpperCase()}** গেমমোডের কিউ সফলভাবে শুরু হয়েছে!` });
    }

    // ৩. .open-ticket <@user> <gamemode> কমান্ড (টেস্টারদের জন্য)
    if (commandName === 'open-ticket') {
        if (!message.member.roles.cache.has(TESTER_ROLE_ID) && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply({ content: '❌ এই কমান্ডটি শুধু টেস্টাররা ব্যবহার করতে পারবেন!' });
        }

        const targetUser = message.mentions.users.first();
        const gameMode = args[1]?.toLowerCase();

        if (!targetUser || !gameMode) {
            return message.reply({ content: '❌ সঠিক নিয়মে ব্যবহার করুন: `.open-ticket @user uhc`' });
        }

        db.get(`SELECT * FROM players WHERE discord_id = ?`, [targetUser.id], async (err, row) => {
            if (!row) return message.reply({ content: '❌ প্লেয়ারটি রেজিস্টার্ড নয়!' });

            if (queues.has(gameMode)) {
                let list = queues.get(gameMode);
                const qIndex = list.findIndex(p => p.userId === targetUser.id);
                if (qIndex !== -1) {
                    list.splice(qIndex, 1);
                }
            }

            try {
                const guild = message.guild;
                const channel = await guild.channels.create({
                    name: `test-${row.ign}`,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                        { id: targetUser.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                        { id: message.author.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
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

                await channel.send({ content: `<@${targetUser.id}> <@${message.author.id}>`, embeds: [ticketEmbed] });
                return message.reply({ content: `✅ টিকিট সফলভাবে খোলা হয়েছে: ${channel}` });
            } catch (e) {
                return message.reply({ content: '❌ টিকিট তৈরি করতে সমস্যা হয়েছে!' });
            }
        });
    }

    // ৪. .result <@user> <tier> <points> কমান্ড (টেস্টারদের জন্য)
    // ৪. result <user> <tier> <points> কমান্ড (মডারেটর বা টেস্টারদের জন্য)
if (commandName === 'result') {
    if (!message.member.roles.cache.has(TESTER_ROLE_ID) && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply({ content: '❌ এই কমান্ডটি শুধু টেস্টিং টিম ব্যবহার করতে পারবে!' });
    }

    const targetUser = message.mentions.users.first();
    const tier = args[1];
    const points = parseInt(args[2]);

    if (!targetUser || !tier || isNaN(points)) {
        return message.reply({ content: '❌ সঠিক নিয়মে ব্যবহার করুন: `.result @user Tier4 50`' });
    }

    db.get('SELECT * FROM players WHERE discord_id = ?', [targetUser.id], (err, playerRow) => {
        if (err || !playerRow) {
            return message.reply({ content: '❌ এই প্লেয়ারটি ডাটাবেজে রেজিস্টার্ড নয়!' });
        }

        db.run('UPDATE players SET points = ? WHERE discord_id = ?', [points, targetUser.id], (err) => {
            if (err) return message.reply({ content: '❌ রেজাল্ট সেভ করতে সমস্যা হয়েছে!' });

            // নির্দিষ্ট রেজাল্ট চ্যানেলে ইম্বেড পাঠানো
            const resultChannel = message.guild.channels.cache.get(RESULT_CHANNEL_ID);
            if (resultChannel) {
                const resultEmbed = new EmbedBuilder()
                    .setColor('Gold')
                    .setTitle('🏆 Test Result & Evaluation')
                    .addFields(
                        { name: '👥 Tester', value: `<@${message.author.id}>`, inline: true },
                        { name: '🎮 Player IGN', value: playerRow.ign, inline: true },
                        { name: '📊 Achieved Rank', value: `**${tier}**`, inline: true },
                        { name: '⭐ Points', value: `**${points}**`, inline: true }
                    )
                    .setTimestamp();

                resultChannel.send({ content: `<@${targetUser.id}>`, embeds: [resultEmbed] });
            }

            return message.reply({ content: `✅ রেজাল্ট সফলভাবে সেভ এবং পাঠানো হয়েছে! Player: **${playerRow.ign}** | Tier: **${tier}** | Points: **${points}**` });
        });
    });
}

    // ৫. .leaderboard কমান্ড
    if (commandName === 'leaderboard') {
        db.all(`SELECT * FROM players ORDER BY points DESC LIMIT 10`, (err, rows) => {
            if (err || !rows.length) return message.reply({ content: 'কোনো ডাটা নেই।' });
            let list = rows.map((r, index) => `**#${index + 1}** - <@${r.discord_id}> (${r.ign}) - Points: **${r.points || 0}**`).join('\n');
            const embed = new EmbedBuilder().setTitle('🏆 Top 10 Leaderboard').setDescription(list).setColor('Gold');
            return message.reply({ embeds: [embed] });
        });
    }

    // ৬. .tester-stats কমান্ড
    if (commandName === 'tester-stats') {
        const tester = message.mentions.users.first() || message.author;
        return message.reply({ content: `📊 Tester <@${tester.id}> stats loaded successfully.` });
    }
});

// ২. বাটন, সিলেক্ট মেনু এবং মোডাল ইন্টারঅ্যাকশন হ্যান্ডলার
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

    // রেজিস্টার বাটন ক্লিক করলে ফর্ম বা মোডাল ওপেন হবে
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

    // গেমমোড সিলেক্ট মেনু থেকে রোল দেওয়া
    if (interaction.isStringSelectMenu() && interaction.customId === 'gamemode_select') {
        const userId = interaction.user.id;
        const selectedMode = interaction.values[0];
        const roleId = GAMEMODE_ROLES[selectedMode];

        db.get(`SELECT * FROM players WHERE discord_id = ?`, [userId], async (err, row) => {
            if (err || !row) {
                return interaction.reply({ 
                    content: '❌ আপনি এখনো মাইনক্রাফট আইডি রেজিস্টার করেননি! প্রথমে **Register / Update Profile** বাটনে ক্লিক করুন।', 
                    ephemeral: true 
                });
            }

            try {
                const member = await interaction.guild.members.fetch(userId);
                if (roleId) {
                    await member.roles.add(roleId);
                }
                return interaction.reply({ content: `✅ সফলভাবে আপনাকে গেমমোড রোল দেওয়া হয়েছে!`, ephemeral: true });
            } catch (error) {
                return interaction.reply({ content: '❌ রোল দিতে সমস্যা হয়েছে। বটের পারমিশন চেক করুন।', ephemeral: true });
            }
        });
    }

    // মোডাল সাবমিট হলে ডেটাবেজে সেভ হওয়া
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

    // কিউতে জয়েন বা লিভ করার বাটন হ্যান্ডলার
    if (interaction.isButton() && (interaction.customId.startsWith('join_queue_') || interaction.customId.startsWith('leave_queue_'))) {
        const parts = interaction.customId.split('_');
        const action = parts[0]; 
        const gameMode = parts.slice(2).join('_'); 
        const userId = interaction.user.id;

        db.get(`SELECT * FROM players WHERE discord_id = ?`, [userId], async (err, playerRow) => {
            if (!playerRow) {
                return interaction.reply({ content: '❌ কিউতে জয়েন করার আগে অবশ্যই প্রোফাইল রেজিস্টার করতে হবে!', ephemeral: true });
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

            let desc = list.length === 0 ? 'এখনো কেউ কিউতে নেই।' : list.map((p, idx) => `**#${idx + 1}** - <@${p.userId}> (${p.ign})`).join('\n');
            const updatedEmbed = new EmbedBuilder()
                .setTitle(`🎮 Queue: ${gameMode.toUpperCase()}`)
                .setDescription(desc)
                .setColor('Blue');

            await interaction.message.edit({ embeds: [updatedEmbed] }).catch(() => {});
        });
    }
});

client.login(process.env.DISCORD_TOKEN);
